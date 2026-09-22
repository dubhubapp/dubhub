/**
 * VAT-ANON-1: server-authoritative anonymous artist identification claims.
 * Creates private claims; never exposes artist identity on public post serializers.
 */

import {
  canArtistUsePaidTools,
  type CanArtistUsePaidToolsDeps,
} from "./artist-paid-tool-access";
import {
  canArtistCreateAnonymousIdentification,
  isAnonymousArtistIdentificationEnabled,
} from "./artist-private-identification-policy";
import { pool } from "./db";

export {
  ANONYMOUS_ARTIST_IDENTIFICATION_ENV,
  canArtistCreateAnonymousIdentification,
  isAnonymousArtistIdentificationEnabled,
} from "./artist-private-identification-policy";

export type AnonymousClaimErrorCode =
  | "FEATURE_DISABLED"
  | "VERIFIED_ARTIST_REQUIRED"
  | "PAID_ARTIST_TOOL_REQUIRED"
  | "POST_NOT_FOUND"
  | "ARTIST_ALREADY_VERIFIED"
  | "ANONYMOUS_CLAIM_EXISTS"
  | "TAG_REQUIRED"
  | "COMMENT_INVALID"
  | "COMMENT_NOT_FOUND"
  | "CLAIM_NOT_FOUND"
  | "NOT_CLAIM_OWNER";

export class AnonymousClaimError extends Error {
  readonly code: AnonymousClaimErrorCode;
  readonly httpStatus: number;

