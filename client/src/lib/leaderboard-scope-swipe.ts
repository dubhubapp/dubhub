/**
 * Community ↔ Artists scope swipe — pure decision helpers + content-region gesture hook.
 * No carousel, no dual-list mount, no finger-follow (threshold/velocity commit only).
 */

import { useEffect, useRef, type RefObject } from "react";
import type { LeaderboardScope } from "@/lib/leaderboard-presentation";

/** Align with `use-edge-swipe-back` left-edge reserve. */
export const LEADERBOARD_SCOPE_EDGE_START_PX = 24;
/** Minimum horizontal travel before a gesture can arm as horizontal. */
export const LEADERBOARD_SCOPE_DRAG_START_PX = 12;
/** Commit when |dx| / viewportWidth >= this (restrained vs full-page back swipe). */
export const LEADERBOARD_SCOPE_COMMIT_PROGRESS = 0.28;
/** Flick commit threshold — same order as edge-swipe back. */
export const LEADERBOARD_SCOPE_FAST_SWIPE_PX_PER_MS = 0.75;
/** abs(dx) must exceed abs(dy) * ratio for horizontal intent. */
export const LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO = 1.2;
/** Early vertical cancel when vertical drift wins before horizontal arm. */
export const LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX = 14;

const INTERACTIVE_SELECTOR =
  "input, textarea, select, button, a, [contenteditable], [role='button'], [role='tab']";

export function isLeaderboardScopeSwipeInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(INTERACTIVE_SELECTOR);
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

export type LeaderboardScopeSwipeDecision =
  | {
      action: "noop";
      reason: "boundary" | "vertical" | "insufficient" | "zero";
      nextScope: null;
    }
  | {
      action: "commit";
      reason: "distance" | "velocity";
      nextScope: LeaderboardScope;
    };

export function evaluateLeaderboardScopeSwipe(input: {
  currentScope: LeaderboardScope;
  deltaX: number;
  deltaY: number;
  /** Signed px/ms (positive = rightward). */
  velocityX: number;
  viewportWidth: number;
}): LeaderboardScopeSwipeDecision {
  const { currentScope, deltaX, deltaY, velocityX } = input;
  const viewportWidth = Math.max(1, input.viewportWidth);
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX === 0 && absY === 0) {
    return { action: "noop", reason: "zero", nextScope: null };
  }

  // Vertical-dominant: never switch scope.
  if (absY > LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
    return { action: "noop", reason: "vertical", nextScope: null };
  }
  if (absX < LEADERBOARD_SCOPE_DRAG_START_PX) {
    return { action: "noop", reason: "insufficient", nextScope: null };
  }
  if (absX <= absY * LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO) {
    return { action: "noop", reason: "vertical", nextScope: null };
  }

  const nextScope = resolveLeaderboardScopeFromDelta(currentScope, deltaX);
  if (!nextScope) {
    return { action: "noop", reason: "boundary", nextScope: null };
  }

  const progress = absX / viewportWidth;
  if (progress >= LEADERBOARD_SCOPE_COMMIT_PROGRESS) {
    return { action: "commit", reason: "distance", nextScope };
  }

  const velocityMatchesDirection =
    (deltaX < 0 && velocityX <= -LEADERBOARD_SCOPE_FAST_SWIPE_PX_PER_MS) ||
    (deltaX > 0 && velocityX >= LEADERBOARD_SCOPE_FAST_SWIPE_PX_PER_MS);
  if (velocityMatchesDirection) {
    return { action: "commit", reason: "velocity", nextScope };
  }

  return { action: "noop", reason: "insufficient", nextScope: null };
}

type GestureState = {
  active: boolean;
  armed: boolean;
  cancelled: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTs: number;
  velocityX: number;
};

function createIdleGesture(): GestureState {
  return {
    active: false,
    armed: false,
    cancelled: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTs: 0,
    velocityX: 0,
  };
}

type UseLeaderboardScopeSwipeOptions = {
  enabled?: boolean;
  scopeRef: RefObject<LeaderboardScope>;
  containerRef: RefObject<HTMLElement | null>;
  onCommitScope: (next: LeaderboardScope) => void;
};

/**
 * Axis-locked touch gesture on the Leaderboard content region.
 * Commits on release only; does not preventDefault until horizontal intent is confirmed.
 */
export function useLeaderboardScopeSwipe({
  enabled = true,
  scopeRef,
  containerRef,
  onCommitScope,
}: UseLeaderboardScopeSwipeOptions): void {
  const onCommitRef = useRef(onCommitScope);
  onCommitRef.current = onCommitScope;
  const gestureRef = useRef<GestureState>(createIdleGesture());

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || typeof window === "undefined") return;

    const reset = () => {
      gestureRef.current = createIdleGesture();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      if (isLeaderboardScopeSwipeInteractiveTarget(event.target)) {
        reset();
        return;
      }
      const touch = event.touches[0];
      if (touch.clientX <= LEADERBOARD_SCOPE_EDGE_START_PX) {
        reset();
        return;
      }
      const now = performance.now();
      gestureRef.current = {
        active: true,
        armed: false,
        cancelled: false,
        pointerId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        lastTs: now,
        velocityX: 0,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const state = gestureRef.current;
      if (!state.active || state.cancelled) return;
      const touch = Array.from(event.touches).find((t) => t.identifier === state.pointerId);
      if (!touch) return;

      const now = performance.now();
      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const dt = Math.max(1, now - state.lastTs);
      state.velocityX = (touch.clientX - state.lastX) / dt;
      state.lastX = touch.clientX;
      state.lastY = touch.clientY;
      state.lastTs = now;

      if (!state.armed) {
        if (absY > LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX && absY > absX) {
          state.cancelled = true;
          state.active = false;
          return;
        }
        if (
          absX >= LEADERBOARD_SCOPE_DRAG_START_PX &&
          absX > absY * LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO
        ) {
          state.armed = true;
        } else {
          return;
        }
      }

      // Claim the gesture only after horizontal intent is established.
      if (state.armed) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      const state = gestureRef.current;
      if (!state.active || state.cancelled || !state.armed) {
        reset();
        return;
      }
      const decision = evaluateLeaderboardScopeSwipe({
        currentScope: scopeRef.current,
        deltaX: state.lastX - state.startX,
        deltaY: state.lastY - state.startY,
        velocityX: state.velocityX,
        viewportWidth: window.innerWidth,
      });
      reset();
      if (decision.action === "commit") {
        onCommitRef.current(decision.nextScope);
      }
    };

    const onTouchCancel = () => {
      reset();
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchCancel);
      reset();
    };
  }, [enabled, containerRef, scopeRef]);
}
