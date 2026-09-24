/**
 * Releases secondary-tab finger-follow pager (RELEASES-SWIPE-TABS-2).
 * List-mode only; sequence from getReleaseTrackerSecondaryViews(scope).
 * Gesture DNA mirrors Profile pager — isolated module, not a shared mega-refactor.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { ReleaseTrackerFeedView } from "@/lib/release-tracker-presentation";

/** Align with Profile / edge-swipe-back left-edge reserve. */
export const RELEASE_TRACKER_TAB_SWIPE_EDGE_START_PX = 24;
/** Minimum horizontal travel before a gesture can arm as horizontal. */
export const RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX = 12;
/** Finger-follow commit when |dx| / viewportWidth >= this. */
export const RELEASE_TRACKER_TAB_PAGER_COMMIT_PROGRESS = 0.48;
/** Flick commit threshold (release-window velocity). */
export const RELEASE_TRACKER_TAB_PAGER_FLICK_PX_PER_MS = 0.4;
/** Minimum |dx| before velocity / projection may commit. */
export const RELEASE_TRACKER_TAB_PAGER_FLICK_MIN_DX_PX = 28;
/** Recent-motion window (ms) for release velocity. */
export const RELEASE_TRACKER_TAB_PAGER_VELOCITY_WINDOW_MS = 100;
/** Project this many ms of release-window velocity when evaluating flick intent. */
export const RELEASE_TRACKER_TAB_PAGER_PROJECTION_MS = 150;
/** Outer-edge rubber-band factor. */
export const RELEASE_TRACKER_TAB_PAGER_EDGE_RUBBER = 0.28;
/** Unified settle duration floor (ms). */
export const RELEASE_TRACKER_TAB_PAGER_SNAP_MS_MIN = 220;
/** Unified settle duration ceiling (ms). */
export const RELEASE_TRACKER_TAB_PAGER_SNAP_MS = 400;
/** Extra ms added across 0→1 remaining page progress. */
export const RELEASE_TRACKER_TAB_PAGER_SNAP_MS_SPAN = 180;
/** Same settle curve as Profile. */
export const RELEASE_TRACKER_TAB_PAGER_SNAP_EASING = "cubic-bezier(0.32, 0.45, 0.42, 1)";
/** abs(dx) must exceed abs(dy) * ratio for horizontal intent. */
export const RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO = 1.2;
/** Early vertical cancel when vertical drift wins before horizontal arm. */
export const RELEASE_TRACKER_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX = 14;

/** Full-bleed pager viewport — fills remaining content column under sticky chrome. */
export const RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS =
  "relative z-0 -mx-4 flex min-h-0 flex-1 flex-col overflow-x-hidden" as const;

/** Horizontal track; min-h-full matches viewport so empty space below short lists stays swipeable. */
export const RELEASE_TRACKER_TAB_PAGER_TRACK_CLASS =
  "flex min-h-full w-full flex-1" as const;

/**
 * One full pager page. `px-4` restores the content inset.
 * Inactive idle panels collapse so only the active panel owns page height.
 * Active panel: min-h-full fills the viewport canvas; h-auto still grows with long lists.
 */
export const RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS =
  "box-border min-w-full w-full shrink-0 grow-0 basis-full self-start px-4 data-[state=inactive]:!block data-[state=inactive]:h-0 data-[state=inactive]:min-h-0 data-[state=inactive]:overflow-y-hidden data-[state=active]:h-auto data-[state=active]:min-h-full data-[state=active]:overflow-y-visible" as const;

/**
 * Empty / loading list panel — Slice-1 fill so EMPTY_REGION can centre.
 * Do not pair with VERT_UNLOCK height resets (`!h-auto !min-h-0`); use
 * {@link RELEASE_TRACKER_TAB_PAGER_PANEL_STABLE_UNLOCK_CLASS} when unlocked.
 */
export const RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS =
  "flex min-h-full flex-1 flex-col self-stretch" as const;

