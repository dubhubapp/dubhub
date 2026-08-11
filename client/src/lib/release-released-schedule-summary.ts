/**
 * Post-release Edit schedule presentation.
 * Uses existing timing helpers — does not re-interpret live boundaries.
 */

import {
  RELEASE_TIMING_MODE_EXACT,
  normalizeReleaseTimingMode,
} from "@shared/release-timing";
import { RELEASE_RELEASED_LABEL } from "@/lib/release-status-pill";
import {
  formatReleasePublicSchedule,
  resolveReleaseCalendarYmd,
  viewerLocalStartOfCalendarDateMs,
  type ReleaseTimingInput,
} from "@/lib/release-status";
import { hydrateTimingDraftFromRelease } from "@/lib/release-timing-draft";
import {
  formatExactReleaseTimeDisplay,
  formatUtcOffsetForRelease,
} from "@/lib/release-timezone-label";
import {
  findReleaseTimezoneOption,
  formatReleaseTimezoneLocation,
} from "@/lib/release-timezone-options";

export type ReleasedScheduleSummary = {
  label: string;
  /** Midnight: date only. Exact: date · wall time. */
  primaryLine: string;
  /** Exact only: location · UTC offset. */
  secondaryLine: string | null;
};

function releaseDateString(
  releaseDate: ReleaseTimingInput["releaseDate"],
): string | null {
  if (releaseDate == null || releaseDate === "") return null;
  if (releaseDate instanceof Date) return releaseDate.toISOString();
  return String(releaseDate);
}

function releaseAtString(
  releaseAt: ReleaseTimingInput["releaseAt"],
): string | null {
  if (releaseAt == null || releaseAt === "") return null;
  if (releaseAt instanceof Date) return releaseAt.toISOString();
  return String(releaseAt);
}

function formatCalendarDateLabel(ymd: string, locale: string): string {
  const startMs = viewerLocalStartOfCalendarDateMs(ymd);
  if (startMs == null) return ymd;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startMs));
}

/**
 * Compact read-only schedule lines for a live (post-boundary) release on Edit.
 */
export function buildReleasedScheduleSummary(
  input: ReleaseTimingInput,
  args?: { locale?: string },
): ReleasedScheduleSummary {
  const locale =
    args?.locale ||
    (typeof navigator !== "undefined" ? navigator.language : "en-US");
  const label = RELEASE_RELEASED_LABEL;
  const mode = normalizeReleaseTimingMode(input.releaseTimingMode);

  if (mode === RELEASE_TIMING_MODE_EXACT) {
    const draft = hydrateTimingDraftFromRelease({
      releaseDate: releaseDateString(input.releaseDate),
      releaseTimingMode: input.releaseTimingMode,
      releaseAt: releaseAtString(input.releaseAt),
      releaseTimezone: input.releaseTimezone ?? null,
    });
    const ymd = resolveReleaseCalendarYmd(input.releaseDate) || "";
    const datePart = ymd ? formatCalendarDateLabel(ymd, locale) : "";

    let timeLabel = draft.timeLocal || "";
    if (draft.timezone && ymd && draft.timeLocal) {
      const exactDisplay = formatExactReleaseTimeDisplay({
        timeLocalHhmm: draft.timeLocal,
        timeZone: draft.timezone,
        releaseDateYmd: ymd,
        locale,
      });
      timeLabel = exactDisplay.split(" · ")[0] || draft.timeLocal;
    }

    const primaryLine =
      datePart && timeLabel
        ? `${datePart} · ${timeLabel}`
        : datePart ||
          timeLabel ||
          formatReleasePublicSchedule(input, { locale });

    let secondaryLine: string | null = null;
    if (draft.timezone) {
      const offset = formatUtcOffsetForRelease({
        timeZone: draft.timezone,
        releaseDateYmd: ymd || "2026-06-15",
        timeLocalHhmm: draft.timeLocal || "12:00",
      });
      const option = findReleaseTimezoneOption(draft.timezone);
      secondaryLine = option
        ? `${formatReleaseTimezoneLocation(option)} · ${offset}`
        : `${draft.timezone} · ${offset}`;
    }

    return { label, primaryLine, secondaryLine };
  }

  return {
    label,
    primaryLine: formatReleasePublicSchedule(input, { locale }),
    secondaryLine: null,
  };
}
