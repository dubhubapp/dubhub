/**
 * Community ↔ Artists primary-tab finger-follow pager (LEADERBOARD-SWIPE-2).
 * Gesture DNA mirrors Releases secondary pager — isolated module, not a shared mega-refactor.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { LeaderboardScope } from "@/lib/leaderboard-presentation";
import { lbSwipe8Ensure, lbSwipe8Log } from "@/lib/leaderboard-swipe-8-runtime-audit";

/** Fixed primary sequence — Community then Artists. */
export const LEADERBOARD_SCOPES: readonly LeaderboardScope[] = ["users", "artists"] as const;

/** Align with `use-edge-swipe-back` left-edge reserve. */
export const LEADERBOARD_SCOPE_EDGE_START_PX = 24;
/** Minimum horizontal travel before a gesture can arm as horizontal. */
export const LEADERBOARD_SCOPE_DRAG_START_PX = 12;
/** Finger-follow commit when |dx| / viewportWidth >= this. */
export const LEADERBOARD_SCOPE_COMMIT_PROGRESS = 0.48;
/** Flick commit threshold (release-window velocity). */
export const LEADERBOARD_SCOPE_FLICK_PX_PER_MS = 0.4;
/** Minimum |dx| before velocity / projection may commit. */
export const LEADERBOARD_SCOPE_FLICK_MIN_DX_PX = 28;
/** Recent-motion window (ms) for release velocity. */
export const LEADERBOARD_SCOPE_VELOCITY_WINDOW_MS = 100;
/** Project this many ms of release-window velocity when evaluating flick intent. */
export const LEADERBOARD_SCOPE_PROJECTION_MS = 150;
/** Outer-edge rubber-band factor. */
export const LEADERBOARD_SCOPE_EDGE_RUBBER = 0.28;
/** Unified settle duration floor (ms). */
export const LEADERBOARD_SCOPE_SNAP_MS_MIN = 220;
/** Unified settle duration ceiling (ms). */
export const LEADERBOARD_SCOPE_SNAP_MS = 400;
/** Extra ms added across 0→1 remaining page progress. */
export const LEADERBOARD_SCOPE_SNAP_MS_SPAN = 180;
/** Same settle curve as Releases / Profile. */
export const LEADERBOARD_SCOPE_SNAP_EASING = "cubic-bezier(0.32, 0.45, 0.42, 1)";
/** abs(dx) must exceed abs(dy) * ratio for horizontal intent. */
export const LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO = 1.2;
/** Early vertical cancel when vertical drift wins before horizontal arm. */
export const LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX = 14;

/** Full-bleed pager viewport under sticky chrome (parent already supplies px-4). */
export const LEADERBOARD_SCOPE_PAGER_VIEWPORT_CLASS =
  "relative z-0 w-full overflow-x-hidden" as const;

/**
 * Horizontal track; translate3d moves panels.
 * `w-[200%]` + half-width panels guarantees idle trackScrollWidth ≈ 2× viewport
 * even when the inactive panel is vertically collapsed to 0 (WKWebView otherwise
 * reported ~1× scrollWidth until unlock expanded the adjacent panel).
 * `items-start` keeps cross-axis heights independent.
 */
export const LEADERBOARD_SCOPE_PAGER_TRACK_CLASS =
  "flex w-[200%] max-w-none items-start" as const;

/**
 * HERO-19/20/21B — full-bleed prize track viewport.
 * Horizontal: breaks out of Leaderboard `px-4` gutters; clips offscreen hero panel.
 * Vertical (HERO-20): pulls under sticky chrome with the proven
 * `safe-area + 0.25rem + {@link LEADERBOARD_STICKY_CHROME_BODY_OFFSET}` amount so
 * artwork paints behind status/tabs. Stage stays ~34dvh (HERO-22 — no height
 * compensation). HERO-21B: BOTH overflow-x/y hidden so CSS does not compute
 * overflow-y:auto (nested iOS vertical pan). Clip utilities omitted — iOS 15 target.
 */
export const LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS =
  "relative z-0 -mx-4 -mt-[calc(env(safe-area-inset-top,0px)+0.25rem+6rem)] w-[calc(100%+2rem)] overflow-x-hidden overflow-y-hidden" as const;

export const LEADERBOARD_SCOPE_HERO_TRACK_CLASS =
  LEADERBOARD_SCOPE_PAGER_TRACK_CLASS;

export const LEADERBOARD_SCOPE_HERO_PANEL_CLASS =
  "box-border w-1/2 min-w-[50%] max-w-[50%] shrink-0 grow-0 basis-1/2 self-start" as const;

/**
 * One full pager page (50% of the 200%-wide track = one viewport width).
 * Idle inactive panels must compute to zero height so only the committed active
 * panel owns track/viewport/page scroll extent (LEADERBOARD-SWIPE-9A / 12C).
 *
 * Collapse uses non-`!important` utilities (Releases DNA) so temporary unlock
 * `!…` tokens can win during drag without fighting attribute+!important specificity.
 *
 * Horizontal: `basis-1/2` / `w-1/2` retain width while vertical collapse is active.
 */
