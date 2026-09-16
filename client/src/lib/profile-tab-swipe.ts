/**
 * Profile sub-tab finger-follow pager (PROFILE-TABS-3A).
 * Track transform follows the finger after axis lock; activeTab updates only after snap commit.
 */

import { useEffect, useRef, type RefObject } from "react";

/** Align with `use-edge-swipe-back` / Leaderboard left-edge reserve. */
export const PROFILE_TAB_SWIPE_EDGE_START_PX = 24;
/** Minimum horizontal travel before a gesture can arm as horizontal. */
export const PROFILE_TAB_SWIPE_DRAG_START_PX = 12;
/** Finger-follow commit when |dx| / viewportWidth >= this. */
export const PROFILE_TAB_PAGER_COMMIT_PROGRESS = 0.48;
/** Flick commit threshold for interactive pager (release-window velocity). */
export const PROFILE_TAB_PAGER_FLICK_PX_PER_MS = 0.4;
/** Minimum |dx| before velocity / projection may commit. */
export const PROFILE_TAB_PAGER_FLICK_MIN_DX_PX = 28;
/** Recent-motion window (ms) for release velocity — not whole-gesture average. */
export const PROFILE_TAB_PAGER_VELOCITY_WINDOW_MS = 100;
/** Project this many ms of release-window velocity when evaluating flick intent. */
export const PROFILE_TAB_PAGER_PROJECTION_MS = 150;
/** Outer-edge rubber-band factor (Overview right / Notifications left). */
export const PROFILE_TAB_PAGER_EDGE_RUBBER = 0.28;
/** Unified settle duration floor (ms) — short remaining travel. */
export const PROFILE_TAB_PAGER_SNAP_MS_MIN = 220;
/** Unified settle duration ceiling (ms) — near full-page remaining travel. */
export const PROFILE_TAB_PAGER_SNAP_MS = 400;
/** Extra ms added across 0→1 remaining page progress (MIN + span = MAX). */
export const PROFILE_TAB_PAGER_SNAP_MS_SPAN = 180;
/**
 * Near-uniform settle curve — soft start/end, no assertive ease-out launch.
 * Same for commit and cancel.
 */
export const PROFILE_TAB_PAGER_SNAP_EASING = "cubic-bezier(0.32, 0.45, 0.42, 1)";
/** abs(dx) must exceed abs(dy) * ratio for horizontal intent. */
export const PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO = 1.2;
/** Early vertical cancel when vertical drift wins before horizontal arm. */
export const PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX = 14;

/** @deprecated Use PROFILE_TAB_PAGER_COMMIT_PROGRESS — kept for older test imports. */
export const PROFILE_TAB_SWIPE_COMMIT_PROGRESS = PROFILE_TAB_PAGER_COMMIT_PROGRESS;
/** @deprecated Use PROFILE_TAB_PAGER_FLICK_PX_PER_MS. */
export const PROFILE_TAB_SWIPE_FAST_SWIPE_PX_PER_MS = PROFILE_TAB_PAGER_FLICK_PX_PER_MS;

/** Radix Profile tab values in swipe order (label "Likes" uses `"liked"`). */
export const PROFILE_SWIPE_TAB_IDS = ["profile", "posts", "liked", "notifications"] as const;
export type ProfileSwipeTabId = (typeof PROFILE_SWIPE_TAB_IDS)[number];

export function isProfileSwipeTabId(v: string): v is ProfileSwipeTabId {
  return (PROFILE_SWIPE_TAB_IDS as readonly string[]).includes(v);
}

export function profileTabIndex(tab: ProfileSwipeTabId): number {
  return Math.max(0, PROFILE_SWIPE_TAB_IDS.indexOf(tab));
}

