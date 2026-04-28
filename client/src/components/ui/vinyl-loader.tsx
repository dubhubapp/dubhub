import { VinylPullRefreshIndicator } from "@/components/vinyl-pull-refresh-indicator";
import { cn } from "@/lib/utils";

type VinylLoaderSize = "sm" | "md" | "lg";

const sizeClassMap: Record<VinylLoaderSize, string> = {
  sm: "scale-[0.72]",
  md: "scale-100",
  lg: "scale-[1.18]",
};

export function VinylLoader({
  label,
  size = "md",
  centered = false,
  fullScreen = false,
  inline = false,
  className,
  labelClassName,
}: {
  label?: string;
  size?: VinylLoaderSize;
  centered?: boolean;
  fullScreen?: boolean;
  inline?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div
      className={cn(
        inline ? "inline-flex items-center justify-center" : "flex flex-col items-center justify-center gap-2",
        centered && "w-full",
        fullScreen && "min-h-screen",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn("transform-gpu", sizeClassMap[size])}>
        <VinylPullRefreshIndicator pullDistancePx={0} pullProgress={1} phase="refreshing" />
      </div>
      {!inline && label ? <p className={cn("text-sm text-muted-foreground", labelClassName)}>{label}</p> : null}
    </div>
  );
}
