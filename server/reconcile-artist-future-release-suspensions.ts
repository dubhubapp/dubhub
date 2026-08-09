/**
 * Atomic artist-scoped future-release suspension reconcile.
 * Does not call RevenueCat. Does not send notifications.
 */

import type { Pool, PoolClient } from "pg";
import {
  FUTURE_RELEASE_SUSPENSION_ADVISORY_LOCK_SEED,
  FUTURE_RELEASE_SUSPENSION_REASON,
  FREE_ACTIVE_FUTURE_RELEASE_LIMIT,
  classifyAccessForSuspensionReconcile,
  isFutureReleaseSuspensionEnforcementEnabled,
  planPaidRestore,
  planUnpaidReconcile,
  type ReleaseSuspensionRow,
} from "./future-release-suspension";
import {
  getEffectivePaidAccess,
  getSnapshotFreshness,
  type ArtistSubscriptionSnapshot,
} from "./subscription-status-domain";
import {
  resolveServerSubscriptionEnvironment,
  type CanArtistUsePaidToolsDeps,
} from "./artist-paid-tool-access";
import type { SubscriptionSnapshotByEnvironment } from "./subscription-status-repository";

export type FutureReleaseReconcileOutcome =
  | "enforcement_disabled"
  | "no_write"
  | "restored"
  | "reconciled_unpaid"
  | "noop_unpaid"
  | "failed";

export type FutureReleaseReconcileResult = {
  outcome: FutureReleaseReconcileOutcome;
  accessCategory: "confirmed_paid" | "confirmed_unpaid" | "no_write" | "disabled";
  suspendedCount: number;
  restoredCount: number;
  promotedCount: number;
};

export type ReconcileArtistFutureReleaseSuspensionsDeps = {
  pool: Pool;
  getSnapshotsForUser: (artistId: string) => Promise<SubscriptionSnapshotByEnvironment>;
  resolveEnvironment?: CanArtistUsePaidToolsDeps["resolveEnvironment"];
  now?: () => Date;
  enforcementEnabled?: boolean;
  /** When set, skip snapshot lookup and force this access category (tests / promotion-only). */
  accessCategoryOverride?: "confirmed_paid" | "confirmed_unpaid" | "no_write";
  /**
   * When unpaid and over capacity after freeze, suspend these IDs first
   * (e.g. a release that just became public).
   */
  preferSuspendIds?: string[];
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
  };
}

async function loadArtistReleases(
  client: PoolClient,
  artistId: string,
): Promise<ReleaseSuspensionRow[]> {
  const result = await client.query(
    `SELECT id, is_public, is_coming_soon, release_date, created_at, subscription_suspended_at
     FROM releases
     WHERE artist_id = $1`,
    [artistId],
  );
  return result.rows.map(mapRow);
}

async function applySuspend(
  client: PoolClient,
  ids: string[],
  now: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await client.query(
    `UPDATE releases
     SET subscription_suspended_at = $1,
         subscription_suspension_reason = $2,
         updated_at = $1
     WHERE id = ANY($3::uuid[])
       AND subscription_suspended_at IS NULL`,
    [now, FUTURE_RELEASE_SUSPENSION_REASON, ids],
  );
  return result.rowCount ?? 0;
}

async function applyClearSuspension(
  client: PoolClient,
  ids: string[],
  now: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await client.query(
    `UPDATE releases
     SET subscription_suspended_at = NULL,
         subscription_suspension_reason = NULL,
         updated_at = $1
     WHERE id = ANY($2::uuid[])
       AND subscription_suspended_at IS NOT NULL`,
    [now, ids],
  );
  return result.rowCount ?? 0;
}

function resolveAccessCategory(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date,
): "confirmed_paid" | "confirmed_unpaid" | "no_write" {
  const freshness = getSnapshotFreshness(snapshot, now);
  const hasPaid = getEffectivePaidAccess(snapshot, now).hasPaidToolAccess === true;
  return classifyAccessForSuspensionReconcile({
    freshness:
      freshness === "fresh" ? "fresh" : freshness === "stale" ? "stale" : "unknown",
    hasPaidToolAccess: hasPaid,
  });
}

/**
 * Reconcile one artist's future-release suspensions under an advisory lock.
 * Never holds the transaction across network I/O — snapshots are loaded first.
 */
