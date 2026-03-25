/**
 * Community trust — canonical writes for `user_karma` + `user_karma_events`.
 *
 * **Aggregate table `user_karma` (read as public “reputation” in APIs):**
 * - `score` — Broad trust / helpfulness. Increases on: valid confirmed IDs on *someone else’s* post
 *   (+10 per idempotent event) and on *other users liking your comments* (+1 per active like event).
 *   Does **not** include moderator action bonuses, post likes on tracks, or self-credit.
 * - `correct_ids` — Count of **successful confirmed IDs** on **other users’ posts** only (increments
 *   only on idempotent `confirmed_id` events, never from comment likes).
 *
 * **Event log `user_karma_events`:**
 * - Required for idempotency and abuse resistance. Inserts happen *before* aggregate bumps.
 * - `confirmed_id` — One active row per (recipient, post, comment); unique index enforces no double-pay.
 * - `comment_like` — `score_delta` only (`correct_ids_delta` = 0); revoked on unlike.
 *
 * **All writes** to `user_karma` for trust reasons must go through this module. Do not add inline
 * `INSERT`/`UPDATE user_karma` in routes.
 */
import { pool } from "./db";

export type ConfirmedIdRewardSource = "moderator_confirmed" | "artist_confirmed";

/** Snapshot of `user_karma` for a profile (no row => zeros). */
export type UserKarmaAggregate = {
  score: number;
  correct_ids: number;
};

/**
 * Read-only: fetch hardened aggregate trust for API responses.
 * Routes should use this instead of duplicating `SELECT` from `user_karma`.
 */
