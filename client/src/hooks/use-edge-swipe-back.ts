import { useEffect, useRef, type RefObject } from "react";
import { playInteractionLight, playSuccessNotification } from "@/lib/haptic";

type UseEdgeSwipeBackOptions = {
  enabled: boolean;
  onBack: () => void;
  containerRef: RefObject<HTMLElement | null>;
};

const EDGE_START_PX = 24;
const SWIPE_DRAG_START_PX = 12;
const COMPLETE_PROGRESS = 0.5;
const FAST_SWIPE_PX_PER_MS = 0.75;
const HORIZONTAL_INTENT_RATIO = 1.2;
const MAX_VERTICAL_DRIFT_PX = 14;
const INTERACTIVE_SELECTOR =
  "input, textarea, select, button, a, [contenteditable], [role='button']";
const OPEN_OVERLAY_SELECTOR =
  "[role='dialog'], [data-state='open'], [data-vaul-drawer], [data-radix-dialog-content]";

type GestureState = {
  active: boolean;
  startedFromEdge: boolean;
  dragging: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastTs: number;
  velocityX: number;
  thresholdHapticPlayed: boolean;
  completed: boolean;
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(INTERACTIVE_SELECTOR);
}

function isOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(OPEN_OVERLAY_SELECTOR) !== null;
}

function clearSwipeStyles(container: HTMLElement): void {
  container.style.transition = "";
  container.style.transform = "";
  container.style.boxShadow = "";
  container.style.willChange = "";
}

export function useEdgeSwipeBack({ enabled, onBack, containerRef }: UseEdgeSwipeBackOptions): void {
  const onBackRef = useRef(onBack);
  const gestureRef = useRef<GestureState>({
    active: false,
    startedFromEdge: false,
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTs: 0,
    velocityX: 0,
    thresholdHapticPlayed: false,
    completed: false,
  });

  onBackRef.current = onBack;

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || typeof window === "undefined") return;

    const resetGesture = () => {
      gestureRef.current = {
        active: false,
        startedFromEdge: false,
        dragging: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastTs: 0,
        velocityX: 0,
        thresholdHapticPlayed: false,
        completed: false,
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!enabled) return;
      if (event.touches.length !== 1) {
        resetGesture();
        return;
      }
      if (isOverlayOpen()) {
        resetGesture();
        return;
      }
      if (isInteractiveTarget(event.target)) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      const startedFromEdge = touch.clientX <= EDGE_START_PX;
      const now = performance.now();
      gestureRef.current = {
        active: true,
        startedFromEdge,
        dragging: false,
        pointerId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastTs: now,
        velocityX: 0,
        thresholdHapticPlayed: false,
        completed: false,
      };
    };

    const applyDragVisual = (distancePx: number) => {
      container.style.transition = "none";
      container.style.willChange = "transform, box-shadow";
      container.style.transform = `translate3d(${distancePx}px, 0, 0)`;
      const shadowAlpha = Math.min(0.28, distancePx / window.innerWidth / 2.2);
      container.style.boxShadow = `-14px 0 34px rgba(0,0,0,${shadowAlpha})`;
    };

    const animateBack = () => {
      container.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 240ms ease";
      container.style.transform = "translate3d(0,0,0)";
      container.style.boxShadow = "none";
      const onEnd = () => {
        clearSwipeStyles(container);
      };
      container.addEventListener("transitionend", onEnd, { once: true });
    };

    const animateComplete = () => {
      container.style.transition = "transform 210ms cubic-bezier(0.2, 0.95, 0.25, 1), box-shadow 210ms ease";
      container.style.transform = "translate3d(100%,0,0)";
      container.style.boxShadow = "none";
      const onEnd = () => {
        playSuccessNotification();
        onBackRef.current();
      };
      container.addEventListener("transitionend", onEnd, { once: true });
    };

    const onTouchMove = (event: TouchEvent) => {
      const state = gestureRef.current;
      if (!state.active || !state.startedFromEdge || state.completed) return;
      const touch = Array.from(event.touches).find((t) => t.identifier === state.pointerId);
      if (!touch) return;

      const now = performance.now();
      const deltaXRaw = touch.clientX - state.startX;
      const deltaX = Math.max(0, deltaXRaw);
      const deltaY = touch.clientY - state.startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      const hasHorizontalIntent = absDeltaX > absDeltaY * HORIZONTAL_INTENT_RATIO;
      const isRightSwipe = deltaXRaw > 0;
      const dt = Math.max(1, now - state.lastTs);
      state.velocityX = (touch.clientX - state.lastX) / dt;
      state.lastX = touch.clientX;
      state.lastTs = now;

      if (!state.dragging) {
        if (absDeltaY > MAX_VERTICAL_DRIFT_PX && absDeltaY > absDeltaX) {
          resetGesture();
          clearSwipeStyles(container);
          return;
        }
        if (hasHorizontalIntent && isRightSwipe && absDeltaX >= SWIPE_DRAG_START_PX) {
          state.dragging = true;
        } else {
          return;
        }
      }

      if (!hasHorizontalIntent && absDeltaX > SWIPE_DRAG_START_PX) return;

      const clampedX = Math.min(window.innerWidth, deltaX);
      const progress = clampedX / window.innerWidth;
      if (progress >= COMPLETE_PROGRESS && !state.thresholdHapticPlayed) {
        state.thresholdHapticPlayed = true;
        playInteractionLight();
      }
      if (progress < COMPLETE_PROGRESS) {
        state.thresholdHapticPlayed = false;
      }

      if (state.dragging) {
        event.preventDefault();
        applyDragVisual(clampedX);
      }
    };

    const onTouchEnd = () => {
      const state = gestureRef.current;
      if (!state.dragging) {
        resetGesture();
        clearSwipeStyles(container);
        return;
      }
      const distancePx = Math.max(0, state.lastX - state.startX);
      const progress = distancePx / window.innerWidth;
      const shouldComplete =
        progress >= COMPLETE_PROGRESS || state.velocityX >= FAST_SWIPE_PX_PER_MS;
      if (shouldComplete) {
        state.completed = true;
        animateComplete();
      } else {
        animateBack();
      }
      resetGesture();
    };

    const onTouchCancel = () => {
      animateBack();
      resetGesture();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      clearSwipeStyles(container);
    };
  }, [enabled, containerRef]);
}
