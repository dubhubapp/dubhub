/**
 * Attach posts with optional free-limit enforcement (owner paid-tool access).
 * Uses a release-scoped advisory transaction lock.
 */

import type { Pool, PoolClient } from "pg";
import { canArtistUsePaidTools } from "./artist-paid-tool-access";
import {
  ATTACHMENT_LIMIT_ADVISORY_LOCK_SEED,
  FREE_ATTACHMENT_LIMIT,
  FreeAttachmentLimitReachedError,
  isAttachmentLimitEnforcementEnabled,
  logAttachmentLimitDecision,
} from "./release-attachment-limit";
import type { SubscriptionSnapshotByEnvironment } from "./subscription-status-repository";
import type { SubscriptionEnvironment } from "./subscription-status-domain";

export type AttachPostsResult = {
  attached: string[];
  newlyAttached: string[];
  rejected: string[];
  postAlreadyAttached?: string[];
};

export type AttachPostsWithLimitDeps = {
  pool: Pool;
  getSnapshotsForUser: (artistId: string) => Promise<SubscriptionSnapshotByEnvironment>;
  now?: () => Date;
  enforcementEnabled?: boolean;
  paidToolAccessOverride?: boolean;
  resolveEnvironment?: () =>
    | { environment: SubscriptionEnvironment; reason: string }
    | { environment: null; reason: string };
};

export type AttachmentCapacityView = {
  unlimited: boolean;
  used: number;
  limit: typeof FREE_ATTACHMENT_LIMIT;
  remaining: number;
  canAttachMore: boolean;
};

export type AttachmentAllowanceView = {
  unlimited: boolean;
  limit: typeof FREE_ATTACHMENT_LIMIT;
};

async function countReleaseAttachments(
  client: PoolClient,
  releaseId: string,
): Promise<number> {
  const result = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM release_posts WHERE release_id = $1`,
    [releaseId],
  );
  return result.rows[0]?.c ?? 0;
}

export async function getReleaseAttachmentCapacity(
  releaseId: string,
  deps: AttachPostsWithLimitDeps,
): Promise<AttachmentCapacityView | null> {
  const ownerResult = await deps.pool.query<{ artist_id: string }>(
    `SELECT artist_id FROM releases WHERE id = $1 LIMIT 1`,
    [releaseId],
  );
  const ownerId = ownerResult.rows[0]?.artist_id;
  if (!ownerId) return null;

  const usedResult = await deps.pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM release_posts WHERE release_id = $1`,
    [releaseId],
  );
  const used = usedResult.rows[0]?.c ?? 0;
  const limit = FREE_ATTACHMENT_LIMIT;
  const remaining = Math.max(0, limit - used);

  const enforcementEnabled =
    deps.enforcementEnabled ?? isAttachmentLimitEnforcementEnabled();

  let unlimited = false;
  if (typeof deps.paidToolAccessOverride === "boolean") {
    unlimited = deps.paidToolAccessOverride;
  } else {
    unlimited = await canArtistUsePaidTools(ownerId, {
      getSnapshotsForUser: deps.getSnapshotsForUser,
      resolveEnvironment: deps.resolveEnvironment,
      now: deps.now,
    });
  }

  const canAttachMore =
    !enforcementEnabled || unlimited || used < limit;

  return {
    unlimited,
    used,
    limit,
    remaining,
    canAttachMore,
  };
}

export async function getArtistAttachmentAllowance(
  artistId: string,
  deps: Omit<AttachPostsWithLimitDeps, "pool"> & { pool?: Pool },
): Promise<AttachmentAllowanceView> {
  let unlimited = false;
  if (typeof deps.paidToolAccessOverride === "boolean") {
    unlimited = deps.paidToolAccessOverride;
  } else {
    unlimited = await canArtistUsePaidTools(artistId, {
      getSnapshotsForUser: deps.getSnapshotsForUser,
      resolveEnvironment: deps.resolveEnvironment,
      now: deps.now,
    });
  }
  return {
    unlimited,
    limit: FREE_ATTACHMENT_LIMIT,
  };
}

/**
 * Attach posts with the same eligibility rules as storage.attachPostsToRelease,
 * plus free-limit enforcement against the release owner.
 */