export const LEADERBOARD_SCOPE_PAGER_PANEL_CLASS =
  "box-border w-1/2 min-w-[50%] max-w-[50%] shrink-0 grow-0 basis-1/2 self-start data-[state=inactive]:!block data-[state=inactive]:h-0 data-[state=inactive]:min-h-0 data-[state=inactive]:max-h-0 data-[state=inactive]:overflow-hidden data-[state=active]:h-auto data-[state=active]:max-h-none data-[state=active]:min-h-0 data-[state=active]:overflow-y-visible" as const;

/**
 * Overrides inactive collapse for current/adjacent during dragging or snapping.
 * Must win over non-important inactive `h-0` / `max-h-0` / `overflow-hidden`
 * (LEADERBOARD-SWIPE-12C). `!overflow-visible` clears both axes after shorthand clip.
 * Applied imperatively (classList) during live gestures — not via React state.
 */
export const LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS =
  "!h-auto !max-h-none !min-h-0 !overflow-visible" as const;

/** Individual class tokens from {@link LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS}. */
export function leaderboardPagerVertUnlockClassTokens(): string[] {
  return LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS.split(/\s+/).filter(Boolean);
}

/** Sync unlock on a live panel ref (no React). */
export function applyLeaderboardPagerPanelImperativeUnlock(
  el: HTMLElement | null | undefined,
): void {
  if (!el) return;
  for (const token of leaderboardPagerVertUnlockClassTokens()) {
    el.classList.add(token);
  }
}

/** Remove temporary imperative unlock tokens after commit/cancel/idle. */
export function clearLeaderboardPagerPanelImperativeUnlock(
  el: HTMLElement | null | undefined,
): void {
  if (!el) return;
  for (const token of leaderboardPagerVertUnlockClassTokens()) {
    el.classList.remove(token);
  }
}

/** Set on the pager viewport while horizontal arm or vertical cancel owns the gesture. */
export const LEADERBOARD_SCOPE_PAGER_DRAGGING_ATTR = "data-leaderboard-pager-dragging" as const;

/**
 * Result-row shell — swipe-eligible carve-out from interactive exclusion
 * (avatar / username buttons inside the row may seed horizontal drag).
 */
export const LEADERBOARD_SCOPE_PAGER_ROW_ATTR = "data-leaderboard-pager-row" as const;

const INTERACTIVE_SELECTOR =
  "input, textarea, select, button, a, [contenteditable], [role='button'], [role='tab'], [role='dialog']";

/**
 * True when the event target should block pager start.
 * Generic interactive elements are excluded; marked leaderboard rows are allowed
 * even when the hit target is a nested avatar/username button (Releases card carve-out DNA).
 */
export function isLeaderboardScopeSwipeInteractiveTarget(target: EventTarget | null): boolean {
  if (target == null) return false;
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  if (!interactive) return false;
  const row = target.closest(`[${LEADERBOARD_SCOPE_PAGER_ROW_ATTR}]`);
  if (row && row.contains(interactive)) return false;
  return true;
}

let leaderboardPagerClickSuppressArmed = false;

export function armLeaderboardPagerClickSuppression(): void {
  leaderboardPagerClickSuppressArmed = true;
}

export function clearLeaderboardPagerClickSuppression(): void {
  leaderboardPagerClickSuppressArmed = false;
}

/** Returns true once if a just-finished gesture should not open a row action. */
export function consumeLeaderboardPagerClickSuppression(): boolean {
  if (!leaderboardPagerClickSuppressArmed) return false;
  leaderboardPagerClickSuppressArmed = false;
  return true;
}

/** Test seam. */
export function isLeaderboardPagerClickSuppressionArmed(): boolean {
  return leaderboardPagerClickSuppressArmed;
}

export function leaderboardScopeIndex(scope: LeaderboardScope): number {
  const i = LEADERBOARD_SCOPES.indexOf(scope);
  return Math.max(0, i);
}

/**
 * Swipe left (negative dx) → Artists; swipe right (positive dx) → Community.
 * No wrap at either boundary.
 */
export function resolveLeaderboardScopeFromDelta(
  currentScope: LeaderboardScope,
  deltaX: number,
): LeaderboardScope | null {
  if (deltaX < 0) return currentScope === "users" ? "artists" : null;
  if (deltaX > 0) return currentScope === "artists" ? "users" : null;
  return null;
}

export type LeaderboardScopeChangePlan =
  | { changed: false; nextScope: LeaderboardScope }
  | { changed: true; nextScope: LeaderboardScope };

/** Shared tap/swipe owner: bail when next === current. */
export function planLeaderboardScopeChange(
  currentScope: LeaderboardScope,
  nextScope: LeaderboardScope,
): LeaderboardScopeChangePlan {
  if (nextScope === currentScope) {
    return { changed: false, nextScope: currentScope };
  }
  return { changed: true, nextScope };
}

export function leaderboardPagerRestTranslatePx(
  index: number,
  viewportWidth: number,
): number {
  const translate = -Math.max(0, index) * Math.max(1, viewportWidth);
  return translate === 0 ? 0 : translate;
}

