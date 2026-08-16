import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, Disc3, GalleryHorizontal, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";
import {
  isReleaseDayTodayFromTiming,
} from "@/lib/release-status";
import { ReleaseDayCelebration, SavedReleaseDayCelebration } from "@/components/release-day-celebration";
import { apiUrl } from "@/lib/apiBase";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
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
import { ArtworkReleaseBrowser } from "@/components/artwork-release-browser";
import { shouldShowSavedReleaseCountdownIndicator } from "@/lib/home-widget-countdown-icon";
import { isHomeReleaseWidgetSelectionEnabled } from "@/lib/home-widget-selection-flag";
import { readHomeWidgetSelectedReleaseId } from "@/lib/home-widget-selection-store";
import {
  buildArtworkReleaseSequence,
  isArtworkViewSupported,
  resolveArtworkEffectiveLayout,
  type ArtworkLayoutMode,
} from "@/lib/artwork-release-browser";
import {
  readReleaseTrackerLayoutPreference,
  writeReleaseTrackerLayoutPreference,
} from "@/lib/release-tracker-layout-preference";
import {
  readReleaseTrackerArtworkSession,
  resolveArtworkSessionReleaseId,
  writeReleaseTrackerArtworkSession,
} from "@/lib/release-tracker-artwork-session";
import {
  RELEASE_FEED_MONTH_HEADING_CLASS,
  RELEASE_FEED_SKELETON_VARIANT,
  RELEASE_TRACKER_ADD_HREF,
  RELEASE_TRACKER_CONTENT_TOP_GAP_CLASS,
  RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS,
  RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS,
  RELEASE_TRACKER_PRIMARY_LABEL_CLASS,
  RELEASE_TRACKER_PRIMARY_ROW_CLASS,
  RELEASE_TRACKER_SECONDARY_ROW_CLASS,
  RELEASE_TRACKER_STICKY_CHROME_CLASS,
  RELEASE_TRACKER_STICKY_FADE_CLASS,
  coerceReleaseTrackerView,
  getReleaseTrackerEmptyCopy,
  getReleaseTrackerSecondaryViews,
  getScopeFromSearch,
  getViewFromSearch,
  shouldShowReleaseFeedByline,
  type ReleaseTrackerFeedScope,
  type ReleaseTrackerFeedView,
} from "@/lib/release-tracker-presentation";
import { cn } from "@/lib/utils";

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

type FeedView = ReleaseTrackerFeedView;
type FeedScope = ReleaseTrackerFeedScope;

/** Saved Releases feed: release drops today for someone else’s track (not your own release). */
function isSavedReleaseOutTodayInList(
  r: ReleaseFeedItem,
  scope: FeedScope,
  currentUserId: string | undefined
): boolean {
  if (scope !== "saved" || !currentUserId) return false;
  if (r.artistId === currentUserId) return false;
  return isReleaseDayTodayFromTiming(r);
}