export async function attachPostsWithLimit(
  releaseId: string,
  callerId: string,
  postIds: string[],
  deps: AttachPostsWithLimitDeps,
): Promise<AttachPostsResult> {
  const enforcementEnabled =
    deps.enforcementEnabled ?? isAttachmentLimitEnforcementEnabled();

  const client = await deps.pool.connect();
  const attached: string[] = [];
  const newlyAttached: string[] = [];
  const rejected: string[] = [];
  const postAlreadyAttached: string[] = [];

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::bigint))`,
      [releaseId, ATTACHMENT_LIMIT_ADVISORY_LOCK_SEED.toString()],
    );

    const ownerRow = await client.query<{ artist_id: string }>(
      `SELECT artist_id FROM releases WHERE id = $1 LIMIT 1`,
      [releaseId],
    );
    const ownerId = ownerRow.rows[0]?.artist_id;
    if (!ownerId) {
      throw new Error("Release not found");
    }

    let paidToolAccess = false;
    let paidPolicyLookupFailed = false;
    if (typeof deps.paidToolAccessOverride === "boolean") {
      paidToolAccess = deps.paidToolAccessOverride;
    } else if (enforcementEnabled) {
      paidToolAccess = await canArtistUsePaidTools(ownerId, {
        getSnapshotsForUser: async (id) => {
          try {
            return await deps.getSnapshotsForUser(id);
          } catch (error) {
            paidPolicyLookupFailed = true;
            throw error;
          }
        },
        resolveEnvironment: deps.resolveEnvironment,
        now: deps.now,
      });
    }

    const used = await countReleaseAttachments(client, releaseId);

    // First pass: classify each requested id (no inserts yet).
    type Pending = { postId: string; kind: "new" | "already_here" | "other_release" | "ineligible" };
    const pending: Pending[] = [];

    for (const postId of postIds) {
      const check = await client.query<{ id: string }>(
        `SELECT p.id FROM posts p
         WHERE p.id = $1
           AND p.is_verified_artist = true
           AND p.artist_verified_by = $2
           AND (p.denied_by_artist IS NOT TRUE)
           AND (p.verification_status IS NULL OR p.verification_status != 'unverified')`,
        [postId, callerId],
      );
      if (check.rows.length === 0) {
        pending.push({ postId, kind: "ineligible" });
        continue;
      }
      const existing = await client.query<{ release_id: string }>(
        `SELECT release_id FROM release_posts WHERE post_id = $1 LIMIT 1`,
        [postId],
      );
      if (existing.rows.length > 0 && existing.rows[0].release_id !== releaseId) {
        pending.push({ postId, kind: "other_release" });
        continue;
      }
      if (existing.rows.length > 0 && existing.rows[0].release_id === releaseId) {
        pending.push({ postId, kind: "already_here" });
        continue;
      }
      pending.push({ postId, kind: "new" });
    }

    const newIds = pending.filter((p) => p.kind === "new").map((p) => p.postId);

    if (enforcementEnabled && !paidToolAccess) {
      if (used + newIds.length > FREE_ATTACHMENT_LIMIT) {
        logAttachmentLimitDecision({
          releaseId,
          ownerId,
          enforcementEnabled,
          paidToolAccess,
          used,
          attemptedNew: newIds.length,
          limit: FREE_ATTACHMENT_LIMIT,
          outcome: paidPolicyLookupFailed
            ? "failed_paid_policy_lookup"
            : "blocked_free_limit",
        });
        throw new FreeAttachmentLimitReachedError(used);
      }
      logAttachmentLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        attemptedNew: newIds.length,
        limit: FREE_ATTACHMENT_LIMIT,
        outcome: paidPolicyLookupFailed
          ? "failed_paid_policy_lookup"
          : "allowed_free_slot",
      });
    } else if (!enforcementEnabled) {
      logAttachmentLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        attemptedNew: newIds.length,
        limit: FREE_ATTACHMENT_LIMIT,
        outcome: "bypassed_enforcement_disabled",
      });
    } else {
      logAttachmentLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        attemptedNew: newIds.length,
        limit: FREE_ATTACHMENT_LIMIT,
        outcome: "allowed_paid",
      });
    }

    for (const item of pending) {
      if (item.kind === "ineligible") {
        rejected.push(item.postId);
        continue;
      }
      if (item.kind === "other_release") {
        postAlreadyAttached.push(item.postId);
        rejected.push(item.postId);
        continue;
      }
      if (item.kind === "already_here") {
        attached.push(item.postId);
        continue;
      }
      try {
        await client.query(
          `INSERT INTO release_posts (release_id, post_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (release_id, post_id) DO NOTHING`,
          [releaseId, item.postId],
        );
        attached.push(item.postId);
        newlyAttached.push(item.postId);
      } catch {
        rejected.push(item.postId);
      }
    }

    await client.query("COMMIT");
    return {
      attached,
      newlyAttached,
      rejected,
      postAlreadyAttached:
        postAlreadyAttached.length > 0 ? postAlreadyAttached : undefined,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }
}