export async function getUserKarmaAggregate(userId: string): Promise<UserKarmaAggregate> {
  const result = await pool.query<{ score: number | null; correct_ids: number | null }>(
    `
    SELECT score, correct_ids
    FROM user_karma
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const row = result.rows[0];
  return {
    score: row ? Number(row.score ?? 0) : 0,
    correct_ids: row ? Number(row.correct_ids ?? 0) : 0,
  };
}

export type AwardConfirmedIdKarmaResult = {
  awarded: boolean;
  /**
   * Human-friendly reason when `awarded=false`.
   * This is used for server-side debugging only.
   */
  reason?:
    | "invalid_comment_post_linkage"
    | "post_not_final_identified"
    | "self_credit_commenter_is_post_owner"
    | "self_credit_artist_confirming_own_post"
    | "already_awarded";
};

const SCORE_DELTA = 10;
const CORRECT_IDS_DELTA = 1;

function isUniqueViolation(err: unknown): boolean {
  const e = err as any;
  // Postgres unique_violation is 23505
  return e?.code === "23505" || String(e?.message || "").toLowerCase().includes("unique");
}

/**
 * Award confirmed-ID trust in an idempotent way.
 *
 * Trust rules enforced here (not in route code):
 * - Final state only: `verification_status = 'identified'` and `posts.verified_comment_id = commentId`.
 * - The selected `commentId` must belong to `postId` (join validation).
 * - **No self-credit:** comment author must not be post owner; artist flow cannot credit own post.
 * - **Recipient** = comment author; **actor** = moderator or confirming artist (not given moderator bonus).
 * - Idempotent via `user_karma_events` (`event_type='confirmed_id'`) then +10 score / +1 correct_ids.
 */
export async function awardConfirmedIdKarma(params: {
  source: ConfirmedIdRewardSource;
  actorUserId: string;
  postId: string;
  commentId: string;
}): Promise<AwardConfirmedIdKarmaResult> {
  const { source, actorUserId, postId, commentId } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validate that the selected comment belongs to the target post AND we are in the final identified state.
    const validation = await client.query<{
      post_user_id: string;
      verification_status: string;
      verified_comment_id: string | null;
      comment_user_id: string;
    }>(
      `
      SELECT
        p.user_id AS post_user_id,
        p.verification_status AS verification_status,
        p.verified_comment_id AS verified_comment_id,
        c.user_id AS comment_user_id
      FROM posts p
      INNER JOIN comments c
        ON c.id = $1
       AND c.post_id = p.id
      WHERE p.id = $2
      LIMIT 1
      `,
      [commentId, postId],
    );

    const row = validation.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { awarded: false, reason: "invalid_comment_post_linkage" };
    }

    const isFinalIdentified =
      row.verification_status === "identified" && String(row.verified_comment_id) === String(commentId);
    if (!isFinalIdentified) {
      await client.query("ROLLBACK");
      return { awarded: false, reason: "post_not_final_identified" };
    }

    // Self-credit prevention:
    // - Users identifying their own posts.
    if (row.comment_user_id === row.post_user_id) {
      await client.query("ROLLBACK");
      return { awarded: false, reason: "self_credit_commenter_is_post_owner" };
    }

    // - Artists confirming their own track/post.
    if (source === "artist_confirmed" && actorUserId === row.post_user_id) {
      await client.query("ROLLBACK");
      return { awarded: false, reason: "self_credit_artist_confirming_own_post" };
    }

    // Idempotency check: look for an active confirmed_id reward event already created for this exact outcome.
    const existingEvent = await client.query<{ id: string }>(
      `
      SELECT id
      FROM user_karma_events
      WHERE user_id = $1
        AND event_type = 'confirmed_id'
        AND post_id = $2
        AND comment_id = $3
        AND revoked_at IS NULL
      LIMIT 1
      `,
      [row.comment_user_id, postId, commentId],
    );

    if (existingEvent.rows.length > 0) {
      await client.query("ROLLBACK");
      return { awarded: false, reason: "already_awarded" };
    }

    // Record the reward outcome first (idempotency layer), then update the aggregate `user_karma`.
    // We rely on the DB's unique active-event constraint to prevent duplicates under races.
    try {
      await client.query(
        `
        INSERT INTO user_karma_events (
          user_id,
          source_user_id,
          post_id,
          comment_id,
          event_type,
          score_delta,
          correct_ids_delta,
          revoked_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, 'confirmed_id', $5, $6, NULL, NOW())
        `,
        [
          row.comment_user_id,
          actorUserId,
          postId,
          commentId,
          SCORE_DELTA,
          CORRECT_IDS_DELTA,
        ],
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Another request won the race and created the active event already.
        await client.query("ROLLBACK");
        return { awarded: false, reason: "already_awarded" };
      }
      throw err;
    }

    await client.query(
      `
      INSERT INTO user_karma (user_id, score, correct_ids, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        score = user_karma.score + EXCLUDED.score,
        correct_ids = user_karma.correct_ids + EXCLUDED.correct_ids,
        updated_at = NOW()
      `,
      [row.comment_user_id, SCORE_DELTA, CORRECT_IDS_DELTA],
    );

    await client.query("COMMIT");
    return { awarded: true };
  } catch (err) {
    // If anything fails mid-transaction, rollback to avoid partial writes.
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

export type CommentLikeKarmaResult = {
  acted: boolean;
  reason?:
    | "comment_not_found"
    | "self_like_no_karma"
    | "already_awarded"
    | "already_revoked";
};

/**
 * Award `+1` comment helpfulness **score only** (never `correct_ids`) idempotently.
 *
 * Uses `user_karma_events` for idempotency:
 * - `event_type = 'comment_like'`, `correct_ids_delta = 0`
 * - unique active constraint on (event_type, recipient, source_user_id, comment)
 * - **No self-like:** liker cannot be the comment author.
 */
export async function awardCommentLikeKarma(params: { actorUserId: string; commentId: string }): Promise<CommentLikeKarmaResult> {
  const { actorUserId, commentId } = params;
  const client = await pool.connect();

  // Recipient is the comment author.
  try {
    await client.query("BEGIN");

    const commentValidation = await client.query<{ post_id: string; user_id: string }>(
      `
      SELECT post_id, user_id
      FROM comments
      WHERE id = $1
      LIMIT 1
      `,
      [commentId],
    );

    const commentRow = commentValidation.rows[0];
    if (!commentRow) {
      await client.query("ROLLBACK");
      return { acted: false, reason: "comment_not_found" };
    }

    const recipientUserId = commentRow.user_id;
    const postId = commentRow.post_id;

    // No self-like score (does not touch aggregate).
    if (recipientUserId === actorUserId) {
      await client.query("ROLLBACK");
      return { acted: false, reason: "self_like_no_karma" };
    }

    // Insert the active event first. If it already exists, do nothing.
    try {
      await client.query(
        `
        INSERT INTO user_karma_events (
          user_id,
          source_user_id,
          post_id,
          comment_id,
          event_type,
          score_delta,
          correct_ids_delta,
          revoked_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, 'comment_like', 1, 0, NULL, NOW())
        `,
        [recipientUserId, actorUserId, postId, commentId],
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        await client.query("ROLLBACK");
        return { acted: false, reason: "already_awarded" };
      }
      throw err;
    }

    await client.query(
      `
      INSERT INTO user_karma (user_id, score, correct_ids, updated_at)
      VALUES ($1, 1, 0, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        score = user_karma.score + EXCLUDED.score,
        correct_ids = user_karma.correct_ids + EXCLUDED.correct_ids,
        updated_at = NOW()
      `,
      [recipientUserId],
    );

    await client.query("COMMIT");
    return { acted: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Revoke `-1` comment helpfulness **score** idempotently on unlike.
 *
 * Sets `revoked_at` on the matching active `comment_like` event; then decrements `user_karma.score`
 * (floored at 0). Does not change `correct_ids`.
 */
export async function revokeCommentLikeKarma(params: { actorUserId: string; commentId: string }): Promise<CommentLikeKarmaResult> {
  const { actorUserId, commentId } = params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const commentValidation = await client.query<{ user_id: string }>(
      `
      SELECT user_id
      FROM comments
      WHERE id = $1
      LIMIT 1
      `,
      [commentId],
    );

    const commentRow = commentValidation.rows[0];
    if (!commentRow) {
      await client.query("ROLLBACK");
      return { acted: false, reason: "comment_not_found" };
    }

    const recipientUserId = commentRow.user_id;

    // Self-like: never had karma awarded, so nothing to revoke.
    if (recipientUserId === actorUserId) {
      await client.query("ROLLBACK");
      return { acted: false, reason: "self_like_no_karma" };
    }

    const revokeResult = await client.query<{ id: string }>(
      `
      UPDATE user_karma_events
      SET revoked_at = NOW()
      WHERE event_type = 'comment_like'
        AND user_id = $1
        AND source_user_id = $2
        AND comment_id = $3
        AND revoked_at IS NULL
      RETURNING id
      `,
      [recipientUserId, actorUserId, commentId],
    );

    const revokedEvent = revokeResult.rows[0];
    if (!revokedEvent) {
      await client.query("ROLLBACK");
      return { acted: false, reason: "already_revoked" };
    }

    await client.query(
      `
      UPDATE user_karma
      SET
        score = GREATEST(score - 1, 0),
        updated_at = NOW()
      WHERE user_id = $1
      `,
      [recipientUserId],
    );

    await client.query("COMMIT");
    return { acted: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

