/**
 * Client draft helpers for Midnight vs Exact release timing.
 */

import {
  RELEASE_TIMING_MODE_EXACT,
  RELEASE_TIMING_MODE_MIDNIGHT,
  extractCalendarYmdFromReleaseDate,
  formatWallTimeInTimezone,
  normalizeReleaseTimingMode,
  type ReleaseTimingMode,
} from "@shared/release-timing";
import { resolveDeviceIanaTimezone } from "@/lib/release-timezone-options";

export type ReleaseTimingDraft = {
  mode: ReleaseTimingMode;
  /** HH:mm 24h local wall time for Exact; ignored for Midnight. */
  timeLocal: string;
  /** IANA timezone for Exact. */
  timezone: string | null;
};

export function defaultMidnightDraft(): ReleaseTimingDraft {
  return {
    mode: RELEASE_TIMING_MODE_MIDNIGHT,
    timeLocal: "18:00",
    timezone: null,
  };
}

export function enableExactDraft(current: ReleaseTimingDraft): ReleaseTimingDraft {
  const deviceTz = resolveDeviceIanaTimezone();
  return {
    mode: RELEASE_TIMING_MODE_EXACT,
    timeLocal: current.timeLocal || "18:00",
    timezone: current.timezone || deviceTz,
  };
}

export function hydrateTimingDraftFromRelease(release: {
  releaseDate?: string | null;
  releaseTimingMode?: string | null;
  releaseAt?: string | null;
  releaseTimezone?: string | null;
}): ReleaseTimingDraft {
  const mode = normalizeReleaseTimingMode(release.releaseTimingMode);
  if (mode !== RELEASE_TIMING_MODE_EXACT) {
    return defaultMidnightDraft();
  }
  const tz = release.releaseTimezone?.trim() || null;
  const wall =
    release.releaseAt && tz
      ? formatWallTimeInTimezone(release.releaseAt, tz)
      : null;
  return {
    mode: RELEASE_TIMING_MODE_EXACT,
    timeLocal: wall || "18:00",
    timezone: tz,
  };
}

export function buildReleaseTimingRequestFields(args: {
  comingSoon: boolean;
  releaseDateYmd: string;
  draft: ReleaseTimingDraft;
}): Record<string, string | null> | { error: string } {
  if (args.comingSoon) {
    return {
      release_timing_mode: RELEASE_TIMING_MODE_MIDNIGHT,
    };
  }
  if (args.draft.mode === RELEASE_TIMING_MODE_MIDNIGHT) {
    return {
      release_timing_mode: RELEASE_TIMING_MODE_MIDNIGHT,
    };
  }
  if (!args.releaseDateYmd) {
    return { error: "Release date is required for scheduled releases" };
  }
  if (!args.draft.timeLocal) {
    return { error: "Choose a release time" };
  }
  if (!args.draft.timezone) {
    return {
      error: "Choose a timezone for this release time",
    };
  }
  return {
    release_timing_mode: RELEASE_TIMING_MODE_EXACT,
    release_time_local: args.draft.timeLocal,
    release_timezone: args.draft.timezone,
  };
}

export function calendarYmdFromReleaseField(
  releaseDate: string | null | undefined,
): string {
  if (!releaseDate) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return releaseDate;
  return extractCalendarYmdFromReleaseDate(releaseDate) || "";
}
