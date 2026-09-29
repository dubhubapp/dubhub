import { useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useEdgeSwipeBack } from "@/hooks/use-edge-swipe-back";
import { useSettingsTransitionContext } from "@/lib/settings-transition-context";
import type { InteractiveSwipeGesture } from "@/lib/interactive-page-transitions";

type SwipeBackPageProps = {
  enabled?: boolean;
  onBack: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Optional DOM attrs for route-scoped material (e.g. atmosphere ready). */
  "data-atmosphere-ready"?: string;
  "data-atmosphere-instant"?: string;
  "data-release-atmosphere"?: string;
  "data-testid"?: string;
};

export function SwipeBackPage({
  enabled = true,
  onBack,
  className,
  style,
  children,
  ...domAttrs
}: SwipeBackPageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transition = useSettingsTransitionContext();
  const role = transition?.role ?? "solo";
  const interactive = role === "foreground" || transition?.staticPop === true;
  const gestureRef = useRef<InteractiveSwipeGesture | null>(transition?.gesture ?? null);
  gestureRef.current = transition?.gesture ?? null;
  useEdgeSwipeBack({
    enabled: enabled && role !== "underlay" && role !== "retained",
    onBack,
    containerRef,
    interactive,
    interactiveGestureRef: gestureRef,
  });

  return (
    <div ref={containerRef} className={cn("relative", className)} style={style} {...domAttrs}>
      {children}
    </div>
  );
}
