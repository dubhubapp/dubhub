/**
 * Canonical client release boundary for Midnight vs Exact vs Coming Soon.
 *
 * MIDNIGHT — calendar date; boundary = viewer-local start of that date.
 * EXACT — absolute instant from releaseAt (server-derived).
 * COMING SOON — no boundary / always upcoming until a date exists.
 *
 * Do NOT treat stored releaseDate 00:00Z as an Exact Instant boundary.
 */

import {
  RELEASE_TIMING_MODE_EXACT,
  extractCalendarYmdFromReleaseDate,
  normalizeReleaseTimingMode,
} from "@shared/release-timing";
import { isReleaseAnnouncementFresh } from "@shared/home-widget-retention";

export type ReleaseStatus = "upcoming" | "released";

/** Minimal timing fields needed to resolve listener-facing state. */
export type ReleaseTimingInput = {
  isComingSoon?: boolean | null;
  releaseDate?: string | Date | null;
  releaseTimingMode?: string | null;
  releaseAt?: string | Date | null;
  releaseTimezone?: string | null;
};

export type ReleaseBoundary =
  | { kind: "none" }
  | { kind: "midnight"; calendarYmd: string; boundaryMs: number }
  | { kind: "exact"; boundaryMs: number; releaseAt: Date };

/** Local calendar date as YYYY-MM-DD (viewer timezone). */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of a YYYY-MM-DD calendar date in the viewer's local timezone. */
export function viewerLocalStartOfCalendarDateMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const local = new Date(y, month - 1, day, 0, 0, 0, 0);
  if (
    local.getFullYear() !== y ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  ) {
    return null;
  }
  return local.getTime();
}

export function resolveReleaseCalendarYmd(
  releaseDate: string | Date | null | undefined,
): string | null {
  if (releaseDate == null || releaseDate === "") return null;
  if (typeof releaseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate.trim())) {
    return releaseDate.trim();
  }
  return extractCalendarYmdFromReleaseDate(releaseDate);
}

/**
 * Resolve the listener-facing release boundary.
 * Exact never infers from releaseDate's time component — requires releaseAt.
 */
export function resolveReleaseBoundary(
  input: ReleaseTimingInput,
): ReleaseBoundary {
  if (input.isComingSoon) return { kind: "none" };

  const mode = normalizeReleaseTimingMode(input.releaseTimingMode);
  if (mode === RELEASE_TIMING_MODE_EXACT) {
    if (input.releaseAt == null || input.releaseAt === "") {
      // Incomplete Exact row — fail closed to Midnight calendar if available.
      const ymd = resolveReleaseCalendarYmd(input.releaseDate);
      if (!ymd) return { kind: "none" };
      const boundaryMs = viewerLocalStartOfCalendarDateMs(ymd);
      if (boundaryMs == null) return { kind: "none" };
      return { kind: "midnight", calendarYmd: ymd, boundaryMs };
    }
    const at =
      input.releaseAt instanceof Date
        ? input.releaseAt
        : new Date(input.releaseAt);
    if (Number.isNaN(at.getTime())) return { kind: "none" };
    return { kind: "exact", boundaryMs: at.getTime(), releaseAt: at };
  }

  const ymd = resolveReleaseCalendarYmd(input.releaseDate);
  if (!ymd) return { kind: "none" };
  const boundaryMs = viewerLocalStartOfCalendarDateMs(ymd);
  if (boundaryMs == null) return { kind: "none" };
  return { kind: "midnight", calendarYmd: ymd, boundaryMs };
}

export function getReleaseStatusFromTiming(
  input: ReleaseTimingInput,
  now: Date = new Date(),
): ReleaseStatus {
  if (input.isComingSoon) return "upcoming";
  const boundary = resolveReleaseBoundary(input);
  if (boundary.kind === "none") {
    // Coming Soon without date, or undated — treat as upcoming only when flagged;
    // undated non-coming-soon legacy → released (matches prior Instant helper).
    return input.isComingSoon ? "upcoming" : "released";
  }
  return now.getTime() < boundary.boundaryMs ? "upcoming" : "released";
}

