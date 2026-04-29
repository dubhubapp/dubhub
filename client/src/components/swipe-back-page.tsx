import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useEdgeSwipeBack } from "@/hooks/use-edge-swipe-back";

type SwipeBackPageProps = {
  enabled?: boolean;
  onBack: () => void;
  className?: string;
  children: React.ReactNode;
};

export function SwipeBackPage({ enabled = true, onBack, className, children }: SwipeBackPageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEdgeSwipeBack({ enabled, onBack, containerRef });

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {children}
    </div>
  );
}