function ReleaseFeedContentLoader() {
  return (
    <div
      className="divide-y divide-white/10 py-1"
      aria-busy="true"
      aria-label="Loading releases"
      data-skeleton-variant={RELEASE_FEED_SKELETON_VARIANT}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex gap-3.5 py-3.5"
          data-testid="release-feed-row-skeleton"
        >
          <DubHubSkeletonBar tone="teal" className="h-24 w-24 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <DubHubSkeletonBar tone="default" className="h-4 w-full max-w-[14rem]" />
            <DubHubSkeletonBar tone="mid" className="h-3 w-2/3 max-w-[10rem]" />
            <DubHubSkeletonBar tone="faint" className="h-3 w-1/3 max-w-[5.5rem]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Any release with release_date = today (for glow and Out today badge). */
function isReleaseDayHighlight(r: ReleaseFeedItem): boolean {
  return isReleaseDayTodayFromTiming(r);
}

export default function ReleaseTracker() {
  const [location, navigate] = useLocation();
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
  const [layoutMode, setLayoutMode] = useState<ArtworkLayoutMode>("list");
  const [artworkFocusReleaseId, setArtworkFocusReleaseId] = useState<string | null>(
    null,
  );
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

  const setLayoutPreference = useCallback(
    (mode: ArtworkLayoutMode) => {
      setLayoutMode(mode);
      if (currentUser?.id) {
        writeReleaseTrackerLayoutPreference(currentUser.id, mode);
      }
    },
    [currentUser?.id],
  );

  const effectiveScope: FeedScope = isArtist ? scope : "saved";
  const effectiveView: FeedView = coerceReleaseTrackerView(effectiveScope, feedView);
  const artworkSupported = isArtworkViewSupported(effectiveView);
  const effectiveLayout = resolveArtworkEffectiveLayout({
    requested: layoutMode,
    view: effectiveView,
  });

  const rememberArtworkFocus = useCallback(
    (releaseId: string) => {
      setArtworkFocusReleaseId(releaseId);
      if (!currentUser?.id) return;
      writeReleaseTrackerArtworkSession(currentUser.id, {
        scope: effectiveScope,
        view: effectiveView,
        selectedReleaseId: releaseId,
      });
    },
    [currentUser?.id, effectiveScope, effectiveView],
  );

  // Hydrate layout preference + session focus before paint when possible.
  // Collaborations forces List via effectiveLayout without writing over Artwork prefs.
  useLayoutEffect(() => {
    if (!currentUser?.id) {
      setLayoutMode("list");
      setArtworkFocusReleaseId(null);
      return;
    }
    setLayoutMode(readReleaseTrackerLayoutPreference(currentUser.id));
    const session = readReleaseTrackerArtworkSession(currentUser.id);
    setArtworkFocusReleaseId(
      resolveArtworkSessionReleaseId({
        session,
        scope: effectiveScope,
        view: effectiveView,
      }),
    );
  }, [currentUser?.id, effectiveScope, effectiveView]);

  const {
    data: feed,
    isError: isFeedError,
    refetch: refetchFeed,
    isFetching: isFeedFetching,
  } = useQuery<ReleaseFeedItem[]>({
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

  const isFeedLoading = feed === undefined && !isFeedError;
  const feedItems = feed ?? [];
  const emptyCopy = getReleaseTrackerEmptyCopy({ view: feedView, scope: effectiveScope });

  const openRelease = useCallback(
    (r: ReleaseFeedItem) => {
      if (effectiveLayout === "artwork") {
        rememberArtworkFocus(r.id);
      }
      prefetchReleaseDetail(queryClient, r.id);
      const params = new URLSearchParams();
      if (isArtist) params.set("scope", scope);
      params.set("view", feedView);
      navigate(`/releases/${r.id}?${params}`);
    },
    [
      queryClient,
      isArtist,
      scope,
      feedView,
      navigate,
      effectiveLayout,
      rememberArtworkFocus,
    ],
  );

  const myReleasesDueToday = useMemo(() => {
    if (isFeedLoading || !isArtist || effectiveScope !== "my" || !currentUser?.id) return [];
    return feedItems.filter(
      (r) =>
        r.artistId === currentUser.id && isReleaseDayTodayFromTiming(r)
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
    () => standardDatedFeed.filter((r) => isReleaseDayTodayFromTiming(r)),
    [standardDatedFeed]
  );
  const standardNonOutTodayFeed = useMemo(
    () => standardDatedFeed.filter((r) => !isReleaseDayTodayFromTiming(r)),
    [standardDatedFeed]
  );
  const comingSoonFeed = useMemo(
    () => feedItems.filter((r) => r.isComingSoon),
    [feedItems],
  );
  const artworkSequence = useMemo(
    () =>
      buildArtworkReleaseSequence({
        featured: myReleasesDueToday,
        outToday: standardOutTodayFeed,
        datedRest: standardNonOutTodayFeed,
        comingSoon: comingSoonFeed,
      }),
    [
      myReleasesDueToday,
      standardOutTodayFeed,
      standardNonOutTodayFeed,
      comingSoonFeed,
    ],
  );

  const countdownFlagEnabled =
    isHomeReleaseWidgetSelectionEnabled() && effectiveScope === "saved";
  const selectedCountdownReleaseId = useMemo(() => {
    if (!countdownFlagEnabled || !currentUser?.id) return null;
    return readHomeWidgetSelectedReleaseId(currentUser.id);
    // Re-read when returning from Release Detail so the status indicator updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location is an intentional refresh key
  }, [countdownFlagEnabled, currentUser?.id, location]);

  const renderReleaseCard = (r: ReleaseFeedItem, opts?: { featured?: boolean }) => {
    const savedOutToday = isSavedReleaseOutTodayInList(r, effectiveScope, currentUser?.id);
    const releaseDayHighlight = isReleaseDayHighlight(r);
    const isOwnerReleaseDay = r.artistId === currentUser?.id && releaseDayHighlight;
    return (
      <ReleaseFeedCard
        key={r.id}
        release={r}
        onOpen={() => openRelease(r)}
        showByline={shouldShowReleaseFeedByline({
          scope: effectiveScope,
          view: effectiveView,
          currentUserId: currentUser?.id,
          artistId: r.artistId,
          collaborators: r.collaborators,
        })}
        highlight={{
          featured: opts?.featured,
          savedOutToday,
          isOwnerReleaseDay,
          releaseDayHighlight,
        }}
        showCountdownSelectedIndicator={shouldShowSavedReleaseCountdownIndicator({
          flagEnabled: countdownFlagEnabled,
          selectedReleaseId: selectedCountdownReleaseId,
          cardReleaseId: r.id,
        })}
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
        className={cn(
          "flex-1 min-h-0 bg-background overflow-x-hidden overflow-y-auto",
          isArtist
            ? "pb-[var(--releases-feed-bottom-pad)]"
            : "pb-[var(--releases-feed-bottom-pad-listener)]",
        )}
      >
      <div className="px-4 max-w-md mx-auto">
        {currentUser?.id && (
          <div
            className={RELEASE_TRACKER_STICKY_CHROME_CLASS}
            data-testid="releases-sticky-chrome"
          >
            {isArtist && (
              <div
                className={RELEASE_TRACKER_PRIMARY_ROW_CLASS}
                role="group"
                aria-label="Release collection"
              >
                {(["my", "saved"] as FeedScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    aria-pressed={scope === s}
                    className={cn(
                      RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS,
                      scope === s
                        ? RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS
                        : RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
                    )}
                  >
                    <span
                      className={cn(
                        RELEASE_TRACKER_PRIMARY_LABEL_CLASS,
                        scope === s && RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS,
                      )}
                    >
                      {s === "my" ? "My Releases" : "Saved Releases"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className={RELEASE_TRACKER_SECONDARY_ROW_CLASS}>
              <div
                className="flex min-h-11 min-w-0 flex-1"
                role="tablist"
                aria-label="Release list"
              >
                {getReleaseTrackerSecondaryViews(effectiveScope).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={feedView === v}
                    onClick={() => setFeedView(v)}
                    className={cn(
                      "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-0.5 text-[13px] leading-tight transition-colors",
                      feedView === v
                        ? "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
                        : "font-medium text-white/55 hover:text-white/80",
                    )}
                  >
                    {v === "upcoming" ? "Upcoming" : v === "collaborations" ? "Collaborations" : "Past"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!artworkSupported}
                aria-label={
                  effectiveLayout === "artwork"
                    ? "Switch to list view"
                    : "Switch to artwork view"
                }
                aria-pressed={effectiveLayout === "artwork"}
                title={
                  artworkSupported
                    ? effectiveLayout === "artwork"
                      ? "Switch to list view"
                      : "Switch to artwork view"
                    : undefined
                }
                onClick={() =>
                  setLayoutPreference(effectiveLayout === "artwork" ? "list" : "artwork")
                }
                className={cn(
                  // No mb-* here: margin expands the items-end secondary flex line and
                  // drops Upcoming/Collaborations/Past below Leaderboard timeframe labels.
                  "ios-press flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
                  artworkSupported
                    ? "text-white/60 hover:text-white"
                    : "cursor-not-allowed text-white/30 hover:text-white/30 disabled:pointer-events-none disabled:opacity-100",
                )}
                data-testid="releases-layout-toggle"
              >
                {effectiveLayout === "artwork" ? (
                  <List className="h-4 w-4" aria-hidden />
                ) : (
                  <GalleryHorizontal className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            <div
              className={RELEASE_TRACKER_STICKY_FADE_CLASS}
              aria-hidden
              data-testid="releases-sticky-fade"
            />
          </div>
        )}

        <div
          className={
            currentUser?.id ? RELEASE_TRACKER_CONTENT_TOP_GAP_CLASS : "app-page-top-pad"
          }
        >
        {currentUser?.id && !isFeedLoading && !isFeedError && isArtist && effectiveScope === "my" && myReleasesDueToday.length > 0 && effectiveLayout === "list" && (
          <div className="relative z-10 mb-5 space-y-2 border-b border-white/10 pb-3">
            <ReleaseDayCelebration releaseId={myReleasesDueToday[0].id} variant="heading" />
            <div className="divide-y divide-white/10">
              {myReleasesDueToday.map((r) => renderReleaseCard(r, { featured: true }))}
            </div>
          </div>
        )}

        {!currentUser?.id ? (
          <div className="text-center text-muted-foreground py-12">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">Sign in to see releases from artists you’ve liked.</p>
          </div>
        ) : isFeedError ? (
          <div className="text-center text-muted-foreground py-12" data-testid="release-feed-error">
            <Disc3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2 text-foreground">Couldn't load releases.</p>
            <Button
              className="mt-4"
              onClick={() => {
                void refetchFeed();
              }}
              disabled={isFeedFetching}
            >
              Try again
            </Button>
          </div>
        ) : isFeedLoading ? (
          <ReleaseFeedContentLoader />
        ) : feedItems.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Disc3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">
              {emptyCopy.title}
            </p>
            <p className="text-sm">
              {emptyCopy.body}
            </p>
            {isArtist && feedView === "upcoming" && effectiveScope === "my" && (
              <Button className="mt-4" onClick={() => navigate(RELEASE_TRACKER_ADD_HREF)}>
                Add your first release
              </Button>
            )}
          </div>
        ) : effectiveLayout === "artwork" ? (
          <ArtworkReleaseBrowser
            releases={artworkSequence}
            onOpen={(r) => openRelease(r)}
            showBylineFor={(r) =>
              shouldShowReleaseFeedByline({
                scope: effectiveScope,
                view: effectiveView,
                currentUserId: currentUser?.id,
                artistId: r.artistId,
                collaborators: r.collaborators,
              })
            }
            countdownFlagEnabled={countdownFlagEnabled}
            selectedCountdownReleaseId={selectedCountdownReleaseId}
            initialReleaseId={artworkFocusReleaseId}
            onSettledReleaseChange={rememberArtworkFocus}
          />
        ) : (
          <div className="space-y-7">
            {standardOutTodayFeed.length > 0 && (
              <section className="space-y-2">
                <h2 className={RELEASE_FEED_MONTH_HEADING_CLASS}>
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
                <div className="divide-y divide-white/10">
                  {standardOutTodayFeed.map((r) => renderReleaseCard(r))}
                </div>
              </section>
            )}
            {groupReleasesByMonth(
              standardNonOutTodayFeed,
              effectiveView === "upcoming" || effectiveView === "collaborations"
            ).map(({ key: monthKey, label: monthLabel, items }) => (
              <section key={monthKey}>
                <h2 className={RELEASE_FEED_MONTH_HEADING_CLASS}>
                  {monthLabel}
                </h2>
                <div className="divide-y divide-white/10">
                  {items.map((r) => renderReleaseCard(r))}
                </div>
              </section>
            ))}
            {feedItems.some((r) => r.isComingSoon) && (
              <section>
                <h2 className={cn(RELEASE_FEED_MONTH_HEADING_CLASS, "mt-1")}>
                  Coming soon...
                </h2>
                <div className="divide-y divide-white/10">
                  {feedItems
                    .filter((r) => r.isComingSoon)
                    .map((r) => renderReleaseCard(r))}
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
            <div className="absolute inset-x-0 bottom-[calc(var(--app-bottom-nav-block)+var(--releases-cta-stack-bleed))] h-[var(--releases-cta-fade-block)] bg-gradient-to-t from-background via-background/90 to-transparent" />
            <div className="relative mx-auto max-w-md px-4">
              <div className="relative pt-1 pb-0.5">
                <Button
                  onClick={() => navigate(RELEASE_TRACKER_ADD_HREF)}
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
