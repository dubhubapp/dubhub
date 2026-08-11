/**
 * Compact schedule lines for the Create/Edit release hero.
 * Pre-live uses the same timing draft the schedule sheet edits — not a second model.
 * Post-live reuses buildReleasedScheduleSummary.
 */

import {
  RELEASE_TIMING_MODE_EXACT,
  type ReleaseTimingMode,
} from "@shared/release-timing";
import {
  RELEASE_COMING_SOON_LABEL,
  RELEASE_RELEASED_LABEL,
} from "@/lib/release-status-pill";
import type { ReleaseTimingDraft } from "@/lib/release-timing-draft";
import {
  buildReleasedScheduleSummary,
  type ReleasedScheduleSummary,
} from "@/lib/release-released-schedule-summary";
import {
  formatExactReleaseTimeDisplay,
  formatUtcOffsetForRelease,
} from "@/lib/release-timezone-label";
import {
  findReleaseTimezoneOption,
  formatReleaseTimezoneLocation,
} from "@/lib/release-timezone-options";
import {
  viewerLocalStartOfCalendarDateMs,
  type ReleaseTimingInput,
} from "@/lib/release-status";

export type ReleaseFormHeroSchedule = {
  /**
   * Status chip / footer label (Scheduled / Coming Soon / Released).
   * Empty when schedule is still incomplete (do not show false "Scheduled").
   */
  statusLabel: string;
  primaryLine: string;
  secondaryLine: string | null;
  /** When true, schedule area is not tappable. */
  readOnly: boolean;
  /** True when Create/pre-live draft still needs required schedule fields. */
  incomplete?: boolean;
};

const SCHEDULED_LABEL = "Scheduled";
const INCOMPLETE_SCHEDULE_PRIMARY = "Add release schedule *";

function formatCalendarDateLabel(ymd: string, locale: string): string {
  const startMs = viewerLocalStartOfCalendarDateMs(ymd);
  if (startMs == null) return ymd;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(startMs));
}

/**
 * Whether the draft schedule is complete enough to show a Scheduled / Coming Soon
 * summary. Default Midnight with no date is NOT complete.
 */
export function isDraftScheduleComplete(args: {
  comingSoon: boolean;
  releaseDateYmd: string;
  timingDraft: ReleaseTimingDraft;
}): boolean {
  if (args.comingSoon) return true;
  const ymd = args.releaseDateYmd.trim();
  if (!ymd) return false;
  const mode: ReleaseTimingMode = args.timingDraft.mode;
  if (mode === RELEASE_TIMING_MODE_EXACT) {
    return Boolean(
      args.timingDraft.timeLocal?.trim() && args.timingDraft.timezone?.trim(),
    );
  }
  return true;
}

/**
 * Hero schedule from Create / pre-release Edit draft state
 * (same comingSoon / releaseDate / timingDraft the schedule sheet owns).
 */
export function buildDraftScheduleHeroSummary(args: {
  comingSoon: boolean;
  releaseDateYmd: string;
  timingDraft: ReleaseTimingDraft;
  locale?: string;
}): ReleaseFormHeroSchedule {
  const locale =
    args.locale ||
    (typeof navigator !== "undefined" ? navigator.language : "en-US");

  if (args.comingSoon) {
    return {
      statusLabel: RELEASE_COMING_SOON_LABEL,
      primaryLine: "Release date not announced",
      secondaryLine: null,
      readOnly: false,
      incomplete: false,
    };
  }

  if (
    !isDraftScheduleComplete({
      comingSoon: false,
      releaseDateYmd: args.releaseDateYmd,
      timingDraft: args.timingDraft,
    })
  ) {
    return {
      statusLabel: "",
      primaryLine: INCOMPLETE_SCHEDULE_PRIMARY,
      secondaryLine: null,
      readOnly: false,
      incomplete: true,
    };
  }

  const ymd = args.releaseDateYmd.trim();
  const mode: ReleaseTimingMode = args.timingDraft.mode;
  const datePart = ymd ? formatCalendarDateLabel(ymd, locale) : "";

  if (mode === RELEASE_TIMING_MODE_EXACT) {
    let timeLabel = args.timingDraft.timeLocal || "";
    if (args.timingDraft.timezone && ymd && args.timingDraft.timeLocal) {
      const exactDisplay = formatExactReleaseTimeDisplay({
        timeLocalHhmm: args.timingDraft.timeLocal,
        timeZone: args.timingDraft.timezone,
        releaseDateYmd: ymd,
        locale,
      });
      timeLabel = exactDisplay.split(" · ")[0] || args.timingDraft.timeLocal;
    }

    const primaryLine =
      datePart && timeLabel ? `${datePart} · ${timeLabel}` : datePart || timeLabel;

    let secondaryLine: string | null = null;
    if (args.timingDraft.timezone) {
      const offset = formatUtcOffsetForRelease({
        timeZone: args.timingDraft.timezone,
        releaseDateYmd: ymd || "2026-06-15",
        timeLocalHhmm: args.timingDraft.timeLocal || "12:00",
      });
      const option = findReleaseTimezoneOption(args.timingDraft.timezone);
      secondaryLine = option
        ? `${formatReleaseTimezoneLocation(option)} · ${offset}`
        : `${args.timingDraft.timezone} · ${offset}`;
    }

    return {
      statusLabel: SCHEDULED_LABEL,
      primaryLine,
      secondaryLine,
      readOnly: false,
      incomplete: false,
    };
  }

  return {
    statusLabel: SCHEDULED_LABEL,
    primaryLine: datePart,
    secondaryLine: null,
    readOnly: false,
    incomplete: false,
  };
}

export function buildReleasedScheduleHeroSummary(
  input: ReleaseTimingInput,
  args?: { locale?: string },
): ReleaseFormHeroSchedule {
  const summary: ReleasedScheduleSummary = buildReleasedScheduleSummary(
    input,
    args,
  );
  return {
    statusLabel: summary.label || RELEASE_RELEASED_LABEL,
    primaryLine: summary.primaryLine,
    secondaryLine: summary.secondaryLine,
    readOnly: true,
    incomplete: false,
  };
}
