import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { GenreFilter, type FeedSortMode } from "@/components/genre-filter";
import { VinylPullRefreshIndicator } from "@/components/vinyl-pull-refresh-indicator";
import type { PostWithUser } from "@shared/schema";
import { supabase } from "@/lib/supabaseClient";
import { apiUrl } from "@/lib/apiBase";
import {
  ApiRequestError,
  apiDevDiagnosticsEnabled,
  apiDiagIsNativeShell,
  getApiRequestErrorDetail,
  serializeQueryError,
} from "@/lib/apiDiagnostics";
import { useUser } from "@/lib/user-context";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { triggerPullRefreshCommittedHaptic } from "@/lib/pull-refresh-haptics";
import { useToast } from "@/hooks/use-toast";
import { RandomDiceButton } from "@/components/random-dice-button";

/** Keep in sync with `animation.dice-spin` duration in `tailwind.config.ts` (0.42s). */
const DICE_SPIN_ANIMATION_MS = 420;
const RANDOM_DICE_RAIL_EXIT_MS = 175;
const feedTopOverlayGradient =
  "pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/28 via-black/10 to-transparent";

/** Home-only: centered genre menu (identification + feed order live in the genre menu). */
function HomeFeedTopChrome({
  selectedGenres,
  onGenresChange,
  identificationFilter,
  onIdentificationChange,
  sortMode,
  onSortChange,
}: {
  selectedGenres: string[];
  onGenresChange: (next: string[]) => void;
  identificationFilter: "all" | "identified" | "unidentified";
  onIdentificationChange: (next: "all" | "identified" | "unidentified") => void;
  sortMode: FeedSortMode;
  onSortChange: (mode: FeedSortMode) => void;
}) {
  return (
    <>
      <div className={feedTopOverlayGradient} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-2.5 pt-2 sm:px-4 sm:pt-2.5">
        <div className="pointer-events-auto flex w-full min-w-0 justify-center">
          <div className="flex min-w-0 max-w-[min(100%,10.25rem)] justify-center sm:max-w-[min(46vw,12.25rem)]">
            <GenreFilter
              selectedGenres={selectedGenres}
              onGenresChange={onGenresChange}
              identificationFilter={identificationFilter}
              onIdentificationChange={onIdentificationChange}
              sortMode={sortMode}
              onSortChange={onSortChange}
              isCollapsed
            />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * TEMP (dev): Home feed fetch helper — logs distinct labels; grep `[DubHub][Home][feed][dev]`.
 */
async function homeFeedFetchJson<T>(
  feedLabel: string,
  pathAndQuery: string,
  authHeaders: Record<string, string>,
): Promise<T> {
  const resolved = apiUrl(pathAndQuery);
  if (apiDevDiagnosticsEnabled()) {
    console.log("[DubHub][Home][feed][dev]", feedLabel, "request", {
      nativeShell: apiDiagIsNativeShell(),
      pathAndQuery,
      resolvedUrl: resolved,
    });
  }
  let res: Response;
  try {
    res = await fetch(resolved, { headers: authHeaders, credentials: "include" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[DubHub][Home][feed]", feedLabel, "fetch rejected", {
      resolvedUrl: resolved,
      message: msg,
    });
    if (apiDevDiagnosticsEnabled()) {
      console.log("[DubHub][Home][feed][dev]", feedLabel, "fetch rejected", {
        resolvedUrl: resolved,
        message: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
    }
    throw new ApiRequestError({
      message: `Load failed (fetch): ${msg}`,
      url: resolved,
      method: "GET",
    });
  }
  if (apiDevDiagnosticsEnabled()) {
    console.log("[DubHub][Home][feed][dev]", feedLabel, "response", {
      resolvedUrl: resolved,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    });
  }
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    console.error("[DubHub][Home][feed]", feedLabel, "non-OK response", {
      resolvedUrl: resolved,
      status: res.status,
      statusText: res.statusText,
      bodyPreview: text.slice(0, 400),
    });
    if (apiDevDiagnosticsEnabled()) {
      console.log("[DubHub][Home][feed][dev]", feedLabel, "non-OK body preview", {
        resolvedUrl: resolved,
        preview: text.slice(0, 800),
      });
    }
    throw new ApiRequestError({
      message: `${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
      url: resolved,
      method: "GET",
      status: res.status,
      statusText: res.statusText,
      responseBody: text.length > 4000 ? `${text.slice(0, 4000)}…` : text,
    });
  }
  return (await res.json()) as T;
}

export default function Home() {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [identificationFilter, setIdentificationFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [sortMode, setSortMode] = useState<FeedSortMode>("hottest");
  /** True while the rail dice plays exit before leaving Random mode. */
  const [randomViewExiting, setRandomViewExiting] = useState(false);
  /** Bumps when Random mode is entered so the rail dice can play its intro motion. */
  const [diceRailEnterGen, setDiceRailEnterGen] = useState(0);
  const randomExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [isFeedMuted, setIsFeedMuted] = useState(true);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const [location, navigate] = useLocation();
  const lastScrolledPostId = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<string>(location);
  const mergeAttemptedForPostId = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { currentUser } = useUser();

  const genresKey = [...selectedGenres].sort().join(",");

  useEffect(() => {
    return () => {
      if (randomExitTimerRef.current) {
        clearTimeout(randomExitTimerRef.current);
        randomExitTimerRef.current = null;
      }
    };
  }, []);

  const handleFeedSortChange = useCallback(
    (mode: FeedSortMode) => {
      if (mode === "random" && randomViewExiting) {
        if (randomExitTimerRef.current) {
          clearTimeout(randomExitTimerRef.current);
          randomExitTimerRef.current = null;
        }
        setRandomViewExiting(false);
        return;
      }
      if (mode === sortMode && !randomViewExiting) return;

      if (mode !== "random" && sortMode === "random") {
        setRandomViewExiting(true);
        if (randomExitTimerRef.current) clearTimeout(randomExitTimerRef.current);
        randomExitTimerRef.current = setTimeout(() => {
          randomExitTimerRef.current = null;
          setSortMode(mode);
          setRandomViewExiting(false);
        }, RANDOM_DICE_RAIL_EXIT_MS);
        return;
      }

      setRandomViewExiting(false);
      if (randomExitTimerRef.current) {
        clearTimeout(randomExitTimerRef.current);
        randomExitTimerRef.current = null;
      }
      setSortMode(mode);
    },
    [sortMode, randomViewExiting],
  );

  useEffect(() => {
    if (sortMode === "random" && !randomViewExiting) {
      setDiceRailEnterGen((g) => g + 1);
    }
  }, [sortMode, randomViewExiting]);

  // Random discovery mode (one post at a time, no repeats per session).
  const [randomPost, setRandomPost] = useState<PostWithUser | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomExhausted, setRandomExhausted] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);
  const randomSessionTokenRef = useRef(0);
  const randomSeenIdsRef = useRef<Set<string>>(new Set());
  const randomPoolRef = useRef<PostWithUser[]>([]);
  const randomOffsetRef = useRef(0);

  const postsQuery = useQuery({
    queryKey: ["/api/posts", { genresKey, identification: identificationFilter, sortMode }, currentUser?.id],
    queryFn: async () => {
      // Get auth headers so server can set hasLiked and currentUserTaggedAsArtist
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {};
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const params = new URLSearchParams();
      if (selectedGenres.length > 0) {
        params.append("genres", selectedGenres.join(","));
      }
      params.append("identification", identificationFilter);
      const serverSortMode: "hottest" | "newest" = sortMode === "newest" ? "newest" : "hottest";
      params.append("sort", serverSortMode);

      const pathAndQuery = `/api/posts?${params}`;
      return homeFeedFetchJson<PostWithUser[]>("[feed-main]", pathAndQuery, authHeaders);
    },
    enabled: sortMode !== "random",
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: posts = [], isLoading, isError, error, refetch: refetchPosts } = postsQuery;

  // Client-side fallback: ensures UI toggles (sort + filters) update immediately,
  // even if the backend response/order hasn't caught up yet.
  const uiPosts = useMemo(() => {
    if (sortMode === "random") return [];

    const getLikes = (post: PostWithUser) => {
      const raw =
        (post as any).likes ??
        (post as any).likes_count ??
        (post as any).likesCount ??
        (post as any).likeCount ??
        (post as any).like_count ??
        0;
      const n = typeof raw === "string" ? Number(raw) : raw;
      return Number.isFinite(n) ? (n as number) : 0;
    };

    const identificationWhere = (post: PostWithUser) => {
      if (identificationFilter === "identified") {
        return (
          post.verificationStatus === "identified" ||
          post.verificationStatus === "community" ||
          post.isVerifiedArtist ||
          post.isVerifiedCommunity ||
          post.verifiedByModerator
        );
      }
      if (identificationFilter === "unidentified") {
        return (
          post.verificationStatus === "unverified" &&
          !post.isVerifiedArtist &&
          !post.isVerifiedCommunity &&
          !post.verifiedByModerator
        );
      }
      return true; // "all" => both
    };

    const genreWhere = (post: PostWithUser) => {
      if (selectedGenres.length === 0) return true;
      return selectedGenres.includes((post.genre ?? "").toString().trim().toLowerCase());
    };

    const normalizeCreatedAt = (value: any) => {
      const d = value instanceof Date ? value : new Date(value);
      const t = d.getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const filtered = posts.filter((p) => identificationWhere(p) && genreWhere(p));

    if (sortMode === "newest") {
      return [...filtered].sort((a, b) => normalizeCreatedAt(b.createdAt) - normalizeCreatedAt(a.createdAt));
    }

    // Hottest: primary by likes, secondary by recency.
    return [...filtered].sort((a, b) => {
      const likeDiff = getLikes(b) - getLikes(a);
      if (likeDiff !== 0) return likeDiff;
      return normalizeCreatedAt(b.createdAt) - normalizeCreatedAt(a.createdAt);
    });
  }, [posts, identificationFilter, selectedGenres, sortMode]);

  const homeFeedPullRefreshEnabled =
    sortMode !== "random" && !isLoading && !isError && uiPosts.length > 0;
  const activePostIndex = useMemo(
    () => (activePostId ? uiPosts.findIndex((post) => post.id === activePostId) : -1),
    [uiPosts, activePostId],
  );

  /**
   * Hottest mode re-sorts client-side when like counts change; scrollTop stays fixed so the viewport
   * can land on the wrong post. After any feed order change, snap back to the post the user was
   * viewing (activePostId) before paint.
   */
  const prevUiPostsOrderKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (sortMode === "random") return;
    const orderKey = uiPosts.map((p) => p.id).join("\0");
    const prev = prevUiPostsOrderKeyRef.current;
    prevUiPostsOrderKeyRef.current = orderKey;
    if (prev === null || prev === orderKey || !activePostId) return;

    const el = videoFeedRef.current;
    if (!el) return;

    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(activePostId)
        : activePostId;
    const node = el.querySelector<HTMLElement>(`[data-post-id="${escaped}"]`);
    if (!node) return;

    const targetTop = node.offsetTop;
    if (Math.abs(el.scrollTop - targetTop) <= 2) return;
    el.scrollTo({ top: targetTop, behavior: "auto" });
  }, [uiPosts, activePostId, sortMode]);

  const handleHomeFeedPullRefresh = useCallback(async () => {
    const result = await refetchPosts();
    if (result.error) {
      toast({
        title: "Couldn't refresh feed",
        description:
          result.error instanceof Error ? result.error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [refetchPosts, toast]);

  const onHomePullThresholdCrossed = useCallback(() => {
    triggerPullRefreshCommittedHaptic();
  }, []);

  const {
    spacerHeightPx: homePullSpacerHeightPx,
    pullDistance: homePullDistance,
    pullProgress: homePullProgress,
    phase: homePullPhase,
    blocksSnapSettleRef: homePullBlocksSnapRef,
    touchHandlers: homeFeedPullTouchHandlers,
  } = usePullToRefresh({
    scrollRef: videoFeedRef,
    onRefresh: handleHomeFeedPullRefresh,
    enabled: homeFeedPullRefreshEnabled,
    onPullThresholdCrossed: onHomePullThresholdCrossed,
  });

  /**
   * Drag = native scroll (content follows the finger). Release applies distance vs anchor + flick
   * velocity from recent touchmoves; completion uses smooth scroll from the current offset so it
   * stays visually tied to the gesture (no instant jump, no competing debounced settle).
   */
  useEffect(() => {
    const el = videoFeedRef.current;
    if (!el) return;

    const getSnapNodes = () => Array.from(el.querySelectorAll<HTMLElement>("[data-post-id]"));

    const nearestPostIndexForTop = (scrollTop: number): number => {
      const nodes = getSnapNodes();
      if (nodes.length === 0) return -1;
      let bestIndex = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = Math.abs(scrollTop - nodes[i].offsetTop);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = i;
        }
      }
      return bestIndex;
    };

    const nearestPostTop = (): { top: number; dist: number } | null => {
      const nodes = getSnapNodes();
      if (nodes.length === 0) return null;
      const st = el.scrollTop;
      let bestTop = 0;
      let bestDist = Infinity;
      for (const c of nodes) {
        const ot = c.offsetTop;
        const d = Math.abs(st - ot);
        if (d < bestDist) {
          bestDist = d;
          bestTop = ot;
        }
      }
      return { top: bestTop, dist: bestDist };
    };

    /** If inertia leaves the scroller slightly off a snap, ease the last few pixels only. */
    const onScrollEndNudge = () => {
      if (sortMode === "random") return;
      if (homePullBlocksSnapRef.current) return;
      const n = nearestPostTop();
      if (!n) return;
      if (n.dist < 6 || n.dist > 80) return;
      el.scrollTo({ top: n.top, behavior: "smooth" });
    };

    const gesture = {
      armed: false,
      anchorIndex: -1,
      anchorSnapTop: 0,
      lastMoveScrollTop: 0,
      lastMoveTime: 0,
      /** Blended scroll speed (px/ms). Positive = scrolling down = next post. */
      velPxPerMs: 0,
      /** Last in-gesture sample — fast flicks often need this, not averaged touchstart→end delta. */
      lastInstVelPxPerMs: 0,
    };

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest(
        "button, a, input, textarea, select, label, [role='button'], [data-video-action-rail], [data-radix-popper-content-wrapper]",
      );
    };

    const resetGestureTracking = () => {
      gesture.armed = false;
      gesture.anchorIndex = -1;
      gesture.anchorSnapTop = 0;
      gesture.lastMoveScrollTop = 0;
      gesture.lastMoveTime = 0;
      gesture.velPxPerMs = 0;
      gesture.lastInstVelPxPerMs = 0;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (sortMode === "random") return;
      if (homePullBlocksSnapRef.current) return;
      if (event.touches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;

      const nodes = getSnapNodes();
      if (nodes.length === 0) return;

      const now = performance.now();
      const idx = nearestPostIndexForTop(el.scrollTop);
      if (idx < 0) return;

      gesture.armed = true;
      gesture.anchorIndex = idx;
      gesture.anchorSnapTop = nodes[idx].offsetTop;
      gesture.lastMoveScrollTop = el.scrollTop;
      gesture.lastMoveTime = now;
      gesture.velPxPerMs = 0;
      gesture.lastInstVelPxPerMs = 0;
    };

    const onTouchMove = () => {
      if (!gesture.armed) return;
      const now = performance.now();
      const st = el.scrollTop;
      const dt = now - gesture.lastMoveTime;
      if (dt > 0 && dt < 56) {
        const inst = (st - gesture.lastMoveScrollTop) / dt;
        gesture.lastInstVelPxPerMs = inst;
        gesture.velPxPerMs = gesture.velPxPerMs * 0.28 + inst * 0.72;
      }
      gesture.lastMoveScrollTop = st;
      gesture.lastMoveTime = now;
    };

    const onTouchEnd = () => {
      if (!gesture.armed) return;
      gesture.armed = false;

      if (sortMode === "random") return;
      if (homePullBlocksSnapRef.current) return;

      const nodes = getSnapNodes();
      if (nodes.length === 0) return;

      const i0 = gesture.anchorIndex;
      if (i0 < 0 || i0 >= nodes.length) return;

      const h = el.clientHeight;
      if (h <= 0) return;

      const runFinish = () => {
        const endTop = el.scrollTop;
        const offsetFromAnchor = endTop - gesture.anchorSnapTop;
        const vBlend = gesture.velPxPerMs;
        const vInst = gesture.lastInstVelPxPerMs;
        const v =
          Math.abs(vInst) > Math.abs(vBlend) ? vInst : vBlend;

        const distanceCommitPx = Math.round(Math.min(140, Math.max(52, h * 0.14)));
        const flickThreshold = 0.24;
        const flickCommit = Math.abs(v) >= flickThreshold;
        const flickNext = v > flickThreshold;
        const flickPrev = v < -flickThreshold;
        const distanceNext = offsetFromAnchor >= distanceCommitPx;
        const distancePrev = offsetFromAnchor <= -distanceCommitPx;

        let targetIndex = i0;
        if (flickCommit) {
          if (flickNext) targetIndex = Math.min(nodes.length - 1, i0 + 1);
          else if (flickPrev) targetIndex = Math.max(0, i0 - 1);
        } else if (distanceNext) {
          targetIndex = Math.min(nodes.length - 1, i0 + 1);
        } else if (distancePrev) {
          targetIndex = Math.max(0, i0 - 1);
        }

        const targetTop = nodes[targetIndex].offsetTop;
        if (Math.abs(targetTop - endTop) < 4) return;
        el.scrollTo({ top: targetTop, behavior: "smooth" });
      };

      requestAnimationFrame(runFinish);
    };

    el.addEventListener("scrollend", onScrollEndNudge);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", resetGestureTracking, { passive: true });

    return () => {
      el.removeEventListener("scrollend", onScrollEndNudge);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", resetGestureTracking);
    };
  }, [sortMode, uiPosts.length]);

  // Track the snapped/nearest post as the active one (source of truth for audible output).
  useEffect(() => {
    const el = videoFeedRef.current;
    if (!el) return;
    if (sortMode === "random") {
      setActivePostId(randomPost?.id ?? null);
      return;
    }

    let raf: number | null = null;
    const updateActivePost = () => {
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-post-id]"));
      if (nodes.length === 0) return;
      const st = el.scrollTop;
      let bestId: string | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const node of nodes) {
        const dist = Math.abs(st - node.offsetTop);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = node.dataset.postId ?? null;
        }
      }
      if (bestId) {
        setActivePostId((prev) => (prev === bestId ? prev : bestId));
      }
    };

    const scheduleUpdate = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        updateActivePost();
      });
    };

    scheduleUpdate();
    el.addEventListener("scroll", scheduleUpdate, { passive: true });
    el.addEventListener("scrollend", scheduleUpdate);
    el.addEventListener("touchend", scheduleUpdate, { passive: true });

    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      el.removeEventListener("scroll", scheduleUpdate);
      el.removeEventListener("scrollend", scheduleUpdate);
      el.removeEventListener("touchend", scheduleUpdate);
    };
  }, [sortMode, uiPosts.length, randomPost?.id]);

  const shuffleArray = <T,>(arr: T[]): T[] => {
    // Fisher-Yates shuffle
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const isUnidentifiedPost = (post: PostWithUser) => {
    return (
      post.verificationStatus === "unverified" &&
      !post.isVerifiedArtist &&
      !post.isVerifiedCommunity &&
      !post.verifiedByModerator
    );
  };

  const resetRandomSession = () => {
    randomSessionTokenRef.current += 1;
    randomSeenIdsRef.current = new Set();
    randomPoolRef.current = [];
    randomOffsetRef.current = 0;
    setRandomPost(null);
    setRandomExhausted(false);
    setRandomError(null);
    setRandomLoading(false);
  };

  const loadNextRandom = async (opts?: { afterRestart?: boolean }) => {
    const sessionToken = randomSessionTokenRef.current;
    // After restart, React state for exhausted/loading may not have flushed yet; don't block on stale values.
    if (!opts?.afterRestart) {
      if (randomLoading) return;
      if (randomExhausted) return;
    }

    try {
      // Fast path: pool already has unseen candidates; don't show a loading spinner.
      if (randomPoolRef.current.length > 0) {
        while (randomPoolRef.current.length > 0) {
          const next = randomPoolRef.current.shift();
          if (!next) break;

          // If session was reset while the async work was running, ignore this selection.
          if (randomSessionTokenRef.current !== sessionToken) return;

          // Verification status can change between fetch and display; re-check.
          if (!isUnidentifiedPost(next)) continue;

          randomSeenIdsRef.current.add(next.id);
          setRandomPost(next);
          return;
        }
      }

      setRandomLoading(true);
      setRandomError(null);

      // Keep fetching until we find a new unseen post or the backend runs out.
      const BATCH_SIZE = 20;

      const ensurePoolHasUnseen = async () => {
        let iterations = 0;
        while (randomPoolRef.current.length === 0) {
          iterations += 1;
          if (iterations > 50) return false; // Safety valve for pathological datasets.

          const { data: { session } } = await supabase.auth.getSession();
          const authHeaders: Record<string, string> = {};
          if (session?.access_token) {
            authHeaders["Authorization"] = `Bearer ${session.access_token}`;
          }

          const params = new URLSearchParams();
          if (selectedGenres.length > 0) {
            params.append("genres", selectedGenres.join(","));
          }
          params.append("identification", "unidentified");
          // Use server "newest" ordering for a stable scan; we randomize by shuffling client-side.
          params.append("sort", "newest");
          params.append("limit", String(BATCH_SIZE));
          params.append("offset", String(randomOffsetRef.current));

          const pathAndQuery = `/api/posts?${params}`;
          const candidates = await homeFeedFetchJson<PostWithUser[]>(
            "[feed-random-pool]",
            pathAndQuery,
            authHeaders,
          );

          // Move the scan window forward no matter what; if we filtered everything out due to duplicates,
          // we still want to make progress.
          if (!Array.isArray(candidates) || candidates.length === 0) return false;
          randomOffsetRef.current += candidates.length;

          // Deduplicate by id and mark them "seen" when enqueued to prevent duplicates
          // from ever showing twice in this random session (including within a single batch).
          const batchSeen = new Set<string>();
          const freshCandidates: PostWithUser[] = [];
          for (const p of candidates) {
            if (!isUnidentifiedPost(p)) continue;
            if (randomSeenIdsRef.current.has(p.id)) continue;
            if (batchSeen.has(p.id)) continue;
            batchSeen.add(p.id);
            randomSeenIdsRef.current.add(p.id);
            freshCandidates.push(p);
          }

          if (freshCandidates.length > 0) {
            randomPoolRef.current = shuffleArray(freshCandidates);
            return true;
          }
        }
        return randomPoolRef.current.length > 0;
      };

      if (randomPoolRef.current.length === 0) {
        const ok = await ensurePoolHasUnseen();
        if (!ok || randomPoolRef.current.length === 0) {
          setRandomExhausted(true);
          setRandomPost(null);
          return;
        }
      }

      while (randomPoolRef.current.length > 0) {
        const next = randomPoolRef.current.shift();
        if (!next) break;

        // If session was reset while the async work was running, ignore this selection.
        if (randomSessionTokenRef.current !== sessionToken) return;

        // Verification status can change between fetch and display; re-check.
        if (!isUnidentifiedPost(next)) continue;

        randomSeenIdsRef.current.add(next.id);
        setRandomPost(next);
        return;
      }

      // Pool contained candidates, but they all became identified/unavailable.
      setRandomExhausted(true);
      setRandomPost(null);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load random track";
      if (randomSessionTokenRef.current === sessionToken) {
        setRandomError(msg);
      }
    } finally {
      if (randomSessionTokenRef.current === sessionToken) setRandomLoading(false);
    }
  };

  // Start a fresh random session when entering Random mode, or when the genre filter changes.
  useEffect(() => {
    if (sortMode !== "random") return;
    resetRandomSession();
    void loadNextRandom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, genresKey]);

  // Scroll-to-top must run only when the user changes sort or filters — not when feed data
  // updates (e.g. like/unlike), or every like would retrigger this and reset scroll.
  useEffect(() => {
    if (sortMode === "random") return;
    if (videoFeedRef.current) {
      // Jump to top so reordering is immediately visible after sort/filter change.
      videoFeedRef.current.scrollTo({ top: 0, behavior: "auto" });
      setHighlightedPostId(null);
      lastScrolledPostId.current = null;
    }
  }, [sortMode, identificationFilter, selectedGenres]);

  // Handle scroll to specific post from notification / ?post= deep link, or merge post into feed when missing (e.g. not in first page under Hottest)
  useEffect(() => {
    if (sortMode === "random") return;
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post') || params.get('track'); // Support both for backward compatibility

    // Check if location has changed (not just posts refetch)
    const locationChanged = location !== lastLocationRef.current;
    if (locationChanged) {
      lastLocationRef.current = location;
      
      // Clear any existing timeouts from previous notification
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    }

    if (!postId) {
      mergeAttemptedForPostId.current.clear();
    }

    // Post not in current feed slice (sort/limit/filters): fetch once and merge so scroll works without changing sort order
    if (
      postId &&
      !isLoading &&
      !mergeAttemptedForPostId.current.has(postId) &&
      uiPosts.every((p) => p.id !== postId)
    ) {
      mergeAttemptedForPostId.current.add(postId);
      void (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers: Record<string, string> = {};
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
          const res = await fetch(apiUrl(`/api/posts/${postId}`), {
            headers,
            credentials: 'include',
          });
          if (!res.ok) {
            return;
          }
          const fullPost = (await res.json()) as PostWithUser;
          queryClient.setQueriesData(
            { queryKey: ["/api/posts"], exact: false },
            (old: PostWithUser[] | undefined) => {
              if (!old) return [fullPost];
              if (old.some((p) => p.id === fullPost.id)) return old;
              return [fullPost, ...old];
            },
          );
        } catch {
          // One attempt; avoids a refetch loop if the post is missing or the network fails
        }
      })();
      return;
    }

    // Only process if we have a postId, it's different from the last one we scrolled to, and posts are loaded
    if (postId && postId !== lastScrolledPostId.current && uiPosts.length > 0 && videoFeedRef.current) {
      // Find the post in the list
      const postIndex = uiPosts.findIndex(p => p.id === postId);
      
      if (postIndex !== -1) {
        // Mark that we've scrolled to this post
        lastScrolledPostId.current = postId;
        
        // Highlight the post
        setHighlightedPostId(postId);
        
        // Scroll to the post using data-post-id attribute
        scrollTimeoutRef.current = setTimeout(() => {
          const postElement = document.querySelector(`[data-post-id="${postId}"]`);
          if (postElement && videoFeedRef.current) {
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
        
        // Remove highlight after 3 seconds, reset the last scrolled post, and clear query param
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedPostId(null);
          lastScrolledPostId.current = null;
          navigate('/', { replace: true });
        }, 3000);
      }
    }
  }, [uiPosts, location, navigate, isLoading, queryClient]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  if (postsQuery.isError) {
    console.error("[DubHub][Home] postsQuery error", serializeQueryError(postsQuery.error));
  }
  if (apiDevDiagnosticsEnabled()) {
    console.log("[DubHub][Home][dev] postsQuery", {
      status: postsQuery.status,
      isLoading: postsQuery.isLoading,
      isError: postsQuery.isError,
      errorSerialized: postsQuery.isError ? serializeQueryError(postsQuery.error) : null,
      dataPostCount: Array.isArray(postsQuery.data) ? postsQuery.data.length : postsQuery.data,
    });
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading posts...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const detail = getApiRequestErrorDetail(error);
    return (
      <div className="flex-1 flex items-center justify-center bg-background px-4">
        <div className="text-center text-red-400 max-w-lg w-full">
          <p className="text-lg mb-2">Failed to load feed</p>
          <p className="text-sm break-words">{detail.message}</p>
          {apiDevDiagnosticsEnabled() ? (
            <div
              className="mt-6 text-left rounded-md border border-amber-500/50 bg-amber-950/40 p-3 text-amber-100/95 text-xs font-mono space-y-2 break-all"
              data-temp-dev-feed-diag
            >
              <p className="font-sans font-semibold text-amber-200 border-b border-amber-500/30 pb-2">
                Temporary dev-only diagnostics (remove before production)
              </p>
              <p>
                <span className="text-amber-400/90">URL</span> {detail.url ?? "—"}
              </p>
              <p>
                <span className="text-amber-400/90">HTTP status</span>{" "}
                {detail.status !== undefined ? detail.status : "—"}
              </p>
              <p>
                <span className="text-amber-400/90">Message</span> {detail.message}
              </p>
              {detail.responseBody ? (
                <p className="whitespace-pre-wrap opacity-90 max-h-40 overflow-y-auto">
                  <span className="text-amber-400/90">Body</span> {detail.responseBody.slice(0, 1200)}
                  {detail.responseBody.length > 1200 ? "…" : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (sortMode === "random") {
    return (
      <div className="flex-1 relative bg-background overflow-hidden">
        <HomeFeedTopChrome
          selectedGenres={selectedGenres}
          onGenresChange={setSelectedGenres}
          identificationFilter={identificationFilter}
          onIdentificationChange={setIdentificationFilter}
          sortMode="random"
          onSortChange={handleFeedSortChange}
        />

        <div
          ref={videoFeedRef}
          data-home-video-feed
          className="h-full touch-pan-y snap-y snap-mandatory overflow-x-hidden overflow-y-auto scrollbar-hide [overflow-anchor:auto]"
        >
          {randomLoading && !randomPost ? (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="text-center text-muted-foreground">
                <p className="text-lg mb-2">Finding a mystery track...</p>
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              </div>
            </div>
          ) : randomPost ? (
            <VideoCard
              key="home-random-feed-item"
              post={randomPost}
              isHighlighted={false}
              embeddedFeed={true}
              isMuted={isFeedMuted}
              isActive={activePostId === randomPost.id}
              shouldLoadVideo={true}
              videoPreload="auto"
              onToggleMute={() => setIsFeedMuted((prev) => !prev)}
              feedRandomDice={{
                onPress: () => {
                  void loadNextRandom();
                },
                disabled: randomLoading,
                enterGeneration: diceRailEnterGen,
                exiting: randomViewExiting,
                showIntroGlow: true,
              }}
            />
          ) : randomExhausted ? (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="flex max-w-sm flex-col items-center px-6 text-center text-muted-foreground">
                <p className="text-lg mb-2">You’ll find that tune eventually…</p>
                <p className="text-sm mb-5">Want to start fresh?</p>
                <RandomDiceButton
                  active
                  className="min-h-[44px] min-w-[44px] px-2 sm:min-h-12 sm:min-w-12"
                  delayPressMs={DICE_SPIN_ANIMATION_MS}
                  onPress={() => {
                    resetRandomSession();
                    void loadNextRandom({ afterRestart: true });
                  }}
                  aria-label="Start a new random discovery session"
                />
              </div>
            </div>
          ) : randomError ? (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="text-center text-muted-foreground">
                <p className="text-lg mb-2">Couldn’t load a mystery track.</p>
                <p className="text-sm mb-4">{randomError}</p>
                <button
                  type="button"
                  onClick={() => {
                    void loadNextRandom();
                  }}
                  className="px-4 py-2 text-xs rounded-full bg-white/15 border border-white/25 text-white hover:bg-white/20 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="text-center text-muted-foreground">
                <p className="text-lg mb-2">Choose Random in the Genre menu.</p>
                <p className="text-sm">We’ll show one unidentified track at a time.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (uiPosts.length === 0) {
    return (
      <div className="flex-1 relative bg-background">
        <HomeFeedTopChrome
          selectedGenres={selectedGenres}
          onGenresChange={setSelectedGenres}
          identificationFilter={identificationFilter}
          onIdentificationChange={setIdentificationFilter}
          sortMode={sortMode}
          onSortChange={handleFeedSortChange}
        />
        <div className="h-full flex items-center justify-center pt-32">
          <div className="text-center text-muted-foreground">
            <p className="text-lg mb-2">No posts yet. Be the first to upload!</p>
            <p className="text-sm">Try selecting different filters</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-background overflow-hidden">
      <HomeFeedTopChrome
        selectedGenres={selectedGenres}
        onGenresChange={setSelectedGenres}
        identificationFilter={identificationFilter}
        onIdentificationChange={setIdentificationFilter}
        sortMode={sortMode}
        onSortChange={handleFeedSortChange}
      />

      <div
        ref={videoFeedRef}
        data-home-video-feed
        className="h-full touch-pan-y snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-contain scrollbar-hide [overflow-anchor:auto]"
        {...homeFeedPullTouchHandlers}
      >
        <div
          className="flex w-full shrink-0 flex-col items-center justify-center overflow-hidden bg-background transition-[height] duration-500 ease-out motion-reduce:transition-none"
          style={{ height: homePullSpacerHeightPx }}
        >
          <VinylPullRefreshIndicator
            pullDistancePx={homePullDistance}
            pullProgress={homePullProgress}
            phase={homePullPhase}
          />
        </div>
        {uiPosts.map((post, index) => {
          const distanceToActive = activePostIndex === -1 ? 0 : Math.abs(index - activePostIndex);
          const shouldLoadVideo = distanceToActive <= 1;
          const videoPreload: "none" | "metadata" | "auto" =
            distanceToActive === 0 ? "auto" : shouldLoadVideo ? "metadata" : "none";

          return (
          <VideoCard 
            key={post.id} 
            post={post}
            isHighlighted={highlightedPostId === post.id}
            isMuted={isFeedMuted}
            isActive={activePostId === post.id}
            shouldLoadVideo={shouldLoadVideo}
            videoPreload={videoPreload}
            onToggleMute={() => setIsFeedMuted((prev) => !prev)}
          />
          );
        })}
      </div>
    </div>
  );
}