/**
 * Overrides inactive collapse for populated panels during dragging or snapping.
 * Height resets are intentional for tall list measurement — never apply to
 * empty/loading stable-fill panels (they collapse min-h-full → content height).
 */
export const RELEASE_TRACKER_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS =
  "!h-auto !min-h-0 !overflow-y-visible" as const;

/**
 * Unlock for empty/loading only: escape inactive `h-0` / overflow clip without
 * resetting min-height (preserves Slice-1 `min-h-full` settle).
 */
export const RELEASE_TRACKER_TAB_PAGER_PANEL_STABLE_UNLOCK_CLASS =
  "!overflow-y-visible data-[state=inactive]:!h-auto data-[state=inactive]:!min-h-full" as const;

/** Release feed rows — swipe-eligible carve-out from interactive exclusion. */
export const RELEASE_TRACKER_TAB_PAGER_CARD_ATTR = "data-releases-pager-card" as const;
/** Set on the pager viewport while horizontal arm or vertical cancel owns the gesture. */
export const RELEASE_TRACKER_TAB_PAGER_DRAGGING_ATTR = "data-releases-pager-dragging" as const;

const INTERACTIVE_SELECTOR =
  "input, textarea, select, button, a, [contenteditable], [role='button'], [role='tab'], [role='dialog']";

/**
 * True when the event target should block pager start.
 * Generic interactive elements are excluded; release pager-card rows are allowed
 * unless the hit target resolves to a nested interactive control (e.g. provider link).
 */
export function isReleaseTrackerTabSwipeInteractiveTarget(target: EventTarget | null): boolean {
  if (target == null) return false;
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  if (!interactive) return false;
  const card = target.closest(`[${RELEASE_TRACKER_TAB_PAGER_CARD_ATTR}]`);
  if (card && interactive === card) return false;
  return true;
}

let releasePagerCardClickSuppressArmed = false;

export function armReleaseTrackerPagerCardClickSuppression(): void {
  releasePagerCardClickSuppressArmed = true;
}

export function clearReleaseTrackerPagerCardClickSuppression(): void {
  releasePagerCardClickSuppressArmed = false;
}

/** Returns true once if a just-finished gesture should not open the release. */
export function consumeReleaseTrackerPagerCardClickSuppression(): boolean {
  if (!releasePagerCardClickSuppressArmed) return false;
  releasePagerCardClickSuppressArmed = false;
  return true;
}

/** Test seam. */
export function isReleaseTrackerPagerCardClickSuppressionArmed(): boolean {
  return releasePagerCardClickSuppressArmed;
}

export function releaseTrackerViewIndex(
  views: readonly ReleaseTrackerFeedView[],
  view: ReleaseTrackerFeedView,
): number {
  const i = views.indexOf(view);
  return Math.max(0, i);
}

/**
 * Swipe left (negative dx) → next view; swipe right (positive dx) → previous.
 * No wrap. Sequence must be getReleaseTrackerSecondaryViews(scope).
 */
export function resolveReleaseTrackerViewFromDelta(
  views: readonly ReleaseTrackerFeedView[],
  currentView: ReleaseTrackerFeedView,
  deltaX: number,
): ReleaseTrackerFeedView | null {
  const index = views.indexOf(currentView);
  if (index < 0) return null;
  if (deltaX < 0) {
    return index < views.length - 1 ? views[index + 1]! : null;
  }
  if (deltaX > 0) {
    return index > 0 ? views[index - 1]! : null;
  }
  return null;
}

/** Adjacent views only (±1) for prefetch / mount content. */
export function getReleaseTrackerPagerAdjacentViews(
  views: readonly ReleaseTrackerFeedView[],
  currentView: ReleaseTrackerFeedView,
): ReleaseTrackerFeedView[] {
  const index = views.indexOf(currentView);
  if (index < 0) return [];
  const out: ReleaseTrackerFeedView[] = [];
  if (index > 0) out.push(views[index - 1]!);
  if (index < views.length - 1) out.push(views[index + 1]!);
  return out;
}

