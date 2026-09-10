import { isDeletedCommentBody } from "@shared/deleted-comment";
import { commentMentionsUsername } from "@shared/mentionParsing";
import { flattenCommentsForIdSelection } from "@/lib/comment-selection";
import type { CommentWithUser } from "@shared/schema";

export type ArtistPendingActionPostFields = {
  userId?: string | null;
  user_id?: string | null;
  user?: { id?: string | null } | null;
  verificationStatus?: string | null;
  verification_status?: string | null;
  isVerifiedCommunity?: boolean | null;
  is_verified_community?: boolean | null;
  verifiedByModerator?: boolean | null;
  verified_by_moderator?: boolean | null;
  isVerifiedArtist?: boolean | null;
  is_verified_artist?: boolean | null;
  artistVerifiedBy?: string | null;
  artist_verified_by?: string | null;
  deniedByArtist?: boolean | null;
  denied_by_artist?: boolean | null;
  /** Per-artist denial for the current viewer (preferred over post-level deniedByArtist). */
  currentUserDeniedAsArtist?: boolean | null;
  current_user_denied_as_artist?: boolean | null;
  currentUserTaggedAsArtist?: boolean | null;
  current_user_tagged_as_artist?: boolean | null;
};

/**
 * Mirrors VideoCard tagged-artist rail ID eligibility (pending actions only).
 * Does not expand beyond the existing rail gate (e.g. community-pending stays hidden).
 *
 * @param opts.hasCommentTaggingArtist — when feed post flag is stale (common on
 *   notification deep-link into a cached Home row), Comments can prove the tag
 *   from loaded thread bodies / artist_tag once comments hydrate.
 */
export function isArtistPendingActionEligible(
  post: ArtistPendingActionPostFields,
  currentUserId: string | null | undefined,
  opts?: { verifiedArtist?: boolean | null; hasCommentTaggingArtist?: boolean },
): boolean {
  if (!currentUserId) return false;
  if (opts?.verifiedArtist === false) return false;

  const isTaggedArtist = !!(
    post.currentUserTaggedAsArtist ?? post.current_user_tagged_as_artist
  );
  if (!isTaggedArtist && !opts?.hasCommentTaggingArtist) return false;

  return isArtistPendingPostStateEligible(post, currentUserId);
}

/**
 * Identification / deny gates only — ignores the feed tagged flag.
 * Used so Comments can recompute when comments hydrate after a stale open.
 */
export function isArtistPendingPostStateEligible(
  post: ArtistPendingActionPostFields,
  currentUserId: string | null | undefined,
): boolean {
  if (!currentUserId) return false;

  // Prefer per-artist denial; post-level denied_by_artist alone cannot identify who denied.
  const currentUserDenied = !!(
    post.currentUserDeniedAsArtist ?? post.current_user_denied_as_artist
  );
  if (currentUserDenied) return false;

  const status = post.verificationStatus ?? post.verification_status;
  const isVerifiedCommunity = !!(post.isVerifiedCommunity ?? post.is_verified_community);
  const isModeratorVerified = !!(post.verifiedByModerator ?? post.verified_by_moderator);
  const isArtistVerified = !!(post.isVerifiedArtist ?? post.is_verified_artist);
  const artistVerifiedBy = post.artistVerifiedBy ?? post.artist_verified_by ?? null;

  const isAnyIdentifiedState =
    isVerifiedCommunity ||
    status === "community_approved" ||
    status === "verified" ||
    status === "identified" ||
    status === "community" ||
    isModeratorVerified ||
    isArtistVerified ||
    !!artistVerifiedBy;

  if (isAnyIdentifiedState) return false;

  const alreadyArtistConfirmed = isArtistVerified && artistVerifiedBy === currentUserId;
  if (alreadyArtistConfirmed) return false;

  const alreadyArtistVerifiedBySomeone = isArtistVerified && !!artistVerifiedBy;
  return !alreadyArtistVerifiedBySomeone;
}

/**
 * Resolve whether Comments should show artist tag actions while mounted.
 * Prefers live post flag; falls back to hydrated comments when flag is stale.
 */
export function resolveArtistPendingActionsVisible(params: {
  post: ArtistPendingActionPostFields;
  currentUserId: string | null | undefined;
  verifiedArtist: boolean | null | undefined;
  feedFlagEnabled?: boolean;
  comments: CommentWithUser[];
  artist: { id: string; username?: string | null } | null;
}): boolean {
  const { post, currentUserId, verifiedArtist, feedFlagEnabled, comments, artist } = params;
  if (!currentUserId || verifiedArtist === false || !artist?.id) return false;
  if (!isArtistPendingPostStateEligible(post, currentUserId)) return false;

  if (feedFlagEnabled) return true;
  if (isArtistPendingActionEligible(post, currentUserId, { verifiedArtist: true })) return true;

  return comments.some((c) => commentTagsCurrentArtist(c, artist));
}

/**
 * Whether a comment/reply tags this artist.
 * Uses `comments.artist_tag` (first tagged artist profile id) and @username fallback
 * so multi-artist mentions still isolate to the reviewing artist.
 */
export function commentTagsCurrentArtist(
  comment: {
    body?: unknown;
    artistTag?: string | null;
    artist_tag?: string | null;
    taggedArtist?: { id?: string | null; username?: string | null } | null;
  },
  artist: { id: string; username?: string | null },
): boolean {
  if (!artist.id) return false;
  if (isDeletedCommentBody(comment.body)) return false;

  const taggedArtistId =
    comment.taggedArtist?.id ?? comment.artistTag ?? comment.artist_tag ?? null;
  if (taggedArtistId && String(taggedArtistId) === String(artist.id)) return true;

  const username = artist.username?.trim();
  if (username && typeof comment.body === "string") {
    return commentMentionsUsername(comment.body, username);
  }
  return false;
}

export function isCommentEligibleForArtistConfirmId(
  comment: {
    body?: unknown;
    artistTag?: string | null;
    artist_tag?: string | null;
    taggedArtist?: { id?: string | null; username?: string | null } | null;
  },
  artist: { id: string; username?: string | null },
): boolean {
  return commentTagsCurrentArtist(comment, artist);
}

/** Earliest (by createdAt) non-deleted comment/reply tagging this artist — for deny API commentId. */
export function findEarliestCommentIdTaggingArtist(
  comments: CommentWithUser[],
  artist: { id: string; username?: string | null },
): string | null {
  const flat = flattenCommentsForIdSelection(Array.isArray(comments) ? comments : []);
  const matches = flat.filter((c) => commentTagsCurrentArtist(c, artist));
  if (matches.length === 0) return null;

  const toTime = (value: unknown) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    const t = new Date(value as string).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  matches.sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
  return matches[0]?.id ?? null;
}
