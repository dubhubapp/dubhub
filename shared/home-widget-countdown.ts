/**
 * Home Widget countdown domain (Slice 4 / 4.1).
 *
 * Source of truth for label rules; Swift HomeWidgetCountdown mirrors this contract.
 *
 * MIDNIGHT — boundary = start of releaseCalendarDate in the viewer/device timezone.
 * EXACT — boundary = absolute releaseAt instant.
 *
 * Labels: "N days" | "Tomorrow" | "N hours" | "N hours M mins" | "N mins" | "1 min" | "Out now"
 *
 * Out now persists through HOME_WIDGET_OUT_NOW_RETENTION_HOURS after the boundary;
 * after that isRetentionExpired is true (widget should show empty / refresh).
 *
 * Sub-24h minute component: floor to nearest 5; omit when 0 ("12 hours" not "12 hours 0 mins").
 * Final hour: same 5-minute buckets, clamp minimum to 5 mins. Never "0 mins" / seconds.
 * Plural minute unit is "mins" except exactly "1 min".
 */

import {
  outNowRetentionEndMs,
} from "./home-widget-retention";

export type HomeWidgetTimingMode = "midnight" | "exact";

export type HomeWidgetCountdownInput = {
  timingMode: HomeWidgetTimingMode;
  /** YYYY-MM-DD — required for midnight; optional display aid for exact. */
  releaseCalendarDate?: string | null;
  /** Absolute ISO / Date — required for exact. */
  releaseAt?: string | Date | null;
  now?: Date | string;
  /**
   * IANA timezone for Midnight boundary + calendar-day distance.
   * Exact ignores this for the release instant (may still use for display day distance).
   */
  timeZone?: string;
};

export type HomeWidgetCountdownResult = {
  countdownLabel: string;
  isOutNow: boolean;
  /** True when now is at/after boundary + Out-now retention. */
  isRetentionExpired: boolean;
  boundaryMs: number;
  /** Absolute end of Out-now retention (boundary + retention hours). */
  outNowUntilMs: number;
  nextLabelChangeMs: number | null;
};

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Max label-change entries generated for one WidgetKit timeline pass (rolling). */
export const HOME_WIDGET_TIMELINE_MAX_LABEL_ENTRIES = 96;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseHomeWidgetYmd(
  value: string | null | undefined,
): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const m = YMD_RE.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(y) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { y, m: month, d: day };
}

