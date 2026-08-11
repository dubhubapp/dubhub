/**
 * Server-authoritative future-release capacity view for the artist dashboard.
 * Counts eligible public future/coming-soon releases directly from `releases`;
 * does not trust client state. Does not call RevenueCat.
 */

import type { Pool } from "pg";
import { canArtistUsePaidTools } from "./artist-paid-tool-access";
import {
  FREE_ACTIVE_FUTURE_RELEASE_LIMIT,
  isEligiblePublicFuture,
  type ReleaseSuspensionRow,
} from "./future-release-suspension";
import type { SubscriptionEnvironment } from "./subscription-status-domain";
import type { SubscriptionSnapshotByEnvironment } from "./subscription-status-repository";

export type FutureReleaseCapacityView = {
  unlimited: boolean;
  /** null when unlimited (paid). */
  activeFutureLimit: number | null;
  activeFutureUsed: number;
  suspendedFutureCount: number;
};

export type GetFutureReleaseCapacityDeps = {
  pool: Pool;
  getSnapshotsForUser: (artistId: string) => Promise<SubscriptionSnapshotByEnvironment>;
  now?: () => Date;
  resolveEnvironment?: () =>
    | { environment: SubscriptionEnvironment; reason: string }
    | { environment: null; reason: string };
};

function mapRow(row: Record<string, unknown>): ReleaseSuspensionRow {
  return {
    id: String(row.id),
    isPublic: row.is_public === true || row.is_public === "t",
    isComingSoon: row.is_coming_soon === true || row.is_coming_soon === "t",
    releaseDate: (row.release_date as Date | string | null) ?? null,
    createdAt: (row.created_at as Date | string | null) ?? null,
    subscriptionSuspendedAt:
      (row.subscription_suspended_at as Date | string | null) ?? null,
    releaseTimingMode:
      (row.release_timing_mode as string | null | undefined) ?? null,
    releaseAt: (row.release_at as Date | string | null | undefined) ?? null,
  };
}

export async function getFutureReleaseCapacity(
  artistId: string,
  deps: GetFutureReleaseCapacityDeps,
): Promise<FutureReleaseCapacityView> {
  const now = deps.now?.() ?? new Date();

  const unlimited = await canArtistUsePaidTools(artistId, {
    getSnapshotsForUser: deps.getSnapshotsForUser,
    resolveEnvironment: deps.resolveEnvironment,
    now: () => now,
  });

  const result = await deps.pool.query(
    `SELECT id, is_public, is_coming_soon, release_date, created_at, subscription_suspended_at,
            release_timing_mode, release_at
     FROM releases
     WHERE artist_id = $1 AND is_public = true`,
    [artistId],
  );
  const eligible = result.rows
    .map(mapRow)
    .filter((r) => isEligiblePublicFuture(r, now));

  const activeFutureUsed = eligible.filter(
    (r) => r.subscriptionSuspendedAt == null,
  ).length;
  const suspendedFutureCount = eligible.filter(
    (r) => r.subscriptionSuspendedAt != null,
  ).length;

  return {
    unlimited,
    activeFutureLimit: unlimited ? null : FREE_ACTIVE_FUTURE_RELEASE_LIMIT,
    activeFutureUsed,
    suspendedFutureCount,
  };
}
