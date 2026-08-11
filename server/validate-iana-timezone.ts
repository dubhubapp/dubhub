/**
 * Validate IANA timezone names via PostgreSQL pg_timezone_names (authoritative).
 */

import type { Pool } from "pg";
import {
  INVALID_RELEASE_TIMEZONE_CODE,
  INVALID_RELEASE_TIMEZONE_MESSAGE,
} from "@shared/release-timing";

export async function validateIanaTimezoneName(
  timezone: string,
  pool: Pool,
): Promise<
  | { ok: true; timezone: string }
  | { ok: false; code: typeof INVALID_RELEASE_TIMEZONE_CODE; message: string }
> {
  const trimmed = timezone.trim();
  if (!trimmed || !trimmed.includes("/")) {
    return {
      ok: false,
      code: INVALID_RELEASE_TIMEZONE_CODE,
      message: INVALID_RELEASE_TIMEZONE_MESSAGE,
    };
  }
  const tzCheck = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_timezone_names WHERE name = $1
     ) AS ok`,
    [trimmed],
  );
  if (!tzCheck.rows[0]?.ok) {
    return {
      ok: false,
      code: INVALID_RELEASE_TIMEZONE_CODE,
      message: INVALID_RELEASE_TIMEZONE_MESSAGE,
    };
  }
  return { ok: true, timezone: trimmed };
}
