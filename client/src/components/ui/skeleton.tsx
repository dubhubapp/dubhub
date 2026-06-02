import { cn } from "@/lib/utils";

/** Soft ghost bar — primary tier (translucent white on dark glass). */
export const dubhubSkeletonBarClass = "animate-pulse rounded bg-white/12";

/** Mid tier for secondary lines. */
export const dubhubSkeletonBarMidClass = "animate-pulse rounded bg-white/10";

/** Faintest tier for tertiary lines. */
export const dubhubSkeletonBarFaintClass = "animate-pulse rounded bg-white/[0.08]";

/** Subtle teal-tinted tier — accent hint without strong colour. */
export const dubhubSkeletonBarTealClass = "animate-pulse rounded bg-teal-400/[0.1]";

/** Dark-glass card shell aligned with release cards / stats sections. */
export const dubhubSkeletonGlassShellClass =
  "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

type DubHubSkeletonBarProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "mid" | "faint" | "teal";
};

function DubHubSkeletonBar({ className, tone = "default", ...props }: DubHubSkeletonBarProps) {
  const toneClass =
    tone === "mid"
      ? dubhubSkeletonBarMidClass
      : tone === "faint"
        ? dubhubSkeletonBarFaintClass
        : tone === "teal"
          ? dubhubSkeletonBarTealClass
          : dubhubSkeletonBarClass;

  return <div className={cn(toneClass, className)} aria-hidden {...props} />;
}

export { Skeleton, DubHubSkeletonBar };
