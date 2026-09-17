/**
 * Authoritative 13+ date-of-birth validation (calendar DATE, not timestamp).
 *
 * Date basis: UTC calendar date of "today" vs UTC-parsed DOB components.
 * DOB is treated as a civil date (YYYY-MM-DD) with no timezone conversion of the
 * birth moment — only the Y/M/D integers matter.
 *
 * Leap-day rule: DOB 02-29 in a non-leap "today" year uses anniversary March 1 UTC
 * (conservative: birthday is not treated as having occurred on Feb 28).
 */

export const MINIMUM_AGE_YEARS = 13 as const;
export const MAX_PLAUSIBLE_AGE_YEARS = 120 as const;

export const AGE_GATE_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AgeGateInvalidReason =
  | "invalid_format"
  | "invalid_calendar_date"
  | "future_date"
  | "implausible_age";

export type AgeGateEvaluateResult =
  | {
      valid: true;
      eligible: true;
      /** Internal only — never send to clients. */
      ageYears: number;
      normalizedDob: string;
    }
  | {
      valid: true;
      eligible: false;
      ageYears: number;
      normalizedDob: string;
      reason: "minimum_age_not_met";
    }
  | {
      valid: false;
      eligible: false;
      reason: AgeGateInvalidReason;
    };

export type AgeGateClientCode =
  | "minimum_age_not_met"
  | "invalid_date_of_birth";

/** Map internal evaluate result to client-safe code (no age / DOB). */
export function ageGateClientCode(
  result: AgeGateEvaluateResult,
): AgeGateClientCode | null {
  if (result.valid && result.eligible) return null;
  if (result.valid && !result.eligible) return "minimum_age_not_met";
  return "invalid_date_of_birth";
}

export function isLeapYearUtc(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonthUtc(year: number, month1to12: number): number {
  if (month1to12 < 1 || month1to12 > 12) return 0;
  if (month1to12 === 2) return isLeapYearUtc(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month1to12)) return 30;
  return 31;
}

/**
 * Strict YYYY-MM-DD calendar parse. Rejects JS Date rollover (e.g. 2026-02-30).
 */
export function parseStrictCalendarDate(
  value: unknown,
): { ok: true; ymd: string; year: number; month: number; day: number } | { ok: false; reason: "invalid_format" | "invalid_calendar_date" } {
  if (typeof value !== "string") {
    return { ok: false, reason: "invalid_format" };
  }
  const raw = value.trim();
  const match = AGE_GATE_YMD_RE.exec(raw);
  if (!match) {
    return { ok: false, reason: "invalid_format" };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return { ok: false, reason: "invalid_format" };
  }
  if (month < 1 || month > 12) {
    return { ok: false, reason: "invalid_calendar_date" };
  }
  const dim = daysInMonthUtc(year, month);
  if (day < 1 || day > dim) {
    return { ok: false, reason: "invalid_calendar_date" };
  }
  const ymd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { ok: true, ymd, year, month, day };
}

/** UTC Y/M/D of an instant (defaults to Date.now()). */
export function utcCalendarParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };
}

/**
 * Anniversary (month, day) in `inYear` for a birth date.
 * Feb 29 → March 1 when `inYear` is not a leap year.
 */
export function ageAnniversaryInYear(
  birthMonth: number,
  birthDay: number,
  inYear: number,
): { month: number; day: number } {
  if (birthMonth === 2 && birthDay === 29 && !isLeapYearUtc(inYear)) {
    return { month: 3, day: 1 };
  }
  return { month: birthMonth, day: birthDay };
}

function hasReachedAnniversary(
  todayYear: number,
  todayMonth: number,
  todayDay: number,
  birthMonth: number,
  birthDay: number,
): boolean {
  const ann = ageAnniversaryInYear(birthMonth, birthDay, todayYear);
  if (todayMonth > ann.month) return true;
  if (todayMonth < ann.month) return false;
  return todayDay >= ann.day;
}

/**
 * Exact whole-year age on the UTC calendar date of `now`.
 * Caller must pass an already-validated calendar DOB.
 */
export function exactAgeYearsUtc(
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  now: Date = new Date(),
): number {
  const today = utcCalendarParts(now);
  let age = today.year - birthYear;
  if (!hasReachedAnniversary(today.year, today.month, today.day, birthMonth, birthDay)) {
    age -= 1;
  }
  return age;
}

/**
 * Evaluate DOB for 13+ eligibility. Age is internal-only.
 */
export function evaluateDateOfBirth(
  dateOfBirth: unknown,
  now: Date = new Date(),
): AgeGateEvaluateResult {
  const parsed = parseStrictCalendarDate(dateOfBirth);
  if (!parsed.ok) {
    return { valid: false, eligible: false, reason: parsed.reason };
  }

  const today = utcCalendarParts(now);
  const birthBeforeOrOnToday =
    parsed.year < today.year ||
    (parsed.year === today.year && parsed.month < today.month) ||
    (parsed.year === today.year &&
      parsed.month === today.month &&
      parsed.day <= today.day);

  if (!birthBeforeOrOnToday) {
    return { valid: false, eligible: false, reason: "future_date" };
  }

  const ageYears = exactAgeYearsUtc(
    parsed.year,
    parsed.month,
    parsed.day,
    now,
  );

  if (ageYears > MAX_PLAUSIBLE_AGE_YEARS) {
    return { valid: false, eligible: false, reason: "implausible_age" };
  }

  // Negative age should be unreachable after future_date check; treat as invalid.
  if (ageYears < 0) {
    return { valid: false, eligible: false, reason: "future_date" };
  }

  if (ageYears < MINIMUM_AGE_YEARS) {
    return {
      valid: true,
      eligible: false,
      ageYears,
      normalizedDob: parsed.ymd,
      reason: "minimum_age_not_met",
    };
  }

  return {
    valid: true,
    eligible: true,
    ageYears,
    normalizedDob: parsed.ymd,
  };
}
