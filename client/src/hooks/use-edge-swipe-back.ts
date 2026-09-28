import { useEffect, useRef, type RefObject } from "react";
import {
  INTERACTIVE_CANCEL_MS,
  INTERACTIVE_COMMIT_FALLBACK_MS,
  INTERACTIVE_PAGE_EASING,
  INTERACTIVE_POP_MS,
  evaluateInteractiveRelease,
  interactiveMotionMs,
  interactivePageTransitionsEnabled,
  isWithinBackEdge,
  prefersReducedPageMotion,
  pushVelocitySample,
  releaseWindowVelocity,
  shouldArmHorizontalDrag,
  shouldCancelBeforeArm,
  type InteractiveSwipeGesture,
  type VelocitySample,
} from "@/lib/interactive-page-transitions";
import {
  armProfilePopWatch,
  immediateUnderlayPath,
  logProfilePopSample,
  noteEdgeSwipePreventDefault,
  registerEdgeSwipeListener,
  setDebugSettle,
  setDebugSettleTimer,
  unregisterEdgeSwipeListener,
} from "@/lib/interactive-transition-debug";

type UseEdgeSwipeBackOptions = {
  enabled: boolean;
  onBack: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Settings stack foreground. Flag-off callers omit this and keep the legacy gesture. */
  interactive?: boolean;
  interactiveGestureRef?: RefObject<InteractiveSwipeGesture | null>;
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

export function useEdgeSwipeBack({
  enabled,
  onBack,
  containerRef,
  interactive = false,
  interactiveGestureRef,
}: UseEdgeSwipeBackOptions): void {
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
    completed: false,
  });

  onBackRef.current = onBack;

  /* LEGACY_SWIPE_START */
  useEffect(() => {
    if (interactive) return;
    const container = containerRef.current;
    if (!enabled || !container || typeof window === "undefined") return;
    const debugOn = interactivePageTransitionsEnabled();
    const debugOwner =
      container.closest("[data-settings-path]")?.getAttribute("data-settings-path") || "unscoped";
    const listenerIds: number[] = [];

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

      if (state.dragging) {
        event.preventDefault();
        if (debugOn) noteEdgeSwipePreventDefault("legacy", debugOwner);
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
    if (debugOn) {
      listenerIds.push(
        registerEdgeSwipeListener("touchstart", "legacy", debugOwner),
        registerEdgeSwipeListener("touchmove", "legacy", debugOwner),
        registerEdgeSwipeListener("touchend", "legacy", debugOwner),
        registerEdgeSwipeListener("touchcancel", "legacy", debugOwner),
      );
    }

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      for (const id of listenerIds) unregisterEdgeSwipeListener(id);
      clearSwipeStyles(container);
    };
  }, [enabled, containerRef, interactive]);
  /* LEGACY_SWIPE_END */

  /* INTERACTIVE_SWIPE_START */
  useEffect(() => {
    if (!interactive || !enabled || typeof window === "undefined") return;
    const gesture = interactiveGestureRef?.current;
    if (!gesture) return;
    const debugOn = interactivePageTransitionsEnabled();
    const listenerIds: number[] = [];

    const surface = () => gesture.layerRef.current ?? containerRef.current;
    const debugOwner = () =>
      surface()?.closest("[data-settings-path]")?.getAttribute("data-settings-path") || "unscoped";

    let samples: VelocitySample[] = [];
    let tracking = false;
    let dragging = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let disposed = false;
    let settleTimer = 0;
    let settled = false;

    const clearSurface = () => {
      const el = surface();
      if (!el) return;
      el.style.transition = "";
      el.style.transform = "";
    };

    const endSettle = () => {
      if (disposed) return;
      window.clearTimeout(settleTimer);
      if (debugOn) setDebugSettleTimer(0);
      const kind = gesture.getController().completeSettle();
      if (kind !== "commit") {
        gesture.interactionRef.current = false;
        if (debugOn) setDebugSettle(null);
        return;
      }
      if (debugOn) logProfilePopSample("history-onBack");
      gesture.finishCommit();
    };

    const finishOnce = (via: "transitionend" | "fallback-timeout") => {
      if (settled || disposed) return;
      settled = true;
      if (debugOn) logProfilePopSample(via);
      endSettle();
    };

    const animateSurface = (to: string, ms: number, progress: number) => {
      const el = surface();
      if (!el || ms === 0) {
        if (el) {
          el.style.transition = "none";
          el.style.transform = to === "100%" ? "" : "translate3d(0,0,0)";
        }
        gesture.onProgress(progress, false, 0);
        if (debugOn) logProfilePopSample("transition-start");
        endSettle();
        return;
      }
      const onEnd = (event: TransitionEvent) => {
        if (event.target !== el || event.propertyName !== "transform") return;
        el.removeEventListener("transitionend", onEnd);
        finishOnce("transitionend");
      };
      el.addEventListener("transitionend", onEnd);
      settleTimer = window.setTimeout(() => {
        el.removeEventListener("transitionend", onEnd);
        finishOnce("fallback-timeout");
      }, INTERACTIVE_COMMIT_FALLBACK_MS);
      if (debugOn) setDebugSettleTimer(settleTimer);
      if (debugOn) logProfilePopSample("transition-start");
      el.style.transition = `transform ${ms}ms ${INTERACTIVE_PAGE_EASING}`;
      el.style.transform = `translate3d(${to},0,0)`;
      gesture.onProgress(progress, true, ms);
    };

    const runSettle = (kind: "commit" | "cancel", source: "drag" | "button") => {
      const controller = gesture.getController();
      if (!controller.beginSettle(kind, source)) return;
      gesture.interactionRef.current = true;
      if (debugOn) {
        setDebugSettle({ kind, source });
        if (kind === "commit" && immediateUnderlayPath() === "/profile") {
          armProfilePopWatch();
          logProfilePopSample(source === "drag" ? "finger-release" : "button-pop");
        }
      }
      const reduced = prefersReducedPageMotion();
      const ms = interactiveMotionMs(reduced, kind === "commit" ? "pop" : "cancel");
      if (kind === "commit") animateSurface("100%", ms === 0 ? 0 : INTERACTIVE_POP_MS, 1);
      else animateSurface("0px", ms === 0 ? 0 : INTERACTIVE_CANCEL_MS, 0);
    };

    gesture.popDriverRef.current = () => {
      if (disposed) return;
      runSettle("commit", "button");
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        tracking = false;
        dragging = false;
        return;
      }
      if (!gesture.getController().canArm()) return;
      if (isOverlayOpen() || isInteractiveTarget(event.target)) {
        tracking = false;
        return;
      }
      const touch = event.touches[0];
      if (!isWithinBackEdge(touch.clientX)) {
        tracking = false;
        return;
      }
      tracking = true;
      dragging = false;
      pointerId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = touch.clientX;
      samples = [{ x: touch.clientX, t: performance.now() }];
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      if (!dragging && !gesture.getController().canArm()) return;
      const touch = Array.from(event.touches).find((item) => item.identifier === pointerId);
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const now = performance.now();
      samples = pushVelocitySample(samples, touch.clientX, now);
      lastX = touch.clientX;

      if (!dragging) {
        if (shouldCancelBeforeArm(dx, dy)) {
          tracking = false;
          clearSurface();
          return;
        }
        if (!shouldArmHorizontalDrag(dx, dy)) return;
        if (!gesture.getController().beginDrag()) {
          tracking = false;
          return;
        }
        dragging = true;
        gesture.interactionRef.current = true;
      }

      const width = window.innerWidth || 1;
      const clamped = Math.max(0, Math.min(width, dx));
      const el = surface();
      if (el) {
        el.style.transition = "none";
        el.style.transform = `translate3d(${clamped}px,0,0)`;
      }
      gesture.onProgress(clamped / width, false, 0);
      event.preventDefault();
      if (debugOn) noteEdgeSwipePreventDefault("interactive", debugOwner());
    };

    const finishDrag = (kind: "commit" | "cancel") => {
      tracking = false;
      dragging = false;
      runSettle(kind, "drag");
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      if (!dragging) {
        tracking = false;
        return;
      }
      const distancePx = Math.max(0, lastX - startX);
      const velocity = releaseWindowVelocity(samples);
      const decision = evaluateInteractiveRelease({
        distancePx,
        widthPx: window.innerWidth || 1,
        velocityPxPerMs: velocity,
      });
      finishDrag(decision);
    };

    const onTouchCancel = () => {
      if (!dragging) {
        tracking = false;
        return;
      }
      finishDrag("cancel");
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    if (debugOn) {
      const owner = debugOwner();
      listenerIds.push(
        registerEdgeSwipeListener("touchstart", "interactive", owner),
        registerEdgeSwipeListener("touchmove", "interactive", owner),
        registerEdgeSwipeListener("touchend", "interactive", owner),
        registerEdgeSwipeListener("touchcancel", "interactive", owner),
      );
    }

    return () => {
      disposed = true;
      window.clearTimeout(settleTimer);
      if (debugOn) {
        setDebugSettle(null);
        setDebugSettleTimer(0);
        for (const id of listenerIds) unregisterEdgeSwipeListener(id);
      }
      gesture.popDriverRef.current = null;
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [interactive, enabled, containerRef, interactiveGestureRef]);
  /* INTERACTIVE_SWIPE_END */
}
