import { formatReleaseCardDate } from "@/components/release-feed-card";
import { isReleaseUpcoming } from "@/lib/release-status";
import {
  RELEASE_COMING_SOON_LABEL,
  RELEASE_RELEASED_LABEL,
  resolveReleaseStatusPillPresentation,
} from "@/lib/release-status-pill";
import { cn } from "@/lib/utils";

export {
  RELEASE_COMING_SOON_LABEL,
  RELEASE_RELEASED_LABEL,
  RELEASE_STATUS_PILL_BASE_CLASS,
  RELEASE_STATUS_PILL_SIZE_CLASS,
  RELEASE_COMING_SOON_PILL_CLASS,
  RELEASE_RELEASED_PILL_CLASS,
  RELEASE_PAUSED_PILL_CLASS,
  resolveReleaseStatusPillPresentation,
} from "@/lib/release-status-pill";

type ReleaseStatusPillProps = {
  isComingSoon?: boolean;
  releaseDate?: string | null;
  /** When set, overrides computed upcoming/released state. */
  upcoming?: boolean;
  /** Subscription-suspended — distinct neutral pill, same dimensions as Coming Soon. */
  paused?: boolean;
  className?: string;
  size?: "default" | "compact";
  "data-testid"?: string;
};

export function ReleaseStatusPill({
  isComingSoon,
  releaseDate,
  upcoming,
  paused = false,
  className,
  size = "default",
  "data-testid": dataTestId,
}: ReleaseStatusPillProps) {
  const presentation = resolveReleaseStatusPillPresentation({
    paused,
    isComingSoon,
    releaseDate,
    upcoming,
    size,
  });

  return (
    <span
      className={cn(
        presentation.baseClass,
        presentation.sizeClass,
        presentation.toneClass,
        className,
      )}
      data-testid={dataTestId ?? `badge-release-status-${presentation.variant}`}
    >
      {presentation.label}
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
