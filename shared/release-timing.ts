/**
 * Release timing domain — Midnight (calendar date) vs Exact (absolute instant).
 */

export const RELEASE_TIMING_MODE_MIDNIGHT = "midnight" as const;
export const RELEASE_TIMING_MODE_EXACT = "exact" as const;

export type ReleaseTimingMode =
  | typeof RELEASE_TIMING_MODE_MIDNIGHT
  | typeof RELEASE_TIMING_MODE_EXACT;

export const RELEASE_TIMING_MODE_INVALID_CODE =
  "RELEASE_TIMING_MODE_INVALID" as const;
export const RELEASE_TIMING_MODE_INVALID_MESSAGE =
  "release_timing_mode must be midnight or exact." as const;

export const RELEASE_TIMING_HYBRID_REJECTED_CODE =
  "RELEASE_TIMING_HYBRID_REJECTED" as const;
export const RELEASE_TIMING_HYBRID_REJECTED_MESSAGE =
  "Exact release time fields can't be combined with midnight or Coming Soon." as const;

export const RELEASE_AT_CLIENT_NOT_ACCEPTED_CODE =
  "RELEASE_AT_CLIENT_NOT_ACCEPTED" as const;
export const RELEASE_AT_CLIENT_NOT_ACCEPTED_MESSAGE =
  "release_at is server-derived and can't be set by the client." as const;

export const INVALID_RELEASE_TIMEZONE_CODE = "INVALID_RELEASE_TIMEZONE" as const;
export const INVALID_RELEASE_TIMEZONE_MESSAGE =
  "Choose a valid timezone for this release." as const;

export const INVALID_RELEASE_LOCAL_TIME_CODE =
  "INVALID_RELEASE_LOCAL_TIME" as const;
export const INVALID_RELEASE_LOCAL_TIME_MESSAGE =
  "That time doesn’t exist in the selected timezone because the clocks change. Choose another time." as const;

export const EXACT_RELEASE_TIME_REQUIRED_CODE =
  "EXACT_RELEASE_TIME_REQUIRED" as const;
export const EXACT_RELEASE_TIME_REQUIRED_MESSAGE =
  "A release time and timezone are required for a specific release time." as const;

export const INVALID_RELEASE_DATE_CODE = "INVALID_RELEASE_DATE" as const;
export const INVALID_RELEASE_DATE_MESSAGE =
  "release_date must be a valid YYYY-MM-DD calendar date." as const;

export const INVALID_RELEASE_TIME_LOCAL_FORMAT_CODE =
  "INVALID_RELEASE_TIME_LOCAL_FORMAT" as const;
export const INVALID_RELEASE_TIME_LOCAL_FORMAT_MESSAGE =
  "release_time_local must be HH:mm (24-hour)." as const;

/** Post-live timing/status mutation rejected (PATCH). Distinct from RELEASE_LOCKED (detach). */
export const RELEASE_TIMING_LOCKED_CODE = "RELEASE_TIMING_LOCKED" as const;
export const RELEASE_TIMING_LOCKED_MESSAGE =
  "Release scheduling can't be changed after the release is live." as const;

/** Post-live title mutation rejected (PATCH). Distinct from RELEASE_TIMING_LOCKED. */
export const RELEASE_TITLE_LOCKED_CODE = "RELEASE_TITLE_LOCKED" as const;
export const RELEASE_TITLE_LOCKED_MESSAGE =
  "The release title can't be changed after the release is live." as const;

/**
 * True when a PATCH body attempts to mutate timing/status fields.
 * Includes snake_case + camelCase aliases accepted by the update route.
 * Does not treat title/artwork as timing.
 */
export function requestBodyAttemptsReleaseTimingMutation(
  body: Record<string, unknown>,
): boolean {
  return (
    body.is_coming_soon !== undefined ||
    body.release_date !== undefined ||
    body.release_timing_mode !== undefined ||
    body.releaseTimingMode !== undefined ||
    body.release_time_local !== undefined ||
    body.releaseTimeLocal !== undefined ||
    body.release_timezone !== undefined ||
    body.releaseTimezone !== undefined ||
    body.release_at !== undefined ||
    body.releaseAt !== undefined
  );
}

/** @deprecated Slice 1 fail-closed; Exact is enabled in Slice 2. Kept for older clients/tests. */
export const EXACT_RELEASE_TIME_NOT_ENABLED_CODE =
  "EXACT_RELEASE_TIME_NOT_ENABLED" as const;
export const EXACT_RELEASE_TIME_NOT_ENABLED_MESSAGE =
  "Specific release times aren't available yet." as const;

export type ReleaseTimingFields = {
  releaseTimingMode: ReleaseTimingMode;
  releaseAt: Date | string | null;
  releaseTimezone: string | null;
  releaseAnnouncedAt: Date | string | null;
};

export type MidnightTimingWrite = {
  releaseTimingMode: typeof RELEASE_TIMING_MODE_MIDNIGHT;
  releaseAt: null;
  releaseTimezone: null;
};

