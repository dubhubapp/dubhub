import { formatReleaseCardDate } from "@/components/release-feed-card";
import { isReleaseUpcoming } from "@/lib/release-status";
import { cn } from "@/lib/utils";

export const RELEASE_COMING_SOON_LABEL = "Coming Soon";
export const RELEASE_RELEASED_LABEL = "Released";

type ReleaseStatusPillProps = {
  isComingSoon?: boolean;
  releaseDate?: string | null;
  /** When set, overrides computed upcoming/released state. */
  upcoming?: boolean;
  className?: string;
  size?: "default" | "compact";
};

export function ReleaseStatusPill({
  isComingSoon,
  releaseDate,
  upcoming,
  className,
  size = "default",
}: ReleaseStatusPillProps) {
  const isUpcomingState = upcoming ?? isReleaseUpcoming(isComingSoon, releaseDate);
  const label = isUpcomingState ? RELEASE_COMING_SOON_LABEL : RELEASE_RELEASED_LABEL;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded font-medium leading-none",
        size === "compact"
          ? "min-h-[1.125rem] px-1.5 py-0.5 text-[10px]"
          : "min-h-[1.375rem] px-2 py-0.5 text-xs",
        isUpcomingState
          ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
          : "bg-green-500/20 text-green-600 dark:text-green-400",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function releaseStatusSubtitle(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined,
): string {
  if (isComingSoon && !releaseDate) return "Coming soon...";
  if (releaseDate) return formatReleaseCardDate(releaseDate);
  return isReleaseUpcoming(isComingSoon, releaseDate) ? RELEASE_COMING_SOON_LABEL : "";
}