/**
 * Full-bleed pager viewport.
 *
 * Profile content lives under `px-6` → `max-w-md`. Banner / primary nav already
 * break out with `-mx-6` so their edges match the physical screen (within that
 * column). The pager must use the same breakout — **without** `w-full`, which
 * would freeze width at the padded content box and make adjacent panels enter
 * from the inner padding edge instead of x=0 / x=viewport.
 *
 * With block `width: auto` + `-mx-6`, used width expands to containing-block +
 * 3rem (= screen edges on phone). Drag/snap measure this same element via
 * getBoundingClientRect so pageWidth matches layout.
 *
 * No `overflow-y-hidden`: inactive panels collapse with `h-0` + `overflow-y-hidden`
 * so they cannot inflate page scrollHeight; the active panel must not be clipped
 * (PROFILE-GRID-VIEWER-2A-FIX).
 *
 * Short-content hit area: pair with {@link PROFILE_TAB_PAGER_BODY_FILL_CLASS} inside
 * the flex column chain so blank space beneath Posts/Likes remains swipeable.
 */
export const PROFILE_TAB_PAGER_VIEWPORT_CLASS =
  "relative z-0 -mx-6 overflow-x-hidden" as const;

/**
 * Profile scroll → column → Tabs → viewport flex chain.
 * Fills the scrollport content box (above `--app-scroll-nav-clearance` +
 * `--app-scroll-end-pad` padding on the Profile page scroller) so the
 * existing pager host receives touches in empty body space. Not an overlay;
 * does not extend under native nav.
 */
export const PROFILE_TAB_PAGER_SCROLL_FLEX_CLASS = "flex flex-col" as const;

/** Inner px-6 column: grow with the scrollport; allow tall content to expand page scroll. */
export const PROFILE_TAB_PAGER_PAGE_INSET_CLASS =
  "flex flex-1 flex-col px-6" as const;

/** max-w-md column + bottom rhythm formerly `mb-5` on Tabs (kept inside the fill box). */
export const PROFILE_TAB_PAGER_PAGE_COLUMN_CLASS =
  "mx-auto flex w-full max-w-md flex-1 flex-col pb-5" as const;

/** Radix Tabs root: consume remaining space under the banner. */
export const PROFILE_TAB_PAGER_TABS_ROOT_CLASS =
  "flex w-full flex-1 flex-col" as const;

/** Primary nav row must not shrink when the pager flex-grows. */
export const PROFILE_TAB_PAGER_NAV_SHELL_SHRINK_CLASS = "shrink-0" as const;

/** Swipe region grows into remaining Profile body height (short Posts/Likes). */
export const PROFILE_TAB_PAGER_BODY_FILL_CLASS = "flex-1" as const;

/** Four fixed flex slots; track translate is the only horizontal positioning system. */
export const PROFILE_TAB_PAGER_TRACK_CLASS = "flex" as const;

/**
 * One full pager page. Horizontal `px-6` restores the Profile content inset that
 * lived on the outer page wrapper — panel geometry stays edge-to-edge; content
 * inside does not go full-bleed.
 *
 * Horizontal: fixed flex slots (`min-w-full` / `basis-full`) + track
 * `translate3d(-activeIndex * W)`. Do **not** absolute-position panels.
 *
 * Vertical (PROFILE-GRID-VIEWER-2A-FIX): inactive idle panels collapse (`h-0` +
 * `overflow-y-hidden`) so only the active panel owns page height. During
 * drag/snapping, apply `PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS` to current +
 * adjacent so reveal is not clipped.
 */
export const PROFILE_TAB_PAGER_PANEL_CLASS =
  "box-border min-w-full w-full shrink-0 grow-0 basis-full self-start px-6 data-[state=inactive]:!block data-[state=inactive]:h-0 data-[state=inactive]:min-h-0 data-[state=inactive]:overflow-y-hidden data-[state=active]:h-auto data-[state=active]:min-h-0 data-[state=active]:overflow-y-visible" as const;

/** Overrides inactive collapse for current/adjacent during dragging or snapping. */
export const PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS =
  "!h-auto !min-h-0 !overflow-y-visible" as const;

/** Individual class tokens from {@link PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS}. */
export function profilePagerVertUnlockClassTokens(): string[] {
  return PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS.split(/\s+/).filter(Boolean);
}