export const RELEASE_DATE_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const RELEASE_TIME_LOCAL_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isReleaseTimingMode(value: unknown): value is ReleaseTimingMode {
  return (
    value === RELEASE_TIMING_MODE_MIDNIGHT || value === RELEASE_TIMING_MODE_EXACT
  );
}

export function normalizeReleaseTimingMode(
  value: unknown,
): ReleaseTimingMode {
  if (value == null || value === "") return RELEASE_TIMING_MODE_MIDNIGHT;
  if (isReleaseTimingMode(value)) return value;
  const trimmed = String(value).trim().toLowerCase();
  if (trimmed === RELEASE_TIMING_MODE_MIDNIGHT) return RELEASE_TIMING_MODE_MIDNIGHT;
  if (trimmed === RELEASE_TIMING_MODE_EXACT) return RELEASE_TIMING_MODE_EXACT;
  return RELEASE_TIMING_MODE_MIDNIGHT;
}

export function mapReleaseTimingFields(row: {
  release_timing_mode?: unknown;
  releaseTimingMode?: unknown;
  release_at?: unknown;
  releaseAt?: unknown;
  release_timezone?: unknown;
  releaseTimezone?: unknown;
  release_announced_at?: unknown;
  releaseAnnouncedAt?: unknown;
}): ReleaseTimingFields {
  const modeRaw =
    row.release_timing_mode !== undefined
      ? row.release_timing_mode
      : row.releaseTimingMode;
  const atRaw = row.release_at !== undefined ? row.release_at : row.releaseAt;
  const tzRaw =
    row.release_timezone !== undefined
      ? row.release_timezone
      : row.releaseTimezone;
  const announcedRaw =
    row.release_announced_at !== undefined
      ? row.release_announced_at
      : row.releaseAnnouncedAt;

  return {
    releaseTimingMode: normalizeReleaseTimingMode(modeRaw),
    releaseAt: (atRaw as Date | string | null | undefined) ?? null,
    releaseTimezone:
      tzRaw == null || String(tzRaw).trim() === ""
        ? null
        : String(tzRaw).trim(),
    releaseAnnouncedAt:
      (announcedRaw as Date | string | null | undefined) ?? null,
  };
}

export function midnightTimingWrite(): MidnightTimingWrite {
  return {
    releaseTimingMode: RELEASE_TIMING_MODE_MIDNIGHT,
    releaseAt: null,
    releaseTimezone: null,
  };
}

export function parseReleaseCalendarDate(
  value: unknown,
): { ok: true; ymd: string } | { ok: false } {
  if (value == null) return { ok: false };
  const raw = String(value).trim();
  const ymd = raw.length >= 10 ? raw.slice(0, 10) : raw;
  if (!RELEASE_DATE_YMD_RE.test(ymd)) return { ok: false };
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { ok: false };
  }
  return { ok: true, ymd };
}

export function parseReleaseTimeLocal(
  value: unknown,
): { ok: true; hhmm: string } | { ok: false } {
  if (value == null) return { ok: false };
  const raw = String(value).trim();
  if (!RELEASE_TIME_LOCAL_RE.test(raw)) return { ok: false };
  return { ok: true, hhmm: raw };
}

