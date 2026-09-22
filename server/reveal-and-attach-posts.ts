/**
 * VAT-ANON-4B: atomic reveal + release attach.
 * Reveal stays notification-silent; attach notifications run only after COMMIT.
 */

import type { Pool } from "pg";
import { canArtistUsePaidTools } from "./artist-paid-tool-access";
import {
  AnonymousClaimError,
  revealAnonymousArtistIdentificationInTxn,
} from "./artist-private-identification";
import {
  ATTACHMENT_LIMIT_ADVISORY_LOCK_SEED,
  FREE_ATTACHMENT_LIMIT,
  FreeAttachmentLimitReachedError,
  isAttachmentLimitEnforcementEnabled,
  logAttachmentLimitDecision,
} from "./release-attachment-limit";
import type { AttachPostsResult, AttachPostsWithLimitDeps } from "./attach-posts-with-limit";

export type RevealAndAttachErrorCode =
  | "RELEASE_NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "RELEASE_NOT_PUBLIC"
  | "POST_INELIGIBLE"
  | "POST_ALREADY_ATTACHED"
  | "FOREIGN_ANONYMOUS_CLAIM"
  | "CLAIM_NOT_FOUND"
  | "NOT_CLAIM_OWNER"
  | "BATCH_FAILED";

export class RevealAndAttachError extends Error {
  readonly code: RevealAndAttachErrorCode;
  readonly httpStatus: number;
  readonly postId?: string;

  constructor(
    code: RevealAndAttachErrorCode,
    message: string,
    httpStatus: number,
    postId?: string,
  ) {
    super(message);
    this.name = "RevealAndAttachError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.postId = postId;
  }
}

export type RevealAndAttachDeps = AttachPostsWithLimitDeps & {
  pool: Pool;
  /** Profile username for confirm comment bodies. */
  callerUsername: string | null;
  /** Caller may manage the release (owner or ACCEPTED collab). */
  canManage: boolean;
};

/**
 * Atomically reveal caller-owned anonymous claims (if any) and attach posts.
 * Hard failures roll back the entire batch (no partial reveal/attach).
 */
export async function revealAndAttachPosts(
  releaseId: string,
  callerId: string,
  postIds: string[],
  deps: RevealAndAttachDeps,
): Promise<AttachPostsResult> {
  if (!deps.canManage) {
    throw new RevealAndAttachError(
      "NOT_AUTHORIZED",
      "Not authorized to manage this release",
      403,
    );
  }

  const enforcementEnabled =
    deps.enforcementEnabled ?? isAttachmentLimitEnforcementEnabled();

  const client = await deps.pool.connect();
  const attached: string[] = [];
  const newlyAttached: string[] = [];
  const rejected: string[] = [];
  const now = deps.now?.() ?? new Date();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::bigint))`,
      [releaseId, ATTACHMENT_LIMIT_ADVISORY_LOCK_SEED.toString()],
    );

    const releaseRow = await client.query<{
      artist_id: string;
      is_public: boolean | null;
    }>(
      `SELECT artist_id, is_public FROM releases WHERE id = $1 LIMIT 1`,
      [releaseId],
    );
    const release = releaseRow.rows[0];
    if (!release) {
      throw new RevealAndAttachError("RELEASE_NOT_FOUND", "Release not found", 404);
    }
    if (release.is_public !== true) {
      throw new RevealAndAttachError(
        "RELEASE_NOT_PUBLIC",
        "Reveal and attach is only available for public releases.",
        400,
      );
    }

    const ownerId = release.artist_id;

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

    const usedResult = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM release_posts WHERE release_id = $1`,
      [releaseId],
    );
    const used = usedResult.rows[0]?.c ?? 0;

    type Pending = {
      postId: string;
      kind: "new" | "already_here";
    };
    const pending: Pending[] = [];

    for (const postId of postIds) {
      const postMeta = await client.query<{
        id: string;
        is_verified_artist: boolean | null;
        artist_verified_by: string | null;
        is_artist_verified_anonymous: boolean | null;
        denied_by_artist: boolean | null;
        verification_status: string | null;
      }>(
        `SELECT id, is_verified_artist, artist_verified_by, is_artist_verified_anonymous,
                denied_by_artist, verification_status
         FROM posts WHERE id = $1 LIMIT 1`,
        [postId],
      );
      const post = postMeta.rows[0];
      if (!post) {
        throw new RevealAndAttachError(
          "POST_INELIGIBLE",
          "One or more posts could not be attached.",
          400,
          postId,
        );
      }

      if (post.is_artist_verified_anonymous === true) {
        const claimCheck = await client.query<{ artist_id: string; state: string }>(
          `SELECT artist_id, state FROM artist_private_identifications
           WHERE post_id = $1 AND state IN ('anonymous', 'revealed')
           LIMIT 1`,
          [postId],
        );
        const claim = claimCheck.rows[0];
        if (!claim) {
          throw new RevealAndAttachError(
            "CLAIM_NOT_FOUND",
            "Anonymous identification is missing for a selected post.",
            400,
            postId,
          );
        }
        if (String(claim.artist_id) !== callerId) {
          throw new RevealAndAttachError(
            "FOREIGN_ANONYMOUS_CLAIM",
            "You can only reveal and attach your own anonymous identifications.",
            403,
            postId,
          );
        }
        if (claim.state === "anonymous") {
          try {
            await revealAnonymousArtistIdentificationInTxn(client, {
              postId,
              artistId: callerId,
              username: deps.callerUsername,
              now,
            });
          } catch (err) {
            if (err instanceof AnonymousClaimError) {
              throw new RevealAndAttachError(
                err.code === "NOT_CLAIM_OWNER"
                  ? "NOT_CLAIM_OWNER"
                  : err.code === "CLAIM_NOT_FOUND"
                    ? "CLAIM_NOT_FOUND"
                    : "BATCH_FAILED",
                err.message,
                err.httpStatus,
                postId,
              );
            }
            throw err;
          }
        }
      }

      // After optional reveal, require normal public eligibility for caller.
      const eligible = await client.query<{ id: string }>(
        `SELECT p.id FROM posts p
         WHERE p.id = $1
           AND p.is_verified_artist = true
           AND p.artist_verified_by = $2
           AND (p.denied_by_artist IS NOT TRUE)
           AND (p.verification_status IS NULL OR p.verification_status != 'unverified')`,
        [postId, callerId],
      );
      if (eligible.rows.length === 0) {
        throw new RevealAndAttachError(
          "POST_INELIGIBLE",
          "One or more posts are not eligible to attach.",
          400,
          postId,
        );
      }

      const existing = await client.query<{ release_id: string }>(
        `SELECT release_id FROM release_posts WHERE post_id = $1 LIMIT 1`,
        [postId],
      );
      if (existing.rows.length > 0 && existing.rows[0].release_id !== releaseId) {
        throw new RevealAndAttachError(
          "POST_ALREADY_ATTACHED",
          "This post is already attached to another release.",
          409,
          postId,
        );
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
      if (item.kind === "already_here") {
        attached.push(item.postId);
        continue;
      }
      await client.query(
        `INSERT INTO release_posts (release_id, post_id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (release_id, post_id) DO NOTHING`,
        [releaseId, item.postId],
      );
      attached.push(item.postId);
      newlyAttached.push(item.postId);
    }

    await client.query("COMMIT");
    return { attached, newlyAttached, rejected };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}