/** PROFILE-SWIPE-POLISH-4 — sync unlock on a live panel ref (no React). */
export function applyProfilePagerPanelImperativeUnlock(el: HTMLElement | null | undefined): void {
  if (!el) return;
  for (const token of profilePagerVertUnlockClassTokens()) {
    el.classList.add(token);
  }
}

/** Remove temporary imperative unlock tokens after commit/cancel/idle. */
export function clearProfilePagerPanelImperativeUnlock(el: HTMLElement | null | undefined): void {
  if (!el) return;
  for (const token of profilePagerVertUnlockClassTokens()) {
    el.classList.remove(token);
  }
}

/**
 * Posts/Likes grid thumbnail buttons — swipe-eligible carve-out from interactive exclusion
 * (PROFILE-TABS-GESTURE-4B). Nested real controls inside a card remain excluded.
 */
export const PROFILE_TAB_PAGER_CARD_ATTR = "data-profile-pager-card" as const;
/** Set on the pager viewport while horizontal arm or vertical cancel owns the gesture. */
export const PROFILE_TAB_PAGER_DRAGGING_ATTR = "data-profile-pager-dragging" as const;

const INTERACTIVE_SELECTOR =
  "input, textarea, select, button, a, [contenteditable], [role='button'], [role='tab'], [role='dialog']";

/**
 * True when the event target should block pager start.
 * Generic interactive elements are excluded; Profile pager-card buttons are allowed
 * unless the hit target resolves to a nested interactive control inside the card.
 */
export function isProfileTabSwipeInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  if (!interactive) return false;
  const card = target.closest(`[${PROFILE_TAB_PAGER_CARD_ATTR}]`);
  // Card surface itself is swipe-eligible.
  if (card && interactive === card) return false;
  return true;
}

/** One-shot click suppress after horizontal arm or vertical cancel on a card gesture. */
let profilePagerCardClickSuppressArmed = false;

export function armProfilePagerCardClickSuppression(): void {
  profilePagerCardClickSuppressArmed = true;
}

export function clearProfilePagerCardClickSuppression(): void {
  profilePagerCardClickSuppressArmed = false;
}

/** Returns true once if a just-finished gesture should not open the viewer. */
export function consumeProfilePagerCardClickSuppression(): boolean {
  if (!profilePagerCardClickSuppressArmed) return false;
  profilePagerCardClickSuppressArmed = false;
  return true;
}

/** Test seam. */
export function isProfilePagerCardClickSuppressionArmed(): boolean {
  return profilePagerCardClickSuppressArmed;
}

/**
 * Swipe left (negative dx) → next tab; swipe right (positive dx) → previous.
 * No wrap at Overview or Notifications.
 */
export function resolveProfileTabFromDelta(
  currentTab: ProfileSwipeTabId,
  deltaX: number,
): ProfileSwipeTabId | null {
  const index = PROFILE_SWIPE_TAB_IDS.indexOf(currentTab);
  if (index < 0) return null;
  if (deltaX < 0) {
    return index < PROFILE_SWIPE_TAB_IDS.length - 1 ? PROFILE_SWIPE_TAB_IDS[index + 1]! : null;
  }
  if (deltaX > 0) {
    return index > 0 ? PROFILE_SWIPE_TAB_IDS[index - 1]! : null;
  }
  return null;
}

/** Resting translate for a committed tab index. */
export function profilePagerRestTranslatePx(index: number, viewportWidth: number): number {
  const translate = -Math.max(0, index) * Math.max(1, viewportWidth);
  return translate === 0 ? 0 : translate;
}

/**
 * Mild rubber-band when dragging past Overview (right) or Notifications (left).
 */
export function applyProfilePagerEdgeRubber(
  dx: number,
  index: number,
  rubber: number = PROFILE_TAB_PAGER_EDGE_RUBBER,
): number {
  const atStart = index <= 0 && dx > 0;
  const atEnd = index >= PROFILE_SWIPE_TAB_IDS.length - 1 && dx < 0;
  if (atStart || atEnd) return dx * rubber;
  return dx;
}

export function prefersProfilePagerReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Live pager progress for PROFILE-TABS-3B shared underline (same gesture as the track). */
export type ProfilePagerProgressPhase = "idle" | "dragging" | "snapping";

