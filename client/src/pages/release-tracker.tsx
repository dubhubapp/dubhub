import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
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
import { prefetchReleaseArtworkAtmosphere } from "@/lib/release-artwork-atmosphere";
import {
  isPushPromptSessionActive,
  markReleasesPushPromptHandled,
  shouldOfferReleasesPushPrompt,
} from "@/lib/push-prompt";
import { Capacitor } from "@capacitor/core";
import { useLgNav5aDestinationProbe, useLgNav5aRenderCycle } from "@/lib/lg-nav-5a-timing";
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
  ARTWORK_VIEW_COLUMN_CLASS,
  ARTWORK_VIEW_WELL_CLASS,
  buildArtworkReleaseSequence,
  isArtworkViewSupported,
  resolveArtworkEffectiveLayout,
  resolveArtworkViewColumnMinHClass,
  resolveArtworkViewPageBottomPadClass,
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
  RELEASE_FEED_DIVIDE_CLASS,
  RELEASE_FEED_MONTH_HEADING_CLASS,
  RELEASE_FEED_SKELETON_VARIANT,
  RELEASE_TRACKER_ADD_HREF,
  RELEASE_TRACKER_ADD_CTA_CLASS,
  RELEASE_TRACKER_CONTENT_TOP_GAP_CLASS,
  RELEASE_TRACKER_EMPTY_BODY_CLASS,
  RELEASE_TRACKER_EMPTY_CLASS,
  RELEASE_TRACKER_EMPTY_CTA_CLASS,
  RELEASE_TRACKER_EMPTY_ICON_CLASS,
  RELEASE_TRACKER_EMPTY_REGION_CLASS,
  RELEASE_TRACKER_EMPTY_TITLE_CLASS,
  RELEASE_TRACKER_FAB_FADE_CLASS,
  RELEASE_TRACKER_CTA_SLAB_ATTR,
  RELEASE_TRACKER_FAB_UNDERLAY_CLASS,
  RELEASE_TRACKER_NAV_SHELF_ATTR,
  RELEASE_TRACKER_PAGE_CLASS,
  RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS,
  RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS,
  RELEASE_TRACKER_PRIMARY_LABEL_CLASS,
  RELEASE_TRACKER_PRIMARY_ROW_CLASS,
  RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS,
  RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS,
  RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS,
  RELEASE_TRACKER_SECONDARY_INDICATOR_TAP_MS,
  RELEASE_TRACKER_SECONDARY_ROW_CLASS,
  RELEASE_TRACKER_SECONDARY_TABLIST_CLASS,
  RELEASE_TRACKER_STICKY_CHROME_CLASS,
  RELEASE_TRACKER_STICKY_FADE_CLASS,
  coerceReleaseTrackerView,
  getReleaseTrackerEmptyCopy,
  getReleaseTrackerSecondaryViews,
  getScopeFromSearch,
  getViewFromSearch,
  hasOwnedReleaseHistory,
  resolveMyUpcomingEmptyReleaseCtaLabel,
  shouldShowReleaseFeedByline,
  type ReleaseTrackerFeedScope,
  type ReleaseTrackerFeedView,
} from "@/lib/release-tracker-presentation";
import {
  RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS,
  RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS,
  RELEASE_TRACKER_TAB_PAGER_PANEL_STABLE_UNLOCK_CLASS,
  RELEASE_TRACKER_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS,
  RELEASE_TRACKER_TAB_PAGER_SNAP_EASING,
  RELEASE_TRACKER_TAB_PAGER_SNAP_MS,
  RELEASE_TRACKER_TAB_PAGER_TRACK_CLASS,
  RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS,
  getReleaseTrackerPagerAdjacentViews,
  interpolateReleaseTrackerNavIndicator,
  prefersReleaseTrackerPagerReducedMotion,
  releaseTrackerPagerUnlockCovers,
  releaseTrackerSecondaryIndicatorMetricsFromTabRect,
  releaseTrackerSecondaryTabEmphasisColor,
  releaseTrackerViewIndex,
  resolveReleaseTrackerPagerHostHeightPx,
  resolveReleaseTrackerPagerPrepareUnlockIndices,
  resolveReleaseTrackerPagerVertUnlockIndices,
  resolveReleaseTrackerSecondaryTabEmphasis,
  useReleaseTrackerTabPager,
  type ReleaseTrackerNavIndicatorMetrics,
  type ReleaseTrackerPagerProgressEvent,
} from "@/lib/release-tracker-tab-swipe";
import { useDelayedReleaseFeedSkeleton } from "@/lib/use-delayed-release-feed-skeleton";
import { playInteractionLight } from "@/lib/haptic";
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
      className={cn(RELEASE_FEED_DIVIDE_CLASS, "py-1")}
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
          <DubHubSkeletonBar tone="mid" className="h-[7.5rem] w-[7.5rem] shrink-0 rounded-lg ring-1 ring-white/10" />
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

/**
 * Delayed visual skeleton for uncached first fetches.
 * Remount via key={scope-view} so each tab gets a fresh quiet window.
 * aria-busy remains during the quiet interval (no repeated live announcements).
 */
function ReleaseFeedDelayedLoader() {
  const showSkeleton = useDelayedReleaseFeedSkeleton(true);
  if (showSkeleton) {
    return <ReleaseFeedContentLoader />;
  }
  return (
    <div
      aria-busy="true"
      aria-label="Loading releases"
      data-testid="release-feed-loading-quiet"
    />
  );
}

/** Any release with release_date = today (for glow and Out today badge). */
function isReleaseDayHighlight(r: ReleaseFeedItem): boolean {
  return isReleaseDayTodayFromTiming(r);
}