/** Current + adjacent views (max 3). */
export function getReleaseTrackerPagerMountedViews(
  views: readonly ReleaseTrackerFeedView[],
  currentView: ReleaseTrackerFeedView,
): ReleaseTrackerFeedView[] {
  const index = views.indexOf(currentView);
  if (index < 0) return [...views];
  const start = Math.max(0, index - 1);
  const end = Math.min(views.length - 1, index + 1);
  return views.slice(start, end + 1);
}

export function releaseTrackerPagerRestTranslatePx(
  index: number,
  viewportWidth: number,
): number {
  const translate = -Math.max(0, index) * Math.max(1, viewportWidth);
  return translate === 0 ? 0 : translate;
}

export function applyReleaseTrackerPagerEdgeRubber(
  dx: number,
  index: number,
  viewCount: number,
  rubber: number = RELEASE_TRACKER_TAB_PAGER_EDGE_RUBBER,
): number {
  const atStart = index <= 0 && dx > 0;
  const atEnd = index >= viewCount - 1 && dx < 0;
  if (atStart || atEnd) return dx * rubber;
  return dx;
}

export function prefersReleaseTrackerPagerReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type ReleaseTrackerPagerProgressPhase = "idle" | "dragging" | "snapping";

export type ReleaseTrackerPagerProgressEvent = {
  phase: ReleaseTrackerPagerProgressPhase;
  currentIndex: number;
  adjacentIndex: number | null;
  progress: number;
  animate: boolean;
  reducedMotion: boolean;
  durationMs?: number;
};

export function resolveReleaseTrackerPagerHostHeightPx(input: {
  phase: ReleaseTrackerPagerProgressPhase;
  currentHeight: number;
  adjacentHeight: number | null;
}): number {
  const current = Math.max(0, input.currentHeight);
  if (
    (input.phase === "dragging" || input.phase === "snapping") &&
    input.adjacentHeight != null
  ) {
    return Math.max(current, Math.max(0, input.adjacentHeight));
  }
  return current;
}

export function resolveReleaseTrackerPagerVertUnlockIndices(input: {
  phase: ReleaseTrackerPagerProgressPhase;
  currentIndex: number;
  adjacentIndex: number | null;
}): number[] | null {
  if (input.phase !== "dragging" && input.phase !== "snapping") return null;
  if (input.adjacentIndex == null) return [input.currentIndex];
  if (input.adjacentIndex === input.currentIndex) return [input.currentIndex];
  return [input.currentIndex, input.adjacentIndex];
}

/**
 * RELEASES-SWIPE-TABS-6 — unlock current ±1 at gesture prepare (touchstart)
 * so the first armed move does not need a React unlock render.
 */
export function resolveReleaseTrackerPagerPrepareUnlockIndices(
  currentIndex: number,
  viewCount: number,
): number[] {
  const index = Math.max(0, Math.min(currentIndex, Math.max(0, viewCount - 1)));
  const out: number[] = [index];
  if (index > 0) out.unshift(index - 1);
  if (index < viewCount - 1) out.push(index + 1);
  return out;
}

/** True when every needed index is already present in the applied unlock set. */
export function releaseTrackerPagerUnlockCovers(
  applied: number[] | null,
  needed: number[] | null,
): boolean {
  if (needed == null) return applied == null;
  if (applied == null) return false;
  return needed.every((i) => applied.includes(i));
}

/**
 * Visual label emphasis 0..1 for a secondary tab during pager progress.
 * Semantic aria-selected stays on the committed view; this is presentational only.
 */
export function resolveReleaseTrackerSecondaryTabEmphasis(input: {
  tabIndex: number;
  currentIndex: number;
  adjacentIndex: number | null;
  progress: number;
}): number {
  const t = Math.min(1, Math.max(0, input.progress));
  if (input.adjacentIndex == null || t <= 0) {
    return input.tabIndex === input.currentIndex ? 1 : 0;
  }
  if (input.tabIndex === input.currentIndex) return 1 - t;
  if (input.tabIndex === input.adjacentIndex) return t;
  return 0;
}