export async function reconcileArtistFutureReleaseSuspensions(
  artistId: string,
  deps: ReconcileArtistFutureReleaseSuspensionsDeps,
): Promise<FutureReleaseReconcileResult> {
  const empty = (
    outcome: FutureReleaseReconcileOutcome,
    accessCategory: FutureReleaseReconcileResult["accessCategory"],
  ): FutureReleaseReconcileResult => ({
    outcome,
    accessCategory,
    suspendedCount: 0,
    restoredCount: 0,
    promotedCount: 0,
  });

  try {
    if (!artistId?.trim()) return empty("failed", "no_write");

    const enforcementEnabled =
      deps.enforcementEnabled ?? isFutureReleaseSuspensionEnforcementEnabled();
    if (!enforcementEnabled) {
      return empty("enforcement_disabled", "disabled");
    }

    const now = deps.now?.() ?? new Date();

    let accessCategory: "confirmed_paid" | "confirmed_unpaid" | "no_write";
    if (deps.accessCategoryOverride) {
      accessCategory = deps.accessCategoryOverride;
    } else {
      const resolved = (deps.resolveEnvironment ?? resolveServerSubscriptionEnvironment)();
      if (!resolved.environment) {
        return empty("no_write", "no_write");
      }
      const snapshots = await deps.getSnapshotsForUser(artistId);
      const snapshot = snapshots[resolved.environment];
      accessCategory = resolveAccessCategory(snapshot, now);
    }

    if (accessCategory === "no_write") {
      return empty("no_write", "no_write");
    }

    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::bigint))`,
        [artistId, FUTURE_RELEASE_SUSPENSION_ADVISORY_LOCK_SEED.toString()],
      );

      const releases = await loadArtistReleases(client, artistId);

      if (accessCategory === "confirmed_paid") {
        const { restoreIds } = planPaidRestore(releases);
        const restoredCount = await applyClearSuspension(client, restoreIds, now);
        await client.query("COMMIT");
        const result: FutureReleaseReconcileResult = {
          outcome: restoredCount > 0 ? "restored" : "noop_unpaid",
          accessCategory,
          suspendedCount: 0,
          restoredCount,
          promotedCount: 0,
        };
        if (restoredCount > 0) {
          console.log("[future-release-suspension]", {
            artistId,
            accessCategory,
            suspendedCount: 0,
            restoredCount,
            promotedCount: 0,
            outcome: result.outcome,
          });
        }
        return result;
      }

      // confirmed_unpaid
      const plan = planUnpaidReconcile({
        releases,
        now,
        preferSuspendIds: deps.preferSuspendIds,
      });
      const suspendedCount = await applySuspend(client, plan.suspendIds, now);
      const promotedCount = await applyClearSuspension(client, plan.promoteIds, now);
      await client.query("COMMIT");

      const outcome =
        suspendedCount > 0 || promotedCount > 0 ? "reconciled_unpaid" : "noop_unpaid";
      const result: FutureReleaseReconcileResult = {
        outcome,
        accessCategory,
        suspendedCount,
        restoredCount: 0,
        promotedCount,
      };
      if (outcome !== "noop_unpaid") {
        console.log("[future-release-suspension]", {
          artistId,
          accessCategory,
          suspendedCount,
          restoredCount: 0,
          promotedCount,
          outcome,
          freeLimit: FREE_ACTIVE_FUTURE_RELEASE_LIMIT,
        });
      }
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[future-release-suspension] reconcile failed", {
      artistId,
      message: error instanceof Error ? error.message : String(error),
    });
    return empty("failed", "no_write");
  }
}

/**
 * Unpaid-only promotion/reconcile after a slot opens (delete / date roll).
 * Uses confirmed_unpaid override so stale snapshots do not block promotion
 * when the caller already knows the artist is operating under free rules.
 * Prefer calling the full reconcile with snapshots when available.
 */
export async function promoteArtistFutureReleaseSlotsIfUnpaid(
  artistId: string,
  deps: ReconcileArtistFutureReleaseSuspensionsDeps,
): Promise<FutureReleaseReconcileResult> {
  return reconcileArtistFutureReleaseSuspensions(artistId, {
    ...deps,
    // Still evaluates snapshots unless override set; callers may pass unpaid override
    // only when they have already established free-tool context.
  });
}
