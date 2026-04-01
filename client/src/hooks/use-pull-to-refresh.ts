import { useCallback, useEffect, useRef, useState, type RefObject, type TouchEvent } from "react";

/** Minimum height of the pull row while in the refreshing phase (floor when release distance is tiny). */
const DEFAULT_REFRESH_SLOT_PX = 52;
/** Visual pull distance needed to commit refresh (rubber-banded space, not raw finger travel). */
const DEFAULT_THRESHOLD_PX = 56;
/** Asymptotic cap for rubber-band pull (visual never quite reaches this). */
const DEFAULT_MAX_VISUAL_PULL_PX = 108;
/** Rubber-band stiffness — higher = more travel before the curve saturates. */
const RUBBER_INTENSITY = 0.62;
/** After refresh + work, brief "complete" phase before collapse (fade / settle). */
const DEFAULT_COMPLETE_MS = 300;
/** Ensures spin + held row are perceptible even on instant network/cache. */
const DEFAULT_MIN_REFRESH_VISIBLE_MS = 560;
/** Top-of-feed: tolerate subpixel / elastic settle */
const TOP_SCROLL_EPSILON = 8;

/**
 * Pull must not arm while comments UI is up, during drawer close, or while a Vaul drawer is still
 * marked open (avoids dismiss swipe leaking to the feed on the first post).
 */
export function isHomeFeedPullSuppressed(): boolean {
  if (typeof document === "undefined") return false;
  const body = document.body;
  if (body.classList.contains("comments-modal-open")) return true;
  if (body.classList.contains("comments-dismiss-pull-guard")) return true;
  if (document.querySelector('[data-vaul-drawer][data-state="open"]')) return true;
  return false;
}

export type PullToRefreshPhase = "idle" | "pulling" | "threshold" | "refreshing" | "completing";

