/**
 * DEBUG surface timings for a TestFlight / production bundle.
 * Default off. Does not change queries, payloads, or navigation.
 *
 * Enable:  localStorage.setItem("dubhub.debug.perf", "1")
 * Disable: localStorage.removeItem("dubhub.debug.perf")
 *
 * Logs `[Perf]` only. No tokens, bodies, PII, signed URLs, or query data.
 */
import { useLayoutEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

export const PERF_DEBUG_STORAGE_KEY = "dubhub.debug.perf";

export type PerfCacheVerdict = "hit" | "miss";

export type PerfCacheReport = {
  cache: PerfCacheVerdict;
  hasData: boolean;
  dataUpdatedAt: number;
  isInvalidated: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
};

export type PerfRefetchPolicy = "if-stale" | "always";

type QueryStateLike = {
  data?: unknown;
  dataUpdatedAt?: number;
  isInvalidated?: boolean;
  fetchStatus?: "fetching" | "paused" | "idle";
} | null | undefined;

const BLOCKED_DETAIL_KEYS = new Set([
  "username",
  "email",
  "token",
  "authorization",
  "accesstoken",
  "access_token",
  "body",
  "payload",
  "data",
  "avatar",
  "avatarurl",
  "avatar_url",
  "url",
  "signedurl",
  "videourl",
  "video_url",
  "userid",
  "user_id",
]);

export function perfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PERF_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function perfCacheReport(state: QueryStateLike): PerfCacheReport {
  const hasData = !!state && state.data !== undefined;
  return {
    cache: hasData ? "hit" : "miss",
    hasData,
    dataUpdatedAt: state?.dataUpdatedAt ?? 0,
    isInvalidated: state?.isInvalidated === true,
    fetchStatus: state?.fetchStatus ?? "idle",
  };
}

/** Whether this visit should count a network fetch. Does not start one. */
export function perfNetworkStarted(
  report: PerfCacheReport,
  policy: PerfRefetchPolicy,
  enabled = true,
): boolean {
  if (!enabled) return false;
  if (report.fetchStatus === "fetching") return true;
  if (policy === "always") return true;
  return !report.hasData || report.isInvalidated;
}

export type PerfSession = {
  t0: number;
  requests: number;
  noted: Set<string>;
  startedAt: Map<string, number>;
  meta: Map<string, string>;
};

export function perfSessionStart(): PerfSession {
  return {
    t0: perfNow(),
    requests: 0,
    noted: new Set(),
    startedAt: new Map(),
    meta: new Map(),
  };
}

export function perfNoteFetch(session: PerfSession, id: string, started: boolean): void {
  if (!started || session.noted.has(id)) return;
  session.noted.add(id);
  session.requests += 1;
  session.startedAt.set(id, perfNow());
}

export function perfSince(session: PerfSession, id: string): number {
  const start = session.startedAt.get(id) ?? session.t0;
  return perfNow() - start;
}

function roundTiming(value: number): number {
  return Math.round(value * 10) / 10;
}

function sanitizeDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (BLOCKED_DETAIL_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === "string" && /^https?:\/\//i.test(value)) continue;
    if (typeof value === "number" && (key === "t" || key === "dt") && Number.isFinite(value)) {
      out[key] = roundTiming(value);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeDetail(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function perfLog(event: string, detail?: Record<string, unknown>): void {
  try {
    if (!perfDebugEnabled()) return;
    console.info(`[Perf] ${event}`, sanitizeDetail(detail ?? {}));
  } catch {
    /* logging must not affect the screen */
  }
}

export type PerfVisit = {
  active: boolean;
  generation: number;
  note: (id: string, started: boolean) => void;
  noted: (id: string) => boolean;
  since: (id: string) => number;
  meta: (key: string, value?: string) => string | undefined;
  mark: (id: string, event: string, detail?: Record<string, unknown>) => void;
};

export function usePerfVisit(active: boolean, key = ""): PerfVisit {
  const sessionRef = useRef<PerfSession | null>(null);
  const marksRef = useRef(new Set<string>());
  const wasActiveRef = useRef(false);
  const keyRef = useRef("");
  const generationRef = useRef(0);
  const enabled = perfDebugEnabled();

  if (!enabled || !active) {
    if (wasActiveRef.current) {
      sessionRef.current = null;
      marksRef.current = new Set();
      wasActiveRef.current = false;
    }
  } else if (!wasActiveRef.current || keyRef.current !== key) {
    sessionRef.current = perfSessionStart();
    marksRef.current = new Set();
    wasActiveRef.current = true;
    keyRef.current = key;
    generationRef.current += 1;
  }

  return {
    active: enabled && wasActiveRef.current,
    generation: generationRef.current,
    note(id, started) {
      const session = sessionRef.current;
      if (!session) return;
      perfNoteFetch(session, id, started);
    },
    noted(id) {
      return sessionRef.current?.noted.has(id) ?? false;
    },
    since(id) {
      const session = sessionRef.current;
      if (!session) return 0;
      return perfSince(session, id);
    },
    meta(metaKey, value) {
      const session = sessionRef.current;
      if (!session) return undefined;
      if (value !== undefined && !session.meta.has(metaKey)) session.meta.set(metaKey, value);
      return session.meta.get(metaKey);
    },
    mark(id, event, detail) {
      if (!perfDebugEnabled()) return;
      const session = sessionRef.current;
      if (!session || marksRef.current.has(id)) return;
      marksRef.current.add(id);
      const payload: Record<string, unknown> = { ...(detail ?? {}) };
      if (payload.requests == null) payload.requests = session.requests;
      if (id === "open") {
        if (payload.t == null) payload.t = session.t0;
      } else if (payload.dt == null && payload.t == null) {
        payload.dt = perfNow() - session.t0;
      }
      perfLog(event, payload);
    },
  };
}

function remember(perf: PerfVisit, key: string, value: string): string {
  const existing = perf.meta(key);
  if (existing) return existing;
  perf.meta(key, value);
  return value;
}

function rememberReport(perf: PerfVisit, prefix: string, report: PerfCacheReport): PerfCacheReport {
  const fetchStatus = remember(perf, `${prefix}:fs`, report.fetchStatus);
  return {
    cache: remember(perf, `${prefix}:cache`, report.cache) as PerfCacheVerdict,
    hasData: remember(perf, `${prefix}:has`, report.hasData ? "1" : "0") === "1",
    dataUpdatedAt: Number(remember(perf, `${prefix}:at`, String(report.dataUpdatedAt))),
    isInvalidated: remember(perf, `${prefix}:inv`, report.isInvalidated ? "1" : "0") === "1",
    fetchStatus: (fetchStatus === "fetching" || fetchStatus === "paused" ? fetchStatus : "idle"),
  };
}

type PopupSlot = {
  session: PerfSession;
  marks: Set<string>;
  profile: PerfCacheReport;
  profileNetwork: boolean;
};

let popupSlot: PopupSlot | null = null;

export function perfPopupArm(profile: PerfCacheReport, profileNetwork: boolean): void {
  if (!perfDebugEnabled()) return;
  const session = perfSessionStart();
  if (profileNetwork) perfNoteFetch(session, "profile", true);
  popupSlot = { session, marks: new Set(), profile, profileNetwork };
}

function popupMark(slot: PopupSlot, id: string, event: string, detail: Record<string, unknown>): void {
  if (slot.marks.has(id)) return;
  slot.marks.add(id);
  const payload: Record<string, unknown> = { ...detail, requests: slot.session.requests };
  if (id === "open") payload.t = slot.session.t0;
  else payload.dt = perfNow() - slot.session.t0;
  perfLog(event, payload);
}

export function useProfilePopupPerf(input: {
  open: boolean;
  userId: string | undefined;
  profileReady: boolean;
  contentReady: boolean;
}): void {
  const queryClient = useQueryClient();
  const { open, userId, profileReady, contentReady } = input;
  useLayoutEffect(() => {
    if (!open) return;
    const slot = popupSlot;
    if (!slot || !perfDebugEnabled()) return;

    const stats = userId
      ? perfCacheReport(queryClient.getQueryState(["/api/user", userId, "stats"]))
      : undefined;
    const karma = userId
      ? perfCacheReport(queryClient.getQueryState(["/api/user", userId, "karma"]))
      : undefined;
    const statsNetwork = stats ? perfNetworkStarted(stats, "if-stale", true) : false;
    const karmaNetwork = karma ? perfNetworkStarted(karma, "if-stale", true) : false;
    if (stats) perfNoteFetch(slot.session, "stats", statsNetwork);
    if (karma) perfNoteFetch(slot.session, "karma", karmaNetwork);

    popupMark(slot, "open", "profile-popup open", {
      cache: slot.profile.cache,
      network: slot.profileNetwork || statsNetwork || karmaNetwork,
      profile: slot.profile,
      ...(stats ? { stats } : {}),
      ...(karma ? { karma } : {}),
    });
    if (profileReady) {
      popupMark(slot, "primary", "profile-popup primary", {
        cache: slot.profile.cache,
        network: slot.profileNetwork,
      });
    }
    if (contentReady) {
      popupMark(slot, "first", "profile-popup first-content", {
        cache: slot.profile.cache,
      });
    }
  }, [open, userId, profileReady, contentReady, queryClient]);
}

export function useOwnProfilePerf(input: {
  active: boolean;
  queryClient: QueryClient;
  userId: string | undefined;
  statsLoading: boolean;
  karmaLoading: boolean;
  rankEnabled: boolean;
  rankLoading: boolean;
  postsEnabled: boolean;
  likesEnabled: boolean;
  postsLoading: boolean;
  likesLoading: boolean;
}): void {
  const perf = usePerfVisit(input.active, input.userId ?? "");
  const {
    userId,
    statsLoading,
    karmaLoading,
    rankEnabled,
    rankLoading,
    postsEnabled,
    likesEnabled,
    postsLoading,
    likesLoading,
    queryClient,
  } = input;
  useLayoutEffect(() => {
    if (!perf.active || !userId) return;
    const stats = perfCacheReport(queryClient.getQueryState(["/api/user", userId, "stats"]));
    const karma = perfCacheReport(queryClient.getQueryState(["/api/user", userId, "karma-score"]));
    const rank = perfCacheReport(queryClient.getQueryState(["/api/user", userId, "karma"]));
    const posts = perfCacheReport(queryClient.getQueryState(["/api/user", userId, "posts"]));
    const likes = perfCacheReport(queryClient.getQueryState(["/api/user", userId, "liked-posts"]));
    perf.note("stats", perfNetworkStarted(stats, "if-stale", true));
    perf.note("karma", perfNetworkStarted(karma, "if-stale", true));
    perf.note("rank", perfNetworkStarted(rank, "if-stale", rankEnabled));
    perf.note("posts", perfNetworkStarted(posts, "if-stale", postsEnabled));
    perf.note("likes", perfNetworkStarted(likes, "if-stale", likesEnabled));
    const postsCache = remember(perf, "postsCache", posts.cache);
    const likesCache = remember(perf, "likesCache", likes.cache);
    const cache = remember(perf, "cache", stats.cache === "hit" && karma.cache === "hit" ? "hit" : "miss");
    perf.mark("open", "profile open", {
      cache,
      network: perf.noted("stats") || perf.noted("karma"),
      stats,
      karma,
    });
    if (!statsLoading) {
      perf.mark("stats", "profile stats", { cache: stats.cache, network: perf.noted("stats") });
    }
    if (!karmaLoading) {
      perf.mark("karma", "profile karma", { cache: karma.cache, network: perf.noted("karma") });
    }
    if (!statsLoading && !karmaLoading) {
      perf.mark("primary", "profile primary", {
        cache,
        network: perf.noted("stats") || perf.noted("karma"),
      });
      perf.mark("first", "profile first-content", { cache });
    }
    if (rankEnabled && !rankLoading) {
      perf.mark("rep-rank", "profile rep-rank", {
        cache: rank.cache,
        network: perf.noted("rank"),
      });
    }
    if (posts.hasData && likes.hasData) {
      perf.mark("secondary", "profile secondary", {
        posts: postsCache,
        likes: likesCache,
        network: perf.noted("posts") || perf.noted("likes"),
      });
    }
  }, [
    perf.active,
    perf.generation,
    userId,
    statsLoading,
    karmaLoading,
    rankEnabled,
    rankLoading,
    postsEnabled,
    likesEnabled,
    postsLoading,
    likesLoading,
    queryClient,
  ]);
}

export function usePublicProfilePerf(input: {
  active: boolean;
  queryClient: QueryClient;
  username: string;
  profileEnabled: boolean;
  profileLoading: boolean;
  profileFetching: boolean;
  profileId: string | undefined;
  karmaLoading: boolean;
  karmaFetching: boolean;
}): void {
  const perf = usePerfVisit(input.active, input.username);
  const {
    username,
    profileEnabled,
    profileLoading,
    profileFetching,
    profileId,
    karmaLoading,
    karmaFetching,
    queryClient,
  } = input;
  useLayoutEffect(() => {
    if (!perf.active || !profileEnabled) return;
    const profile = perfCacheReport(
      queryClient.getQueryState(["/api/user/profile", username]),
    );
    perf.note("profile", perfNetworkStarted(profile, "always", true));
    const karma = profileId
      ? perfCacheReport(queryClient.getQueryState(["/api/user", profileId, "karma"]))
      : undefined;
    if (karma) perf.note("karma", perfNetworkStarted(karma, "if-stale", true));
    const karmaCache = karma ? rememberReport(perf, "karma", karma) : undefined;
    const cache = remember(perf, "cache", profile.cache);
    perf.mark("open", "public-profile open", {
      cache,
      network: perf.noted("profile"),
      profile,
    });
    if (profileFetching || profile.fetchStatus === "fetching") perf.meta("sawProfileFetch", "1");
    const sawProfileFetch = perf.meta("sawProfileFetch") === "1";
    if (!profileLoading && !profileFetching && (sawProfileFetch || !perf.noted("profile"))) {
      perf.mark("primary", "public-profile primary", {
        cache,
        network: perf.noted("profile"),
      });
    }
    if (!profileLoading) {
      perf.mark("first", "public-profile first-content", { cache });
    }
    if (profileId && karmaCache && !karmaLoading && !karmaFetching) {
      perf.mark("rep", "public-profile rep", {
        cache: karmaCache.cache,
        network: perf.noted("karma"),
        karma: karmaCache,
      });
    }
  }, [
    perf.active,
    perf.generation,
    username,
    profileEnabled,
    profileLoading,
    profileFetching,
    profileId,
    karmaLoading,
    karmaFetching,
    queryClient,
  ]);
}

export function useCommentsPerf(input: {
  active: boolean;
  postId: string;
  queryClient: QueryClient;
  fetching: boolean;
  loading: boolean;
  hasData: boolean;
}): void {
  const perf = usePerfVisit(input.active, input.postId);
  const { postId, queryClient, fetching, loading, hasData } = input;
  useLayoutEffect(() => {
    if (!perf.active) return;
    const comments = perfCacheReport(
      queryClient.getQueryState(["/api/posts", postId, "comments"]),
    );
    const network = perfNetworkStarted(comments, "always", true);
    perf.note("comments", network);
    const cache = remember(perf, "cache", comments.cache);
    const visit = remember(perf, "visit", cache === "hit" ? "reopen" : "cold");
    perf.mark("open", "comments open", {
      cache,
      visit,
      network,
      refetch: cache === "hit" && network,
      comments,
    });
    if (fetching || comments.fetchStatus === "fetching") perf.meta("sawFetch", "1");
    const sawFetch = perf.meta("sawFetch") === "1";
    if (!fetching && !loading && (sawFetch || !perf.noted("comments"))) {
      perf.mark("primary", "comments primary", {
        cache,
        visit,
        network: perf.noted("comments"),
        refetch: cache === "hit" && sawFetch,
      });
    }
    if (hasData) {
      perf.mark("first", "comments first-content", { cache, visit });
    }
  }, [perf.active, perf.generation, postId, queryClient, fetching, loading, hasData]);
}

export function useLeaderboardPerf(input: {
  active: boolean;
  queryClient: QueryClient;
  timeframe: string;
  scope: "users" | "artists";
  userId: string | undefined;
  usersLoading: boolean;
  usersFetching: boolean;
  artistsLoading: boolean;
  artistsFetching: boolean;
  userRankLoading: boolean;
  userRankFetching: boolean;
  artistRankLoading: boolean;
  artistRankFetching: boolean;
}): void {
  const perf = usePerfVisit(input.active, "leaderboard");
  const {
    queryClient,
    timeframe,
    scope,
    userId,
    usersLoading,
    usersFetching,
    artistsLoading,
    artistsFetching,
    userRankLoading,
    userRankFetching,
    artistRankLoading,
    artistRankFetching,
  } = input;
  useLayoutEffect(() => {
    if (!perf.active) return;
    const users = perfCacheReport(
      queryClient.getQueryState(["/api/leaderboard/users", timeframe]),
    );
    const artists = perfCacheReport(
      queryClient.getQueryState(["/api/leaderboard/artists", timeframe]),
    );
    perf.note(`users:${timeframe}`, perfNetworkStarted(users, "if-stale", true));
    perf.note(`artists:${timeframe}`, perfNetworkStarted(artists, "if-stale", true));

    const rankScope = scope;
    const rankEnabled = !!userId;
    const rank = rankEnabled
      ? perfCacheReport(
          queryClient.getQueryState([
            rankScope === "users" ? "/api/leaderboard/users/my-rank" : "/api/leaderboard/artists/my-rank",
            userId,
            timeframe,
          ]),
        )
      : undefined;
    if (rank) {
      perf.note(
        `rank:${rankScope}:${timeframe}`,
        perfNetworkStarted(rank, "if-stale", true),
      );
    }

    perf.mark("open", "leaderboard open", {
      timeframe,
      scope,
      network: perf.noted(`users:${timeframe}`) || perf.noted(`artists:${timeframe}`),
    });

    const usersCache = rememberReport(perf, `users:${timeframe}`, users);
    const artistsCache = rememberReport(perf, `artists:${timeframe}`, artists);
    if (!usersFetching && !usersLoading) {
      perf.mark(`users:${timeframe}`, "leaderboard users request", {
        timeframe,
        cache: usersCache.cache,
        network: perf.noted(`users:${timeframe}`),
        dt: perf.since(`users:${timeframe}`),
        users: usersCache,
      });
    }
    if (!artistsFetching && !artistsLoading) {
      perf.mark(`artists:${timeframe}`, "leaderboard artists request", {
        timeframe,
        cache: artistsCache.cache,
        network: perf.noted(`artists:${timeframe}`),
        dt: perf.since(`artists:${timeframe}`),
        artists: artistsCache,
      });
    }
    const rankLoading = rankScope === "users" ? userRankLoading : artistRankLoading;
    const rankFetching = rankScope === "users" ? userRankFetching : artistRankFetching;
    const rankCache = rank ? rememberReport(perf, `rank:${rankScope}:${timeframe}`, rank) : undefined;
    if (rank && rankCache && rankEnabled && !rankFetching && !rankLoading) {
      perf.mark(`rank:${rankScope}:${timeframe}`, "leaderboard my-rank request", {
        timeframe,
        scope: rankScope,
        cache: rankCache.cache,
        network: perf.noted(`rank:${rankScope}:${timeframe}`),
        dt: perf.since(`rank:${rankScope}:${timeframe}`),
        rank: rankCache,
      });
    }
    const listLoading = scope === "users" ? usersLoading : artistsLoading;
    if (!listLoading) {
      perf.mark("first", "leaderboard first-content", {
        timeframe,
        scope,
        cache: scope === "users" ? usersCache.cache : artistsCache.cache,
      });
    }
  }, [
    perf.active,
    perf.generation,
    queryClient,
    timeframe,
    scope,
    userId,
    usersLoading,
    usersFetching,
    artistsLoading,
    artistsFetching,
    userRankLoading,
    userRankFetching,
    artistRankLoading,
    artistRankFetching,
  ]);
}

function feedKey(scope: string, view: string): readonly [string, string, string] {
  return ["/api/releases/feed", scope, view];
}

export function perfCountFetching(queryClient: QueryClient, queryKey: readonly unknown[]): number {
  try {
    return queryClient
      .getQueryCache()
      .findAll({ queryKey })
      .filter((query) => query.state.fetchStatus === "fetching").length;
  } catch {
    return 0;
  }
}

export function useReleasesPerf(input: {
  active: boolean;
  queryClient: QueryClient;
  scope: string;
  view: string;
  userReady: boolean;
  adjacentViews: readonly string[];
  warmPast: boolean;
  feedLoading: boolean;
  feedFetching: boolean;
}): void {
  const perf = usePerfVisit(input.active, "releases");
  const { queryClient, scope, view, userReady, adjacentViews, warmPast, feedLoading, feedFetching } =
    input;
  const adjacentKey = adjacentViews.join(",");
  useLayoutEffect(() => {
    if (!perf.active || !userReady) return;
    const activeReport = perfCacheReport(queryClient.getQueryState(feedKey(scope, view)));
    perf.note(`feed:${scope}:${view}`, perfNetworkStarted(activeReport, "always", true));
    for (const adjacent of adjacentKey ? adjacentKey.split(",") : []) {
      if (!adjacent || adjacent === view) continue;
      const report = perfCacheReport(queryClient.getQueryState(feedKey(scope, adjacent)));
      perf.note(`feed:${scope}:${adjacent}`, perfNetworkStarted(report, "if-stale", true));
    }
    if (warmPast && !(scope === "my" && view === "past")) {
      const past = perfCacheReport(queryClient.getQueryState(feedKey("my", "past")));
      perf.note("feed:my:past", perfNetworkStarted(past, "if-stale", true));
    }
    const cache = remember(perf, "cache", activeReport.cache);
    const fetching = perfCountFetching(queryClient, ["/api/releases/feed"]);
    perf.mark("open", "releases open", {
      cache,
      scope,
      view,
      network: perf.noted(`feed:${scope}:${view}`),
      fetching,
    });
    if (feedFetching) perf.meta("sawFeed", "1");
    const sawFeed = perf.meta("sawFeed") === "1";
    if (!feedLoading && !feedFetching && (sawFeed || !perf.noted(`feed:${scope}:${view}`))) {
      perf.mark("primary", "releases primary", {
        cache,
        scope,
        view,
        network: perf.noted(`feed:${scope}:${view}`),
        fetching: perfCountFetching(queryClient, ["/api/releases/feed"]),
      });
    }
    if (!feedLoading) {
      perf.mark("first", "releases first-content", { cache, scope, view });
    }
  }, [perf.active, perf.generation, queryClient, scope, view, userReady, adjacentKey, warmPast, feedLoading, feedFetching]);
}

export function useReleaseDetailPerf(input: {
  active: boolean;
  queryClient: QueryClient;
  releaseId: string;
  detailFetching: boolean;
  detailPending: boolean;
  hasRelease: boolean;
  hasFullDetail: boolean;
  hasError: boolean;
  holdForAtmosphere: boolean;
  placeholderFromFeed: boolean;
  statsEnabled: boolean;
  statsFetching: boolean;
  statsLoading: boolean;
}): void {
  const perf = usePerfVisit(input.active, input.releaseId);
  const {
    queryClient,
    releaseId,
    detailFetching,
    detailPending,
    hasRelease,
    hasFullDetail,
    hasError,
    holdForAtmosphere,
    placeholderFromFeed,
    statsEnabled,
    statsFetching,
    statsLoading,
  } = input;
  useLayoutEffect(() => {
    if (!perf.active || !releaseId) return;
    const detail = perfCacheReport(queryClient.getQueryState(["/api/releases", releaseId]));
    const stats = perfCacheReport(queryClient.getQueryState(["/api/releases", releaseId, "stats"]));
    perf.note("detail", perfNetworkStarted(detail, "if-stale", true));
    if (statsEnabled) perf.note("stats", perfNetworkStarted(stats, "if-stale", true));
    const cache = remember(perf, "cache", detail.cache);
    const placeholder = remember(perf, "placeholder", placeholderFromFeed ? "yes" : "no");
    const statsCache = rememberReport(perf, "stats", stats);
    perf.mark("open", "release-detail open", {
      cache,
      placeholder: placeholder === "yes",
      network: perf.noted("detail"),
      detail,
    });
    const detailSettled = !detailFetching && !detailPending && (hasFullDetail || hasError);
    if (detailSettled) {
      perf.mark("primary", "release-detail primary", {
        cache,
        placeholder: placeholder === "yes",
        network: perf.noted("detail"),
      });
    }
    const showingFailure = hasError && !detailPending && !detailFetching && !hasRelease;
    if ((hasRelease && !holdForAtmosphere) || showingFailure) {
      perf.mark("first", "release-detail first-content", {
        cache,
        placeholder: placeholder === "yes",
      });
    }
    if (statsEnabled && !statsFetching && !statsLoading) {
      perf.mark("stats", "release-detail stats", {
        cache: statsCache.cache,
        network: perf.noted("stats"),
        stats: statsCache,
      });
    }
  }, [
    perf.active,
    perf.generation,
    queryClient,
    releaseId,
    detailFetching,
    detailPending,
    hasRelease,
    hasFullDetail,
    hasError,
    holdForAtmosphere,
    placeholderFromFeed,
    statsEnabled,
    statsFetching,
    statsLoading,
  ]);
}
