/**
 * HINTS-PREMIUM-2 — anchored soft-halo coachmark (Like → Releases first).
 * Minimal API; no step sequences / third-party coachmark libs.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  COMMENTS_SHEET_COACHMARK_GAP_PX,
  CONTEXTUAL_COACHMARK_ENTRANCE_MS,
  CONTEXTUAL_COACHMARK_GAP_PX,
  CONTEXTUAL_COACHMARK_HALO_SCALE,
  CONTEXTUAL_COACHMARK_MAX_WIDTH_PX,
  CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX,
  armContextualCoachmarkGestureSuppress,
  isCoachmarkTargetRectUsable,
  placeCommentsSheetCoachmark,
  placeContextualCoachmark,
  type CoachmarkPlacement,
  type RectLike,
} from "@/lib/contextual-coachmark";
import { APP_MATERIAL_INTERACTIVE_BLUE } from "@/lib/app-material";

export type ContextualCoachmarkProps = {
  open: boolean;
  /** Live hit-target element (e.g. Like 44×44 wrap). Remeasured while open. */
  targetEl: HTMLElement | null;
  copy: string;
  onDismiss: () => void;
  /** Called when the target is gone/unusable — must NOT persist seen. */
  onTargetLost?: () => void;
  showHalo?: boolean;
  preferredPlacement?: CoachmarkPlacement;
  /**
   * When true (default), interacting with the target also dismisses (Like).
   * When false, target stays interactive without dismissing (Comments sheet).
   */
  dismissOnTargetInteract?: boolean;
  /**
   * Taps here neither dismiss nor get consumed (optional exempt control).
   */
  interactionExemptEl?: HTMLElement | null;
  /** Portal host. Defaults to document.body. */
  portalRoot?: HTMLElement | null;
  /**
   * `fixed` = viewport coords (feed tips / Comments above-sheet).
   * `absolute` = coords relative to `portalRoot`.
   * `flow` = in-document inside `portalRoot` (unused by Comments after 4B).
   */
  positionMode?: "fixed" | "absolute" | "flow";
  /**
   * `default` — generic left/above/below placement.
   * `comments-sheet-above` — centered just above measured Comments sheet.
   */
  placementVariant?: "default" | "comments-sheet-above";
  /** Stacking above elevated Comments drawer (z-110). Default 62. */
  stackZIndex?: number;
  testId?: string;
  className?: string;
};