/** Matches inactive `text-white/55` → active opaque white on the Releases canvas. */
export const RELEASE_TRACKER_SECONDARY_TAB_INACTIVE_ALPHA = 0.55;

export function releaseTrackerSecondaryTabEmphasisColor(emphasis: number): string {
  const t = Math.min(1, Math.max(0, emphasis));
  const alpha =
    RELEASE_TRACKER_SECONDARY_TAB_INACTIVE_ALPHA +
    (1 - RELEASE_TRACKER_SECONDARY_TAB_INACTIVE_ALPHA) * t;
  return `rgba(255, 255, 255, ${alpha})`;
}

export type ReleaseTrackerNavIndicatorMetrics = {
  left: number;
  width: number;
  bottom: number;
};

export function lerpReleaseTrackerNav(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateReleaseTrackerNavIndicator(
  from: Pick<ReleaseTrackerNavIndicatorMetrics, "left" | "width">,
  to: Pick<ReleaseTrackerNavIndicatorMetrics, "left" | "width">,
  progress: number,
): { left: number; width: number } {
  const t = Math.min(1, Math.max(0, progress));
  return {
    left: lerpReleaseTrackerNav(from.left, to.left, t),
    width: lerpReleaseTrackerNav(from.width, to.width, t),
  };
}

/**
 * Secondary underline used inset-x-2 (8px each side) on the flex-1 tab button.
 * Shared indicator must match that optical width.
 */
export const RELEASE_TRACKER_SECONDARY_INDICATOR_INSET_PX = 8 as const;

export function releaseTrackerSecondaryIndicatorMetricsFromTabRect(input: {
  tabLeft: number;
  tabWidth: number;
  tabBottom: number;
  listLeft: number;
  listBottom: number;
  insetPx?: number;
}): ReleaseTrackerNavIndicatorMetrics {
  const inset = input.insetPx ?? RELEASE_TRACKER_SECONDARY_INDICATOR_INSET_PX;
  return {
    left: input.tabLeft - input.listLeft + inset,
    width: Math.max(0, input.tabWidth - inset * 2),
    bottom: input.listBottom - input.tabBottom,
  };
}

export function releaseTrackerPagerDragProgress(input: {
  deltaX: number;
  rubberDx: number;
  viewportWidth: number;
  hasAdjacent: boolean;
}): number {
  if (!input.hasAdjacent) return 0;
  const width = Math.max(1, input.viewportWidth);
  return Math.min(1, Math.abs(input.rubberDx) / width);
}

export type ReleaseTrackerPagerVelocitySample = { x: number; t: number };

export function computeReleaseTrackerPagerReleaseVelocity(
  samples: readonly ReleaseTrackerPagerVelocitySample[],
  endTs?: number,
  windowMs: number = RELEASE_TRACKER_TAB_PAGER_VELOCITY_WINDOW_MS,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1]!;
  const end = endTs ?? last.t;
  const windowStart = end - Math.max(1, windowMs);

  let windowed = samples.filter((s) => s.t >= windowStart);
  if (windowed.length < 2) {
    let before: ReleaseTrackerPagerVelocitySample | null = null;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i]!.t < windowStart) {
        before = samples[i]!;
        break;
      }
    }
    windowed = before ? [before, ...windowed] : samples.slice(-2);
  }
  if (windowed.length < 2) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 1; i < windowed.length; i++) {
    const a = windowed[i - 1]!;
    const b = windowed[i]!;
    const dt = Math.max(1, b.t - a.t);
    const segmentV = (b.x - a.x) / dt;
    const ageMs = Math.max(0, end - b.t);
    const weight = Math.max(0.15, 1 - ageMs / Math.max(1, windowMs));
    weightedSum += segmentV * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

export function releaseTrackerPagerSnapDurationMs(
  remainingTravelPx: number,
  viewportWidth: number,
): number {
  const width = Math.max(1, viewportWidth);
  const remainingProgress = Math.min(1, Math.max(0, Math.abs(remainingTravelPx) / width));
  const duration =
    RELEASE_TRACKER_TAB_PAGER_SNAP_MS_MIN +
    remainingProgress * RELEASE_TRACKER_TAB_PAGER_SNAP_MS_SPAN;
  return Math.round(
    Math.min(
      RELEASE_TRACKER_TAB_PAGER_SNAP_MS,
      Math.max(RELEASE_TRACKER_TAB_PAGER_SNAP_MS_MIN, duration),
    ),
  );
}

export type ReleaseTrackerPagerReleaseDecision =
  | {
      action: "commit";
      reason: "distance" | "velocity";
      nextView: ReleaseTrackerFeedView;
    }
  | {
      action: "cancel";
      reason: "insufficient" | "boundary" | "vertical" | "zero";
      nextView: null;
    };

function velocityMatchesFlickDirection(deltaX: number, velocityX: number): boolean {
  return (
    (deltaX < 0 && velocityX <= -RELEASE_TRACKER_TAB_PAGER_FLICK_PX_PER_MS) ||
    (deltaX > 0 && velocityX >= RELEASE_TRACKER_TAB_PAGER_FLICK_PX_PER_MS)
  );
}

function velocitySameSign(deltaX: number, velocityX: number): boolean {
  return (deltaX < 0 && velocityX < 0) || (deltaX > 0 && velocityX > 0);
}

export function evaluateReleaseTrackerPagerRelease(input: {
  views: readonly ReleaseTrackerFeedView[];
  currentView: ReleaseTrackerFeedView;
  deltaX: number;
  deltaY: number;
  velocityX: number;
  viewportWidth: number;
}): ReleaseTrackerPagerReleaseDecision {
  const { views, currentView, deltaX, deltaY, velocityX } = input;
  const viewportWidth = Math.max(1, input.viewportWidth);
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX === 0 && absY === 0) {
    return { action: "cancel", reason: "zero", nextView: null };
  }

  if (absY > RELEASE_TRACKER_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
    return { action: "cancel", reason: "vertical", nextView: null };
  }
  if (absX < RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX) {
    return { action: "cancel", reason: "insufficient", nextView: null };
  }
  if (absX <= absY * RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO) {
    return { action: "cancel", reason: "vertical", nextView: null };
  }

  const nextView = resolveReleaseTrackerViewFromDelta(views, currentView, deltaX);
  if (!nextView) {
    return { action: "cancel", reason: "boundary", nextView: null };
  }

  const progress = absX / viewportWidth;
  if (progress >= RELEASE_TRACKER_TAB_PAGER_COMMIT_PROGRESS) {
    return { action: "commit", reason: "distance", nextView };
  }

  if (absX >= RELEASE_TRACKER_TAB_PAGER_FLICK_MIN_DX_PX) {
    if (velocityMatchesFlickDirection(deltaX, velocityX)) {
      return { action: "commit", reason: "velocity", nextView };
    }
    if (velocitySameSign(deltaX, velocityX)) {
      const projectedAbsX = absX + Math.abs(velocityX) * RELEASE_TRACKER_TAB_PAGER_PROJECTION_MS;
      if (projectedAbsX / viewportWidth >= RELEASE_TRACKER_TAB_PAGER_COMMIT_PROGRESS) {
        return { action: "commit", reason: "velocity", nextView };
      }
    }
  }

  return { action: "cancel", reason: "insufficient", nextView: null };
}