export type UsePullToRefreshOptions = {
  scrollRef: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<void>;
  /** Set false to disable handlers (e.g. other tabs or unsupported surfaces). */
  enabled?: boolean;
  /** Rubber-banded distance past which release commits refresh. */
  thresholdPx?: number;
  maxVisualPullPx?: number;
  refreshSlotPx?: number;
  /**
   * After the user commits a refresh, keep the held-open region visible at least this long
   * (runs in parallel with `onRefresh`; collapse waits for both).
   */
  minRefreshVisibleMs?: number;
  completeHoldMs?: number;
  /** Fires once per pull gesture when visual pull first crosses the threshold (e.g. haptics). */
  onPullThresholdCrossed?: () => void;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Maps finger distance to visual pull with increasing resistance (asymptotic toward maxVisualPullPx).
 */
function rubberBandVisualPull(fingerDeltaPx: number, maxVisualPullPx: number): number {
  if (fingerDeltaPx <= 0 || maxVisualPullPx <= 0) return 0;
  const t = fingerDeltaPx * RUBBER_INTENSITY;
  return maxVisualPullPx * (1 - Math.exp(-t / maxVisualPullPx));
}

/**
 * Only arm pull when scroll is snapped / aligned with the first post — not between snap points.
 * While pulling, do not use first.offsetTop (spacer changes it); rely on scrollTop ≤ epsilon in touchmove.
 */
function canArmPullAtFirstPost(el: HTMLElement): boolean {
  if (el.scrollTop > TOP_SCROLL_EPSILON) return false;
  const first = el.querySelector<HTMLElement>("[data-post-id]");
  if (!first) return true;
  return Math.abs(el.scrollTop - first.offsetTop) <= TOP_SCROLL_EPSILON;
}

/**
 * Touch pull-to-refresh for a scroll container (Home feed).
 *
 * Phases: idle → pulling / threshold (finger) → refreshing → completing → idle.
 * Touch state is mirrored in refs for correct touchend; visual updates are rAF-coalesced.
 * `blocksSnapSettleRef` is true for the whole gesture + refresh so snap debounce does not fight the spacer.
 */
export function usePullToRefresh({
  scrollRef,
  onRefresh,
  enabled = true,
  thresholdPx = DEFAULT_THRESHOLD_PX,
  maxVisualPullPx = DEFAULT_MAX_VISUAL_PULL_PX,
  refreshSlotPx = DEFAULT_REFRESH_SLOT_PX,
  minRefreshVisibleMs = DEFAULT_MIN_REFRESH_VISIBLE_MS,
  completeHoldMs = DEFAULT_COMPLETE_MS,
  onPullThresholdCrossed,
}: UsePullToRefreshOptions) {
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const isPullingRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const rafPullFlushRef = useRef<number | null>(null);

  /** True from first valid pull touchstart through end of refresh (sync; for snap settle guard). */
  const blocksSnapSettleRef = useRef(false);
  /** Ensures threshold callback (e.g. haptic) runs at most once per gesture until the next armed touchstart. */
  const thresholdCrossedCallbackFiredRef = useRef(false);

  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  /** Locked row height for the whole refreshing phase (does not snap down to slot px on release). */
  const [refreshHoldHeightPx, setRefreshHoldHeightPx] = useState(refreshSlotPx);

  const resetPullVisual = useCallback(() => {
    pullDistanceRef.current = 0;
    isPullingRef.current = false;
    setPullDistance(0);
    setIsPulling(false);
    pullStartYRef.current = null;
    blocksSnapSettleRef.current = false;
    thresholdCrossedCallbackFiredRef.current = false;
  }, []);

  const cancelRafPull = useCallback(() => {
    if (rafPullFlushRef.current != null) {
      cancelAnimationFrame(rafPullFlushRef.current);
      rafPullFlushRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelRafPull(), [cancelRafPull]);

  const flushPullDistance = useCallback(() => {
    rafPullFlushRef.current = null;
    setPullDistance(pullDistanceRef.current);
  }, []);

  const schedulePullDistanceFlush = useCallback(() => {
    if (rafPullFlushRef.current != null) return;
    rafPullFlushRef.current = requestAnimationFrame(flushPullDistance);
  }, [flushPullDistance]);

  const handleTouchStart = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      if (!enabled || isRefreshing || isCompleting || refreshInFlightRef.current) return;
      if (isHomeFeedPullSuppressed()) return;
      const el = scrollRef.current;
      if (!el || !canArmPullAtFirstPost(el)) return;
      pullStartYRef.current = e.touches[0]?.clientY ?? null;
      if (pullStartYRef.current == null) return;
      thresholdCrossedCallbackFiredRef.current = false;
      isPullingRef.current = true;
      blocksSnapSettleRef.current = true;
      setIsPulling(true);
    },
    [enabled, isRefreshing, isCompleting, scrollRef],
  );

  const handleTouchMove = useCallback(
    (_e: TouchEvent<HTMLElement>) => {
      if (!isPullingRef.current || pullStartYRef.current == null) return;
      if (isHomeFeedPullSuppressed()) {
        cancelRafPull();
        resetPullVisual();
        return;
      }
      const el = scrollRef.current;
      if (!el || el.scrollTop > TOP_SCROLL_EPSILON) {
        cancelRafPull();
        resetPullVisual();
        return;
      }
      const currentY = _e.touches[0]?.clientY ?? pullStartYRef.current;
      const fingerDelta = Math.max(0, currentY - pullStartYRef.current);
      const next = rubberBandVisualPull(fingerDelta, maxVisualPullPx);
      pullDistanceRef.current = next;
      if (next >= thresholdPx && !thresholdCrossedCallbackFiredRef.current) {
        thresholdCrossedCallbackFiredRef.current = true;
        onPullThresholdCrossed?.();
      }
      schedulePullDistanceFlush();
    },
    [
      maxVisualPullPx,
      thresholdPx,
      onPullThresholdCrossed,
      scrollRef,
      resetPullVisual,
      schedulePullDistanceFlush,
      cancelRafPull,
    ],
  );

  const handleTouchEnd = useCallback(async () => {
    cancelRafPull();

    if (!isPullingRef.current || pullStartYRef.current == null) {
      if (!isRefreshing && !isCompleting) resetPullVisual();
      return;
    }

    if (isHomeFeedPullSuppressed()) {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      isPullingRef.current = false;
      setIsPulling(false);
      pullStartYRef.current = null;
      blocksSnapSettleRef.current = false;
      return;
    }

    const crossed = pullDistanceRef.current >= thresholdPx;
    const releasePullPx = pullDistanceRef.current;

    isPullingRef.current = false;
    setIsPulling(false);
    pullStartYRef.current = null;

    if (!crossed || refreshInFlightRef.current) {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      blocksSnapSettleRef.current = false;
      return;
    }

    const heldHeight = Math.min(
      maxVisualPullPx,
      Math.max(refreshSlotPx, Math.round(releasePullPx)),
    );
    setRefreshHoldHeightPx(heldHeight);

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    pullDistanceRef.current = 0;
    setPullDistance(0);

    try {
      const minVisible = delay(minRefreshVisibleMs);
      await Promise.all([onRefresh(), minVisible]);
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
      setIsCompleting(true);
      await delay(completeHoldMs);
      setIsCompleting(false);
      blocksSnapSettleRef.current = false;
    }
  }, [
    cancelRafPull,
    isRefreshing,
    isCompleting,
    thresholdPx,
    maxVisualPullPx,
    refreshSlotPx,
    minRefreshVisibleMs,
    completeHoldMs,
    onRefresh,
    resetPullVisual,
  ]);

  const handleTouchCancel = useCallback(() => {
    cancelRafPull();
    if (!isRefreshing && !isCompleting && !refreshInFlightRef.current) {
      resetPullVisual();
    }
  }, [cancelRafPull, isRefreshing, isCompleting, resetPullVisual]);

  const spacerHeightPx = isRefreshing || isCompleting ? refreshHoldHeightPx : pullDistance;
  const pullProgress = Math.min(1, thresholdPx > 0 ? pullDistance / thresholdPx : 0);
  const phase: PullToRefreshPhase =
    isCompleting ? "completing" : isRefreshing ? "refreshing" : isPulling && pullDistance >= thresholdPx ? "threshold" : isPulling ? "pulling" : "idle";

  return {
    spacerHeightPx,
    pullDistance,
    pullProgress,
    phase,
    isPulling,
    isRefreshing,
    isCompleting,
    blocksSnapSettleRef,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
  };
}
