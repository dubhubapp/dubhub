/**
 * Release-day notify eligibility — Exact (release_at) + Midnight (listener-local date).
 *
 * Exact: now >= release_at. No London/09:00.
 * Midnight: effective IANA local calendar date >= release calendar YMD.
 * Unknown timezone → fail closed for Midnight.
 */

import { extractCalendarYmdFromReleaseDate } from "@shared/release-timing";

export type ReleaseDayNotifyMode = "midnight" | "exact" | "unknown";

export function normalizeReleaseTimingMode(
  releaseTimingMode?: string | null,
): ReleaseDayNotifyMode {
  const mode = String(releaseTimingMode ?? "midnight")
    .trim()
    .toLowerCase();
  if (mode === "exact") return "exact";
  if (mode === "midnight" || mode === "") return "midnight";
  return "unknown";
}

export function isExactReleaseDayNotifyEligible(input: {
  releaseTimingMode?: string | null;
  releaseAt?: Date | string | null;
  now?: Date;
}): boolean {
  if (normalizeReleaseTimingMode(input.releaseTimingMode) !== "exact") {
    return false;
  }
  const raw = input.releaseAt;
  if (raw == null || raw === "") return false;
  const at = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(at.getTime())) return false;
  const now = input.now ?? new Date();
  return at.getTime() <= now.getTime();
}

/** @deprecated Prefer isExactReleaseDayNotifyEligible. */
export function isExactPastBoundaryForReleaseDayNotify(input: {
  releaseTimingMode?: string | null;
  releaseAt?: Date | string | null;
  now?: Date;
}): boolean {
  return isExactReleaseDayNotifyEligible(input);
}

/**
 * Calendar YMD for a Midnight release_date carrier (UTC YMD extraction).
 */
export function midnightReleaseCalendarYmd(
  releaseDate: Date | string | null | undefined,
): string | null {
  return extractCalendarYmdFromReleaseDate(releaseDate);
}

function calendarYmdInTimeZone(now: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

/**
 * Midnight due when listener local calendar date >= release calendar YMD.
 * Missing/invalid timezone → fail closed (false).
 */
export function isMidnightReleaseDueForTimezone(input: {
  releaseCalendarYmd: string;
  effectiveTimezone: string | null | undefined;
  now?: Date;
}): boolean {
  const tz = String(input.effectiveTimezone ?? "").trim();
  if (!tz || !tz.includes("/")) return false;
  const ymd = String(input.releaseCalendarYmd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const localYmd = calendarYmdInTimeZone(input.now ?? new Date(), tz);
  if (!localYmd) return false;
  return localYmd >= ymd;
}
