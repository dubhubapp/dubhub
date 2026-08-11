/**
 * Shared helpers to resolve create/PATCH release timing writes (Slice 2).
 */

import {
  calendarDateToUtcMidnight,
  extractCalendarYmdFromReleaseDate,
  formatWallTimeInTimezone,
  parseReleaseTimingWriteBody,
  type ReleaseTimingWriteErrorCode,
} from "@shared/release-timing";
import { reconstructExactReleaseAt } from "./release-timing-reconstruct";
import type { Pool } from "pg";

export type ResolvedReleaseTimingWrite =
  | {
      ok: true;
      isComingSoon: boolean;
      releaseDate: Date | null;
      releaseTimingMode: "midnight" | "exact";
      releaseAt: Date | null;
      releaseTimezone: string | null;
    }
  | {
      ok: false;
      status: 400;
      code: ReleaseTimingWriteErrorCode;
      message: string;
    };

export async function resolveReleaseTimingForCreate(args: {
  body: Record<string, unknown>;
  comingSoon: boolean;
  /** Parsed calendar date when not coming soon (YYYY-MM-DD or null). */
  legacyReleaseDateYmd: string | null;
  pool: Pool;
}): Promise<ResolvedReleaseTimingWrite> {
  if (args.comingSoon) {
    return {
      ok: true,
      isComingSoon: true,
      releaseDate: null,
      releaseTimingMode: "midnight",
      releaseAt: null,
      releaseTimezone: null,
    };
  }

  const parsed = parseReleaseTimingWriteBody(args.body, {
    calendarDateFallback: args.legacyReleaseDateYmd,
  });
  if (!parsed.ok) return parsed;

  if (parsed.kind === "omit" || parsed.kind === "midnight") {
    if (!args.legacyReleaseDateYmd) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_RELEASE_DATE",
        message: "release_date is required unless coming soon",
      };
    }
    return {
      ok: true,
      isComingSoon: false,
      releaseDate: calendarDateToUtcMidnight(args.legacyReleaseDateYmd),
      releaseTimingMode: "midnight",
      releaseAt: null,
      releaseTimezone: null,
    };
  }

  const reconstructed = await reconstructExactReleaseAt(
    {
      calendarDate: parsed.calendarDate,
      timeLocal: parsed.timeLocal,
      timezone: parsed.timezone,
    },
    { pool: args.pool },
  );
  if (!reconstructed.ok) return reconstructed;

  return {
    ok: true,
    isComingSoon: false,
    releaseDate: calendarDateToUtcMidnight(parsed.calendarDate),
    releaseTimingMode: "exact",
    releaseAt: reconstructed.releaseAt,
    releaseTimezone: parsed.timezone,
  };
}

export async function resolveReleaseTimingForUpdate(args: {
  body: Record<string, unknown>;
  comingSoon: boolean | undefined;
  /** When body includes release_date (including null). */
  releaseDateProvided: boolean;
  legacyReleaseDateYmd: string | null;
  current: {
    isComingSoon: boolean;
    releaseDate: Date | string | null;
    releaseTimingMode?: string | null;
    releaseAt?: Date | string | null;
    releaseTimezone?: string | null;
  };
  pool: Pool;
}): Promise<ResolvedReleaseTimingWrite> {
  const nextComing =
    args.comingSoon !== undefined
      ? args.comingSoon
      : !!args.current.isComingSoon;

  if (nextComing) {
    return {
      ok: true,
      isComingSoon: true,
      releaseDate: null,
      releaseTimingMode: "midnight",
      releaseAt: null,
      releaseTimezone: null,
    };
  }

  const currentYmd = extractCalendarYmdFromReleaseDate(args.current.releaseDate);
  const fallbackYmd = args.releaseDateProvided
    ? args.legacyReleaseDateYmd
    : args.legacyReleaseDateYmd ?? currentYmd;

  const parsed = parseReleaseTimingWriteBody(args.body, {
    calendarDateFallback: fallbackYmd,
  });
  if (!parsed.ok) return parsed;

  if (parsed.kind === "midnight") {
    const ymd = args.releaseDateProvided
      ? args.legacyReleaseDateYmd
      : args.legacyReleaseDateYmd ?? currentYmd;
    if (!ymd) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_RELEASE_DATE",
        message: "release_date is required unless coming soon",
      };
    }
    return {
      ok: true,
      isComingSoon: false,
      releaseDate: calendarDateToUtcMidnight(ymd),
      releaseTimingMode: "midnight",
      releaseAt: null,
      releaseTimezone: null,
    };
  }

  if (parsed.kind === "exact") {
    const reconstructed = await reconstructExactReleaseAt(
      {
        calendarDate: parsed.calendarDate,
        timeLocal: parsed.timeLocal,
        timezone: parsed.timezone,
      },
      { pool: args.pool },
    );
    if (!reconstructed.ok) return reconstructed;
    return {
      ok: true,
      isComingSoon: false,
      releaseDate: calendarDateToUtcMidnight(parsed.calendarDate),
      releaseTimingMode: "exact",
      releaseAt: reconstructed.releaseAt,
      releaseTimezone: parsed.timezone,
    };
  }

  // omit timing keys — preserve or recompute Exact on date-only change
  const ymd = args.releaseDateProvided
    ? args.legacyReleaseDateYmd
    : currentYmd;
  if (!ymd) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_RELEASE_DATE",
      message: "release_date is required unless coming soon",
    };
  }

  if (args.current.releaseTimingMode === "exact") {
    const timezone = args.current.releaseTimezone;
    if (!timezone || !args.current.releaseAt) {
      return {
        ok: true,
        isComingSoon: false,
        releaseDate: calendarDateToUtcMidnight(ymd),
        releaseTimingMode: "midnight",
        releaseAt: null,
        releaseTimezone: null,
      };
    }
    const wall = formatWallTimeInTimezone(args.current.releaseAt, timezone);
    if (!wall) {
      return {
        ok: false,
        status: 400,
        code: "EXACT_RELEASE_TIME_REQUIRED",
        message: "A release time and timezone are required for a specific release time.",
      };
    }
    const reconstructed = await reconstructExactReleaseAt(
      { calendarDate: ymd, timeLocal: wall, timezone },
      { pool: args.pool },
    );
    if (!reconstructed.ok) return reconstructed;
    return {
      ok: true,
      isComingSoon: false,
      releaseDate: calendarDateToUtcMidnight(ymd),
      releaseTimingMode: "exact",
      releaseAt: reconstructed.releaseAt,
      releaseTimezone: timezone,
    };
  }

  return {
    ok: true,
    isComingSoon: false,
    releaseDate: calendarDateToUtcMidnight(ymd),
    releaseTimingMode: "midnight",
    releaseAt: null,
    releaseTimezone: null,
  };
}