export type ProfilePagerProgressEvent = {
  phase: ProfilePagerProgressPhase;
  currentIndex: number;
  /** Neighbor index while dragging/snapping toward it; null when anchored / snap-back. */
  adjacentIndex: number | null;
  /** 0…1 toward adjacentIndex (0 = current, 1 = adjacent). */
  progress: number;
  animate: boolean;
  reducedMotion: boolean;
  /** Settle duration for snapping (underline must match track). */
  durationMs?: number;
};

/**
 * Host height while idle = current panel only.
 * While dragging/snapping toward a neighbor = max(current, adjacent) — discrete,
 * not interpolated per pointermove (PROFILE-GRID-VIEWER-2A / 2A-FIX).
 */
export function resolveProfilePagerHostHeightPx(input: {
  phase: ProfilePagerProgressPhase;
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

/**
 * Gesture-prepare inline minHeight must never shrink the body-fill floor.
 * Idle fill comes from flex (`PROFILE_TAB_PAGER_BODY_FILL_CLASS`); prepare only
 * raises the host when an adjacent panel is taller.
 */
export function resolveProfilePagerPrepareHostMinHeightPx(
  measuredMaxPanelHeight: number,
  idleViewportHeight: number,
): number {
  return Math.max(
    Math.max(0, measuredMaxPanelHeight),
    Math.max(0, idleViewportHeight),
  );
}

/**
 * Panels that must temporarily expand vertically during drag/snap.
 * `null` = idle; rely on Radix `data-state=active` natural height only.
 */
export function resolveProfilePagerVertUnlockIndices(input: {
  phase: ProfilePagerProgressPhase;
  currentIndex: number;
  adjacentIndex: number | null;
}): number[] | null {
  if (input.phase !== "dragging" && input.phase !== "snapping") return null;
  if (input.adjacentIndex == null) return [input.currentIndex];
  if (input.adjacentIndex === input.currentIndex) return [input.currentIndex];
  return [input.currentIndex, input.adjacentIndex];
}

/**
 * PROFILE-SWIPE-POLISH-2 — unlock current ±1 at gesture prepare (touchstart)
 * so the first armed move does not need a React unlock render.
 */
export function resolveProfilePagerPrepareUnlockIndices(
  currentIndex: number,
  tabCount: number = PROFILE_SWIPE_TAB_IDS.length,
): number[] {
  const index = Math.max(0, Math.min(currentIndex, Math.max(0, tabCount - 1)));
  const out: number[] = [index];
  if (index > 0) out.unshift(index - 1);
  if (index < tabCount - 1) out.push(index + 1);
  return out;
}

/** True when every needed index is already present in the applied unlock set. */
export function profilePagerUnlockCovers(
  applied: number[] | null,
  needed: number[] | null,
): boolean {
  if (needed == null) return applied == null;
  if (applied == null) return false;
  return needed.every((i) => applied.includes(i));
}

/**
 * Visual label emphasis 0..1 for a Profile primary tab during pager progress.
 * Semantic aria-selected stays on the committed tab; this is presentational only.
 */
export function resolveProfilePrimaryTabEmphasis(input: {
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

/** Matches inactive `text-white/55` → active opaque white on the Profile canvas. */
export const PROFILE_PRIMARY_TAB_INACTIVE_ALPHA = 0.55;

export function profilePrimaryTabEmphasisColor(emphasis: number): string {
  const t = Math.min(1, Math.max(0, emphasis));
  const alpha =
    PROFILE_PRIMARY_TAB_INACTIVE_ALPHA +
    (1 - PROFILE_PRIMARY_TAB_INACTIVE_ALPHA) * t;
  return `rgba(255, 255, 255, ${alpha})`;
}

/** Fixed flex-slot viewport X: (panelIndex - activeIndex) * pageWidth. */
export function profilePagerViewportXPx(
  panelIndex: number,
  activeIndex: number,
  pageWidth: number,
): number {
  return (panelIndex - activeIndex) * Math.max(1, pageWidth);
}

/**
 * Preserve scrollTop when valid; clamp only when beyond the new max after a
 * shorter panel commits (e.g. Likes → Posts). Never forces top.
 */
export function clampScrollTopToContentMax(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  if (scrollTop > max) return max;
  if (scrollTop < 0) return 0;
  return scrollTop;
}

export function clampElementScrollTopIfNeeded(el: HTMLElement): number {
  const next = clampScrollTopToContentMax(el.scrollTop, el.scrollHeight, el.clientHeight);
  if (next !== el.scrollTop) el.scrollTop = next;
  return next;
}

export type ProfileNavIndicatorMetrics = {
  left: number;
  width: number;
  bottom: number;
};

export function lerpProfileNav(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateProfileNavIndicator(
  from: Pick<ProfileNavIndicatorMetrics, "left" | "width">,
  to: Pick<ProfileNavIndicatorMetrics, "left" | "width">,
  progress: number,
): { left: number; width: number } {
  const t = Math.min(1, Math.max(0, progress));
  return {
    left: lerpProfileNav(from.left, to.left, t),
    width: lerpProfileNav(from.width, to.width, t),
  };
}

/**
 * Drag progress toward an adjacent page from rubber-adjusted dx.
 * At outer edges (no adjacent) returns 0 so the indicator stays put.
 */
export function profilePagerDragProgress(input: {
  deltaX: number;
  rubberDx: number;
  viewportWidth: number;
  hasAdjacent: boolean;
}): number {
  if (!input.hasAdjacent) return 0;
  const width = Math.max(1, input.viewportWidth);
  return Math.min(1, Math.abs(input.rubberDx) / width);
}

/** Horizontal touch sample for release-window velocity (PROFILE-TABS-GESTURE-4A). */
export type ProfilePagerVelocitySample = { x: number; t: number };

/**
 * Signed px/ms from recent samples inside `windowMs` (default 100ms).
 * Segment velocities are recency-weighted — not a whole-gesture average.
 */
export function computeProfilePagerReleaseVelocity(
  samples: readonly ProfilePagerVelocitySample[],
  endTs?: number,
  windowMs: number = PROFILE_TAB_PAGER_VELOCITY_WINDOW_MS,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1]!;
  const end = endTs ?? last.t;
  const windowStart = end - Math.max(1, windowMs);

  let windowed = samples.filter((s) => s.t >= windowStart);
  if (windowed.length < 2) {
    // Prepend the latest sample before the window so the span can cover it.
    let before: ProfilePagerVelocitySample | null = null;
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
    // Prefer recent motion: weight → 1 at endTs, → ~0 at window start.
    const ageMs = Math.max(0, end - b.t);
    const weight = Math.max(0.15, 1 - ageMs / Math.max(1, windowMs));
    weightedSum += segmentV * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/**
 * Unified pager settle duration (ms) — commit and cancel identical.
 * Scales only with remaining travel; release velocity does not shorten.
 *
 * duration = clamp(220, 220 + (remainingPx / W) * 180, 400)
 */
export function profilePagerSnapDurationMs(
  remainingTravelPx: number,
  viewportWidth: number,
): number {
  const width = Math.max(1, viewportWidth);
  const remainingProgress = Math.min(1, Math.max(0, Math.abs(remainingTravelPx) / width));
  const duration =
    PROFILE_TAB_PAGER_SNAP_MS_MIN + remainingProgress * PROFILE_TAB_PAGER_SNAP_MS_SPAN;
  return Math.round(
    Math.min(PROFILE_TAB_PAGER_SNAP_MS, Math.max(PROFILE_TAB_PAGER_SNAP_MS_MIN, duration)),
  );
}

export type ProfilePagerReleaseDecision =
  | {
      action: "commit";
      reason: "distance" | "velocity";
      nextTab: ProfileSwipeTabId;
    }
  | {
      action: "cancel";
      reason: "insufficient" | "boundary" | "vertical" | "zero";
      nextTab: null;
    };

function profilePagerVelocityMatchesFlickDirection(
  deltaX: number,
  velocityX: number,
): boolean {
  return (
    (deltaX < 0 && velocityX <= -PROFILE_TAB_PAGER_FLICK_PX_PER_MS) ||
    (deltaX > 0 && velocityX >= PROFILE_TAB_PAGER_FLICK_PX_PER_MS)
  );
}

function profilePagerVelocitySameSign(deltaX: number, velocityX: number): boolean {
  return (deltaX < 0 && velocityX < 0) || (deltaX > 0 && velocityX > 0);
}

/**
 * Release decision for finger-follow pager
 * (48% distance OR flick ≥28px @ 0.40 px/ms OR projected 150ms ≥48% with same-sign v).
 */
export function evaluateProfilePagerRelease(input: {
  currentTab: ProfileSwipeTabId;
  deltaX: number;
  deltaY: number;
  /** Signed px/ms (positive = rightward) — prefer release-window velocity. */
  velocityX: number;
  viewportWidth: number;
}): ProfilePagerReleaseDecision {
  const { currentTab, deltaX, deltaY, velocityX } = input;
  const viewportWidth = Math.max(1, input.viewportWidth);
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX === 0 && absY === 0) {
    return { action: "cancel", reason: "zero", nextTab: null };
  }

  if (absY > PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
    return { action: "cancel", reason: "vertical", nextTab: null };
  }
  if (absX < PROFILE_TAB_SWIPE_DRAG_START_PX) {
    return { action: "cancel", reason: "insufficient", nextTab: null };
  }
  if (absX <= absY * PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO) {
    return { action: "cancel", reason: "vertical", nextTab: null };
  }

  const nextTab = resolveProfileTabFromDelta(currentTab, deltaX);
  if (!nextTab) {
    return { action: "cancel", reason: "boundary", nextTab: null };
  }

  const progress = absX / viewportWidth;
  if (progress >= PROFILE_TAB_PAGER_COMMIT_PROGRESS) {
    return { action: "commit", reason: "distance", nextTab };
  }

  if (absX >= PROFILE_TAB_PAGER_FLICK_MIN_DX_PX) {
    if (profilePagerVelocityMatchesFlickDirection(deltaX, velocityX)) {
      return { action: "commit", reason: "velocity", nextTab };
    }
    // Projected position: absX + |v| * 150ms must clear distance commit, same-sign only.
    if (profilePagerVelocitySameSign(deltaX, velocityX)) {
      const projectedAbsX = absX + Math.abs(velocityX) * PROFILE_TAB_PAGER_PROJECTION_MS;
      if (projectedAbsX / viewportWidth >= PROFILE_TAB_PAGER_COMMIT_PROGRESS) {
        return { action: "commit", reason: "velocity", nextTab };
      }
    }
  }

  return { action: "cancel", reason: "insufficient", nextTab: null };
}

/** @deprecated Prefer evaluateProfilePagerRelease for finger-follow. */
export const evaluateProfileTabSwipe = (
  input: Parameters<typeof evaluateProfilePagerRelease>[0],
):
  | { action: "noop"; reason: ProfilePagerReleaseDecision["reason"]; nextTab: null }
  | { action: "commit"; reason: "distance" | "velocity"; nextTab: ProfileSwipeTabId } => {
  const d = evaluateProfilePagerRelease(input);
  if (d.action === "commit") return d;
  return { action: "noop", reason: d.reason, nextTab: null };
};

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
  /** Horizontal samples for release-window velocity (PROFILE-TABS-GESTURE-4A). */
  samples: ProfilePagerVelocitySample[];
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

type UseProfileTabPagerOptions = {
  enabled?: boolean;
  /** Committed tab — used to sync track after taps / external changes. */
  activeTab: ProfileSwipeTabId;
  tabRef: RefObject<ProfileSwipeTabId>;
  viewportRef: RefObject<HTMLElement | null>;
  trackRef: RefObject<HTMLElement | null>;
  onCommitTab: (next: ProfileSwipeTabId) => void;
  /** Optional PROFILE-TABS-3B underline consumer — same gesture as the track. */
  onPagerProgress?: (event: ProfilePagerProgressEvent) => void;
  /**
   * PROFILE-SWIPE-POLISH-2 — called when a single-finger gesture is seeded on
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
    const durationMs = opts.durationMs ?? PROFILE_TAB_PAGER_SNAP_MS;
    track.style.transition = `transform ${durationMs}ms ${PROFILE_TAB_PAGER_SNAP_EASING}`;
  } else {
    track.style.transition = "none";
  }
  track.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

/**
 * Finger-follow pager on the Profile content region beneath sub-tabs.
 * Calls onCommitTab only after a successful snap completes (never during preview).
 */
export function useProfileTabPager({
  enabled = true,
  activeTab,
  tabRef,
  viewportRef,
  trackRef,
  onCommitTab,
  onPagerProgress,
  onGesturePrepare,
  onGestureAbort,
}: UseProfileTabPagerOptions): void {
  const onCommitRef = useRef(onCommitTab);
  onCommitRef.current = onCommitTab;
  const onProgressRef = useRef(onPagerProgress);
  onProgressRef.current = onPagerProgress;
  const onPrepareRef = useRef(onGesturePrepare);
  onPrepareRef.current = onGesturePrepare;
  const onAbortRef = useRef(onGestureAbort);
  onAbortRef.current = onGestureAbort;
  const gestureRef = useRef<GestureState>(createIdleGesture());

  // Keep track aligned when activeTab changes via tap (or post-commit normalisation).
  useEffect(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport || typeof window === "undefined") return;

    const sync = () => {
      if (gestureRef.current.phase !== "idle") return;
      const width = Math.max(1, viewport.getBoundingClientRect().width || window.innerWidth);
      const index = profileTabIndex(activeTab);
      track.style.willChange = "";
      setTrackTransform(track, profilePagerRestTranslatePx(index, width), {
        animate: false,
        reducedMotion: true,
      });
      // Indicator rest/tap sync is owned by the Profile nav consumer (avoids fighting tap morph).
    };

    sync();
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeTab, trackRef, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!enabled || !viewport || !track || typeof window === "undefined") return;

    /**
     * PROFILE-SWIPE-POLISH-4 — armed drag uses cached width; no per-move rect read.
     * Falls back to a live measure only if the cache was cleared (resize / idle).
     */
    let gestureWidthPx = 0;

    const reset = () => {
      gestureRef.current = createIdleGesture();
      gestureWidthPx = 0;
      viewport.removeAttribute(PROFILE_TAB_PAGER_DRAGGING_ATTR);
    };

    const setPagerDraggingVisual = (on: boolean) => {
      if (on) viewport.setAttribute(PROFILE_TAB_PAGER_DRAGGING_ATTR, "true");
      else viewport.removeAttribute(PROFILE_TAB_PAGER_DRAGGING_ATTR);
    };

    const claimCardGesture = () => {
      armProfilePagerCardClickSuppression();
      setPagerDraggingVisual(true);
    };

    /** Live measure — used to seed / refresh the per-gesture cache. */
    const measureViewportWidthPx = () =>
      Math.max(1, viewport.getBoundingClientRect().width || window.innerWidth);

    const widthOf = () => {
      if (gestureWidthPx > 0) return gestureWidthPx;
      gestureWidthPx = measureViewportWidthPx();
      return gestureWidthPx;
    };
    const cacheGestureWidth = () => {
      gestureWidthPx = measureViewportWidthPx();
      return gestureWidthPx;
    };

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

    const finishSnap = (targetTranslate: number, commitTab: ProfileSwipeTabId | null) => {
      const reduced = prefersProfilePagerReducedMotion();
      const width = widthOf();
      const currentIndex = profileTabIndex(tabRef.current);
      const targetIndex = commitTab ? profileTabIndex(commitTab) : currentIndex;
      // Finger is up — clear press-suppress attr; click suppress remains until consume/next start.
      setPagerDraggingVisual(false);
      // Continuity: settle must start from the live drag translate (no first-frame jump).
      const fromTranslate = readCurrentTranslateX();
      const remainingTravelPx = Math.abs(targetTranslate - fromTranslate);
      // Same duration formula for commit and cancel — remaining distance only.
      const snapMs = profilePagerSnapDurationMs(remainingTravelPx, width);
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
        if (commitTab && commitTab !== tabRef.current) {
          onCommitRef.current(commitTab);
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

      // Reaffirm start translate with transition:none, then glide to target.
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
      // Clear stale suppress from a prior gesture before evaluating this one.
      clearProfilePagerCardClickSuppression();
      if (isProfileTabSwipeInteractiveTarget(event.target)) {
        reset();
        return;
      }
      const touch = event.touches[0];
      if (touch.clientX <= PROFILE_TAB_SWIPE_EDGE_START_PX) {
        reset();
        return;
      }
      const width = cacheGestureWidth();
      const index = profileTabIndex(tabRef.current);
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
        baseTranslate: profilePagerRestTranslatePx(index, width),
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
      // Bound sample buffer (keep ~last 250ms worth at high event rates).
      if (state.samples.length > 64) {
        state.samples = state.samples.slice(-48);
      }

      if (!state.armed) {
        if (absY > PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
          // Vertical wins: suppress card press + click; do not preventDefault.
          claimCardGesture();
          state.cancelled = true;
          state.active = false;
          state.phase = "idle";
          onAbortRef.current?.();
          return;
        }
        if (
          absX >= PROFILE_TAB_SWIPE_DRAG_START_PX &&
          absX > absY * PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO
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
      const index = profileTabIndex(tabRef.current);
      const rubberDx = applyProfilePagerEdgeRubber(deltaX, index);
      const viewportWidth = widthOf();
      setTrackTransform(track, state.baseTranslate + rubberDx, {
        animate: false,
        reducedMotion: true,
      });
      const adjacentTab = resolveProfileTabFromDelta(tabRef.current, deltaX);
      const adjacentIndex = adjacentTab ? profileTabIndex(adjacentTab) : null;
      onProgressRef.current?.({
        phase: "dragging",
        currentIndex: index,
        adjacentIndex,
        progress: profilePagerDragProgress({
          deltaX,
          rubberDx,
          viewportWidth,
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
      const index = profileTabIndex(tabRef.current);
      const deltaX = state.lastX - state.startX;
      const deltaY = state.lastY - state.startY;
      const endTs = performance.now();
      // Ensure release timestamp is represented so a final pause does not empty the window.
      if (
        state.samples.length === 0 ||
        state.samples[state.samples.length - 1]!.t < endTs
      ) {
        state.samples.push({ x: state.lastX, t: endTs });
      }
      const velocityX = computeProfilePagerReleaseVelocity(state.samples, endTs);
      const decision = evaluateProfilePagerRelease({
        currentTab: tabRef.current,
        deltaX,
        deltaY,
        velocityX,
        viewportWidth: width,
      });

      if (decision.action === "commit") {
        const nextIndex = profileTabIndex(decision.nextTab);
        finishSnap(profilePagerRestTranslatePx(nextIndex, width), decision.nextTab);
        return;
      }

      finishSnap(profilePagerRestTranslatePx(index, width), null);
    };

    const onTouchCancel = () => {
      const state = gestureRef.current;
      if (state.phase === "snapping") return;
      if (state.armed) {
        const width = widthOf();
        const index = profileTabIndex(tabRef.current);
        finishSnap(profilePagerRestTranslatePx(index, width), null);
        return;
      }
      if (state.active) onAbortRef.current?.();
      reset();
    };

    const onGestureResize = () => {
      // Invalidate so the next widthOf() remasures; mid-gesture uses refreshed value safely.
      gestureWidthPx = 0;
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchCancel, { passive: true });
    window.addEventListener("resize", onGestureResize);

    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("resize", onGestureResize);
      reset();
    };
  }, [enabled, tabRef, trackRef, viewportRef]);
}

/** @deprecated Alias — PROFILE-TABS-3A uses useProfileTabPager. */
export const useProfileTabSwipe = useProfileTabPager;
