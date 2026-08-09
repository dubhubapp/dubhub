/**
 * Server-authoritative release creation capacity for the Create Release UI.
 * Counts artist_release_creation_ledger only; does not trust client state.
 */

import type { Pool } from "pg";
import { canArtistUsePaidTools } from "./artist-paid-tool-access";
import type { SubscriptionEnvironment } from "./subscription-status-domain";
import {
  FREE_RELEASE_LIMIT,
  getReleaseLimitRollingWindow,
  isReleaseLimitEnforcementEnabled,
} from "./release-creation-limit";
import type { SubscriptionSnapshotByEnvironment } from "./subscription-status-repository";

export type ReleaseCreationCapacityView = {
  unlimited: boolean;
  used: number;
  limit: typeof FREE_RELEASE_LIMIT;
  remaining: number;
  canCreate: boolean;
};

export type GetReleaseCreationCapacityDeps = {
  pool: Pool;
  getSnapshotsForUser: (artistId: string) => Promise<SubscriptionSnapshotByEnvironment>;
  now?: () => Date;
  enforcementEnabled?: boolean;
  resolveEnvironment?: () =>
    | { environment: SubscriptionEnvironment; reason: string }
    | { environment: null; reason: string };
};

export async function getReleaseCreationCapacity(
  artistId: string,
  deps: GetReleaseCreationCapacityDeps,
): Promise<ReleaseCreationCapacityView> {
  const now = deps.now?.() ?? new Date();
  const enforcementEnabled =
    deps.enforcementEnabled ?? isReleaseLimitEnforcementEnabled();
  const window = getReleaseLimitRollingWindow(now);

  const countResult = await deps.pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM artist_release_creation_ledger
     WHERE artist_id = $1
       AND created_at >= $2
       AND created_at <= $3`,
    [artistId, window.start, window.end],
  );
  const used = Math.max(0, countResult.rows[0]?.c ?? 0);
  const limit = FREE_RELEASE_LIMIT;
  const remaining = Math.max(0, limit - used);

  const unlimited = await canArtistUsePaidTools(artistId, {
    getSnapshotsForUser: deps.getSnapshotsForUser,
    resolveEnvironment: deps.resolveEnvironment,
    now: () => now,
  });

  const canCreate =
    !enforcementEnabled || unlimited || used < limit;

  return {
    unlimited,
    used,
    limit,
    remaining,
    canCreate,
  };
}