export function applyLeaderboardPagerEdgeRubber(
  dx: number,
  index: number,
  scopeCount: number = LEADERBOARD_SCOPES.length,
  rubber: number = LEADERBOARD_SCOPE_EDGE_RUBBER,
): number {
  const atStart = index <= 0 && dx > 0;
  const atEnd = index >= scopeCount - 1 && dx < 0;
  if (atStart || atEnd) return dx * rubber;
  return dx;
}

export function prefersLeaderboardPagerReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type LeaderboardPagerProgressPhase = "idle" | "dragging" | "snapping";

export type LeaderboardPagerProgressEvent = {
  phase: LeaderboardPagerProgressPhase;
  currentIndex: number;
  adjacentIndex: number | null;
  progress: number;
  animate: boolean;
  reducedMotion: boolean;
  durationMs?: number;
};

export function resolveLeaderboardPagerHostHeightPx(input: {
  phase: LeaderboardPagerProgressPhase;
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

export function resolveLeaderboardPagerVertUnlockIndices(input: {
  phase: LeaderboardPagerProgressPhase;
  currentIndex: number;
  adjacentIndex: number | null;
}): number[] | null {
  if (input.phase !== "dragging" && input.phase !== "snapping") return null;
  if (input.adjacentIndex == null) return [input.currentIndex];
  if (input.adjacentIndex === input.currentIndex) return [input.currentIndex];
  return [input.currentIndex, input.adjacentIndex];
}

/** Unlock current ±1 at gesture prepare (touchstart). */
export function resolveLeaderboardPagerPrepareUnlockIndices(
  currentIndex: number,
  scopeCount: number = LEADERBOARD_SCOPES.length,
): number[] {
  const index = Math.max(0, Math.min(currentIndex, Math.max(0, scopeCount - 1)));
  const out: number[] = [index];
  if (index > 0) out.unshift(index - 1);
  if (index < scopeCount - 1) out.push(index + 1);
  return out;
}

export function leaderboardPagerUnlockCovers(
  applied: number[] | null,
  needed: number[] | null,
): boolean {
  if (needed == null) return applied == null;
  if (applied == null) return false;
  return needed.every((i) => applied.includes(i));
}

/**
 * Visual label emphasis 0..1 for a primary tab during pager progress.
 * Semantic aria-selected stays on the committed scope; this is presentational only.
 */
export function resolveLeaderboardPrimaryTabEmphasis(input: {
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

/** Matches inactive `text-white/72` → active opaque white (HERO-6 tab contrast). */
export const LEADERBOARD_PRIMARY_TAB_INACTIVE_ALPHA = 0.72;

export function leaderboardPrimaryTabEmphasisColor(emphasis: number): string {
  const t = Math.min(1, Math.max(0, emphasis));
  const alpha =
    LEADERBOARD_PRIMARY_TAB_INACTIVE_ALPHA +
    (1 - LEADERBOARD_PRIMARY_TAB_INACTIVE_ALPHA) * t;
  return `rgba(255, 255, 255, ${alpha})`;
}

export type LeaderboardNavIndicatorMetrics = {
  left: number;
  width: number;
  bottom: number;
};

export function lerpLeaderboardNav(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateLeaderboardNavIndicator(
  from: Pick<LeaderboardNavIndicatorMetrics, "left" | "width">,
  to: Pick<LeaderboardNavIndicatorMetrics, "left" | "width">,
  progress: number,
): { left: number; width: number } {
  const t = Math.min(1, Math.max(0, progress));
  return {
    left: lerpLeaderboardNav(from.left, to.left, t),
    width: lerpLeaderboardNav(from.width, to.width, t),
  };
}

/**
 * Primary underline is label-width (former after:inset-x-0 on the label span).
 * Measure the label element relative to the TabsList.
 */
export const LEADERBOARD_PRIMARY_INDICATOR_INSET_PX = 0 as const;

export function leaderboardPrimaryIndicatorMetricsFromLabelRect(input: {
  labelLeft: number;
  labelWidth: number;
  labelBottom: number;
  listLeft: number;
  listBottom: number;
  insetPx?: number;
}): LeaderboardNavIndicatorMetrics {
  const inset = input.insetPx ?? LEADERBOARD_PRIMARY_INDICATOR_INSET_PX;
  return {
    left: input.labelLeft - input.listLeft + inset,
    width: Math.max(0, input.labelWidth - inset * 2),
    bottom: input.listBottom - input.labelBottom,
  };
}

export function leaderboardPagerDragProgress(input: {
  deltaX: number;
  rubberDx: number;
  viewportWidth: number;
  hasAdjacent: boolean;
}): number {
  if (!input.hasAdjacent) return 0;
  const width = Math.max(1, input.viewportWidth);
  return Math.min(1, Math.abs(input.rubberDx) / width);
}

export type LeaderboardPagerVelocitySample = { x: number; t: number };

export function computeLeaderboardPagerReleaseVelocity(
  samples: readonly LeaderboardPagerVelocitySample[],
  endTs?: number,
  windowMs: number = LEADERBOARD_SCOPE_VELOCITY_WINDOW_MS,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1]!;
  const end = endTs ?? last.t;
  const windowStart = end - Math.max(1, windowMs);

  let windowed = samples.filter((s) => s.t >= windowStart);
  if (windowed.length < 2) {
    let before: LeaderboardPagerVelocitySample | null = null;
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

export function leaderboardPagerSnapDurationMs(
  remainingTravelPx: number,
  viewportWidth: number,
): number {
  const width = Math.max(1, viewportWidth);
  const remainingProgress = Math.min(1, Math.max(0, Math.abs(remainingTravelPx) / width));
  const duration =
    LEADERBOARD_SCOPE_SNAP_MS_MIN + remainingProgress * LEADERBOARD_SCOPE_SNAP_MS_SPAN;
  return Math.round(
    Math.min(
      LEADERBOARD_SCOPE_SNAP_MS,
      Math.max(LEADERBOARD_SCOPE_SNAP_MS_MIN, duration),
    ),
  );
}

export type LeaderboardScopeSwipeDecision =
  | {
      action: "commit";
      reason: "distance" | "velocity";
      nextScope: LeaderboardScope;
    }
  | {
      action: "cancel";
      reason: "insufficient" | "boundary" | "vertical" | "zero";
      nextScope: null;
    };

function velocityMatchesFlickDirection(deltaX: number, velocityX: number): boolean {
  return (
    (deltaX < 0 && velocityX <= -LEADERBOARD_SCOPE_FLICK_PX_PER_MS) ||
    (deltaX > 0 && velocityX >= LEADERBOARD_SCOPE_FLICK_PX_PER_MS)
  );
}

function velocitySameSign(deltaX: number, velocityX: number): boolean {
  return (deltaX < 0 && velocityX < 0) || (deltaX > 0 && velocityX > 0);
}

export function evaluateLeaderboardScopeSwipe(input: {
  currentScope: LeaderboardScope;
  deltaX: number;
  deltaY: number;
  /** Signed px/ms (positive = rightward). */
  velocityX: number;
  viewportWidth: number;
  /**
   * When true, horizontal ownership was already decided during touchmove.
   * Release must not reclassify as vertical from cumulative deltaY.
   */
  armed?: boolean;
}): LeaderboardScopeSwipeDecision {
  const { currentScope, deltaX, deltaY, velocityX } = input;
  const viewportWidth = Math.max(1, input.viewportWidth);
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const armed = input.armed === true;

  if (absX === 0 && absY === 0) {
    return { action: "cancel", reason: "zero", nextScope: null };
  }

  // Pre-arm only: vertical-intent rejection. Armed gestures keep horizontal ownership.
  if (!armed) {
    if (absY > LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
      return { action: "cancel", reason: "vertical", nextScope: null };
    }
    if (absX < LEADERBOARD_SCOPE_DRAG_START_PX) {
      return { action: "cancel", reason: "insufficient", nextScope: null };
    }
    if (absX <= absY * LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO) {
      return { action: "cancel", reason: "vertical", nextScope: null };
    }
  }

  const nextScope = resolveLeaderboardScopeFromDelta(currentScope, deltaX);
  if (!nextScope) {
    return { action: "cancel", reason: "boundary", nextScope: null };
  }

  const progress = absX / viewportWidth;
  if (progress >= LEADERBOARD_SCOPE_COMMIT_PROGRESS) {
    return { action: "commit", reason: "distance", nextScope };
  }

  if (absX >= LEADERBOARD_SCOPE_FLICK_MIN_DX_PX) {
    if (velocityMatchesFlickDirection(deltaX, velocityX)) {
      return { action: "commit", reason: "velocity", nextScope };
    }
    if (velocitySameSign(deltaX, velocityX)) {
      const projectedAbsX = absX + Math.abs(velocityX) * LEADERBOARD_SCOPE_PROJECTION_MS;
      if (projectedAbsX / viewportWidth >= LEADERBOARD_SCOPE_COMMIT_PROGRESS) {
        return { action: "commit", reason: "velocity", nextScope };
      }
    }
  }

  return { action: "cancel", reason: "insufficient", nextScope: null };
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
  samples: LeaderboardPagerVelocitySample[];
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

type UseLeaderboardScopeSwipeOptions = {
  enabled?: boolean;
  scopeRef: RefObject<LeaderboardScope>;
  activeScope: LeaderboardScope;
  /**
   * Touch listener host (HERO-16). May wrap prize banner + pager viewport.
   * Falls back to viewportRef when omitted.
   */
  gestureHostRef?: RefObject<HTMLElement | null>;
  /** Pager clip / width geometry only — travel distance uses this width. */
  viewportRef: RefObject<HTMLElement | null>;
  trackRef: RefObject<HTMLElement | null>;
  /**
   * HERO-18 — optional follower track. Receives the same translateX as trackRef;
   * never an independent progress source.
   */
  heroTrackRef?: RefObject<HTMLElement | null>;
  onCommitScope: (next: LeaderboardScope) => void;
  onPagerProgress?: (event: LeaderboardPagerProgressEvent) => void;
  onGesturePrepare?: () => void;
  onGestureAbort?: () => void;
};

function setTrackTransform(
  track: HTMLElement,
  translateX: number,
  opts: { animate: boolean; reducedMotion: boolean; durationMs?: number },
): void {
  if (opts.animate && !opts.reducedMotion) {
    const durationMs = opts.durationMs ?? LEADERBOARD_SCOPE_SNAP_MS;
    track.style.transition = `transform ${durationMs}ms ${LEADERBOARD_SCOPE_SNAP_EASING}`;
  } else {
    track.style.transition = "none";
  }
  track.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

/**
 * Map list-pager translate (pagerViewport px) onto heroTrack travel.
 * HERO-19: heroViewport may be wider after gutter breakout; same normalized
 * progress, different pixel distance — prevents hero/list drift.
 */
export function leaderboardHeroTranslateFromPagerPx(
  pagerTranslateX: number,
  pagerWidth: number,
  heroWidth: number,
): number {
  const pw = Math.max(1, pagerWidth);
  const hw = Math.max(1, heroWidth);
  if (pw === hw) return pagerTranslateX;
  return pagerTranslateX * (hw / pw);
}

/** Write list translate; scale the same progress onto optional hero follower. */
function setSyncedTracksTransform(
  listTrack: HTMLElement,
  heroTrack: HTMLElement | null | undefined,
  pagerTranslateX: number,
  pagerWidth: number,
  opts: { animate: boolean; reducedMotion: boolean; durationMs?: number },
): void {
  setTrackTransform(listTrack, pagerTranslateX, opts);
  if (!heroTrack) return;
  const heroViewport = heroTrack.parentElement;
  const heroWidth = Math.max(
    1,
    heroViewport?.getBoundingClientRect().width || pagerWidth,
  );
  setTrackTransform(
    heroTrack,
    leaderboardHeroTranslateFromPagerPx(pagerTranslateX, pagerWidth, heroWidth),
    opts,
  );
}

function clearSyncedTrackMotion(
  listTrack: HTMLElement,
  heroTrack: HTMLElement | null | undefined,
): void {
  listTrack.style.willChange = "";
  listTrack.style.transition = "none";
  if (heroTrack) {
    heroTrack.style.willChange = "";
    heroTrack.style.transition = "none";
  }
}

/**
 * Finger-follow pager on Leaderboard content.
 * Calls onCommitScope only after a successful snap completes (never during preview).
 */
export function useLeaderboardScopeSwipe({
  enabled = true,
  scopeRef,
  activeScope,
  gestureHostRef,
  viewportRef,
  trackRef,
  heroTrackRef,
  onCommitScope,
  onPagerProgress,
  onGesturePrepare,
  onGestureAbort,
}: UseLeaderboardScopeSwipeOptions): void {
  const onCommitRef = useRef(onCommitScope);
  onCommitRef.current = onCommitScope;
  const onProgressRef = useRef(onPagerProgress);
  onProgressRef.current = onPagerProgress;
  const onPrepareRef = useRef(onGesturePrepare);
  onPrepareRef.current = onGesturePrepare;
  const onAbortRef = useRef(onGestureAbort);
  onAbortRef.current = onGestureAbort;
  const gestureRef = useRef<GestureState>(createIdleGesture());

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
      const index = leaderboardScopeIndex(activeScope);
      track.style.willChange = "";
      const heroTrack = heroTrackRef?.current;
      if (heroTrack) heroTrack.style.willChange = "";
      setSyncedTracksTransform(
        track,
        heroTrack,
        leaderboardPagerRestTranslatePx(index, width),
        width,
        {
          animate: false,
          reducedMotion: true,
        },
      );
    };

    gestureRef.current = createIdleGesture();
    clearLeaderboardPagerClickSuppression();
    const dragHost = gestureHostRef?.current ?? viewportRef.current;
    dragHost?.removeAttribute(LEADERBOARD_SCOPE_PAGER_DRAGGING_ATTR);

    sync();
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled, activeScope, gestureHostRef, heroTrackRef, trackRef, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const heroTrack = heroTrackRef?.current ?? null;
    const gestureHost = gestureHostRef?.current ?? viewport;
    if (!enabled || !viewport || !track || !gestureHost || typeof window === "undefined") {
      return;
    }

    // LEADERBOARD-SWIPE-8 TEMP — remove after physical root cause.
    lbSwipe8Ensure();
    let nextGestureId = 0;
    let currentGestureId: number | null = null;
    let touchstartCount = 0;
    let touchendCount = 0;
    let touchcancelCount = 0;

    /** Bumped to invalidate in-flight snap settle callbacks. */
    let snapGeneration = 0;

    /** Always pager viewport width — never the taller gesture host. */
    const widthOf = () =>
      Math.max(1, viewport.getBoundingClientRect().width || window.innerWidth);

    const applyTransform = (
      translateX: number,
      opts: { animate: boolean; reducedMotion: boolean; durationMs?: number },
    ) => {
      setSyncedTracksTransform(track, heroTrack, translateX, widthOf(), opts);
    };

    const clearMotion = () => {
      clearSyncedTrackMotion(track, heroTrack);
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

    const baseTraceFields = () => {
      const g = gestureRef.current;
      const width = widthOf();
      const deltaX = g.lastX - g.startX;
      const deltaY = g.lastY - g.startY;
      // RefObject.current is T | null under React types; do not invent a scope.
      const scope = scopeRef.current;
      return {
        gestureId: currentGestureId,
        phase: g.phase,
        activeScope: scope,
        sourceIndex: scope != null ? leaderboardScopeIndex(scope) : null,
        viewportWidth: width,
        startX: g.startX,
        currentX: g.lastX,
        deltaX,
        deltaY,
        baseTranslate: g.baseTranslate,
        currentTranslate: readCurrentTranslateX(),
        progress: Math.min(1, Math.abs(deltaX) / Math.max(1, width)),
        snapGeneration,
        pointerId: g.pointerId,
        touchstartCount,
        touchendCount,
        touchcancelCount,
      };
    };

    /**
     * LEADERBOARD-SWIPE-13B — gesture-only reset by default can skip abort cleanup.
     * Successful commit must keep unlock/minHeight until activeTab layout settles.
     * Abort/cancel/unmount still pass `clearPrepare: true` (default).
     */
    const reset = (note?: string, opts?: { clearPrepare?: boolean }) => {
      const clearPrepare = opts?.clearPrepare !== false;
      lbSwipe8Log({
        event: "RESET",
        ...baseTraceFields(),
        note: note ?? null,
        extra: { clearPrepare },
      });
      gestureRef.current = createIdleGesture();
      gestureHost.removeAttribute(LEADERBOARD_SCOPE_PAGER_DRAGGING_ATTR);
      currentGestureId = null;
      touchstartCount = 0;
      touchendCount = 0;
      touchcancelCount = 0;
      // Idempotent prepare cleanup (unlock + host minHeight) — not on successful commit.
      if (clearPrepare) onAbortRef.current?.();
    };

    const setPagerDraggingVisual = (on: boolean) => {
      if (on) gestureHost.setAttribute(LEADERBOARD_SCOPE_PAGER_DRAGGING_ATTR, "true");
      else gestureHost.removeAttribute(LEADERBOARD_SCOPE_PAGER_DRAGGING_ATTR);
    };

    const claimGesture = () => {
      armLeaderboardPagerClickSuppression();
      setPagerDraggingVisual(true);
    };

    const enterSnapping = () => {
      gestureRef.current.phase = "snapping";
      gestureRef.current.active = false;
      gestureRef.current.armed = false;
      gestureRef.current.pointerId = null;
    };

    const finishSnap = (
      targetTranslate: number,
      commitScope: LeaderboardScope | null,
    ) => {
      const reduced = prefersLeaderboardPagerReducedMotion();
      const width = widthOf();
      const scope = scopeRef.current;
      if (scope == null) {
        reset("missing-scope-finish-snap");
        return;
      }
      const currentIndex = leaderboardScopeIndex(scope);
      const targetIndex = commitScope
        ? leaderboardScopeIndex(commitScope)
        : currentIndex;
      setPagerDraggingVisual(false);
      const fromTranslate = readCurrentTranslateX();
      const remainingTravelPx = Math.abs(targetTranslate - fromTranslate);
      const snapMs = leaderboardPagerSnapDurationMs(remainingTravelPx, width);
      const gen = ++snapGeneration;
      enterSnapping();
      lbSwipe8Log({
        event: "SNAP_BEGIN",
        ...baseTraceFields(),
        targetScope: commitScope,
        snapTarget: targetTranslate,
        snapGeneration: gen,
        note: commitScope ? "commit-snap" : "cancel-snap",
      });
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
        if (gen !== snapGeneration) {
          lbSwipe8Log({
            event: "SNAP_END",
            ...baseTraceFields(),
            snapTarget: targetTranslate,
            snapGeneration: gen,
            note: `gen-mismatch gen=${gen} live=${snapGeneration}`,
          });
          // Re-grab / teardown invalidated this settle. Never leave phase stuck
          // in "snapping" when no live gesture owns the pager.
          const g = gestureRef.current;
          if (g.phase === "snapping" && !g.active) {
            clearMotion();
            reset("stranded-snapping-after-gen-mismatch");
          }
          return;
        }
        clearMotion();
        applyTransform(targetTranslate, { animate: false, reducedMotion: true });
        lbSwipe8Log({
          event: "SNAP_END",
          ...baseTraceFields(),
          snapTarget: targetTranslate,
          currentTranslate: targetTranslate,
          targetScope: commitScope,
          snapGeneration: gen,
        });
        if (commitScope && commitScope !== scopeRef.current) {
          lbSwipe8Log({
            event: "COMMIT",
            ...baseTraceFields(),
            targetScope: commitScope,
            snapTarget: targetTranslate,
            commitQualified: true,
            snapGeneration: gen,
          });
          // Keep unlock + host minHeight until activeTab layout finalization (13B).
          reset("after-commit", { clearPrepare: false });
          onCommitRef.current(commitScope);
        } else {
          reset("after-cancel-snap");
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

      applyTransform(fromTranslate, { animate: false, reducedMotion: true });
      void track.offsetWidth;
      if (heroTrack) void heroTrack.offsetWidth;
      applyTransform(targetTranslate, {
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
      if (event.touches.length !== 1) {
        lbSwipe8Log({
          event: "TOUCH_START_SKIP",
          gestureId: currentGestureId,
          activeScope: scopeRef.current,
          skipReason: `touches.length=${event.touches.length}`,
          snapGeneration,
        });
        if (gestureRef.current.phase !== "snapping") reset("multi-touch");
        return;
      }
      clearLeaderboardPagerClickSuppression();
      if (isLeaderboardScopeSwipeInteractiveTarget(event.target)) {
        lbSwipe8Log({
          event: "TOUCH_START_SKIP",
          gestureId: currentGestureId,
          activeScope: scopeRef.current,
          skipReason: "interactive-target",
          snapGeneration,
          extra: {
            targetTag:
              event.target instanceof Element ? event.target.tagName : null,
          },
        });
        if (gestureRef.current.phase !== "snapping") reset("interactive");
        return;
      }
      const touch = event.touches[0];
      if (touch.clientX <= LEADERBOARD_SCOPE_EDGE_START_PX) {
        lbSwipe8Log({
          event: "TOUCH_START_SKIP",
          gestureId: currentGestureId,
          activeScope: scopeRef.current,
          skipReason: "left-edge",
          startX: touch.clientX,
          snapGeneration,
        });
        if (gestureRef.current.phase !== "snapping") reset("left-edge");
        return;
      }

      const width = widthOf();
      const scope = scopeRef.current;
      if (scope == null) {
        if (gestureRef.current.phase !== "snapping") reset("missing-scope-touchstart");
        return;
      }
      const index = leaderboardScopeIndex(scope);
      let baseTranslate = leaderboardPagerRestTranslatePx(index, width);
      let interruptedSnap = false;

      // Interrupt in-flight snap: continue from live visual translate (no jump).
      if (gestureRef.current.phase === "snapping") {
        interruptedSnap = true;
        snapGeneration += 1;
        clearMotion();
        void track.offsetWidth;
        if (heroTrack) void heroTrack.offsetWidth;
        baseTranslate = readCurrentTranslateX();
        applyTransform(baseTranslate, { animate: false, reducedMotion: true });
        setPagerDraggingVisual(false);
      }

      currentGestureId = ++nextGestureId;
      touchstartCount = 1;
      touchendCount = 0;
      touchcancelCount = 0;

      // Imperative unlock / host height BEFORE seeding gesture (no React prepare).
      onPrepareRef.current?.();

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
        baseTranslate,
      };
      lbSwipe8Log({
        event: "TOUCH_START",
        ...baseTraceFields(),
        note: interruptedSnap ? "interrupted-snap" : null,
        extra: {
          usersPanelW: document
            .querySelector('[data-testid="leaderboard-pager-panel-users"]')
            ?.getBoundingClientRect().width,
          artistsPanelW: document
            .querySelector('[data-testid="leaderboard-pager-panel-artists"]')
            ?.getBoundingClientRect().width,
          trackW: track.getBoundingClientRect().width,
          trackScrollW: track.scrollWidth,
          touchCss: lbSwipe8Ensure().captureTouchCss(),
        },
      });
    };

    const onTouchMove = (event: TouchEvent) => {
      const state = gestureRef.current;
      if (!state.active || state.cancelled || state.phase === "snapping") return;
      const touch = Array.from(event.touches).find((t) => t.identifier === state.pointerId);
      if (!touch) {
        lbSwipe8Log({
          event: "TOUCH_START_SKIP",
          ...baseTraceFields(),
          skipReason: "pointerId-mismatch-on-move",
          extra: {
            expectedPointerId: state.pointerId,
            touchIds: Array.from(event.touches).map((t) => t.identifier),
          },
        });
        return;
      }

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
        if (absY > LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
          claimGesture();
          state.cancelled = true;
          state.active = false;
          state.phase = "idle";
          lbSwipe8Log({
            event: "TOUCH_END",
            ...baseTraceFields(),
            note: "pre-arm-vertical-cancel",
            decisionAction: "cancel",
            decisionReason: "vertical",
          });
          reset("pre-arm-vertical-cancel");
          return;
        }
        if (
          absX >= LEADERBOARD_SCOPE_DRAG_START_PX &&
          absX > absY * LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO
        ) {
          claimGesture();
          state.armed = true;
          state.phase = "dragging";
          track.style.willChange = "transform";
          track.style.transition = "none";
          if (heroTrack) {
            heroTrack.style.willChange = "transform";
            heroTrack.style.transition = "none";
          }
          lbSwipe8Log({
            event: "ARM",
            ...baseTraceFields(),
          });
        } else {
          return;
        }
      }

      event.preventDefault();
      const scope = scopeRef.current;
      if (scope == null) {
        reset("missing-scope-touchmove");
        return;
      }
      const index = leaderboardScopeIndex(scope);
      const rubberDx = applyLeaderboardPagerEdgeRubber(deltaX, index);
      applyTransform(state.baseTranslate + rubberDx, {
        animate: false,
        reducedMotion: true,
      });
      const adjacentScope = resolveLeaderboardScopeFromDelta(scope, deltaX);
      const adjacentIndex = adjacentScope ? leaderboardScopeIndex(adjacentScope) : null;
      onProgressRef.current?.({
        phase: "dragging",
        currentIndex: index,
        adjacentIndex,
        progress: leaderboardPagerDragProgress({
          deltaX,
          rubberDx,
          viewportWidth: widthOf(),
          hasAdjacent: adjacentIndex != null,
        }),
        animate: false,
        reducedMotion: true,
      });
    };

    const onTouchEnd = (event: TouchEvent) => {
      touchendCount += 1;
      const state = gestureRef.current;
      const endTouch = event.changedTouches[0] ?? null;
      const endPointerId = endTouch ? endTouch.identifier : null;

      if (!state.active || state.cancelled || !state.armed || state.phase === "snapping") {
        lbSwipe8Log({
          event: "TOUCH_END",
          ...baseTraceFields(),
          endPointerId,
          note: !state.active
            ? "inactive"
            : state.cancelled
              ? "already-cancelled"
              : !state.armed
                ? "never-armed"
                : "phase-snapping",
          commitQualified: false,
        });
        if (state.phase !== "snapping") {
          // reset() → onAbort clears prepare (unarmed / cancelled).
          reset("touchend-early");
        }
        return;
      }

      const width = widthOf();
      const scope = scopeRef.current;
      if (scope == null) {
        reset("missing-scope-touchend");
        return;
      }
      const index = leaderboardScopeIndex(scope);
      const deltaX = state.lastX - state.startX;
      const deltaY = state.lastY - state.startY;
      const endTs = performance.now();
      if (
        state.samples.length === 0 ||
        state.samples[state.samples.length - 1]!.t < endTs
      ) {
        state.samples.push({ x: state.lastX, t: endTs });
      }
      const velocityX = computeLeaderboardPagerReleaseVelocity(state.samples, endTs);
      const absX = Math.abs(deltaX);
      const progress = absX / width;
      const flickQualified =
        absX >= LEADERBOARD_SCOPE_FLICK_MIN_DX_PX &&
        ((deltaX < 0 && velocityX <= -LEADERBOARD_SCOPE_FLICK_PX_PER_MS) ||
          (deltaX > 0 && velocityX >= LEADERBOARD_SCOPE_FLICK_PX_PER_MS) ||
          (((deltaX < 0 && velocityX < 0) || (deltaX > 0 && velocityX > 0)) &&
            (absX + Math.abs(velocityX) * LEADERBOARD_SCOPE_PROJECTION_MS) / width >=
              LEADERBOARD_SCOPE_COMMIT_PROGRESS));
      const commitQualified =
        progress >= LEADERBOARD_SCOPE_COMMIT_PROGRESS || flickQualified;

      lbSwipe8Log({
        event: "TOUCH_END",
        ...baseTraceFields(),
        endPointerId,
        velocityX,
        progress,
        flickQualified,
        commitQualified,
        extra: {
          pointerMatch: endPointerId === state.pointerId,
          changedTouches: Array.from(event.changedTouches).map((t) => t.identifier),
        },
      });

      const decision = evaluateLeaderboardScopeSwipe({
        currentScope: scope,
        deltaX,
        deltaY,
        velocityX,
        viewportWidth: width,
        // Horizontal ownership already decided in touchmove — do not reclassify vertical.
        armed: true,
      });

      lbSwipe8Log({
        event: "EVALUATE",
        ...baseTraceFields(),
        velocityX,
        progress,
        flickQualified,
        commitQualified: decision.action === "commit",
        targetScope: decision.action === "commit" ? decision.nextScope : null,
        decisionAction: decision.action,
        decisionReason: decision.reason,
      });

      if (decision.action === "commit") {
        const nextIndex = leaderboardScopeIndex(decision.nextScope);
        finishSnap(leaderboardPagerRestTranslatePx(nextIndex, width), decision.nextScope);
        return;
      }

      finishSnap(leaderboardPagerRestTranslatePx(index, width), null);
    };

    const onTouchCancel = (event: TouchEvent) => {
      touchcancelCount += 1;
      const state = gestureRef.current;
      const endTouch = event.changedTouches[0] ?? null;
      lbSwipe8Log({
        event: "TOUCH_CANCEL",
        ...baseTraceFields(),
        endPointerId: endTouch ? endTouch.identifier : null,
        note: "browser-touchcancel",
        extra: {
          cancelable: event.cancelable,
          defaultPrevented: event.defaultPrevented,
        },
      });
      if (state.phase === "snapping") return;
      if (state.armed) {
        const width = widthOf();
        const scope = scopeRef.current;
        if (scope == null) {
          reset("missing-scope-touchcancel");
          return;
        }
        const index = leaderboardScopeIndex(scope);
        finishSnap(leaderboardPagerRestTranslatePx(index, width), null);
        return;
      }
      reset("touchcancel");
    };

    gestureHost.addEventListener("touchstart", onTouchStart, { passive: true });
    gestureHost.addEventListener("touchmove", onTouchMove, { passive: false });
    gestureHost.addEventListener("touchend", onTouchEnd, { passive: true });
    gestureHost.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      snapGeneration += 1;
      gestureHost.removeEventListener("touchstart", onTouchStart);
      gestureHost.removeEventListener("touchmove", onTouchMove);
      gestureHost.removeEventListener("touchend", onTouchEnd);
      gestureHost.removeEventListener("touchcancel", onTouchCancel);
      reset("effect-cleanup");
    };
  }, [enabled, gestureHostRef, heroTrackRef, scopeRef, trackRef, viewportRef]);
}
