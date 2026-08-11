/**
 * Human-readable timezone presentation for Exact release time UX.
 * Location-first; UTC offsets derived for the selected release date/time via Intl.
 */

import {
  findReleaseTimezoneOption,
  formatReleaseTimezoneLocation,
} from "@/lib/release-timezone-options";

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function parseHhmm(hhmm: string): { h: number; min: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return { h: Number(m[1]), min: Number(m[2]) };
}

function zonedParts(instantMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
  };
}

/**
 * Approximate the UTC instant for a civil wall time in an IANA zone.
 * Presentation-only — server Postgres reconstruction remains authoritative for release_at.
 */
export function approximateInstantForZonedWallTime(args: {
  timeZone: string;
  releaseDateYmd: string;
  timeLocalHhmm?: string;
}): Date | null {
  const ymd = parseYmd(args.releaseDateYmd);
  const wall = parseHhmm(args.timeLocalHhmm || "12:00");
  if (!ymd || !wall) return null;

  let guess = Date.UTC(ymd.y, ymd.m - 1, ymd.d, wall.h, wall.min, 0);
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(guess, args.timeZone);
    if (
      [parts.y, parts.m, parts.d, parts.h, parts.min].some((n) => Number.isNaN(n))
    ) {
      return null;
    }
    const asUtc = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.min, 0);
    const desired = Date.UTC(ymd.y, ymd.m - 1, ymd.d, wall.h, wall.min, 0);
    const delta = desired - asUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

function normalizeShortOffset(raw: string): string {
  const cleaned = raw.replace(/^GMT/i, "UTC").replace(/^UTC/i, "UTC");
  const m = /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(cleaned.replace(/\s+/g, ""));
  if (!m) {
    if (/^UTC$/i.test(cleaned.replace(/\s+/g, ""))) return "UTC+0";
    return cleaned;
  }
  const sign = m[1];
  const hours = Number(m[2]);
  const mins = m[3] ? Number(m[3]) : 0;
  if (mins === 0) return `UTC${sign}${hours}`;
  return `UTC${sign}${hours}:${String(mins).padStart(2, "0")}`;
}

/**
 * UTC offset label for an IANA zone on the selected release date/time.
 * Examples: UTC+0, UTC+1, UTC-4, UTC-5.
 *
 * Uses the selected IANA zone + release civil time only — never Date.now() and
 * never the device's local timezone getters. Device/simulator TZ must not change
 * the offset for a fixed IANA + date pair.
 */
export function formatUtcOffsetForRelease(args: {
  timeZone: string;
  releaseDateYmd: string;
  timeLocalHhmm?: string;
}): string {
  const ymd = args.releaseDateYmd?.trim() || "2026-06-15";
  const instant =
    approximateInstantForZonedWallTime({
      timeZone: args.timeZone,
      releaseDateYmd: ymd,
      timeLocalHhmm: args.timeLocalHhmm || "12:00",
    }) ||
    // Noon UTC on the calendar date is almost always in the correct DST era.
    new Date(`${ymd}T12:00:00.000Z`);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: args.timeZone,
      timeZoneName: "longOffset",
      hour: "numeric",
    }).formatToParts(instant);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name) return normalizeShortOffset(name.replace(/GMT/gi, "UTC"));
  } catch {
    /* fall through */
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: args.timeZone,
      timeZoneName: "shortOffset",
      hour: "numeric",
    }).formatToParts(instant);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name) return normalizeShortOffset(name);
  } catch {
    /* ignore */
  }

  return "UTC";
}

/** Concept label (Pacific Time / UK Time) — secondary/search only. */
export function formatReleaseTimezoneLabel(args: {
  timeZone: string;
  releaseDateYmd: string;
  locale?: string;
}): string {
  const curated = findReleaseTimezoneOption(args.timeZone);
  if (curated?.label) return curated.label;
  return formatUtcOffsetForRelease(args);
}

/** Selected Exact timezone control / summary: "18:00 · London · UTC+1". */
export function formatExactReleaseTimeDisplay(args: {
  timeLocalHhmm: string;
  timeZone: string;
  releaseDateYmd: string;
  locale?: string;
}): string {
  const locale =
    args.locale ||
    (typeof navigator !== "undefined" ? navigator.language : "en-GB");
  const option = findReleaseTimezoneOption(args.timeZone);
  const city = option?.city || args.timeZone;
  const offset = formatUtcOffsetForRelease({
    timeZone: args.timeZone,
    releaseDateYmd: args.releaseDateYmd,
    timeLocalHhmm: args.timeLocalHhmm,
  });

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(args.timeLocalHhmm.trim());
  if (!match) return `${args.timeLocalHhmm} · ${city} · ${offset}`;

  const hours = Number(match[1]);
  const minutes = match[2];
  const probe = new Date(Date.UTC(2020, 0, 1, hours, Number(minutes)));
  const formatted = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(probe);

  return `${formatted} · ${city} · ${offset}`;
}

/** Picker secondary line: "UTC+1 · UK Time". */
export function formatTimezonePickerSecondary(args: {
  timeZone: string;
  releaseDateYmd: string;
  timeLocalHhmm?: string;
  conceptLabel?: string | null;
}): string {
  const offset = formatUtcOffsetForRelease({
    timeZone: args.timeZone,
    releaseDateYmd: args.releaseDateYmd,
    timeLocalHhmm: args.timeLocalHhmm,
  });
  const concept =
    args.conceptLabel ||
    findReleaseTimezoneOption(args.timeZone)?.label ||
    null;
  return concept ? `${offset} · ${concept}` : offset;
}

export function formatTimezonePickerPrimary(timeZone: string): string {
  const option = findReleaseTimezoneOption(timeZone);
  if (option) return formatReleaseTimezoneLocation(option);
  return timeZone;
}

export function prefersHour12(locale?: string): boolean {
  const loc =
    locale ||
    (typeof navigator !== "undefined" ? navigator.language : "en-GB");
  try {
    const opts = new Intl.DateTimeFormat(loc, {
      hour: "numeric",
    }).resolvedOptions();
    return opts.hour12 === true;
  } catch {
    return false;
  }
}