/** Calendar date carrier as UTC midnight Date (legacy serialization). */
export function calendarDateToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function extractCalendarYmdFromReleaseDate(
  releaseDate: Date | string | null | undefined,
): string | null {
  if (releaseDate == null) return null;
  const d = releaseDate instanceof Date ? releaseDate : new Date(releaseDate);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Format an absolute instant as HH:mm in a given IANA timezone (24h).
 * Used for Exact edit hydration — never uses the device timezone.
 */
export function formatWallTimeInTimezone(
  releaseAt: Date | string,
  timeZone: string,
): string | null {
  const date = releaseAt instanceof Date ? releaseAt : new Date(releaseAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;
    if (hour == null || minute == null) return null;
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    return null;
  }
}

export type ReleaseTimingWriteErrorCode =
  | typeof RELEASE_TIMING_MODE_INVALID_CODE
  | typeof RELEASE_TIMING_HYBRID_REJECTED_CODE
  | typeof RELEASE_AT_CLIENT_NOT_ACCEPTED_CODE
  | typeof INVALID_RELEASE_TIMEZONE_CODE
  | typeof INVALID_RELEASE_LOCAL_TIME_CODE
  | typeof EXACT_RELEASE_TIME_REQUIRED_CODE
  | typeof INVALID_RELEASE_DATE_CODE
  | typeof INVALID_RELEASE_TIME_LOCAL_FORMAT_CODE;

export type ParsedReleaseTimingWrite =
  | {
      ok: true;
      kind: "omit";
    }
  | {
      ok: true;
      kind: "midnight";
    }
  | {
      ok: true;
      kind: "exact";
      calendarDate: string;
      timeLocal: string;
      timezone: string;
    }
  | {
      ok: false;
      status: 400;
      code: ReleaseTimingWriteErrorCode;
      message: string;
    };

function bodyMode(body: Record<string, unknown>): unknown {
  return body.release_timing_mode !== undefined
    ? body.release_timing_mode
    : body.releaseTimingMode;
}

function bodyTimezone(body: Record<string, unknown>): unknown {
  return body.release_timezone !== undefined
    ? body.release_timezone
    : body.releaseTimezone;
}

function bodyTimeLocal(body: Record<string, unknown>): unknown {
  return body.release_time_local !== undefined
    ? body.release_time_local
    : body.releaseTimeLocal;
}

function bodyReleaseAt(body: Record<string, unknown>): unknown {
  return body.release_at !== undefined ? body.release_at : body.releaseAt;
}

function hasNonEmpty(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

/**
 * Parse create/PATCH timing intent.
 * Legacy bodies with no timing keys → omit (preserve on PATCH / Midnight on create).
 * Client-supplied release_at is never accepted as authority.
 */
export function parseReleaseTimingWriteBody(
  body: Record<string, unknown>,
  args?: { calendarDateFallback?: string | null },
): ParsedReleaseTimingWrite {
  const modeRaw = bodyMode(body);
  const tzRaw = bodyTimezone(body);
  const timeRaw = bodyTimeLocal(body);
  const atRaw = bodyReleaseAt(body);

  const modeMentioned = modeRaw !== undefined;
  const tzMentioned = tzRaw !== undefined;
  const timeMentioned = timeRaw !== undefined;
  const atMentioned = atRaw !== undefined;

  if (!modeMentioned && !tzMentioned && !timeMentioned && !atMentioned) {
    return { ok: true, kind: "omit" };
  }

  if (hasNonEmpty(atRaw)) {
    return {
      ok: false,
      status: 400,
      code: RELEASE_AT_CLIENT_NOT_ACCEPTED_CODE,
      message: RELEASE_AT_CLIENT_NOT_ACCEPTED_MESSAGE,
    };
  }

  let mode: ReleaseTimingMode = RELEASE_TIMING_MODE_MIDNIGHT;
  if (modeMentioned && modeRaw != null && modeRaw !== "") {
    const trimmed = String(modeRaw).trim().toLowerCase();
    if (
      trimmed !== RELEASE_TIMING_MODE_MIDNIGHT &&
      trimmed !== RELEASE_TIMING_MODE_EXACT
    ) {
      return {
        ok: false,
        status: 400,
        code: RELEASE_TIMING_MODE_INVALID_CODE,
        message: RELEASE_TIMING_MODE_INVALID_MESSAGE,
      };
    }
    mode = trimmed as ReleaseTimingMode;
  } else if (hasNonEmpty(tzRaw) || hasNonEmpty(timeRaw)) {
    // Time/zone without mode → treat as Exact intent.
    mode = RELEASE_TIMING_MODE_EXACT;
  }

  if (mode === RELEASE_TIMING_MODE_MIDNIGHT) {
    if (hasNonEmpty(tzRaw) || hasNonEmpty(timeRaw)) {
      return {
        ok: false,
        status: 400,
        code: RELEASE_TIMING_HYBRID_REJECTED_CODE,
        message: RELEASE_TIMING_HYBRID_REJECTED_MESSAGE,
      };
    }
    return { ok: true, kind: "midnight" };
  }

  const dateSource =
    body.release_date !== undefined
      ? body.release_date
      : args?.calendarDateFallback ?? null;
  const dateParsed = parseReleaseCalendarDate(dateSource);
  if (!dateParsed.ok) {
    return {
      ok: false,
      status: 400,
      code: INVALID_RELEASE_DATE_CODE,
      message: INVALID_RELEASE_DATE_MESSAGE,
    };
  }

  if (!hasNonEmpty(timeRaw) || !hasNonEmpty(tzRaw)) {
    return {
      ok: false,
      status: 400,
      code: EXACT_RELEASE_TIME_REQUIRED_CODE,
      message: EXACT_RELEASE_TIME_REQUIRED_MESSAGE,
    };
  }

  const timeParsed = parseReleaseTimeLocal(timeRaw);
  if (!timeParsed.ok) {
    return {
      ok: false,
      status: 400,
      code: INVALID_RELEASE_TIME_LOCAL_FORMAT_CODE,
      message: INVALID_RELEASE_TIME_LOCAL_FORMAT_MESSAGE,
    };
  }

  const timezone = String(tzRaw).trim();
  if (!timezone.includes("/")) {
    return {
      ok: false,
      status: 400,
      code: INVALID_RELEASE_TIMEZONE_CODE,
      message: INVALID_RELEASE_TIMEZONE_MESSAGE,
    };
  }

  return {
    ok: true,
    kind: "exact",
    calendarDate: dateParsed.ymd,
    timeLocal: timeParsed.hhmm,
    timezone,
  };
}

/** @deprecated Use parseReleaseTimingWriteBody. */
export function evaluateReleaseTimingWriteRequest(
  body: Record<string, unknown>,
):
  | { ok: true; timingMentioned: boolean }
  | {
      ok: false;
      status: 400;
      code: ReleaseTimingWriteErrorCode;
      message: string;
    } {
  const parsed = parseReleaseTimingWriteBody(body);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    timingMentioned: parsed.kind !== "omit",
  };
}