function resolveNow(now?: Date | string): Date {
  if (now == null) return new Date();
  const d = now instanceof Date ? now : new Date(now);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function resolveTimeZone(timeZone?: string): string {
  if (timeZone && timeZone.trim()) return timeZone.trim();
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function zonedParts(instantMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    h: get("hour"),
    min: get("minute"),
    s: get("second"),
  };
}

export function calendarYmdInTimeZone(
  instant: Date | string | number,
  timeZone: string,
): string | null {
  const ms =
    typeof instant === "number"
      ? instant
      : instant instanceof Date
        ? instant.getTime()
        : new Date(instant).getTime();
  if (!Number.isFinite(ms)) return null;
  const p = zonedParts(ms, timeZone);
  if ([p.y, p.m, p.d].some((n) => Number.isNaN(n))) return null;
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function startOfCalendarDateInTimeZoneMs(
  ymd: string,
  timeZone: string,
): number | null {
  const parsed = parseHomeWidgetYmd(ymd);
  if (!parsed) return null;
  let guess = Date.UTC(parsed.y, parsed.m - 1, parsed.d, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(guess, timeZone);
    if ([parts.y, parts.m, parts.d, parts.h, parts.min].some((n) => Number.isNaN(n))) {
      return null;
    }
    const asUtc = Date.UTC(
      parts.y,
      parts.m - 1,
      parts.d,
      parts.h,
      parts.min,
      parts.s || 0,
    );
    const desired = Date.UTC(parsed.y, parsed.m - 1, parsed.d, 0, 0, 0);
    const delta = desired - asUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return guess;
}

function wholeCalendarDayDifference(
  fromYmd: string,
  toYmd: string,
): number | null {
  const a = parseHomeWidgetYmd(fromYmd);
  const b = parseHomeWidgetYmd(toYmd);
  if (!a || !b) return null;
  const from = Date.UTC(a.y, a.m - 1, a.d);
  const to = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((to - from) / DAY_MS);
}

export function resolveHomeWidgetBoundaryMs(
  input: HomeWidgetCountdownInput,
): number | null {
  const timeZone = resolveTimeZone(input.timeZone);
  if (input.timingMode === "exact") {
    if (input.releaseAt == null || input.releaseAt === "") return null;
    const at =
      input.releaseAt instanceof Date
        ? input.releaseAt
        : new Date(input.releaseAt);
    if (Number.isNaN(at.getTime())) return null;
    return at.getTime();
  }
  const ymd = input.releaseCalendarDate?.trim() || null;
  if (!ymd) return null;
  return startOfCalendarDateInTimeZoneMs(ymd, timeZone);
}

/**
 * Final-hour display: round DOWN to nearest 5 minutes, clamp minimum to 5.
 * Canonical rule shared with Swift.
 */
export function formatMinuteUnit(minutes: number): string {
  return minutes === 1 ? "1 min" : `${minutes} mins`;
}

export function formatFinalHourCountdownLabel(remainingMs: number): string {
  if (remainingMs <= 0) return "Out now";
  const mins = remainingMs / MIN_MS;
  if (mins <= 5) return formatMinuteUnit(5);
  const bucket = Math.floor(mins / 5) * 5;
  return formatMinuteUnit(bucket);
}

/**
 * Final-24h (and same-day overflow) display:
 * hours = floor(totalMinutes/60); minutes = floor((totalMinutes%60)/5)*5;
 * omit minutes when 0. Below 60 minutes → final-hour buckets.
 */
export function formatSubDayCountdownLabel(remainingMs: number): string {
  if (remainingMs <= 0) return "Out now";
  const totalMinutes = Math.floor(remainingMs / MIN_MS);
  if (totalMinutes < 60) {
    return formatFinalHourCountdownLabel(remainingMs);
  }
  const hours = Math.floor(totalMinutes / 60);
  const remMins = totalMinutes % 60;
  const roundedMins = Math.floor(remMins / 5) * 5;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  if (roundedMins === 0) return hourPart;
  return `${hourPart} ${formatMinuteUnit(roundedMins)}`;
}

/**
 * Family presentation of a canonical countdown label.
 * Compact (systemSmall): omit the "mins" suffix only when an hours component
 * is already present ("7 hours 55 mins" → "7 hours 55"). Minutes-only labels
 * keep the unit ("55 mins"). Timing/timeline remain canonical.
 */
export function presentHomeWidgetCountdownLabel(
  label: string,
  options?: { compactMinutesWithHours?: boolean },
): string {
  const trimmed = label.trim();
  if (!options?.compactMinutesWithHours) return trimmed;
  const match = /^(\d+ hours?) (\d+) mins$/i.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1]} ${match[2]}`;
}

function nextSubDayLabelChangeMs(
  remainingMs: number,
  boundaryMs: number,
  nowMs: number,
): number {
  const totalMinutes = Math.floor(remainingMs / MIN_MS);
  if (totalMinutes < 60) {
    const mins = remainingMs / MIN_MS;
    if (mins <= 5) return boundaryMs;
    const bucket = Math.floor(mins / 5) * 5;
    return Math.max(boundaryMs - bucket * MIN_MS, nowMs + MIN_MS);
  }
  const hours = Math.floor(totalMinutes / 60);
  const remMins = totalMinutes % 60;
  const roundedMins = Math.floor(remMins / 5) * 5;
  // First moment the displayed bucket would drop.
  const nextTotalMinutes =
    roundedMins === 0 ? hours * 60 - 1 : hours * 60 + roundedMins - 1;
  return Math.max(boundaryMs - nextTotalMinutes * MIN_MS, nowMs + MIN_MS);
}

/**
 * Compute widget countdown label.
 *
 * Far range (remaining >= 24h): calendar day distance → Tomorrow / N days
 * Final 24h: "N hours" | "N hours M mins" (5-minute minute buckets)
 * Final hour: "N mins" (5-minute buckets, min 5)
 * At/after boundary: Out now
 */
export function computeHomeWidgetCountdown(
  input: HomeWidgetCountdownInput,
): HomeWidgetCountdownResult | null {
  const now = resolveNow(input.now);
  const timeZone = resolveTimeZone(input.timeZone);
  const boundaryMs = resolveHomeWidgetBoundaryMs(input);
  if (boundaryMs == null) return null;

  const remainingMs = boundaryMs - now.getTime();
  const outNowUntilMs = outNowRetentionEndMs(boundaryMs);
  if (remainingMs <= 0) {
    const expired = now.getTime() >= outNowUntilMs;
    return {
      countdownLabel: "Out now",
      isOutNow: !expired,
      isRetentionExpired: expired,
      boundaryMs,
      outNowUntilMs,
      nextLabelChangeMs: expired ? null : outNowUntilMs,
    };
  }

  if (remainingMs < 24 * HOUR_MS) {
    return {
      countdownLabel: formatSubDayCountdownLabel(remainingMs),
      isOutNow: false,
      isRetentionExpired: false,
      boundaryMs,
      outNowUntilMs,
      nextLabelChangeMs: nextSubDayLabelChangeMs(
        remainingMs,
        boundaryMs,
        now.getTime(),
      ),
    };
  }

  const nowYmd = calendarYmdInTimeZone(now, timeZone);
  const boundaryYmd =
    input.timingMode === "midnight"
      ? input.releaseCalendarDate?.trim() || null
      : calendarYmdInTimeZone(boundaryMs, timeZone);
  if (!nowYmd || !boundaryYmd) return null;
  const dayDiff = wholeCalendarDayDifference(nowYmd, boundaryYmd);
  if (dayDiff == null) return null;

  if (dayDiff <= 0) {
    return {
      countdownLabel: formatSubDayCountdownLabel(remainingMs),
      isOutNow: false,
      isRetentionExpired: false,
      boundaryMs,
      outNowUntilMs,
      nextLabelChangeMs: nextSubDayLabelChangeMs(
        remainingMs,
        boundaryMs,
        now.getTime(),
      ),
    };
  }

  if (dayDiff === 1) {
    const hoursStart = boundaryMs - 24 * HOUR_MS;
    return {
      countdownLabel: "Tomorrow",
      isOutNow: false,
      isRetentionExpired: false,
      boundaryMs,
      outNowUntilMs,
      nextLabelChangeMs: Math.max(hoursStart, now.getTime() + MIN_MS),
    };
  }

  const tomorrowYmdParts = parseHomeWidgetYmd(nowYmd);
  let nextLabelChangeMs: number | null = null;
  if (tomorrowYmdParts) {
    const nextDayUtc = Date.UTC(
      tomorrowYmdParts.y,
      tomorrowYmdParts.m - 1,
      tomorrowYmdParts.d + 1,
    );
    const nd = new Date(nextDayUtc);
    const nextYmd = `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}-${String(nd.getUTCDate()).padStart(2, "0")}`;
    nextLabelChangeMs = startOfCalendarDateInTimeZoneMs(nextYmd, timeZone);
  }
  const hoursStart = boundaryMs - 24 * HOUR_MS;
  if (hoursStart > now.getTime()) {
    nextLabelChangeMs =
      nextLabelChangeMs == null
        ? hoursStart
        : Math.min(nextLabelChangeMs, hoursStart);
  }

  return {
    countdownLabel: `${dayDiff} days`,
    isOutNow: false,
    isRetentionExpired: false,
    boundaryMs,
    outNowUntilMs,
    nextLabelChangeMs:
      nextLabelChangeMs != null
        ? Math.max(nextLabelChangeMs, now.getTime() + MIN_MS)
        : null,
  };
}