export default function ReleaseTracker() {
  useLgNav5aDestinationProbe("releases");
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
    // RELEASES-SWIPE-TABS-6 — one light haptic on successful secondary change
    // (tap + swipe commit share this path). Primary My/Saved uses setScope.
    if (v !== feedView) {
      playInteractionLight();
    }
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
  const secondaryViews = useMemo(
    () => getReleaseTrackerSecondaryViews(effectiveScope),
    [effectiveScope],
  );
  /** List-mode secondary pager only — artwork keeps tap-only single pane. */
  const listPagerEnabled = !!currentUser?.id && effectiveLayout === "list";
  const adjacentViews = useMemo(
    () => getReleaseTrackerPagerAdjacentViews(secondaryViews, effectiveView),
    [secondaryViews, effectiveView],
  );

  const pagerViewportRef = useRef<HTMLDivElement | null>(null);
  const pagerTrackRef = useRef<HTMLDivElement | null>(null);
  const pagerPanelRefs = useRef<(HTMLElement | null)[]>([]);
  const secondaryTablistRef = useRef<HTMLDivElement | null>(null);
  const secondaryIndicatorRef = useRef<HTMLSpanElement | null>(null);
  const secondaryTabButtonRefs = useRef<
    Partial<Record<ReleaseTrackerFeedView, HTMLButtonElement | null>>
  >({});
  const secondaryNavMetricsRef = useRef<
    Partial<Record<ReleaseTrackerFeedView, ReleaseTrackerNavIndicatorMetrics>>
  >({});
  const secondaryIndicatorPhaseRef = useRef<"idle" | "dragging" | "snapping">("idle");
  const pagerViewRef = useRef<FeedView>(effectiveView);
  pagerViewRef.current = effectiveView;
  const pagerHostHeightKeyRef = useRef("");
  const pagerHeightPhaseRef = useRef<ReleaseTrackerPagerProgressEvent["phase"]>("idle");
  const pagerPanelHeightCacheRef = useRef<{ key: string; heights: Record<number, number> }>({
    key: "",
    heights: {},
  });
  const pagerVertUnlockIndicesRef = useRef<number[] | null>(null);
  const [pagerVertUnlockIndices, setPagerVertUnlockIndices] = useState<number[] | null>(
    null,
  );

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
  // effectiveLayout never writes over stored Artwork prefs.
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

  const fetchReleasesFeed = useCallback(
    async (scopeArg: FeedScope, viewArg: FeedView): Promise<ReleaseFeedItem[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const params = new URLSearchParams({ view: viewArg, scope: scopeArg });
      const res = await fetch(apiUrl(`/api/releases/feed?${params}`), {
        headers,
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch releases");
      return res.json();
    },
    [],
  );

  const {
    data: artworkFeed,
    isError: isArtworkFeedError,
    refetch: refetchArtworkFeed,
    isFetching: isArtworkFeedFetching,
    status: artworkFeedQueryStatus,
    fetchStatus: artworkFeedFetchStatus,
    dataUpdatedAt: artworkFeedDataUpdatedAt,
  } = useQuery<ReleaseFeedItem[]>({
    queryKey: ["/api/releases/feed", effectiveScope, effectiveView],
    queryFn: () => fetchReleasesFeed(effectiveScope, effectiveView),
    enabled: !!currentUser?.id && !listPagerEnabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const listPanelQueries = useQueries({
    queries: secondaryViews.map((view) => {
      const isActive = view === effectiveView;
      const isAdjacent = adjacentViews.includes(view);
      return {
        queryKey: ["/api/releases/feed", effectiveScope, view] as const,
        queryFn: () => fetchReleasesFeed(effectiveScope, view),
        enabled: !!currentUser?.id && listPagerEnabled && (isActive || isAdjacent),
        staleTime: 0,
        refetchOnMount: isActive ? ("always" as const) : false,
        refetchOnReconnect: isActive,
        refetchOnWindowFocus: isActive,
      };
    }),
  });

  // Prefetch only ±1 adjacent keys (no non-adjacent).
  useEffect(() => {
    if (!listPagerEnabled || !currentUser?.id) return;
    for (const view of adjacentViews) {
      void queryClient.prefetchQuery({
        queryKey: ["/api/releases/feed", effectiveScope, view],
        queryFn: () => fetchReleasesFeed(effectiveScope, view),
      });
    }
  }, [
    listPagerEnabled,
    currentUser?.id,
    adjacentViews,
    effectiveScope,
    queryClient,
    fetchReleasesFeed,
  ]);

  const activeListPanelIndex = releaseTrackerViewIndex(secondaryViews, effectiveView);
  const activeListPanelQuery = listPanelQueries[activeListPanelIndex];

  const feed = listPagerEnabled ? activeListPanelQuery?.data : artworkFeed;
  const isFeedError = listPagerEnabled
    ? !!activeListPanelQuery?.isError
    : isArtworkFeedError;
  const refetchFeed = listPagerEnabled
    ? () => activeListPanelQuery?.refetch()
    : refetchArtworkFeed;
  const isFeedFetching = listPagerEnabled
    ? !!activeListPanelQuery?.isFetching
    : isArtworkFeedFetching;
  const feedQueryStatus = listPagerEnabled
    ? (activeListPanelQuery?.status ?? "pending")
    : artworkFeedQueryStatus;
  const feedFetchStatus = listPagerEnabled
    ? (activeListPanelQuery?.fetchStatus ?? "idle")
    : artworkFeedFetchStatus;
  const feedDataUpdatedAt = listPagerEnabled
    ? (activeListPanelQuery?.dataUpdatedAt ?? 0)
    : artworkFeedDataUpdatedAt;

  const isFeedLoading = feed === undefined && !isFeedError;
  const feedItems = feed ?? [];

  /**
   * Warm My Past in parallel for artist My Releases (same query key as Past tab).
   * Skip when main feed is already My Past — one observer, no duplicate key/work.
   * Keeps Past ownership cache fresh under existing feed invalidation.
   */
  const shouldWarmMyPastFeed =
    !!currentUser?.id &&
    isArtist &&
    effectiveScope === "my" &&
    effectiveView !== "past";

  const myPastWarmQuery = useQuery<ReleaseFeedItem[]>({
    queryKey: ["/api/releases/feed", "my", "past"],
    queryFn: () => fetchReleasesFeed("my", "past"),
    enabled: shouldWarmMyPastFeed,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  /** Owned history for My Upcoming empty copy — null until Past is known. */
  const ownedReleaseHistoryKnown: boolean | null = (() => {
    if (!isArtist || effectiveScope !== "my") return null;
    if (effectiveView === "past") {
      if (isFeedLoading) return null;
      return hasOwnedReleaseHistory(feedItems, currentUser?.id);
    }
    if (!myPastWarmQuery.isFetched && myPastWarmQuery.data === undefined) return null;
    return hasOwnedReleaseHistory(myPastWarmQuery.data ?? [], currentUser?.id);
  })();

  const emptyCopy = getReleaseTrackerEmptyCopy({
    view: feedView,
    scope: effectiveScope,
    hasOwnedReleaseHistory: ownedReleaseHistoryKnown,
  });

  const showMyUpcomingEmptyCta =
    isArtist &&
    feedView === "upcoming" &&
    effectiveScope === "my";

  /** Stable empty CTA — no first/next flicker (see resolveMyUpcomingEmptyReleaseCtaLabel). */
  const myUpcomingEmptyCtaLabel = resolveMyUpcomingEmptyReleaseCtaLabel();

  useLgNav5aRenderCycle("releases", {
    scope: effectiveScope,
    view: feedView,
    feed: {
      status: feedQueryStatus,
      fetchStatus: feedFetchStatus,
      isLoading: isFeedLoading,
      isFetching: isFeedFetching,
      rows: feedItems.length,
      dataUpdatedAt: feedDataUpdatedAt,
    },
  });

  const openRelease = useCallback(
    (r: ReleaseFeedItem) => {
      if (effectiveLayout === "artwork") {
        rememberArtworkFocus(r.id);
      }
      prefetchReleaseDetail(queryClient, r.id);
      prefetchReleaseArtworkAtmosphere(r.artworkUrl);
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

  const artworkWellActive =
    effectiveLayout === "artwork" &&
    !!currentUser?.id &&
    !isFeedLoading &&
    !isFeedError &&
    feedItems.length > 0;

  /** Empty / error / signed-out: flex-centre in the band between tabs and Add Release.
   * List pager also fills the column so short lists keep a full swipe canvas. */
  const isEmptyContentRegion =
    !currentUser?.id ||
    isFeedError ||
    (!isFeedLoading && !isFeedError && feedItems.length === 0);

  const fillReleasesContentColumn =
    artworkWellActive || isEmptyContentRegion || listPagerEnabled;

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

  const renderReleaseCard = (
    r: ReleaseFeedItem,
    opts?: { featured?: boolean; view?: FeedView },
  ) => {
    const cardView = opts?.view ?? effectiveView;
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
          view: cardView,
          currentUserId: currentUser?.id,
          artistId: r.artistId,
          collaborators: r.collaborators,
        })}
        omitOwnHandle={
          effectiveScope === "my" &&
          cardView !== "collaborations" &&
          !!currentUser?.id &&
          r.artistId === currentUser.id
        }
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

  const applySecondaryNavIndicator = useCallback(
    (
      metrics: { left: number; width: number; bottom: number },
      opts: { animate: boolean; durationMs: number; reducedMotion: boolean },
    ) => {
      const el = secondaryIndicatorRef.current;
      if (!el) return;
      const reduced = opts.reducedMotion || prefersReleaseTrackerPagerReducedMotion();
      if (opts.animate && !reduced) {
        el.style.transition = `left ${opts.durationMs}ms ${RELEASE_TRACKER_TAB_PAGER_SNAP_EASING}, width ${opts.durationMs}ms ${RELEASE_TRACKER_TAB_PAGER_SNAP_EASING}, bottom ${opts.durationMs}ms ${RELEASE_TRACKER_TAB_PAGER_SNAP_EASING}`;
      } else {
        el.style.transition = "none";
      }
      el.style.left = `${metrics.left}px`;
      el.style.width = `${Math.max(0, metrics.width)}px`;
      el.style.bottom = `${metrics.bottom}px`;
    },
    [],
  );

  const measureSecondaryNavTriggers = useCallback(() => {
    const list = secondaryTablistRef.current;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const next: Partial<Record<ReleaseTrackerFeedView, ReleaseTrackerNavIndicatorMetrics>> =
      {};
    for (const id of secondaryViews) {
      const trigger = list.querySelector<HTMLElement>(`[data-releases-secondary-tab="${id}"]`);
      if (!trigger) continue;
      const rect = trigger.getBoundingClientRect();
      next[id] = releaseTrackerSecondaryIndicatorMetricsFromTabRect({
        tabLeft: rect.left,
        tabWidth: rect.width,
        tabBottom: rect.bottom,
        listLeft: listRect.left,
        listBottom: listRect.bottom,
      });
    }
    secondaryNavMetricsRef.current = next;
  }, [secondaryViews]);

  const syncSecondaryNavIndicatorToView = useCallback(
    (view: FeedView, opts: { animate: boolean; durationMs: number }) => {
      measureSecondaryNavTriggers();
      const metrics = secondaryNavMetricsRef.current[view];
      if (!metrics) return;
      applySecondaryNavIndicator(metrics, {
        animate: opts.animate,
        durationMs: opts.durationMs,
        reducedMotion: prefersReleaseTrackerPagerReducedMotion(),
      });
    },
    [applySecondaryNavIndicator, measureSecondaryNavTriggers],
  );

  const measurePagerPanelHeight = useCallback((index: number) => {
    const el = pagerPanelRefs.current[index];
    if (!el) return 0;
    // Prefer scrollHeight so collapsed (h-0) adjacent panels still report content size.
    return Math.ceil(
      Math.max(el.scrollHeight, el.offsetHeight, el.getBoundingClientRect().height),
    );
  }, []);

  const pagerGeometryCacheKey = useCallback(() => {
    const width = Math.round(
      pagerViewportRef.current?.getBoundingClientRect().width ||
        (typeof window !== "undefined" ? window.innerWidth : 0),
    );
    return `${effectiveScope}:${effectiveView}:${effectiveLayout}:${secondaryViews.join(",")}:${width}`;
  }, [effectiveScope, effectiveView, effectiveLayout, secondaryViews]);

  const cachePagerPanelHeights = useCallback(
    (indices: readonly number[]) => {
      const key = pagerGeometryCacheKey();
      const prev = pagerPanelHeightCacheRef.current;
      const heights =
        prev.key === key ? { ...prev.heights } : ({} as Record<number, number>);
      for (const index of indices) {
        heights[index] = measurePagerPanelHeight(index);
      }
      pagerPanelHeightCacheRef.current = { key, heights };
    },
    [measurePagerPanelHeight, pagerGeometryCacheKey],
  );

  const readCachedPagerPanelHeight = useCallback((index: number) => {
    const cache = pagerPanelHeightCacheRef.current;
    if (cache.key !== pagerGeometryCacheKey()) return null;
    const h = cache.heights[index];
    return typeof h === "number" ? h : null;
  }, [pagerGeometryCacheKey]);

  const applyHostMinHeightFromCache = useCallback(
    (
      phase: ReleaseTrackerPagerProgressEvent["phase"],
      unlock: number[] | null,
      opts?: { currentIndex: number; adjacentIndex: number | null },
    ) => {
      const viewport = pagerViewportRef.current;
      if (!viewport) return;
      if (phase === "idle" || !unlock || unlock.length === 0) {
        viewport.style.minHeight = "";
        return;
      }
      cachePagerPanelHeights(unlock);
      const viewportFloor = Math.ceil(viewport.getBoundingClientRect().height);
      if (opts) {
        const currentHeight = Math.max(
          viewportFloor,
          readCachedPagerPanelHeight(opts.currentIndex) ??
            measurePagerPanelHeight(opts.currentIndex),
        );
        const adjacentHeight =
          opts.adjacentIndex == null
            ? null
            : Math.max(
                viewportFloor,
                readCachedPagerPanelHeight(opts.adjacentIndex) ??
                  measurePagerPanelHeight(opts.adjacentIndex),
              );
        const hostH = resolveReleaseTrackerPagerHostHeightPx({
          phase,
          currentHeight,
          adjacentHeight,
        });
        viewport.style.minHeight = `${hostH}px`;
        return;
      }
      // Prepare path: hold max of current ±1 so either swipe direction is safe.
      let maxH = viewportFloor;
      for (const index of unlock) {
        maxH = Math.max(
          maxH,
          readCachedPagerPanelHeight(index) ?? measurePagerPanelHeight(index),
        );
      }
      viewport.style.minHeight = `${maxH}px`;
    },
    [cachePagerPanelHeights, measurePagerPanelHeight, readCachedPagerPanelHeight],
  );

  const setPagerVertUnlock = useCallback((unlock: number[] | null) => {
    pagerVertUnlockIndicesRef.current = unlock;
    setPagerVertUnlockIndices((prev) => {
      if (prev == null && unlock == null) return prev;
      if (
        prev != null &&
        unlock != null &&
        prev.length === unlock.length &&
        prev.every((v, i) => v === unlock[i])
      ) {
        return prev;
      }
      return unlock;
    });
  }, []);

  const applyPagerHostHeight = useCallback(
    (event: Pick<ReleaseTrackerPagerProgressEvent, "phase" | "currentIndex" | "adjacentIndex">) => {
      const key = `${event.phase}:${event.currentIndex}:${event.adjacentIndex ?? "x"}`;
      if (key === pagerHostHeightKeyRef.current && event.phase !== "idle") {
        return;
      }

      const unlock = resolveReleaseTrackerPagerVertUnlockIndices({
        phase: event.phase,
        currentIndex: event.currentIndex,
        adjacentIndex: event.adjacentIndex,
      });

      // First armed progress: prepare already unlocked current±1 — skip React work.
      if (
        event.phase !== "idle" &&
        releaseTrackerPagerUnlockCovers(pagerVertUnlockIndicesRef.current, unlock)
      ) {
        pagerHostHeightKeyRef.current = key;
        pagerHeightPhaseRef.current = event.phase;
        applyHostMinHeightFromCache(event.phase, unlock ?? pagerVertUnlockIndicesRef.current, {
          currentIndex: event.currentIndex,
          adjacentIndex: event.adjacentIndex,
        });
        return;
      }

      pagerHostHeightKeyRef.current = key;
      pagerHeightPhaseRef.current = event.phase;
      setPagerVertUnlock(unlock);

      if (event.phase === "idle") {
        const viewport = pagerViewportRef.current;
        if (viewport) viewport.style.minHeight = "";
      }
    },
    [applyHostMinHeightFromCache, setPagerVertUnlock],
  );

  const clearSecondaryTabVisualEmphasis = useCallback(() => {
    for (const id of secondaryViews) {
      const el = secondaryTabButtonRefs.current[id];
      if (!el) continue;
      el.style.transition = "";
      el.style.color = "";
    }
  }, [secondaryViews]);

  const applySecondaryTabVisualEmphasis = useCallback(
    (event: ReleaseTrackerPagerProgressEvent) => {
      if (!listPagerEnabled) return;
      const reduced = event.reducedMotion || prefersReleaseTrackerPagerReducedMotion();
      const durationMs = event.durationMs ?? RELEASE_TRACKER_TAB_PAGER_SNAP_MS;
      for (let tabIndex = 0; tabIndex < secondaryViews.length; tabIndex++) {
        const id = secondaryViews[tabIndex]!;
        const el = secondaryTabButtonRefs.current[id];
        if (!el) continue;
        const emphasis = resolveReleaseTrackerSecondaryTabEmphasis({
          tabIndex,
          currentIndex: event.currentIndex,
          adjacentIndex: event.adjacentIndex,
          progress: event.progress,
        });
        if (event.animate && !reduced) {
          el.style.transition = `color ${durationMs}ms ${RELEASE_TRACKER_TAB_PAGER_SNAP_EASING}`;
        } else {
          el.style.transition = "none";
        }
        // Color/opacity only — font-weight stays on committed feedView classes (no reflow).
        el.style.color = releaseTrackerSecondaryTabEmphasisColor(emphasis);
      }
    },
    [listPagerEnabled, secondaryViews],
  );

  useLayoutEffect(() => {
    const viewport = pagerViewportRef.current;
    if (!viewport || !listPagerEnabled) return;
    const phase = pagerHeightPhaseRef.current;
    if (phase !== "dragging" && phase !== "snapping") {
      viewport.style.minHeight = "";
      return;
    }
    const unlock = pagerVertUnlockIndices;
    if (!unlock || unlock.length === 0) return;
    // Prepare unlock may be current±1 (3 indices); use max-of-unlock path.
    applyHostMinHeightFromCache(phase, unlock);
  }, [pagerVertUnlockIndices, listPagerEnabled, applyHostMinHeightFromCache]);

  const handlePagerProgress = useCallback(
    (event: ReleaseTrackerPagerProgressEvent) => {
      secondaryIndicatorPhaseRef.current = event.phase;
      applyPagerHostHeight(event);
      if (event.phase === "idle") {
        clearSecondaryTabVisualEmphasis();
      } else {
        applySecondaryTabVisualEmphasis(event);
      }
      const currentId = secondaryViews[event.currentIndex];
      if (!currentId) return;
      if (!secondaryNavMetricsRef.current[currentId]) {
        measureSecondaryNavTriggers();
      }
      const metricsMap = secondaryNavMetricsRef.current;
      const from = metricsMap[currentId];
      if (!from) return;

      if (event.adjacentIndex == null || event.progress <= 0) {
        applySecondaryNavIndicator(from, {
          animate: event.animate,
          durationMs: event.durationMs ?? RELEASE_TRACKER_TAB_PAGER_SNAP_MS,
          reducedMotion: event.reducedMotion,
        });
        return;
      }

      const adjacentId = secondaryViews[event.adjacentIndex];
      if (adjacentId && !metricsMap[adjacentId]) {
        measureSecondaryNavTriggers();
      }
      const to = adjacentId ? secondaryNavMetricsRef.current[adjacentId] : null;
      if (!to) {
        applySecondaryNavIndicator(from, {
          animate: event.animate,
          durationMs: event.durationMs ?? RELEASE_TRACKER_TAB_PAGER_SNAP_MS,
          reducedMotion: event.reducedMotion,
        });
        return;
      }

      const lerped = interpolateReleaseTrackerNavIndicator(from, to, event.progress);
      applySecondaryNavIndicator(
        { ...lerped, bottom: from.bottom },
        {
          animate: event.animate,
          durationMs: event.durationMs ?? RELEASE_TRACKER_TAB_PAGER_SNAP_MS,
          reducedMotion: event.reducedMotion,
        },
      );
    },
    [
      applySecondaryNavIndicator,
      applyPagerHostHeight,
      applySecondaryTabVisualEmphasis,
      clearSecondaryTabVisualEmphasis,
      measureSecondaryNavTriggers,
      secondaryViews,
    ],
  );

  const handlePagerGesturePrepare = useCallback(() => {
    if (!listPagerEnabled) return;
    const currentIndex = releaseTrackerViewIndex(secondaryViews, pagerViewRef.current);
    const prepareUnlock = resolveReleaseTrackerPagerPrepareUnlockIndices(
      currentIndex,
      secondaryViews.length,
    );
    measureSecondaryNavTriggers();
    cachePagerPanelHeights(prepareUnlock);
    // Unlock before first armed transform so drag frames skip React layout work.
    pagerHostHeightKeyRef.current = `prepare:${currentIndex}`;
    pagerHeightPhaseRef.current = "dragging";
    setPagerVertUnlock(prepareUnlock);
    applyHostMinHeightFromCache("dragging", prepareUnlock);
  }, [
    applyHostMinHeightFromCache,
    cachePagerPanelHeights,
    listPagerEnabled,
    measureSecondaryNavTriggers,
    secondaryViews,
    setPagerVertUnlock,
  ]);

  const handlePagerGestureAbort = useCallback(() => {
    if (!listPagerEnabled) return;
    if (secondaryIndicatorPhaseRef.current === "dragging") return;
    pagerHostHeightKeyRef.current = "";
    pagerHeightPhaseRef.current = "idle";
    setPagerVertUnlock(null);
    const viewport = pagerViewportRef.current;
    if (viewport) viewport.style.minHeight = "";
    clearSecondaryTabVisualEmphasis();
  }, [clearSecondaryTabVisualEmphasis, listPagerEnabled, setPagerVertUnlock]);

  useReleaseTrackerTabPager({
    enabled: listPagerEnabled,
    views: secondaryViews,
    activeView: effectiveView,
    viewRef: pagerViewRef,
    viewportRef: pagerViewportRef,
    trackRef: pagerTrackRef,
    onCommitView: setFeedView,
    onPagerProgress: handlePagerProgress,
    onGesturePrepare: handlePagerGesturePrepare,
    onGestureAbort: handlePagerGestureAbort,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id) return;
    const reduced = prefersReleaseTrackerPagerReducedMotion();
    const animateTap =
      secondaryIndicatorPhaseRef.current === "idle" && !reduced;
    syncSecondaryNavIndicatorToView(effectiveView, {
      animate: animateTap,
      durationMs: RELEASE_TRACKER_SECONDARY_INDICATOR_TAP_MS,
    });
    // Tap / commit: clear transient drag colors so committed classes win.
    clearSecondaryTabVisualEmphasis();
    secondaryIndicatorPhaseRef.current = "idle";
    if (listPagerEnabled) {
      pagerHostHeightKeyRef.current = "";
      applyPagerHostHeight({
        phase: "idle",
        currentIndex: releaseTrackerViewIndex(secondaryViews, effectiveView),
        adjacentIndex: null,
      });
      // Keep geometry warm for the next gesture.
      const idx = releaseTrackerViewIndex(secondaryViews, effectiveView);
      cachePagerPanelHeights(
        resolveReleaseTrackerPagerPrepareUnlockIndices(idx, secondaryViews.length),
      );
      measureSecondaryNavTriggers();
    }
  }, [
    effectiveView,
    secondaryViews,
    currentUser?.id,
    listPagerEnabled,
    syncSecondaryNavIndicatorToView,
    applyPagerHostHeight,
    clearSecondaryTabVisualEmphasis,
    cachePagerPanelHeights,
    measureSecondaryNavTriggers,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      pagerPanelHeightCacheRef.current = { key: "", heights: {} };
      if (secondaryIndicatorPhaseRef.current !== "idle") return;
      syncSecondaryNavIndicatorToView(pagerViewRef.current, {
        animate: false,
        durationMs: 0,
      });
      if (listPagerEnabled) {
        const idx = releaseTrackerViewIndex(secondaryViews, pagerViewRef.current);
        cachePagerPanelHeights(
          resolveReleaseTrackerPagerPrepareUnlockIndices(idx, secondaryViews.length),
        );
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [
    syncSecondaryNavIndicatorToView,
    listPagerEnabled,
    secondaryViews,
    cachePagerPanelHeights,
  ]);

  const buildFeedSlices = useCallback(
    (items: ReleaseFeedItem[]) => {
      const featured =
        isArtist && effectiveScope === "my" && currentUser?.id
          ? items.filter(
              (r) =>
                r.artistId === currentUser.id && isReleaseDayTodayFromTiming(r),
            )
          : [];
      const featuredIds = new Set(featured.map((r) => r.id));
      const dated = items.filter(
        (r) => r.releaseDate && !r.isComingSoon && !featuredIds.has(r.id),
      );
      const outToday = dated.filter((r) => isReleaseDayTodayFromTiming(r));
      const rest = dated.filter((r) => !isReleaseDayTodayFromTiming(r));
      const comingSoon = items.filter((r) => r.isComingSoon);
      return { featured, outToday, rest, comingSoon };
    },
    [isArtist, effectiveScope, currentUser?.id],
  );

  const renderListFeedBody = (
    view: FeedView,
    items: ReleaseFeedItem[],
    opts: {
      isLoading: boolean;
      isError: boolean;
      onRetry: () => void;
      isRetrying: boolean;
    },
  ) => {
    const copy = getReleaseTrackerEmptyCopy({
      view,
      scope: effectiveScope,
      hasOwnedReleaseHistory: ownedReleaseHistoryKnown,
    });
    const showEmptyCta =
      isArtist && view === "upcoming" && effectiveScope === "my";
    if (opts.isError) {
      return (
        <div className={RELEASE_TRACKER_EMPTY_CLASS} data-testid="release-feed-error">
          <Disc3 className={RELEASE_TRACKER_EMPTY_ICON_CLASS} />
          <p className={RELEASE_TRACKER_EMPTY_TITLE_CLASS}>Couldn't load releases.</p>
          <Button
            className={RELEASE_TRACKER_EMPTY_CTA_CLASS}
            onClick={opts.onRetry}
            disabled={opts.isRetrying}
          >
            Try again
          </Button>
        </div>
      );
    }
    if (opts.isLoading) {
      return (
        <div
          className={RELEASE_TRACKER_EMPTY_REGION_CLASS}
          data-testid="release-feed-loading"
        >
          <ReleaseFeedDelayedLoader key={`${effectiveScope}-${view}`} />
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div
          className={RELEASE_TRACKER_EMPTY_REGION_CLASS}
          data-testid="release-feed-empty"
        >
          <div className={RELEASE_TRACKER_EMPTY_CLASS}>
            <Disc3 className={RELEASE_TRACKER_EMPTY_ICON_CLASS} />
            <p className={RELEASE_TRACKER_EMPTY_TITLE_CLASS}>{copy.title}</p>
            <p className={RELEASE_TRACKER_EMPTY_BODY_CLASS}>{copy.body}</p>
            {showEmptyCta && (
              <Button
                className={RELEASE_TRACKER_EMPTY_CTA_CLASS}
                onClick={() => navigate(RELEASE_TRACKER_ADD_HREF)}
              >
                {myUpcomingEmptyCtaLabel}
              </Button>
            )}
          </div>
        </div>
      );
    }

    const slices = buildFeedSlices(items);
    const ascending = view === "upcoming" || view === "collaborations";

    return (
      <div className="space-y-7">
        {slices.featured.length > 0 && (
          <div className="relative z-10 mb-5 space-y-2 border-b border-white/[0.08] pb-3">
            <ReleaseDayCelebration releaseId={slices.featured[0]!.id} variant="heading" />
            <div className={RELEASE_FEED_DIVIDE_CLASS}>
              {slices.featured.map((r) =>
                renderReleaseCard(r, { featured: true, view }),
              )}
            </div>
          </div>
        )}
        {slices.outToday.length > 0 && (
          <section className="space-y-2">
            <h2 className={RELEASE_FEED_MONTH_HEADING_CLASS}>Released today</h2>
            {slices.outToday[0]!.artistId === currentUser?.id ? (
              <ReleaseDayCelebration
                releaseId={slices.outToday[0]!.id}
                title={slices.outToday[0]!.title}
                variant="inline"
              />
            ) : (
              <SavedReleaseDayCelebration
                releaseId={slices.outToday[0]!.id}
                title={slices.outToday[0]!.title}
                variant="inline"
              />
            )}
            <div className={RELEASE_FEED_DIVIDE_CLASS}>
              {slices.outToday.map((r) => renderReleaseCard(r, { view }))}
            </div>
          </section>
        )}
        {groupReleasesByMonth(slices.rest, ascending).map(
          ({ key: monthKey, label: monthLabel, items: monthItems }) => (
            <section key={monthKey}>
              <h2 className={RELEASE_FEED_MONTH_HEADING_CLASS}>{monthLabel}</h2>
              <div className={RELEASE_FEED_DIVIDE_CLASS}>
                {monthItems.map((r) => renderReleaseCard(r, { view }))}
              </div>
            </section>
          ),
        )}
        {slices.comingSoon.length > 0 && (
          <section>
            <h2 className={cn(RELEASE_FEED_MONTH_HEADING_CLASS, "mt-1")}>
              Coming soon...
            </h2>
            <div className={RELEASE_FEED_DIVIDE_CLASS}>
              {slices.comingSoon.map((r) => renderReleaseCard(r, { view }))}
            </div>
          </section>
        )}
      </div>
    );
  };

  const pagerPanelClass = (
    panelIndex: number,
    opts?: { stableFill?: boolean },
    ...extra: Array<string | undefined>
  ) => {
    const unlocked = pagerVertUnlockIndices?.includes(panelIndex) === true;
    const stableFill = opts?.stableFill === true;
    return cn(
      RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS,
      // Populated panels: full VERT_UNLOCK (height reset OK for tall lists).
      // Empty/loading: overflow-only unlock — never !h-auto/!min-h-0 (Slice-1 jump).
      unlocked &&
        !stableFill &&
        RELEASE_TRACKER_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS,
      unlocked &&
        stableFill &&
        RELEASE_TRACKER_TAB_PAGER_PANEL_STABLE_UNLOCK_CLASS,
      ...extra,
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
        data-lg-nav-5a-dest="releases"
        className={cn(
          RELEASE_TRACKER_PAGE_CLASS,
          resolveArtworkViewPageBottomPadClass({
            artworkWell: fillReleasesContentColumn,
            isArtist,
          }),
        )}
        data-releases-tracker=""
      >
      <div
        className={cn(
          "mx-auto max-w-md px-4",
          fillReleasesContentColumn && ARTWORK_VIEW_COLUMN_CLASS,
          fillReleasesContentColumn && resolveArtworkViewColumnMinHClass(isArtist),
        )}
      >
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
                ref={secondaryTablistRef}
                className={RELEASE_TRACKER_SECONDARY_TABLIST_CLASS}
                role="tablist"
                aria-label="Release list"
              >
                {secondaryViews.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={feedView === v}
                    data-releases-secondary-tab={v}
                    ref={(el) => {
                      secondaryTabButtonRefs.current[v] = el;
                    }}
                    onClick={() => setFeedView(v)}
                    className={cn(
                      // duration-200 matches indicator tap morph; drag overrides via inline transition.
                      "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-0.5 text-[13px] leading-tight transition-colors duration-200",
                      feedView === v
                        ? RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS
                        : RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS,
                    )}
                  >
                    {v === "upcoming" ? "Upcoming" : v === "collaborations" ? "Collaborations" : "Past"}
                  </button>
                ))}
                <span
                  ref={secondaryIndicatorRef}
                  className={RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS}
                  aria-hidden
                  data-testid="releases-secondary-indicator"
                />
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
            artworkWellActive
              ? ARTWORK_VIEW_WELL_CLASS
              : cn(
                  currentUser?.id
                    ? RELEASE_TRACKER_CONTENT_TOP_GAP_CLASS
                    : "app-page-top-pad",
                  listPagerEnabled && "flex min-h-0 flex-1 flex-col",
                  isEmptyContentRegion && !listPagerEnabled && RELEASE_TRACKER_EMPTY_REGION_CLASS,
                )
          }
          data-testid={artworkWellActive ? "artwork-view-well" : undefined}
        >
        {!currentUser?.id ? (
          <div className={RELEASE_TRACKER_EMPTY_CLASS}>
            <Calendar className={RELEASE_TRACKER_EMPTY_ICON_CLASS} />
            <p className={RELEASE_TRACKER_EMPTY_TITLE_CLASS}>
              Sign in to see releases from artists you’ve liked.
            </p>
          </div>
        ) : listPagerEnabled ? (
          <div
            ref={pagerViewportRef}
            className={RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS}
            data-testid="releases-tab-pager-viewport"
          >
            <div
              ref={pagerTrackRef}
              className={RELEASE_TRACKER_TAB_PAGER_TRACK_CLASS}
              data-testid="releases-tab-pager-track"
            >
              {secondaryViews.map((view, panelIndex) => {
                const isActivePanel = view === effectiveView;
                const isAdjacentPanel = adjacentViews.includes(view);
                const mountContent = isActivePanel || isAdjacentPanel;
                const panelQuery = listPanelQueries[panelIndex];
                const panelItems = (panelQuery?.data ?? []) as ReleaseFeedItem[];
                const panelError = !!panelQuery?.isError;
                const panelLoading =
                  mountContent && panelQuery?.data === undefined && !panelError;
                const panelEmpty =
                  mountContent &&
                  !panelLoading &&
                  !panelError &&
                  panelItems.length === 0;
                /** Fill height for empty/loading so first paint + swipe unlock stay centred. */
                const panelNeedsStableFill =
                  mountContent && !panelError && (panelLoading || panelEmpty);
                const panelUnlocked =
                  pagerVertUnlockIndices?.includes(panelIndex) === true;
                return (
                  <div
                    key={`${effectiveScope}-${view}`}
                    ref={(el) => {
                      pagerPanelRefs.current[panelIndex] = el;
                    }}
                    className={pagerPanelClass(
                      panelIndex,
                      { stableFill: panelNeedsStableFill },
                      (isActivePanel || panelUnlocked) &&
                        panelNeedsStableFill
                        ? RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS
                        : undefined,
                    )}
                    data-state={isActivePanel ? "active" : "inactive"}
                    data-testid={`releases-pager-panel-${view}`}
                    aria-hidden={!isActivePanel}
                  >
                    {mountContent
                      ? renderListFeedBody(view, panelItems, {
                          isLoading: panelLoading,
                          isError: panelError,
                          onRetry: () => {
                            void panelQuery?.refetch();
                          },
                          isRetrying: !!panelQuery?.isFetching,
                        })
                      : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : isFeedError ? (
          <div className={RELEASE_TRACKER_EMPTY_CLASS} data-testid="release-feed-error">
            <Disc3 className={RELEASE_TRACKER_EMPTY_ICON_CLASS} />
            <p className={RELEASE_TRACKER_EMPTY_TITLE_CLASS}>Couldn't load releases.</p>
            <Button
              className={RELEASE_TRACKER_EMPTY_CTA_CLASS}
              onClick={() => {
                void refetchFeed();
              }}
              disabled={isFeedFetching}
            >
              Try again
            </Button>
          </div>
        ) : isFeedLoading ? (
          <div
            className={RELEASE_TRACKER_EMPTY_REGION_CLASS}
            data-testid="release-feed-loading"
          >
            <ReleaseFeedDelayedLoader key={`${effectiveScope}-${effectiveView}`} />
          </div>
        ) : feedItems.length === 0 ? (
          <div
            className={RELEASE_TRACKER_EMPTY_REGION_CLASS}
            data-testid="release-feed-empty"
          >
            <div className={RELEASE_TRACKER_EMPTY_CLASS}>
              <Disc3 className={RELEASE_TRACKER_EMPTY_ICON_CLASS} />
              <p className={RELEASE_TRACKER_EMPTY_TITLE_CLASS}>{emptyCopy.title}</p>
              <p className={RELEASE_TRACKER_EMPTY_BODY_CLASS}>{emptyCopy.body}</p>
              {showMyUpcomingEmptyCta && (
                <Button
                  className={RELEASE_TRACKER_EMPTY_CTA_CLASS}
                  onClick={() => navigate(RELEASE_TRACKER_ADD_HREF)}
                >
                  {myUpcomingEmptyCtaLabel}
                </Button>
              )}
            </div>
          </div>
        ) : (
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
        )}
        </div>
      </div>

      {isArtist && (
        <>
          <div
            {...{ [RELEASE_TRACKER_NAV_SHELF_ATTR]: "" }}
            className={cn(
              "pointer-events-none fixed inset-x-0 bottom-0 z-[29] h-[var(--app-bottom-control-inset)]",
              RELEASE_TRACKER_FAB_UNDERLAY_CLASS,
            )}
          />
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--releases-cta-anchor)+var(--releases-cta-gap-above-nav))] z-30 bg-transparent">
            <div
              {...{ [RELEASE_TRACKER_CTA_SLAB_ATTR]: "" }}
              className={cn(
                "absolute inset-x-0 bottom-0 h-[var(--releases-cta-underlay-block)]",
                RELEASE_TRACKER_FAB_UNDERLAY_CLASS,
              )}
            />
            <div
              className={cn(
                "absolute inset-x-0 bottom-[var(--releases-cta-underlay-block)] h-[var(--releases-cta-fade-block)]",
                RELEASE_TRACKER_FAB_FADE_CLASS,
              )}
            />
            <div className="relative mx-auto max-w-md px-4">
              <div className="relative pt-1 pb-0.5">
                <Button
                  onClick={() => navigate(RELEASE_TRACKER_ADD_HREF)}
                  className={RELEASE_TRACKER_ADD_CTA_CLASS}
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