type GesturePhase = "idle" | "dragging" | "snapping";

type GestureState = {
  active: boolean;
  armed: boolean;
  cancelled: boolean;
  phase: GesturePhase;
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTs: number;
  samples: ReleaseTrackerPagerVelocitySample[];
  baseTranslate: number;
};

function createIdleGesture(): GestureState {
  return {
    active: false,
    armed: false,
    cancelled: false,
    phase: "idle",
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTs: 0,
    samples: [],
    baseTranslate: 0,
  };
}

type UseReleaseTrackerTabPagerOptions = {
  enabled?: boolean;
  /** Secondary sequence from getReleaseTrackerSecondaryViews(scope). */
  views: readonly ReleaseTrackerFeedView[];
  activeView: ReleaseTrackerFeedView;
  viewRef: RefObject<ReleaseTrackerFeedView>;
  viewportRef: RefObject<HTMLElement | null>;
  trackRef: RefObject<HTMLElement | null>;
  onCommitView: (next: ReleaseTrackerFeedView) => void;
  onPagerProgress?: (event: ReleaseTrackerPagerProgressEvent) => void;
  /**
   * RELEASES-SWIPE-TABS-6 — called when a single-finger gesture is seeded on
   * touchstart (before arm). Warm unlock / geometry here so the first armed
   * move stays free of React layout work.
   */
  onGesturePrepare?: () => void;
  /** Clears prepare work when the gesture never arms (vertical cancel / end). */
  onGestureAbort?: () => void;
};

