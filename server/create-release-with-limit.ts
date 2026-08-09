/**
 * Atomic release creation with ledger write and optional free-limit enforcement.
 * Uses an artist-scoped advisory transaction lock; never counts from releases rows.
 */

import type { Pool, PoolClient } from "pg";
import { canArtistUsePaidTools } from "./artist-paid-tool-access";
import {
  FREE_RELEASE_LIMIT,
  FreeReleaseLimitReachedError,
  RELEASE_LIMIT_ADVISORY_LOCK_SEED,
  evaluateFreeReleaseSlot,
  getReleaseLimitRollingWindow,
  isReleaseLimitEnforcementEnabled,
  logReleaseCreationLimitDecision,
  type ReleaseCreationLimitOutcome,
} from "./release-creation-limit";
import type { SubscriptionSnapshotByEnvironment } from "./subscription-status-repository";

export type CreateReleaseInput = {
  artistId: string;
  title: string;
  releaseDate: Date | null;
  artworkUrl?: string | null;
  isComingSoon?: boolean;
};

export type CreateReleaseRow = {
  id: string;
  artistId: string;
  title: string;
  releaseDate: Date | string | null;
  artworkUrl: string | null;
  notifiedAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  isPublic?: boolean;
  isComingSoon?: boolean;
};

export type CreateReleaseWithLimitDeps = {
  pool: Pool;
  getSnapshotsForUser: (artistId: string) => Promise<SubscriptionSnapshotByEnvironment>;
  now?: () => Date;
  enforcementEnabled?: boolean;
  /** Optional override for tests; when set, skips snapshot lookup. */
  paidToolAccessOverride?: boolean;
};

function mapReleaseRow(row: Record<string, unknown>): CreateReleaseRow {
  return {
    id: String(row.id),
    artistId: String(row.artist_id),
    title: String(row.title),
    releaseDate: (row.release_date as Date | string | null) ?? null,
    artworkUrl: (row.artwork_url as string | null) ?? null,
    notifiedAt: (row.notified_at as Date | string | null) ?? null,
    createdAt: (row.created_at as Date | string | null) ?? null,
    updatedAt: (row.updated_at as Date | string | null) ?? null,
    isPublic: row.is_public == null ? undefined : Boolean(row.is_public),
    isComingSoon: row.is_coming_soon == null ? undefined : Boolean(row.is_coming_soon),
  };
}

async function countRollingLedgerRows(
  client: PoolClient,
  artistId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const result = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM artist_release_creation_ledger
     WHERE artist_id = $1
       AND created_at >= $2
       AND created_at <= $3`,
    [artistId, start, end],
  );
  return result.rows[0]?.c ?? 0;
}

/**
 * Create a release and matching ledger row in one transaction under an advisory lock.
 * Ledger is always written on success (including when enforcement is disabled).
 */
export async function createReleaseWithLimit(
  data: CreateReleaseInput,
  deps: CreateReleaseWithLimitDeps,
): Promise<CreateReleaseRow> {
  const now = deps.now?.() ?? new Date();
  const enforcementEnabled =
    deps.enforcementEnabled ?? isReleaseLimitEnforcementEnabled();

  let paidToolAccess = false;
  let paidPolicyLookupFailed = false;

  if (!enforcementEnabled) {
    // Skip snapshot reads when enforcement is off; still write ledger below.
  } else if (typeof deps.paidToolAccessOverride === "boolean") {
    paidToolAccess = deps.paidToolAccessOverride;
  } else {
    paidToolAccess = await canArtistUsePaidTools(data.artistId, {
      getSnapshotsForUser: async (id) => {
        try {
          return await deps.getSnapshotsForUser(id);
        } catch (error) {
          paidPolicyLookupFailed = true;
          throw error;
        }
      },
      now: () => now,
    });
  }

  const client = await deps.pool.connect();
  let rollingReleaseCount: number | null = null;
  let outcome: ReleaseCreationLimitOutcome;

  try {
    await client.query("BEGIN");

    // Deterministic artist-scoped lock; released on commit/rollback.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::bigint))`,
      [data.artistId, RELEASE_LIMIT_ADVISORY_LOCK_SEED.toString()],
    );

    if (!enforcementEnabled) {
      outcome = "bypassed_enforcement_disabled";
    } else if (paidToolAccess) {
      outcome = "allowed_paid";
    } else {
      const window = getReleaseLimitRollingWindow(now);
      rollingReleaseCount = await countRollingLedgerRows(
        client,
        data.artistId,
        window.start,
        window.end,
      );
      const slot = evaluateFreeReleaseSlot(rollingReleaseCount);
      if (!slot.allowed) {
        outcome = "blocked_free_limit";
        logReleaseCreationLimitDecision({
          artistId: data.artistId,
          enforcementEnabled,
          paidToolAccess,
          rollingReleaseCount,
          limit: FREE_RELEASE_LIMIT,
          outcome,
        });
        throw new FreeReleaseLimitReachedError(slot.used);
      }
      outcome = paidPolicyLookupFailed
        ? "failed_paid_policy_lookup"
        : "allowed_free_slot";
    }

    const insertRelease = await client.query(
      `INSERT INTO releases (
         artist_id, title, release_date, artwork_url, is_public, is_coming_soon, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, true, $5, $6, $6)
       RETURNING *`,
      [
        data.artistId,
        data.title,
        data.releaseDate,
        data.artworkUrl ?? null,
        data.isComingSoon ?? false,
        now,
      ],
    );
    const row = insertRelease.rows[0];
    if (!row) {
      throw new Error("Failed to create release");
    }

    await client.query(
      `INSERT INTO artist_release_creation_ledger (artist_id, release_id, created_at)
       VALUES ($1, $2, $3)`,
      [data.artistId, row.id, now],
    );

    await client.query("COMMIT");

    logReleaseCreationLimitDecision({
      artistId: data.artistId,
      enforcementEnabled,
      paidToolAccess,
      rollingReleaseCount,
      limit: FREE_RELEASE_LIMIT,
      outcome,
    });

    return mapReleaseRow(row);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors (e.g. already rolled back / idle)
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Count ledger rows for an artist in the rolling window (read-only helper for tests/tools).
 */
export async function countArtistRollingReleaseCreations(
  client: Pick<PoolClient, "query">,
  artistId: string,
  now: Date,
): Promise<number> {
  const window = getReleaseLimitRollingWindow(now);
  return countRollingLedgerRows(client as PoolClient, artistId, window.start, window.end);
}
