/**
 * Shared release status pill presentation contract
 * (Upcoming / Coming Soon / Released / Paused).
 */

import {
  isReleaseUpcoming,
  isReleaseUpcomingFromTiming,
  type ReleaseTimingInput,
} from "@/lib/release-status";
import { RELEASE_SUBSCRIPTION_PAUSED_LABEL } from "@/lib/release-subscription-paused";

export const RELEASE_COMING_SOON_LABEL = "Coming Soon";
/** Dated, pre-live releases — user-facing list/detail/discography pill. */
export const RELEASE_UPCOMING_LABEL = "Upcoming";
/**
 * @deprecated Prefer RELEASE_UPCOMING_LABEL. Kept as an alias so older imports keep working.
 * Create/Edit draft hero still uses its own local "Scheduled" label.
 */
export const RELEASE_SCHEDULED_LABEL = RELEASE_UPCOMING_LABEL;
export const RELEASE_RELEASED_LABEL = "Released";

export const RELEASE_STATUS_PILL_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded font-medium leading-none" as const;

export const RELEASE_STATUS_PILL_SIZE_CLASS = {
  default: "min-h-[1.375rem] px-2 py-0.5 text-xs",
  compact: "min-h-[1.125rem] px-1.5 py-0.5 text-[10px]",
} as const;

/**
 * Canonical release-status pill tone system:
 * muted semantic fill + restrained semantic ring + white/near-white label.
 * Colour communicates status; text treatment stays consistent.
 * Upcoming must NEVER use accent/turquoise (selection chrome).
 */
export const RELEASE_STATUS_PILL_LABEL_CLASS = "text-white" as const;

/** Coming Soon — amber family. Explicit is_coming_soon only. */
export const RELEASE_COMING_SOON_PILL_CLASS =
  "bg-amber-500/25 text-white ring-1 ring-inset ring-amber-400/35" as const;

/** Upcoming — indigo/blue family. Must NOT use accent/turquoise. */
export const RELEASE_UPCOMING_PILL_CLASS =
  "bg-indigo-500/25 text-white ring-1 ring-inset ring-indigo-400/35" as const;

/** @deprecated Prefer RELEASE_UPCOMING_PILL_CLASS. */
export const RELEASE_SCHEDULED_PILL_CLASS = RELEASE_UPCOMING_PILL_CLASS;

/** Released — green family. */
export const RELEASE_RELEASED_PILL_CLASS =
  "bg-green-500/25 text-white ring-1 ring-inset ring-green-400/35" as const;

/** Paused — neutral slate; quieter than active statuses. */
export const RELEASE_PAUSED_PILL_CLASS =
  "bg-slate-500/25 text-white ring-1 ring-inset ring-slate-400/30" as const;

export type ReleaseStatusPillVariant = "paused" | "coming_soon" | "upcoming" | "released";

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
    if (args.isComingSoon) {
      return {
        variant: "coming_soon",
        label: RELEASE_COMING_SOON_LABEL,
        baseClass: RELEASE_STATUS_PILL_BASE_CLASS,
        sizeClass,
        toneClass: RELEASE_COMING_SOON_PILL_CLASS,
      };
    }
    return {
      variant: "upcoming",
      label: RELEASE_UPCOMING_LABEL,
      baseClass: RELEASE_STATUS_PILL_BASE_CLASS,
      sizeClass,
      toneClass: RELEASE_UPCOMING_PILL_CLASS,
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
