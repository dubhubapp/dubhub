import { useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useEdgeSwipeBack } from "@/hooks/use-edge-swipe-back";

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
  useEdgeSwipeBack({ enabled, onBack, containerRef });

  return (
    <div ref={containerRef} className={cn("relative", className)} style={style} {...domAttrs}>
      {children}
    </div>
  );
}
