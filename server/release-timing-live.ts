/**
 * Server-authoritative Exact / Midnight live boundaries.
 * Exact: release_at instant. Midnight: UTC calendar day of release_date (artist-management SQL).
 * Not viewer-local midnight — that remains client/widget with viewerTimeZone.
 *
 * Owner mutation freeze (timing PATCH + detach) uses Instant(release_date) for Midnight —
 * the same absolute predicate — not feed UTC-calendar-day buckets.
 */

import { sql, type SQL } from "drizzle-orm";
import {
  normalizeReleaseTimingMode,
  RELEASE_TIMING_MODE_EXACT,
} from "@shared/release-timing";

export function parseReleaseInstant(
  value: Date | string | null | undefined,
): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** YYYY-MM-DD in UTC. */
export function serverUtcCalendarYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type ServerReleaseLiveInput = {
  isComingSoon?: boolean | null;
  releaseTimingMode?: unknown;
  releaseDate?: Date | string | null;
  releaseAt?: Date | string | null;
};

/**
 * Server-authoritative "release is live" for owner mutation locks
 * (timing/status PATCH immutability and post-live detach).
 *
 * Exact: now >= release_at (requires release_at).
 * Midnight: now >= Instant(release_date) (UTC carrier; no viewer TZ).
 * Coming Soon: never live.
 */
export function isServerReleaseLiveForMutation(
  release: ServerReleaseLiveInput,
  now: Date = new Date(),
): boolean {
  if (release.isComingSoon) return false;
  const mode = normalizeReleaseTimingMode(release.releaseTimingMode);
  if (mode === RELEASE_TIMING_MODE_EXACT) {
    const at = parseReleaseInstant(release.releaseAt);
    if (at) return now.getTime() >= at.getTime();
    return false;
  }
  const date = parseReleaseInstant(release.releaseDate);
  if (!date) return false;
  return date.getTime() <= now.getTime();
}

/**
 * Detach lock — same live predicate as timing immutability.
 * Prefer isServerReleaseLiveForMutation for new call sites.
 */
export function isServerDetachLocked(
  release: ServerReleaseLiveInput,
  now: Date = new Date(),
): boolean {
  return isServerReleaseLiveForMutation(release, now);
}

/** True when the release still counts as pre-live / upcoming for server buckets. */
export function isServerReleaseUpcoming(
  release: ServerReleaseLiveInput,
  now: Date = new Date(),
): boolean {
  if (release.isComingSoon) return true;
  const mode = normalizeReleaseTimingMode(release.releaseTimingMode);
  if (mode === RELEASE_TIMING_MODE_EXACT) {
    const at = parseReleaseInstant(release.releaseAt);
    if (at) return now.getTime() < at.getTime();
  }
  const date = parseReleaseInstant(release.releaseDate);
  if (!date) return false;
  return serverUtcCalendarYmd(date) >= serverUtcCalendarYmd(now);
}

/**
 * Feed / discography / attach-modal upcoming predicate.
 * Exact: release_at > NOW(). Midnight: UTC calendar date >= today.
 */
export const sqlReleaseFeedUpcoming: SQL = sql`(
  (r.release_date IS NULL AND r.is_coming_soon = true)
  OR (
    COALESCE(r.release_timing_mode, 'midnight') = 'exact'
    AND r.release_at IS NOT NULL
    AND r.release_at > NOW()
  )
  OR (
    COALESCE(r.release_timing_mode, 'midnight') = 'exact'
    AND r.release_at IS NULL
    AND r.release_date IS NOT NULL
    AND ((r.release_date AT TIME ZONE 'UTC')::date >= (NOW() AT TIME ZONE 'UTC')::date)
  )
  OR (
    COALESCE(r.release_timing_mode, 'midnight') <> 'exact'
    AND r.release_date IS NOT NULL
    AND ((r.release_date AT TIME ZONE 'UTC')::date >= (NOW() AT TIME ZONE 'UTC')::date)
  )
)`;

/**
 * Feed / discography past predicate.
 * Exact: release_at <= NOW(). Midnight: UTC calendar date < today.
 */
export const sqlReleaseFeedPast: SQL = sql`(
  r.release_date IS NOT NULL
  AND COALESCE(r.is_coming_soon, false) = false
  AND (
    (
      COALESCE(r.release_timing_mode, 'midnight') = 'exact'
      AND r.release_at IS NOT NULL
      AND r.release_at <= NOW()
    )
    OR (
      COALESCE(r.release_timing_mode, 'midnight') = 'exact'
      AND r.release_at IS NULL
      AND ((r.release_date AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date)
    )
    OR (
      COALESCE(r.release_timing_mode, 'midnight') <> 'exact'
      AND ((r.release_date AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date)
    )
  )
)`;