  constructor(code: AnonymousClaimErrorCode, message: string, httpStatus: number) {
    super(message);
    this.name = "AnonymousClaimError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type ArtistPrivateIdentificationRow = {
  id: string;
  postId: string;
  artistId: string;
  sourceCommentId: string | null;
  state: "anonymous" | "revealed";
  claimedAt: string;
  revealedAt: string | null;
  entitledAtClaim: boolean;
  createdVia: string | null;
  /** Optional public track title while anonymous. */
  trackTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAnonymousClaimInput = {
  postId: string;
  /** Always the authenticated session user — never from client body. */
  artistId: string;
  sourceCommentId?: string | null;
  createdVia?: string | null;
  /** Optional public track title (already normalized). */
  trackTitle?: string | null;
  /** Spoof attempts: ignored. */
  bodyArtistId?: unknown;
};

export type CreateAnonymousClaimDeps = CanArtistUsePaidToolsDeps & {
  now?: () => Date;
  isFeatureEnabled?: () => boolean;
};

const ALLOWED_CREATED_VIA = new Set([
  "api",
  "tag_decline",
  "confirm_dialog",
  "comments",
]);

function normalizeCreatedVia(raw: string | null | undefined): string | null {
  if (raw == null) return "api";
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return "api";
  return ALLOWED_CREATED_VIA.has(trimmed) ? trimmed : "api";
}

function mapClaimRow(row: Record<string, unknown>): ArtistPrivateIdentificationRow {
  const rawTitle = row.track_title;
  const trackTitle =
    typeof rawTitle === "string" && rawTitle.trim().length > 0 ? rawTitle.trim() : null;
  return {
    id: String(row.id),
    postId: String(row.post_id),
    artistId: String(row.artist_id),
    sourceCommentId: row.source_comment_id != null ? String(row.source_comment_id) : null,
    state: row.state === "revealed" ? "revealed" : "anonymous",
    claimedAt: new Date(String(row.claimed_at)).toISOString(),
    revealedAt: row.revealed_at != null ? new Date(String(row.revealed_at)).toISOString() : null,
    entitledAtClaim: row.entitled_at_claim === true,
    createdVia: row.created_via != null ? String(row.created_via) : null,
    trackTitle,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function assertVerifiedArtistProfile(
  artistId: string,
): Promise<{ username: string | null }> {
  const result = await pool.query<{
    account_type: string | null;
    verified_artist: boolean | null;
    username: string | null;
  }>(
    `SELECT account_type, verified_artist, username
     FROM profiles
     WHERE id = $1
     LIMIT 1`,
    [artistId],
  );
  const profile = result.rows[0];
  if (!profile || profile.account_type !== "artist" || profile.verified_artist !== true) {
    throw new AnonymousClaimError(
      "VERIFIED_ARTIST_REQUIRED",
      "Verified artist profile required to identify tracks anonymously.",
      403,
    );
  }
  return { username: profile.username };
}

async function assertTaggedOnPost(
  client: { query: typeof pool.query },
  postId: string,
  artistId: string,
  sourceCommentId: string | null,
): Promise<string | null> {
  let validatedCommentId: string | null = null;

  if (sourceCommentId) {
    const commentResult = await client.query<{
      id: string;
      post_id: string;
      artist_tag: string | null;
    }>(
      `SELECT id, post_id, artist_tag FROM comments WHERE id = $1 LIMIT 1`,
      [sourceCommentId],
    );
    const comment = commentResult.rows[0];
    if (!comment) {
      throw new AnonymousClaimError("COMMENT_NOT_FOUND", "Comment not found", 404);
    }
    if (comment.post_id !== postId) {
      throw new AnonymousClaimError(
        "COMMENT_INVALID",
        "Comment does not belong to this post",
        403,
      );
    }
    validatedCommentId = comment.id;

    const tagOnComment = comment.artist_tag === artistId;
    if (tagOnComment) return validatedCommentId;
  }

  const tagCheck = await client.query(
    `SELECT 1 FROM artist_video_tags
     WHERE post_id = $1 AND artist_id = $2
     LIMIT 1`,
    [postId, artistId],
  );
  if ((tagCheck.rowCount ?? 0) > 0) {
    return validatedCommentId;
  }

  if (validatedCommentId) {
    // Comment supplied but neither comment.artist_tag nor tag row matches.
    throw new AnonymousClaimError(
      "TAG_REQUIRED",
      "You must be tagged in a comment on this post to identify it anonymously",
      403,
    );
  }

  throw new AnonymousClaimError(
    "TAG_REQUIRED",
    "You must be tagged in a comment on this post to identify it anonymously",
    403,
  );
}

/**
 * Create an anonymous private artist claim.
 * Does not set posts.artist_verified_by. Does not notify. Does not insert confirm comment.
 */
export async function createAnonymousArtistIdentification(
  input: CreateAnonymousClaimInput,
  deps: CreateAnonymousClaimDeps,
): Promise<ArtistPrivateIdentificationRow> {
  // Explicitly ignore any client-supplied artist_id.
  void input.bodyArtistId;

  if (!(deps.isFeatureEnabled ?? isAnonymousArtistIdentificationEnabled)()) {
    throw new AnonymousClaimError(
      "FEATURE_DISABLED",
      "Anonymous artist identification is temporarily unavailable.",
      503,
    );
  }

  const artistId = input.artistId;
  await assertVerifiedArtistProfile(artistId);

  const entitled = await canArtistCreateAnonymousIdentification(artistId, deps);
  // Fail closed: also require the standard paid-tools helper (same snapshot path).
  const paidTools = await canArtistUsePaidTools(artistId, deps);
  if (!entitled || !paidTools) {
    throw new AnonymousClaimError(
      "PAID_ARTIST_TOOL_REQUIRED",
      "Verified Artist Tools required to identify tracks anonymously.",
      403,
    );
  }

  const createdVia = normalizeCreatedVia(input.createdVia);
  const sourceCommentId =
    typeof input.sourceCommentId === "string" && input.sourceCommentId.trim()
      ? input.sourceCommentId.trim()
      : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const postResult = await client.query<{
      id: string;
      is_verified_artist: boolean | null;
      artist_verified_by: string | null;
      is_artist_verified_anonymous: boolean | null;
      verification_status: string | null;
    }>(
      `SELECT id, is_verified_artist, artist_verified_by,
              is_artist_verified_anonymous, verification_status
       FROM posts
       WHERE id = $1
       FOR UPDATE`,
      [input.postId],
    );
    const post = postResult.rows[0];
    if (!post) {
      throw new AnonymousClaimError("POST_NOT_FOUND", "Post not found", 404);
    }

    if (post.is_verified_artist === true || post.artist_verified_by != null) {
      throw new AnonymousClaimError(
        "ARTIST_ALREADY_VERIFIED",
        "This post has already been verified by an artist.",
        400,
      );
    }

    if (post.is_artist_verified_anonymous === true) {
      throw new AnonymousClaimError(
        "ANONYMOUS_CLAIM_EXISTS",
        "An anonymous artist identification already exists for this post.",
        400,
      );
    }

    const existingClaim = await client.query(
      `SELECT id, artist_id, state
       FROM artist_private_identifications
       WHERE post_id = $1 AND state IN ('anonymous', 'revealed')
       LIMIT 1
       FOR UPDATE`,
      [input.postId],
    );
    if ((existingClaim.rowCount ?? 0) > 0) {
      const row = existingClaim.rows[0];
      if (String(row.artist_id) === artistId) {
        throw new AnonymousClaimError(
          "ANONYMOUS_CLAIM_EXISTS",
          "You already have an anonymous identification on this post.",
          400,
        );
      }
      throw new AnonymousClaimError(
        "ARTIST_ALREADY_VERIFIED",
        "This post has already been claimed by an artist.",
        400,
      );
    }

    const validatedCommentId = await assertTaggedOnPost(
      client,
      input.postId,
      artistId,
      sourceCommentId,
    );

    const insertResult = await client.query(
      `INSERT INTO artist_private_identifications (
         post_id, artist_id, source_comment_id, state,
         entitled_at_claim, created_via, track_title
       ) VALUES ($1, $2, $3, 'anonymous', true, $4, $5)
       RETURNING *`,
      [
        input.postId,
        artistId,
        validatedCommentId,
        createdVia,
        input.trackTitle ?? null,
      ],
    );

    // Public projection only — never write artist_verified_by while anonymous.
    await client.query(
      `UPDATE posts
       SET is_artist_verified_anonymous = true,
           verification_status = 'identified',
           denied_by_artist = false,
           denied_at = NULL
       WHERE id = $1`,
      [input.postId],
    );

    await client.query("COMMIT");
    return mapClaimRow(insertResult.rows[0] as Record<string, unknown>);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (err instanceof AnonymousClaimError) throw err;
    // Unique index race → treat as conflict.
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === "23505") {
      throw new AnonymousClaimError(
        "ANONYMOUS_CLAIM_EXISTS",
        "An anonymous artist identification already exists for this post.",
        400,
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

export type RevealAnonymousClaimInput = {
  postId: string;
  /** Always the authenticated session user — never from client body. */
  artistId: string;
  /** Spoof attempts: ignored. */
  bodyArtistId?: unknown;
};

export type RevealAnonymousClaimResult = {
  claim: ArtistPrivateIdentificationRow;
  /** True when claim was already revealed (safe retry). */
  alreadyRevealed: boolean;
  insertedConfirmCommentId: string | null;
};

export type RevealInTxnInput = {
  postId: string;
  artistId: string;
  /** Profile username for confirm comment body. */
  username: string | null;
  now?: Date;
};

type PgTxnClient = {
  query: typeof pool.query;
};

/**
 * VAT-ANON-4/4B: reveal core that runs inside an existing transaction.
 * No BEGIN/COMMIT. No notifications.
 */
export async function revealAnonymousArtistIdentificationInTxn(
  client: PgTxnClient,
  input: RevealInTxnInput,
): Promise<RevealAnonymousClaimResult> {
  const artistId = input.artistId;
  const now = input.now ?? new Date();
  const username = input.username;

  const claimResult = await client.query(
    `SELECT *
     FROM artist_private_identifications
     WHERE post_id = $1 AND state IN ('anonymous', 'revealed')
     LIMIT 1
     FOR UPDATE`,
    [input.postId],
  );
  const claimRow = claimResult.rows[0] as Record<string, unknown> | undefined;
  if (!claimRow) {
    throw new AnonymousClaimError(
      "CLAIM_NOT_FOUND",
      "No anonymous identification found for this post.",
      404,
    );
  }
  if (String(claimRow.artist_id) !== artistId) {
    throw new AnonymousClaimError(
      "NOT_CLAIM_OWNER",
      "Only the artist who identified this track anonymously can reveal it.",
      403,
    );
  }

  if (claimRow.state === "revealed") {
    return {
      claim: mapClaimRow(claimRow),
      alreadyRevealed: true,
      insertedConfirmCommentId: null,
    };
  }

  const postResult = await client.query<{
    id: string;
    is_verified_artist: boolean | null;
    artist_verified_by: string | null;
    is_artist_verified_anonymous: boolean | null;
  }>(
    `SELECT id, is_verified_artist, artist_verified_by, is_artist_verified_anonymous
     FROM posts
     WHERE id = $1
     FOR UPDATE`,
    [input.postId],
  );
  const post = postResult.rows[0];
  if (!post) {
    throw new AnonymousClaimError("POST_NOT_FOUND", "Post not found", 404);
  }

  // Resolve pin: source_comment_id if still on this post; else null (do not invent).
  let verifiedCommentId: string | null = null;
  const sourceCommentId =
    claimRow.source_comment_id != null ? String(claimRow.source_comment_id) : null;
  if (sourceCommentId) {
    const commentCheck = await client.query<{ id: string }>(
      `SELECT id FROM comments WHERE id = $1 AND post_id = $2 LIMIT 1`,
      [sourceCommentId, input.postId],
    );
    if (commentCheck.rows[0]) {
      verifiedCommentId = sourceCommentId;
    }
  }

  // Optional confirm comment from anonymous track_title — once only.
  let insertedConfirmCommentId: string | null = null;
  const rawTitle = claimRow.track_title;
  const trackTitle =
    typeof rawTitle === "string" && rawTitle.trim().length > 0 ? rawTitle.trim() : null;
  if (trackTitle) {
    const existingConfirm = await client.query<{ id: string }>(
      `SELECT id FROM comments
       WHERE post_id = $1
         AND user_id = $2
         AND parent_id IS NULL
         AND body LIKE '% confirmed: %'
       LIMIT 1`,
      [input.postId, artistId],
    );
    if (!existingConfirm.rows[0]) {
      const displayName =
        typeof username === "string" && username.trim() ? username.trim() : "Artist";
      const body = `@${displayName} confirmed: ${displayName} - ${trackTitle}`;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO comments (post_id, user_id, body, artist_tag, parent_id, created_at)
         VALUES ($1, $2, $3, NULL, NULL, $4)
         RETURNING id`,
        [input.postId, artistId, body, now],
      );
      insertedConfirmCommentId = inserted.rows[0]?.id ?? null;
    }
  }

  const updateClaim = await client.query(
    `UPDATE artist_private_identifications
     SET state = 'revealed',
         revealed_at = $2,
         updated_at = $2
     WHERE id = $1 AND state = 'anonymous'
     RETURNING *`,
    [String(claimRow.id), now],
  );
  if ((updateClaim.rowCount ?? 0) === 0) {
    // Lost race to another reveal — re-read and treat as idempotent.
    const again = await client.query(
      `SELECT * FROM artist_private_identifications WHERE id = $1 LIMIT 1`,
      [String(claimRow.id)],
    );
    return {
      claim: mapClaimRow(again.rows[0] as Record<string, unknown>),
      alreadyRevealed: true,
      // Prefer not to report a comment insert that may have been orphaned by the race.
      insertedConfirmCommentId: null,
    };
  }

  await client.query(
    `UPDATE posts
     SET is_artist_verified_anonymous = false,
         is_verified_artist = true,
         artist_verified_by = $2,
         verified_comment_id = $3,
         denied_by_artist = false,
         denied_at = NULL,
         verification_status = 'identified'
     WHERE id = $1`,
    [input.postId, artistId, verifiedCommentId],
  );

  return {
    claim: mapClaimRow(updateClaim.rows[0] as Record<string, unknown>),
    alreadyRevealed: false,
    insertedConfirmCommentId,
  };
}

/**
 * VAT-ANON-4: one-way reveal of an owner anonymous claim.
 * Thin transaction wrapper around revealAnonymousArtistIdentificationInTxn.
 * No notifications. No VAT re-gate. Does not delete the claim row.
 */
export async function revealAnonymousArtistIdentification(
  input: RevealAnonymousClaimInput,
  deps?: { now?: () => Date },
): Promise<RevealAnonymousClaimResult> {
  void input.bodyArtistId;

  const artistId = input.artistId;
  const { username } = await assertVerifiedArtistProfile(artistId);
  const now = deps?.now?.() ?? new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await revealAnonymousArtistIdentificationInTxn(client, {
      postId: input.postId,
      artistId,
      username,
      now,
    });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (err instanceof AnonymousClaimError) throw err;
    throw err;
  } finally {
    client.release();
  }
}

export async function getAnonymousClaimForOwner(
  postId: string,
  artistId: string,
): Promise<ArtistPrivateIdentificationRow | null> {
  const result = await pool.query(
    `SELECT *
     FROM artist_private_identifications
     WHERE post_id = $1 AND artist_id = $2 AND state IN ('anonymous', 'revealed')
     LIMIT 1`,
    [postId, artistId],
  );
  if (!result.rows[0]) return null;
  return mapClaimRow(result.rows[0] as Record<string, unknown>);
}

export type ModeratorPrivateClaimView = ArtistPrivateIdentificationRow & {
  artistUsername: string | null;
};

export async function getAnonymousClaimForModerator(
  postId: string,
): Promise<ModeratorPrivateClaimView | null> {
  const result = await pool.query(
    `SELECT c.*, pr.username AS artist_username
     FROM artist_private_identifications c
     JOIN profiles pr ON pr.id = c.artist_id
     WHERE c.post_id = $1 AND c.state IN ('anonymous', 'revealed')
     LIMIT 1`,
    [postId],
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    ...mapClaimRow(row),
    artistUsername: row.artist_username != null ? String(row.artist_username) : null,
  };
}

/** List own claims for future VAT-ANON-4 management (no UI yet). */
export async function listAnonymousClaimsForOwner(
  artistId: string,
): Promise<ArtistPrivateIdentificationRow[]> {
  const result = await pool.query(
    `SELECT *
     FROM artist_private_identifications
     WHERE artist_id = $1 AND state IN ('anonymous', 'revealed')
     ORDER BY claimed_at DESC`,
    [artistId],
  );
  return result.rows.map((row) => mapClaimRow(row as Record<string, unknown>));
}
