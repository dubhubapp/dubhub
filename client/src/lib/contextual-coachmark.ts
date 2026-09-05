/**
 * HINTS-PREMIUM-2 — compact anchored coachmark helpers (Like → Releases first).
 * Placement math only; no tutorial framework / step sequences.
 */

export const LIKE_RELEASE_COACHMARK_COPY =
  "Likes can show up in Releases once a track gets an ID and a release." as const;

export const DISCOVER_COACHMARK_COPY =
  "Filter the feed by mode, genre, or ID status." as const;

export const COMMENTS_COACHMARK_COPY =
  "Know it? Drop the ID in comments." as const;

export const ARTIST_SELF_TAG_COACHMARK_COPY =
  "Your track? Tag yourself in comments, then tap Mark ID." as const;

/** Settle after successful like before showing the coachmark. */
export const LIKE_HINT_SETTLE_MS = 350 as const;

/** Discover panel settle before coaching (comfortable beat after visible open). */
export const DISCOVER_HINT_SETTLE_MS = 520 as const;

/** Comments sheet settle before coaching (mid of 300–400ms). */
export const COMMENTS_HINT_SETTLE_MS = 350 as const;

/** Gap between Comments sheet top edge and coachmark (10–16px). */
export const COMMENTS_SHEET_COACHMARK_GAP_PX = 12 as const;

/** After Comments closes on an eligible artist post — settle before self-tag tip. */
export const ARTIST_SELF_TAG_HINT_SETTLE_MS = 380 as const;

/**
 * Minimum time a surface coachmark must be visible before closing the surface
 * counts as an intentional acknowledge (normal mode persist).
 */
export const CONTEXTUAL_HINT_MIN_VISIBLE_MS = 900 as const;

export const CONTEXTUAL_COACHMARK_MAX_WIDTH_PX = 240 as const;
export const CONTEXTUAL_COACHMARK_GAP_PX = 12 as const;
export const CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX = 10 as const;

/** Soft halo scale vs measured hit target (44×44 class). */
export const CONTEXTUAL_COACHMARK_HALO_SCALE = 1.38 as const;

export const CONTEXTUAL_COACHMARK_ENTRANCE_MS = 180 as const;

export type CoachmarkPlacement = "left" | "above" | "below";