export function isReleaseUpcomingFromTiming(
  input: ReleaseTimingInput,
  now: Date = new Date(),
): boolean {
  return getReleaseStatusFromTiming(input, now) === "upcoming";
}

/**
 * Backward-compatible Instant-era signature.
 * Treats missing mode as Midnight (calendar), not Instant-of-00:00Z.
 */
export function getReleaseStatus(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined,
  now?: Date,
): ReleaseStatus {
  return getReleaseStatusFromTiming(
    { isComingSoon, releaseDate, releaseTimingMode: "midnight" },
    now ?? new Date(),
  );
}

export function isReleaseUpcoming(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined,
  now?: Date,
): boolean {
  return getReleaseStatus(isComingSoon, releaseDate, now) === "upcoming";
}

/**
 * Release-day celebration / glow.
 * Midnight: viewer-local calendar equals release calendar date.
 * Exact: after releaseAt, on the viewer-local calendar day that contains releaseAt
 * (avoids "Out now" contradictions before the absolute instant).
 */
export function isReleaseDayTodayFromTiming(
  input: ReleaseTimingInput,
  now: Date = new Date(),
): boolean {
  if (input.isComingSoon) return false;
  const boundary = resolveReleaseBoundary(input);
  if (boundary.kind === "none") return false;

  if (boundary.kind === "exact") {
    if (now.getTime() < boundary.boundaryMs) return false;
    return toLocalDateKey(boundary.releaseAt) === toLocalDateKey(now);
  }

  return boundary.calendarYmd === toLocalDateKey(now);
}

export function isReleaseDayToday(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined,
  now?: Date,
): boolean {
  return isReleaseDayTodayFromTiming(
    { isComingSoon, releaseDate, releaseTimingMode: "midnight" },
    now ?? new Date(),
  );
}

/** Artist edit live-lock: Midnight = local calendar boundary; Exact = releaseAt. */
export function isReleaseLiveLockedFromTiming(
  input: ReleaseTimingInput,
  now: Date = new Date(),
): boolean {
  if (input.isComingSoon) return false;
  const boundary = resolveReleaseBoundary(input);
  if (boundary.kind === "none") return false;
  return now.getTime() >= boundary.boundaryMs;
}

export function releaseTimingInputFrom(release: ReleaseTimingInput): ReleaseTimingInput {
  return {
    isComingSoon: release.isComingSoon,
    releaseDate: release.releaseDate,
    releaseTimingMode: release.releaseTimingMode,
    releaseAt: release.releaseAt,
    releaseTimezone: release.releaseTimezone,
  };
}

/**
 * Public/listener schedule line.
 * Midnight → date only. Exact → date + viewer-local time.
 */
export function formatReleasePublicSchedule(
  input: ReleaseTimingInput,
  args?: { locale?: string; now?: Date },
): string {
  if (input.isComingSoon && !input.releaseDate) return "Coming soon...";

  const locale =
    args?.locale ||
    (typeof navigator !== "undefined" ? navigator.language : "en-US");
  const boundary = resolveReleaseBoundary(input);

  if (boundary.kind === "exact") {
    const datePart = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(boundary.releaseAt);
    const timePart = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(boundary.releaseAt);
    return `${datePart} · ${timePart}`;
  }

  const ymd =
    boundary.kind === "midnight"
      ? boundary.calendarYmd
      : resolveReleaseCalendarYmd(input.releaseDate);
  if (!ymd) {
    if (input.isComingSoon) return "Coming soon...";
    return "";
  }
  const startMs = viewerLocalStartOfCalendarDateMs(ymd);
  if (startMs == null) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startMs));
}

/**
 * Absolute 24h announcement freshness (not a release boundary).
 * Countdown / Out now remain primary — this is decorative only.
 * App surfaces do not currently render this; Home Widget medium does.
 */
export function isReleaseRecentlyAnnounced(
  releaseAnnouncedAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return isReleaseAnnouncementFresh({
    releaseAnnouncedAt,
    now,
  });
}
