/**
 * Shared release status pill presentation contract (Coming Soon / Released / Paused).
 */

import {
  isReleaseUpcoming,
  isReleaseUpcomingFromTiming,
  type ReleaseTimingInput,
} from "@/lib/release-status";
import { RELEASE_SUBSCRIPTION_PAUSED_LABEL } from "@/lib/release-subscription-paused";

export const RELEASE_COMING_SOON_LABEL = "Coming Soon";
export const RELEASE_RELEASED_LABEL = "Released";

export const RELEASE_STATUS_PILL_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded font-medium leading-none" as const;

export const RELEASE_STATUS_PILL_SIZE_CLASS = {
  default: "min-h-[1.375rem] px-2 py-0.5 text-xs",
  compact: "min-h-[1.125rem] px-1.5 py-0.5 text-[10px]",
} as const;

/** Coming Soon — amber (unchanged). */
export const RELEASE_COMING_SOON_PILL_CLASS =
  "bg-amber-500/20 text-amber-600 dark:text-amber-400" as const;

/** Released — green (unchanged). */
export const RELEASE_RELEASED_PILL_CLASS =
  "bg-green-500/20 text-green-600 dark:text-green-400" as const;

/** Paused — neutral muted; distinct from Coming Soon amber. */
export const RELEASE_PAUSED_PILL_CLASS =
  "bg-muted text-muted-foreground ring-1 ring-inset ring-white/10" as const;

export type ReleaseStatusPillVariant = "paused" | "coming_soon" | "released";

export function resolveReleaseStatusPillPresentation(args: {
  paused?: boolean;
  isComingSoon?: boolean;
  releaseDate?: string | null;
  releaseTimingMode?: string | null;
  releaseAt?: string | null;
  releaseTimezone?: string | null;
  upcoming?: boolean;
  size?: "default" | "compact";
}): {
  variant: ReleaseStatusPillVariant;
  label: string;
  baseClass: typeof RELEASE_STATUS_PILL_BASE_CLASS;
  sizeClass: string;
  toneClass: string;
} {
  const size = args.size ?? "default";
  const sizeClass = RELEASE_STATUS_PILL_SIZE_CLASS[size];

  if (args.paused) {
    return {
      variant: "paused",
      label: RELEASE_SUBSCRIPTION_PAUSED_LABEL,
      baseClass: RELEASE_STATUS_PILL_BASE_CLASS,
      sizeClass,
      toneClass: RELEASE_PAUSED_PILL_CLASS,
    };
  }

  const timing: ReleaseTimingInput = {
    isComingSoon: args.isComingSoon,
    releaseDate: args.releaseDate,
    releaseTimingMode: args.releaseTimingMode,
    releaseAt: args.releaseAt,
    releaseTimezone: args.releaseTimezone,
  };

  const isUpcomingState =
    args.upcoming ??
    (args.releaseTimingMode != null || args.releaseAt != null
      ? isReleaseUpcomingFromTiming(timing)
      : isReleaseUpcoming(args.isComingSoon, args.releaseDate));
  if (isUpcomingState) {
    return {
      variant: "coming_soon",
      label: RELEASE_COMING_SOON_LABEL,
      baseClass: RELEASE_STATUS_PILL_BASE_CLASS,
      sizeClass,
      toneClass: RELEASE_COMING_SOON_PILL_CLASS,
    };
  }

  return {
    variant: "released",
    label: RELEASE_RELEASED_LABEL,
    baseClass: RELEASE_STATUS_PILL_BASE_CLASS,
    sizeClass,
    toneClass: RELEASE_RELEASED_PILL_CLASS,
  };
}
