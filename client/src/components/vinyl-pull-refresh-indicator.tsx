import { Disc3 } from "lucide-react";

import type { PullToRefreshPhase } from "@/hooks/use-pull-to-refresh";
import { cn } from "@/lib/utils";

export type VinylPullRefreshIndicatorProps = {
  /** Rubber-banded pull distance in px (drives slow rotation while dragging). */
  pullDistancePx: number;
  /** 0–1 progress toward refresh threshold. */
  pullProgress: number;
  phase: PullToRefreshPhase;
  className?: string;
  /**
   * Use on white/light primary buttons: spinning vinyl uses `text-primary-foreground` (brand blue)
   * instead of `text-primary` (white), so it stays visible.
   */
  spinningContrast?: "default" | "onPrimaryButton";
};

/**
 * Pull/refresh vinyl — scales with pull, slow rotation while dragging, faster spin when refreshing,
 * fades out in the completing phase.
 */
export function VinylPullRefreshIndicator({
  pullDistancePx,
  pullProgress,
  phase,
  className,
  spinningContrast = "default",
}: VinylPullRefreshIndicatorProps) {
  const pulling = phase === "pulling";
  const atThreshold = phase === "threshold";
  const spinning = atThreshold || phase === "refreshing" || phase === "completing";

  const scale =
    phase === "refreshing" || phase === "completing"
      ? 1
      : 0.78 + 0.22 * Math.min(1, pullProgress * 1.08);

  const spinDuration =
    phase === "refreshing" ? "0.82s" : phase === "threshold" ? "1.35s" : "1s";

  const translateY = pulling || atThreshold ? Math.min(10, pullDistancePx * 0.14) : 0;

  return (
    <div
      className={cn(
        "pointer-events-none flex items-center justify-center",
        phase === "completing" ? "opacity-0 duration-300 ease-out" : "opacity-100 duration-200",
        className,
      )}
      style={{
        transform: `translateY(${translateY}px)`,
        transition:
          phase === "pulling" || atThreshold
            ? "transform 100ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 200ms ease"
            : "opacity 280ms ease, transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
      aria-hidden
    >
      <div
        className="transform-gpu will-change-transform"
        style={{
          transform: `scale(${scale})`,
          transition: "transform 140ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        <div
          className={cn(
            spinning && "motion-safe:animate-spin motion-reduce:animate-none",
            (phase === "refreshing" || phase === "completing" || atThreshold) &&
              (spinningContrast === "onPrimaryButton" ? "text-primary-foreground" : "text-primary"),
            (phase === "pulling" || phase === "idle") && "text-white/55",
          )}
          style={spinning ? { animationDuration: spinDuration } : undefined}
        >
          <Disc3
            className="h-7 w-7 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            style={
              pulling && pullDistancePx > 0
                ? {
                    transform: `rotate(${pullDistancePx * 2.35}deg)`,
                    transition: "transform 40ms linear",
                  }
                : atThreshold
                  ? { transform: "none" }
                  : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