function readTargetRect(el: HTMLElement | null): RectLike | null {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    right: r.right,
    bottom: r.bottom,
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function nodeInside(el: HTMLElement | null | undefined, node: Node | null): boolean {
  return !!el && !!node && (el === node || el.contains(node));
}

/** Compact glass card — C2-adjacent; no turquoise tutorial eyebrow chrome. */
export const CONTEXTUAL_COACHMARK_CARD_CLASS =
  "pointer-events-auto max-w-[15rem] rounded-[18px] border border-white/10 bg-[rgba(20,26,48,0.92)] px-3.5 py-3 text-left text-[13px] leading-snug text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-[rgba(20,26,48,0.82)]" as const;

export function ContextualCoachmark({
  open,
  targetEl,
  copy,
  onDismiss,
  onTargetLost,
  showHalo = true,
  preferredPlacement = "left",
  dismissOnTargetInteract = true,
  interactionExemptEl = null,
  portalRoot = null,
  positionMode = "fixed",
  placementVariant = "default",
  stackZIndex = 62,
  testId = "contextual-coachmark",
  className,
}: ContextualCoachmarkProps) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const [targetRect, setTargetRect] = useState<RectLike | null>(null);
  const [cardSize, setCardSize] = useState({ width: CONTEXTUAL_COACHMARK_MAX_WIDTH_PX, height: 72 });
  const [position, setPosition] = useState<{ top: number; left: number; placement: CoachmarkPlacement } | null>(
    null,
  );
  const [entered, setEntered] = useState(() => prefersReducedMotion());
  const reducedMotion = prefersReducedMotion();
  const onTargetLostRef = useRef(onTargetLost);
  onTargetLostRef.current = onTargetLost;

  const remeasure = useCallback(() => {
    if (positionMode === "flow") {
      // Flow tips live inside a dedicated sheet slot; keep open without geometry math.
      if (!targetEl || !targetEl.isConnected) {
        setTargetRect(null);
        onTargetLostRef.current?.();
        return;
      }
      const r = targetEl.getBoundingClientRect();
      setTargetRect({
        left: r.left,
        top: r.top,
        width: Math.max(r.width, 1),
        height: Math.max(r.height, 1),
        right: r.right,
        bottom: r.bottom,
      });
      return;
    }
    const rect = readTargetRect(targetEl);
    if (!isCoachmarkTargetRectUsable(rect)) {
      setTargetRect(null);
      onTargetLostRef.current?.();
      return;
    }
    setTargetRect(rect);
  }, [targetEl, positionMode]);

  useLayoutEffect(() => {
    if (!open) {
      setTargetRect(null);
      setPosition(null);
      setEntered(reducedMotion);
      return;
    }
    remeasure();
  }, [open, remeasure, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => remeasure();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, remeasure]);

  useLayoutEffect(() => {
    if (!open || !targetRect || !cardRef.current) return;
    if (positionMode === "flow") {
      setPosition({ top: 0, left: 0, placement: preferredPlacement });
      return;
    }
    const card = cardRef.current.getBoundingClientRect();
    const width = Math.min(CONTEXTUAL_COACHMARK_MAX_WIDTH_PX, Math.max(card.width, 1));
    const height = Math.max(card.height, 1);
    setCardSize({ width, height });

    const host = portalRoot && positionMode === "absolute" ? portalRoot : null;
    const hostRect = host?.getBoundingClientRect() ?? null;
    const localTarget: RectLike = hostRect
      ? {
          left: targetRect.left - hostRect.left,
          top: targetRect.top - hostRect.top,
          width: targetRect.width,
          height: targetRect.height,
          right: targetRect.right - hostRect.left,
          bottom: targetRect.bottom - hostRect.top,
        }
      : targetRect;

    const placed =
      placementVariant === "comments-sheet-above"
        ? placeCommentsSheetCoachmark({
            sheet: localTarget,
            cardWidth: width,
            cardHeight: height,
            viewportWidth: hostRect?.width ?? window.innerWidth,
            viewportHeight: hostRect?.height ?? window.innerHeight,
            gap: COMMENTS_SHEET_COACHMARK_GAP_PX,
            margin: CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX,
          })
        : placeContextualCoachmark({
            target: localTarget,
            cardWidth: width,
            cardHeight: height,
            viewportWidth: hostRect?.width ?? window.innerWidth,
            viewportHeight: hostRect?.height ?? window.innerHeight,
            gap: CONTEXTUAL_COACHMARK_GAP_PX,
            margin: CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX,
            preferred: preferredPlacement,
          });
    setPosition(placed);
  }, [open, targetRect, preferredPlacement, copy, portalRoot, positionMode, placementVariant]);

  useEffect(() => {
    if (!open || reducedMotion) {
      setEntered(true);
      return;
    }
    setEntered(false);
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [open, reducedMotion, targetEl]);

  useEffect(() => {
    if (!open) return;

    const consume = (event: Event) => {
      if (typeof (event as { preventDefault?: () => void }).preventDefault === "function") {
        try {
          event.preventDefault();
        } catch {
          /* ignore */
        }
      }
      event.stopPropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null;
      const card = cardRef.current;
      if (card && node && card.contains(node)) {
        // Arm gesture suppress so residual pointerup/click cannot hit video after dismiss.
        armContextualCoachmarkGestureSuppress(event.pointerId);
        consume(event);
        onDismiss();
        return;
      }
      if (nodeInside(interactionExemptEl, node)) {
        // Exempt control (e.g. composer): keep focus; do not dismiss.
        return;
      }
      const onAllowedTarget = nodeInside(targetEl, node);
      if (onAllowedTarget) {
        if (!dismissOnTargetInteract) {
          return;
        }
        // Like heart: dismiss without consuming the control's own tap.
        onDismiss();
        return;
      }
      // Outside: dismiss and arm post-unmount suppress so the same gesture's
      // pointerup/click cannot pause video / hit nav (HOME uses pointerup).
      armContextualCoachmarkGestureSuppress(event.pointerId);
      consume(event);
      onDismiss();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onDismiss, dismissOnTargetInteract, targetEl, interactionExemptEl]);

  const mountNode =
    portalRoot && portalRoot.isConnected
      ? portalRoot
      : typeof document !== "undefined"
        ? document.body
        : null;

  if (!open || !targetRect || !mountNode) return null;

  const isFlow = positionMode === "flow";
  const hostRect =
    positionMode === "absolute" && portalRoot ? portalRoot.getBoundingClientRect() : null;

  const haloSize = Math.max(targetRect.width, targetRect.height) * CONTEXTUAL_COACHMARK_HALO_SCALE;
  const haloStyle: CSSProperties = {
    position: positionMode === "absolute" ? "absolute" : "fixed",
    left: hostRect
      ? targetRect.left - hostRect.left + targetRect.width / 2
      : targetRect.left + targetRect.width / 2,
    top: hostRect
      ? targetRect.top - hostRect.top + targetRect.height / 2
      : targetRect.top + targetRect.height / 2,
    width: haloSize,
    height: haloSize,
    transform: entered
      ? "translate(-50%, -50%) scale(1)"
      : "translate(-50%, -50%) scale(0.96)",
    opacity: entered ? 1 : 0,
    transition: reducedMotion
      ? undefined
      : `opacity ${CONTEXTUAL_COACHMARK_ENTRANCE_MS}ms ease-out, transform ${CONTEXTUAL_COACHMARK_ENTRANCE_MS}ms ease-out`,
    borderRadius: "9999px",
    pointerEvents: "none",
    // Soft diffuse glow — no 1px ring.
    background: `radial-gradient(circle, ${APP_MATERIAL_INTERACTIVE_BLUE}33 0%, ${APP_MATERIAL_INTERACTIVE_BLUE}18 42%, transparent 72%)`,
    boxShadow: `0 0 28px 10px ${APP_MATERIAL_INTERACTIVE_BLUE}24`,
    zIndex: stackZIndex - 1,
  };

  const cardTop = position?.top ?? (hostRect ? targetRect.top - hostRect.top : targetRect.top);
  const cardLeft =
    position?.left ??
    Math.max(
      CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX,
      (hostRect ? targetRect.left - hostRect.left : targetRect.left) -
        CONTEXTUAL_COACHMARK_GAP_PX -
        cardSize.width,
    );

  const cardStyle: CSSProperties = isFlow
    ? {
        position: "relative",
        width: "100%",
        maxWidth: CONTEXTUAL_COACHMARK_MAX_WIDTH_PX,
        marginLeft: "auto",
        marginRight: "auto",
        marginBottom: 4,
        zIndex: 5,
        opacity: entered ? 1 : 0,
        transform: entered ? "scale(1)" : "scale(0.96)",
        transition: reducedMotion
          ? undefined
          : `opacity ${CONTEXTUAL_COACHMARK_ENTRANCE_MS}ms ease-out, transform ${CONTEXTUAL_COACHMARK_ENTRANCE_MS}ms ease-out`,
      }
    : {
        position: positionMode === "absolute" ? "absolute" : "fixed",
        top: cardTop,
        left: cardLeft,
        width: CONTEXTUAL_COACHMARK_MAX_WIDTH_PX,
        maxWidth: `min(${CONTEXTUAL_COACHMARK_MAX_WIDTH_PX}px, calc(100% - ${CONTEXTUAL_COACHMARK_VIEWPORT_MARGIN_PX * 2}px))`,
        zIndex: stackZIndex,
        opacity: entered ? 1 : 0,
        transform: entered ? "scale(1)" : "scale(0.96)",
        transition: reducedMotion
          ? undefined
          : `opacity ${CONTEXTUAL_COACHMARK_ENTRANCE_MS}ms ease-out, transform ${CONTEXTUAL_COACHMARK_ENTRANCE_MS}ms ease-out`,
      };

  return createPortal(
    <>
      {showHalo && !isFlow ? (
        <div
          aria-hidden
          data-testid={`${testId}-halo`}
          data-contextual-coachmark-halo=""
          style={haloStyle}
        />
      ) : null}
      <button
        ref={cardRef}
        type="button"
        role="status"
        aria-live="polite"
        aria-label={`${copy}. Dismiss tip.`}
        data-testid={testId}
        data-contextual-coachmark-card=""
        data-placement={isFlow ? "flow" : position?.placement ?? preferredPlacement}
        data-position-mode={positionMode}
        className={cn(CONTEXTUAL_COACHMARK_CARD_CLASS, className)}
        style={cardStyle}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
      >
        <span className="sr-only">Dismiss tip</span>
        {copy}
      </button>
    </>,
    mountNode,
  );
}
