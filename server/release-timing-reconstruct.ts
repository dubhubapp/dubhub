/**
 * Server-authoritative Exact release_at reconstruction via Postgres AT TIME ZONE.
 *
 * (calendar_date::date + local_time::time) AT TIME ZONE iana
 * → timestamptz absolute instant using the zone's rules on that date (DST-aware).
 *
 * Ambiguous local times (fall-back overlap): Postgres interprets the wall time in
 * the named zone; the earlier occurrence is used (documented product rule).
 *
 * Nonexistent local times (spring-forward gap): detected by round-tripping the
 * reconstructed instant back to HH:mm in the same zone; mismatch → reject.
 */

import type { Pool } from "pg";
import {
  INVALID_RELEASE_LOCAL_TIME_CODE,
  INVALID_RELEASE_LOCAL_TIME_MESSAGE,
  INVALID_RELEASE_TIMEZONE_CODE,
  INVALID_RELEASE_TIMEZONE_MESSAGE,
} from "@shared/release-timing";

export type ReconstructExactReleaseAtResult =
  | { ok: true; releaseAt: Date }
  | {
      ok: false;
      status: 400;
      code:
        | typeof INVALID_RELEASE_TIMEZONE_CODE
        | typeof INVALID_RELEASE_LOCAL_TIME_CODE;
      message: string;
    };

export async function reconstructExactReleaseAt(
  args: {
    calendarDate: string;
    timeLocal: string;
    timezone: string;
  },
  deps: { pool: Pool },
): Promise<ReconstructExactReleaseAtResult> {
  const timezone = args.timezone.trim();

  try {
    const tzCheck = await deps.pool.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_timezone_names WHERE name = $1
       ) AS ok`,
      [timezone],
    );
    if (!tzCheck.rows[0]?.ok) {
      return {
        ok: false,
        status: 400,
        code: INVALID_RELEASE_TIMEZONE_CODE,
        message: INVALID_RELEASE_TIMEZONE_MESSAGE,
      };
    }

    const result = await deps.pool.query<{
      release_at: Date;
      roundtrip_local: string;
    }>(
      `SELECT
         (($1::date + $2::time) AT TIME ZONE $3) AS release_at,
         to_char(
           (($1::date + $2::time) AT TIME ZONE $3) AT TIME ZONE $3,
           'HH24:MI'
         ) AS roundtrip_local`,
      [args.calendarDate, args.timeLocal, timezone],
    );

    const row = result.rows[0];
    if (!row?.release_at) {
      return {
        ok: false,
        status: 400,
        code: INVALID_RELEASE_LOCAL_TIME_CODE,
        message: INVALID_RELEASE_LOCAL_TIME_MESSAGE,
      };
    }

    if (String(row.roundtrip_local) !== args.timeLocal) {
      return {
        ok: false,
        status: 400,
        code: INVALID_RELEASE_LOCAL_TIME_CODE,
        message: INVALID_RELEASE_LOCAL_TIME_MESSAGE,
      };
    }

    const releaseAt =
      row.release_at instanceof Date
        ? row.release_at
        : new Date(row.release_at);
    if (Number.isNaN(releaseAt.getTime())) {
      return {
        ok: false,
        status: 400,
        code: INVALID_RELEASE_LOCAL_TIME_CODE,
        message: INVALID_RELEASE_LOCAL_TIME_MESSAGE,
      };
    }

    return { ok: true, releaseAt };
  } catch (error) {
    console.error("[reconstructExactReleaseAt] Error:", error);
    return {
      ok: false,
      status: 400,
      code: INVALID_RELEASE_TIMEZONE_CODE,
      message: INVALID_RELEASE_TIMEZONE_MESSAGE,
    };
  }
}