export type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type CoachmarkPosition = {
  top: number;
  left: number;
  placement: CoachmarkPlacement;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Prefer `preferred` when it fits; otherwise fall back left → above → below.
 * Clamps into the viewport with safe margins.
 */
export function placeContextualCoachmark(input: {
  target: RectLike;
  cardWidth: number;
  cardHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
  preferred?: CoachmarkPlacement;
}): CoachmarkPosition {
  const gap = input.gap ?? CONTEXTUAL_COACHMARK_GAP_PX;
  const margin = input.margin ?? CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX;
  const preferred = input.preferred ?? "left";
  const { target, cardWidth, cardHeight, viewportWidth, viewportHeight } = input;

  const maxLeft = Math.max(margin, viewportWidth - margin - cardWidth);
  const maxTop = Math.max(margin, viewportHeight - margin - cardHeight);

  const tryLeft = (): CoachmarkPosition | null => {
    const leftCandidate = target.left - gap - cardWidth;
    if (leftCandidate < margin) return null;
    return {
      top: clamp(target.top + target.height / 2 - cardHeight / 2, margin, maxTop),
      left: leftCandidate,
      placement: "left",
    };
  };

  const tryAbove = (): CoachmarkPosition | null => {
    const aboveTop = target.top - gap - cardHeight;
    if (aboveTop < margin) return null;
    return {
      top: aboveTop,
      left: clamp(target.left + target.width / 2 - cardWidth / 2, margin, maxLeft),
      placement: "above",
    };
  };

  const tryBelow = (): CoachmarkPosition => ({
    top: clamp(target.bottom + gap, margin, maxTop),
    left: clamp(target.left + target.width / 2 - cardWidth / 2, margin, maxLeft),
    placement: "below",
  });

  const order: CoachmarkPlacement[] =
    preferred === "below"
      ? ["below", "left", "above"]
      : preferred === "above"
        ? ["above", "left", "below"]
        : ["left", "above", "below"];

  for (const placement of order) {
    if (placement === "left") {
      const hit = tryLeft();
      if (hit) return hit;
    } else if (placement === "above") {
      const hit = tryAbove();
      if (hit) return hit;
    } else {
      return tryBelow();
    }
  }
  return tryBelow();
}

/**
 * HINTS-PREMIUM-4B — Comments tip sits centered just above the measured sheet.
 * If there is not enough room above, clamps downward into the viewport margin
 * (may lightly kiss the sheet top) rather than flipping left or into the composer.
 */
export function placeCommentsSheetCoachmark(input: {
  sheet: RectLike;
  cardWidth: number;
  cardHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
}): CoachmarkPosition {
  const gap = input.gap ?? COMMENTS_SHEET_COACHMARK_GAP_PX;
  const margin = input.margin ?? CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX;
  const { sheet, cardWidth, cardHeight, viewportWidth, viewportHeight } = input;

  const maxLeft = Math.max(margin, viewportWidth - margin - cardWidth);
  const maxTop = Math.max(margin, viewportHeight - margin - cardHeight);

  const idealTop = sheet.top - gap - cardHeight;
  const top = clamp(idealTop, margin, maxTop);
  const left = clamp(sheet.left + sheet.width / 2 - cardWidth / 2, margin, maxLeft);

  return { top, left, placement: "above" };
}

/** True when a measured hit target is still usable for anchoring. */
export function isCoachmarkTargetRectUsable(rect: RectLike | null | undefined): boolean {
  if (!rect) return false;
  return rect.width >= 1 && rect.height >= 1;
}

/**
 * Home contextual tips: only one active at a time (in-memory mutex).
 * Includes Like / Discover / Comments / Artist self-tag.
 */
export function canShowHomeContextualCoachmark(activeHomeHintType: string | null | undefined): boolean {
  return activeHomeHintType == null;
}

/**
 * HINTS-PREMIUM-3C — outside-dismiss must survive coachmark unmount.
 *
 * Video play/pause listens to `pointerup` on the stage (and `click` when
 * double-tap-like is off). Dismissing on `pointerdown` removes the open
 * coachmark listeners before `pointerup`/`click` fire, so those events still
 * reach the video unless we arm a short-lived capture suppress that outlives
 * the coachmark.
 */
const COACHMARK_GESTURE_SUPPRESS_MS = 750 as const;

type ArmedGestureSuppress = {
  pointerId: number;
  until: number;
  cleanup: () => void;
};

let armedGestureSuppress: ArmedGestureSuppress | null = null;

function consumeEvent(event: Event): void {
  if (typeof event.preventDefault === "function") {
    try {
      event.preventDefault();
    } catch {
      /* ignore non-cancelable */
    }
  }
  event.stopPropagation();
}

/** @internal test/reset helper */
export function resetContextualCoachmarkGestureSuppressForTests(): void {
  armedGestureSuppress?.cleanup();
  armedGestureSuppress = null;
}

/** True while a post-dismiss outside-tap suppress window is armed. */
export function isContextualCoachmarkGestureSuppressArmed(): boolean {
  return armedGestureSuppress != null && Date.now() < armedGestureSuppress.until;
}

/**
 * Arm capture-phase consume for the rest of this pointer gesture (and the
 * synthetic click). Safe to call immediately before unmounting the coachmark.
 */
export function armContextualCoachmarkGestureSuppress(pointerId: number): void {
  if (typeof document === "undefined") return;
  armedGestureSuppress?.cleanup();

  const until = Date.now() + COACHMARK_GESTURE_SUPPRESS_MS;
  let cleaned = false;

  const matchesPointer = (event: Event): boolean => {
    if (!("pointerId" in event)) return true;
    const id = (event as PointerEvent).pointerId;
    return id === pointerId || id === -1;
  };

  const onPointerUp = (event: Event) => {
    if (Date.now() >= until) {
      cleanup();
      return;
    }
    if (!matchesPointer(event)) return;
    consumeEvent(event);
    // Keep click suppress briefly; click follows pointerup.
  };

  const onClick = (event: Event) => {
    if (Date.now() >= until) {
      cleanup();
      return;
    }
    consumeEvent(event);
    cleanup();
  };

  const onTouchEnd = (event: Event) => {
    if (Date.now() >= until) {
      cleanup();
      return;
    }
    consumeEvent(event);
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerUp, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("touchend", onTouchEnd, true);
    if (armedGestureSuppress?.cleanup === cleanup) {
      armedGestureSuppress = null;
    }
  };

  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("touchend", onTouchEnd, true);

  armedGestureSuppress = { pointerId, until, cleanup };
  const timerHost = typeof globalThis.setTimeout === "function" ? globalThis : null;
  timerHost?.setTimeout(() => {
    if (armedGestureSuppress?.cleanup === cleanup) cleanup();
  }, COACHMARK_GESTURE_SUPPRESS_MS);
}