function setTrackTransform(
  track: HTMLElement,
  translateX: number,
  opts: { animate: boolean; reducedMotion: boolean; durationMs?: number },
): void {
  if (opts.animate && !opts.reducedMotion) {
    const durationMs = opts.durationMs ?? RELEASE_TRACKER_TAB_PAGER_SNAP_MS;
    track.style.transition = `transform ${durationMs}ms ${RELEASE_TRACKER_TAB_PAGER_SNAP_EASING}`;
  } else {
    track.style.transition = "none";
  }
  track.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

/**
 * Finger-follow pager on Releases list content.
 * Calls onCommitView only after a successful snap completes (never during preview).
 * Does not update URL/feedView during drag — caller owns commit.
 */
export function useReleaseTrackerTabPager({
  enabled = true,
  views,
  activeView,
  viewRef,
  viewportRef,
  trackRef,
  onCommitView,
  onPagerProgress,
  onGesturePrepare,
  onGestureAbort,
}: UseReleaseTrackerTabPagerOptions): void {
  const onCommitRef = useRef(onCommitView);
  onCommitRef.current = onCommitView;
  const onProgressRef = useRef(onPagerProgress);
  onProgressRef.current = onPagerProgress;
  const onPrepareRef = useRef(onGesturePrepare);
  onPrepareRef.current = onGesturePrepare;
  const onAbortRef = useRef(onGestureAbort);
  onAbortRef.current = onGestureAbort;
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const gestureRef = useRef<GestureState>(createIdleGesture());

  /**
   * Align track transform to the committed view before paint.
   * Must depend on `enabled` so Artwork → List remounts re-read live refs
   * (stable RefObject identities alone do not re-fire this effect).
   */
  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const sync = () => {
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (!track || !viewport) return;
      if (gestureRef.current.phase !== "idle") return;
      const width = Math.max(
        1,
        viewport.getBoundingClientRect().width || window.innerWidth,
      );
      const index = releaseTrackerViewIndex(viewsRef.current, activeView);
      track.style.willChange = "";
      setTrackTransform(track, releaseTrackerPagerRestTranslatePx(index, width), {
        animate: false,
        reducedMotion: true,
      });
    };

    // Drop any prior-mount gesture / suppress state before aligning.
    gestureRef.current = createIdleGesture();
    clearReleaseTrackerPagerCardClickSuppression();
    viewportRef.current?.removeAttribute(RELEASE_TRACKER_TAB_PAGER_DRAGGING_ATTR);

    sync();
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled, activeView, views, trackRef, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!enabled || !viewport || !track || typeof window === "undefined") return;

    const reset = () => {
      gestureRef.current = createIdleGesture();
      viewport.removeAttribute(RELEASE_TRACKER_TAB_PAGER_DRAGGING_ATTR);
    };

    const setPagerDraggingVisual = (on: boolean) => {
      if (on) viewport.setAttribute(RELEASE_TRACKER_TAB_PAGER_DRAGGING_ATTR, "true");
      else viewport.removeAttribute(RELEASE_TRACKER_TAB_PAGER_DRAGGING_ATTR);
    };

    const claimCardGesture = () => {
      armReleaseTrackerPagerCardClickSuppression();
      setPagerDraggingVisual(true);
    };

    const widthOf = () =>
      Math.max(1, viewport.getBoundingClientRect().width || window.innerWidth);

    const enterSnapping = () => {
      gestureRef.current.phase = "snapping";
      gestureRef.current.active = false;
      gestureRef.current.armed = false;
    };

    const readCurrentTranslateX = (): number => {
      const raw = getComputedStyle(track).transform;
      if (!raw || raw === "none") return 0;
      try {
        return new DOMMatrixReadOnly(raw).m41;
      } catch {
        return 0;
      }
    };

    const finishSnap = (
      targetTranslate: number,
      commitView: ReleaseTrackerFeedView | null,
    ) => {
      const reduced = prefersReleaseTrackerPagerReducedMotion();
      const width = widthOf();
      const seq = viewsRef.current;
      const currentIndex = releaseTrackerViewIndex(seq, viewRef.current);
      const targetIndex = commitView
        ? releaseTrackerViewIndex(seq, commitView)
        : currentIndex;
      setPagerDraggingVisual(false);
      const fromTranslate = readCurrentTranslateX();
      const remainingTravelPx = Math.abs(targetTranslate - fromTranslate);
      const snapMs = releaseTrackerPagerSnapDurationMs(remainingTravelPx, width);
      enterSnapping();
      onProgressRef.current?.({
        phase: "snapping",
        currentIndex,
        adjacentIndex: targetIndex === currentIndex ? null : targetIndex,
        progress: targetIndex === currentIndex ? 0 : 1,
        animate: !reduced,
        reducedMotion: reduced,
        durationMs: snapMs,
      });
      const runCommit = () => {
        track.style.willChange = "";
        track.style.transition = "none";
        setTrackTransform(track, targetTranslate, { animate: false, reducedMotion: true });
        reset();
        if (commitView && commitView !== viewRef.current) {
          onCommitRef.current(commitView);
        } else {
          onProgressRef.current?.({
            phase: "idle",
            currentIndex: targetIndex,
            adjacentIndex: null,
            progress: 0,
            animate: false,
            reducedMotion: reduced,
            durationMs: 0,
          });
        }
      };

      if (reduced) {
        runCommit();
        return;
      }

      setTrackTransform(track, fromTranslate, { animate: false, reducedMotion: true });
      void track.offsetWidth;
      setTrackTransform(track, targetTranslate, {
        animate: true,
        reducedMotion: false,
        durationMs: snapMs,
      });
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        track.removeEventListener("transitionend", onEnd);
        window.clearTimeout(fallback);
        runCommit();
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target !== track) return;
        if (e.propertyName && e.propertyName !== "transform") return;
        settle();
      };
      const fallback = window.setTimeout(settle, snapMs + 80);
      track.addEventListener("transitionend", onEnd);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (gestureRef.current.phase === "snapping") return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      clearReleaseTrackerPagerCardClickSuppression();
      if (isReleaseTrackerTabSwipeInteractiveTarget(event.target)) {
        reset();
        return;
      }
      const touch = event.touches[0];
      if (touch.clientX <= RELEASE_TRACKER_TAB_SWIPE_EDGE_START_PX) {
        reset();
        return;
      }
      const width = widthOf();
      const seq = viewsRef.current;
      const index = releaseTrackerViewIndex(seq, viewRef.current);
      const now = performance.now();
      gestureRef.current = {
        active: true,
        armed: false,
        cancelled: false,
        phase: "idle",
        pointerId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        lastTs: now,
        samples: [{ x: touch.clientX, t: now }],
        baseTranslate: releaseTrackerPagerRestTranslatePx(index, width),
      };
      // Warm unlock / geometry before the first armed transform frame.
      onPrepareRef.current?.();
    };

    const onTouchMove = (event: TouchEvent) => {
      const state = gestureRef.current;
      if (!state.active || state.cancelled || state.phase === "snapping") return;
      const touch = Array.from(event.touches).find((t) => t.identifier === state.pointerId);
      if (!touch) return;

      const now = performance.now();
      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      state.lastX = touch.clientX;
      state.lastY = touch.clientY;
      state.lastTs = now;
      state.samples.push({ x: touch.clientX, t: now });
      if (state.samples.length > 64) {
        state.samples = state.samples.slice(-48);
      }

      if (!state.armed) {
        if (absY > RELEASE_TRACKER_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
          claimCardGesture();
          state.cancelled = true;
          state.active = false;
          state.phase = "idle";
          onAbortRef.current?.();
          return;
        }
        if (
          absX >= RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX &&
          absX > absY * RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO
        ) {
          claimCardGesture();
          state.armed = true;
          state.phase = "dragging";
          track.style.willChange = "transform";
          track.style.transition = "none";
        } else {
          return;
        }
      }

      event.preventDefault();
      const seq = viewsRef.current;
      const index = releaseTrackerViewIndex(seq, viewRef.current);
      const rubberDx = applyReleaseTrackerPagerEdgeRubber(deltaX, index, seq.length);
      setTrackTransform(track, state.baseTranslate + rubberDx, {
        animate: false,
        reducedMotion: true,
      });
      const adjacentView = resolveReleaseTrackerViewFromDelta(seq, viewRef.current, deltaX);
      const adjacentIndex = adjacentView ? releaseTrackerViewIndex(seq, adjacentView) : null;
      onProgressRef.current?.({
        phase: "dragging",
        currentIndex: index,
        adjacentIndex,
        progress: releaseTrackerPagerDragProgress({
          deltaX,
          rubberDx,
          viewportWidth: widthOf(),
          hasAdjacent: adjacentIndex != null,
        }),
        animate: false,
        reducedMotion: true,
      });
    };

    const onTouchEnd = () => {
      const state = gestureRef.current;
      if (!state.active || state.cancelled || !state.armed || state.phase === "snapping") {
        if (state.phase !== "snapping") {
          if (state.active && !state.armed) onAbortRef.current?.();
          reset();
        }
        return;
      }

      const width = widthOf();
      const seq = viewsRef.current;
      const index = releaseTrackerViewIndex(seq, viewRef.current);
      const deltaX = state.lastX - state.startX;
      const deltaY = state.lastY - state.startY;
      const endTs = performance.now();
      if (
        state.samples.length === 0 ||
        state.samples[state.samples.length - 1]!.t < endTs
      ) {
        state.samples.push({ x: state.lastX, t: endTs });
      }
      const velocityX = computeReleaseTrackerPagerReleaseVelocity(state.samples, endTs);
      const decision = evaluateReleaseTrackerPagerRelease({
        views: seq,
        currentView: viewRef.current,
        deltaX,
        deltaY,
        velocityX,
        viewportWidth: width,
      });

      if (decision.action === "commit") {
        const nextIndex = releaseTrackerViewIndex(seq, decision.nextView);
        finishSnap(releaseTrackerPagerRestTranslatePx(nextIndex, width), decision.nextView);
        return;
      }

      finishSnap(releaseTrackerPagerRestTranslatePx(index, width), null);
    };

    const onTouchCancel = () => {
      const state = gestureRef.current;
      if (state.phase === "snapping") return;
      if (state.armed) {
        const width = widthOf();
        const seq = viewsRef.current;
        const index = releaseTrackerViewIndex(seq, viewRef.current);
        finishSnap(releaseTrackerPagerRestTranslatePx(index, width), null);
        return;
      }
      if (state.active) onAbortRef.current?.();
      reset();
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchCancel);
      reset();
    };
  }, [enabled, viewRef, trackRef, viewportRef]);
}
