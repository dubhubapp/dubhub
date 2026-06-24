import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, Music, Disc3, Plus } from "lucide-react";
import { getCollaborationStatusDisplay } from "@/lib/collaboration-status-display";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";
import { isReleaseDayToday } from "@/lib/release-status";
import { ReleaseDayCelebration, SavedReleaseDayCelebration } from "@/components/release-day-celebration";
import { apiUrl } from "@/lib/apiBase";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";
import {
  DubHubSkeletonBar,
  dubhubSkeletonGlassShellClass,
} from "@/components/ui/skeleton";
import { prefetchReleaseDetail } from "@/lib/release-cache";
import {
  isPushPromptSessionActive,
  markReleasesPushPromptHandled,
  shouldOfferReleasesPushPrompt,
} from "@/lib/push-prompt";
import { Capacitor } from "@capacitor/core";
import {
  ReleaseFeedCard,
  formatReleaseCardDate,
  isReleaseCardUpcoming,
  type ReleaseFeedCardData,
} from "@/components/release-feed-card";

export type ReleaseFeedItem = ReleaseFeedCardData & {
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export { PLATFORM_ICONS, PLATFORM_LABELS, getPlatformIcon, getPlatformLabel } from "@/lib/platforms";

function formatDate(d: string | null) {
  return formatReleaseCardDate(d);
}

function isUpcoming(d: string | null) {
  return isReleaseCardUpcoming(d);
}

function getMonthYearKey(d: string): string {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthYear(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function groupReleasesByMonth<T extends { releaseDate: string | null }>(
  items: T[],
  ascending: boolean
): { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!item.releaseDate) continue;
    const key = getMonthYearKey(item.releaseDate);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const keys = Array.from(map.keys()).sort((a, b) =>
    ascending ? a.localeCompare(b) : b.localeCompare(a)
  );
  return keys.map((key) => {
    const itemsInGroup = map.get(key)!;
    return { key, label: formatMonthYear(itemsInGroup[0].releaseDate!), items: itemsInGroup };
  });
}

type FeedView = "upcoming" | "collaborations" | "past";
type FeedScope = "my" | "saved";

function getScopeFromSearch(search: string, isArtist: boolean): FeedScope {
  if (!isArtist) return "saved";
  const s = new URLSearchParams(search).get("scope");
  return s === "saved" ? "saved" : "my";
}

function getViewFromSearch(search: string, scope: FeedScope): FeedView {
  const v = new URLSearchParams(search).get("view");
  if (scope === "saved") return v === "past" ? "past" : "upcoming";
  return v === "past" || v === "collaborations" ? v : "upcoming";
}

/** Saved Releases feed: release drops today for someone else’s track (not your own release). */
function isSavedReleaseOutTodayInList(
  r: ReleaseFeedItem,
  scope: FeedScope,
  currentUserId: string | undefined
): boolean {
  if (scope !== "saved" || !currentUserId) return false;
  if (r.artistId === currentUserId) return false;
  return isReleaseDayToday(r.isComingSoon, r.releaseDate);
}

function ReleaseFeedContentLoader() {
  return (
    <div className="space-y-4 py-2" aria-busy="true" aria-label="Loading releases">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`flex gap-4 p-4 ${dubhubSkeletonGlassShellClass}`}
        >
          <DubHubSkeletonBar tone="teal" className="w-20 h-20 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <DubHubSkeletonBar tone="default" className="h-3 w-2/3 max-w-[10rem]" />
            <DubHubSkeletonBar tone="mid" className="h-4 w-full max-w-[14rem]" />
            <DubHubSkeletonBar tone="faint" className="h-3 w-1/3 max-w-[6rem]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Any release with release_date = today (for glow and Out today badge). */
function isReleaseDayHighlight(r: ReleaseFeedItem): boolean {
  return isReleaseDayToday(r.isComingSoon, r.releaseDate);
}

export default function ReleaseTracker() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { currentUser, userType } = useUser();
  const isArtist = userType === "artist";
  const [scope, setScopeState] = useState<FeedScope>(() =>
    typeof window !== "undefined" ? getScopeFromSearch(window.location.search, isArtist) : (isArtist ? "my" : "saved")
  );
  const [feedView, setFeedViewState] = useState<FeedView>(() =>
    typeof window !== "undefined" ? getViewFromSearch(window.location.search, scope) : "upcoming"
  );
  const [releasesPushPromptOpen, setReleasesPushPromptOpen] = useState(false);
  const releaseScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimeoutId: number | undefined;

    const attemptOfferReleasesPushPrompt = async () => {
      const userId = currentUser?.id;
      if (!userId || cancelled) return;

      if (isPushPromptSessionActive()) {
        retryTimeoutId = window.setTimeout(() => {
          void attemptOfferReleasesPushPrompt();
        }, 600);
        return;
      }

      if (!(await shouldOfferReleasesPushPrompt(userId))) return;
      if (cancelled) return;
      markReleasesPushPromptHandled(userId);
      setReleasesPushPromptOpen(true);
    };

    void attemptOfferReleasesPushPrompt();
    return () => {
      cancelled = true;
      if (retryTimeoutId !== undefined) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const onPop = () => {
      const s = getScopeFromSearch(window.location.search, isArtist);
      setScopeState(s);
      setFeedViewState(getViewFromSearch(window.location.search, s));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isArtist]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const s = getScopeFromSearch(window.location.search, isArtist);
    setScopeState(s);
    setFeedViewState(getViewFromSearch(window.location.search, s));
  }, [currentUser?.id, isArtist]);

  /** iOS status-bar tap → scroll releases feed to top (page-scoped; no refresh). */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    const onStatusTap = () => {
      releaseScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("statusTap", onStatusTap);
    return () => window.removeEventListener("statusTap", onStatusTap);
  }, []);

  const setScope = (s: FeedScope) => {
    setScopeState(s);
    const nextView: FeedView = s === "saved" ? "upcoming" : feedView;
    setFeedViewState(nextView);
    navigate(`/releases?scope=${s}&view=${nextView}`);
  };

  const setFeedView = (v: FeedView) => {
    setFeedViewState(v);
    const params = new URLSearchParams();
    if (isArtist) params.set("scope", scope);
    params.set("view", v);
    navigate(`/releases?${params}`);
  };

  const effectiveScope: FeedScope = isArtist ? scope : "saved";
  const effectiveView: FeedView = effectiveScope === "saved" && feedView === "collaborations" ? "upcoming" : feedView;
  const tabGroupClass =
    "flex gap-1 p-1.5 rounded-xl border border-white/10 bg-black/35 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";
  const tabButtonBaseClass =
    "ios-press flex-1 py-2 text-sm font-medium rounded-lg border border-white/10 transition-all";
  const activeTabClass =
    "text-accent-foreground font-semibold border-accent/70 bg-accent shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]";
  const inactiveTabClass = "bg-black/20 text-white/70 hover:text-white hover:bg-black/30";

  const { data: feed } = useQuery<ReleaseFeedItem[]>({
    queryKey: ["/api/releases/feed", effectiveScope, effectiveView],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const params = new URLSearchParams({ view: effectiveView, scope: effectiveScope });
      const res = await fetch(apiUrl(`/api/releases/feed?${params}`), {
        headers,
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch releases");
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const isFeedLoading = feed === undefined;
  const feedItems = feed ?? [];

  const openRelease = useCallback(
    (r: ReleaseFeedItem) => {
      prefetchReleaseDetail(queryClient, r.id);
      const params = new URLSearchParams();
      if (isArtist) params.set("scope", scope);
      params.set("view", feedView);
      navigate(`/releases/${r.id}?${params}`);
    },
    [queryClient, isArtist, scope, feedView, navigate]
  );

  const myReleasesDueToday = useMemo(() => {
    if (isFeedLoading || !isArtist || effectiveScope !== "my" || !currentUser?.id) return [];
    return feedItems.filter(
      (r) =>
        r.artistId === currentUser.id && isReleaseDayToday(r.isComingSoon, r.releaseDate)
    );
  }, [feedItems, isFeedLoading, isArtist, effectiveScope, currentUser?.id]);

  const featuredReleaseIds = useMemo(
    () => new Set(myReleasesDueToday.map((r) => r.id)),
    [myReleasesDueToday]
  );
  const standardDatedFeed = useMemo(
    () => feedItems.filter((r) => r.releaseDate && !r.isComingSoon && !featuredReleaseIds.has(r.id)),
    [feedItems, featuredReleaseIds]
  );
  const standardOutTodayFeed = useMemo(
    () => standardDatedFeed.filter((r) => isReleaseDayToday(r.isComingSoon, r.releaseDate)),
    [standardDatedFeed]
  );
  const standardNonOutTodayFeed = useMemo(
    () => standardDatedFeed.filter((r) => !isReleaseDayToday(r.isComingSoon, r.releaseDate)),
    [standardDatedFeed]
  );

  const renderReleaseCard = (r: ReleaseFeedItem, opts?: { featured?: boolean }) => {
    const savedOutToday = isSavedReleaseOutTodayInList(r, effectiveScope, currentUser?.id);
    const releaseDayHighlight = isReleaseDayHighlight(r);
    const isOwnerReleaseDay = r.artistId === currentUser?.id && releaseDayHighlight;
    return (
      <ReleaseFeedCard
        key={r.id}
        release={r}
        onOpen={() => openRelease(r)}
        highlight={{
          featured: opts?.featured,
          savedOutToday,
          isOwnerReleaseDay,
          releaseDayHighlight,
        }}
      />
    );
  };

  return (
    <>
      <PushPermissionPrompt
        open={releasesPushPromptOpen}
        variant="releases"
        onDismiss={() => setReleasesPushPromptOpen(false)}
      />
      <div
        ref={releaseScrollRef}
        className="flex-1 min-h-0 bg-background overflow-x-hidden overflow-y-auto pb-[var(--releases-feed-bottom-pad)]"
      >
      <div className="app-page-top-pad px-4 max-w-md mx-auto">
        {currentUser?.id && (
          <div className="sticky top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-30 mb-4 space-y-3">
            {isArtist && (
              <div className={tabGroupClass}>
                {(["my", "saved"] as FeedScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`${tabButtonBaseClass} ${
                      scope === s ? activeTabClass : inactiveTabClass
                    }`}
                  >
                    {s === "my" ? "My Releases" : "Saved Releases"}
                  </button>
                ))}
              </div>
            )}
            <div className={tabGroupClass}>
              {(effectiveScope === "my"
                ? (["upcoming", "collaborations", "past"] as FeedView[])
                : (["upcoming", "past"] as FeedView[])
              ).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFeedView(v)}
                  className={`${tabButtonBaseClass} ${
                    feedView === v ? activeTabClass : inactiveTabClass
                  }`}
                >
                  {v === "upcoming" ? "Upcoming" : v === "collaborations" ? "Collaborations" : "Past"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={currentUser?.id ? "pt-14" : undefined}>
        {currentUser?.id && !isFeedLoading && isArtist && effectiveScope === "my" && myReleasesDueToday.length > 0 && (
          <div className="relative z-10 mb-7 rounded-xl border-2 border-amber-300/80 bg-gradient-to-br from-violet-500/16 via-background/86 to-amber-400/22 shadow-[0_0_34px_-8px_rgba(139,92,246,0.4),0_0_78px_-8px_rgba(245,158,11,0.95),0_14px_32px_-18px_rgba(245,158,11,0.6),inset_0_1px_0_rgba(255,255,255,0.14)] p-3 space-y-3">
            <ReleaseDayCelebration releaseId={myReleasesDueToday[0].id} variant="heading" />
            <div className="space-y-3">
              {myReleasesDueToday.map((r) => renderReleaseCard(r, { featured: true }))}
            </div>
          </div>
        )}

        {!currentUser?.id ? (
          <div className="text-center text-muted-foreground py-12">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">Sign in to see releases from artists you’ve liked.</p>
          </div>
        ) : isFeedLoading ? (
          <ReleaseFeedContentLoader />
        ) : feedItems.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Disc3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">
              {feedView === "upcoming"
                ? "No upcoming releases"
                : feedView === "collaborations"
                ? "No collaborations"
                : "No past releases"}
            </p>
            <p className="text-sm">
              {feedView === "upcoming"
                ? effectiveScope === "my"
                  ? "Create a release or accept collaboration invites to see upcoming releases here."
                  : "Like posts that are verified by artists to see their releases here."
                : feedView === "collaborations"
                ? "You'll see releases you're invited to collaborate on here."
                : effectiveScope === "my"
                ? "Past releases from you and collaborations will appear here."
                : "Past releases from liked posts will appear here."}
            </p>
            {isArtist && feedView === "upcoming" && effectiveScope === "my" && (
              <Button className="mt-4" onClick={() => navigate("/releases/new")}>
                Add your first release
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {standardOutTodayFeed.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-white/85">
                  Released today
                </h2>
                {standardOutTodayFeed[0].artistId === currentUser?.id ? (
                  <ReleaseDayCelebration
                    releaseId={standardOutTodayFeed[0].id}
                    title={standardOutTodayFeed[0].title}
                    variant="inline"
                  />
                ) : (
                  <SavedReleaseDayCelebration
                    releaseId={standardOutTodayFeed[0].id}
                    title={standardOutTodayFeed[0].title}
                    variant="inline"
                  />
                )}
                <div className="space-y-4">
                  {standardOutTodayFeed.map((r) => renderReleaseCard(r))}
                </div>
              </section>
            )}
            {groupReleasesByMonth(
              standardNonOutTodayFeed,
              effectiveView === "upcoming" || effectiveView === "collaborations"
            ).map(({ key: monthKey, label: monthLabel, items }) => (
              <section key={monthKey}>
                <h2 className="text-sm font-semibold text-white/85 mb-3">
                  {monthLabel}
                </h2>
                <div className="space-y-4">
                  {items.map((r) => renderReleaseCard(r))}
                </div>
              </section>
            ))}
            {feedItems.some((r) => r.isComingSoon) && (
              <section>
                <h2 className="text-sm font-semibold text-white/85 mb-3 mt-1">
                  Coming soon...
                </h2>
                <div className="space-y-4">
                  {feedItems
                    .filter((r) => r.isComingSoon)
                    .map((r) => {
                      const normalized = normalizeReleaseCardFields(r);
                      const collabDisplay = getCollaborationStatusDisplay(r.collaboratorStatus);
                      return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openRelease(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openRelease(r);
                          }
                        }}
                        className={`${releaseCardBaseClass} min-w-0 overflow-hidden`}
                      >
                        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {normalized.artworkUrl ? (
                            <img src={normalized.artworkUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Music className="w-10 h-10 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="min-w-0 truncate text-xs font-semibold leading-snug text-foreground">
                            {formatReleaseByline(r.artistUsername, r.collaborators)}
                          </p>
                          {normalized.title ? (
                            <p className="text-sm leading-snug text-foreground mt-0.5 min-w-0 line-clamp-2 break-all">
                              {normalized.title}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground mt-1">Coming soon...</p>
                          {getBannerFromLinks(r.links, true) && (
                            <p className="text-xs text-primary mt-1">
                              {getBannerFromLinks(r.links, true)}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2 items-center">
                            <span className="inline-block text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                              Upcoming
                            </span>
                            {collabDisplay && (
                              <span className={collabDisplay.className}>{collabDisplay.label}</span>
                            )}
                          </div>
                          {r.links && r.links.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {sortLinksByPlatform(r.links).map((link) => (
                                <a
                                  key={link.id}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ios-press ios-press-soft inline-flex items-center gap-0.5 rounded p-1 bg-muted hover:bg-muted/80 text-xs"
                                  title={getPlatformLabel(link.platform)}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <PlatformIcon platform={link.platform} className="h-5 w-auto object-contain" />
                                  <span className="max-w-[10rem] truncate">
                                    {getLinkCtaLabel(link.platform, true)}
                                  </span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    })}
                </div>
              </section>
            )}
          </div>
        )}
        </div>
      </div>

      {isArtist && (
        <>
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[29] h-[var(--app-bottom-nav-block)] bg-background" />
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--app-bottom-nav-block)+var(--releases-cta-gap-above-nav))] z-30">
            <div className="absolute inset-x-0 bottom-0 h-[calc(var(--app-bottom-nav-block)+var(--releases-cta-stack-bleed))] bg-background" />
            <div className="absolute inset-x-0 bottom-[calc(var(--app-bottom-nav-block)+var(--releases-cta-stack-bleed))] h-[var(--releases-cta-fade-block)] bg-gradient-to-t from-background via-background/95 via-45% to-transparent" />
            <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background/90 via-background/60 to-transparent" />
            <div className="relative mx-auto max-w-md px-4">
              <div className="relative pt-1 pb-0.5">
                <Button
                  onClick={() => navigate("/releases/new")}
                  className="ios-press pointer-events-auto h-12 w-full rounded-xl border border-white/80 bg-white text-slate-900 shadow-[0_10px_28px_-18px_rgba(255,255,255,0.95),0_10px_24px_-18px_rgba(15,23,42,0.45)] transition-all hover:opacity-95 active:scale-[0.995]"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Release
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}

export { formatDate, isUpcoming };
