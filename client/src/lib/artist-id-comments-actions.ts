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
  /** Public anonymous artist attestation (identity hidden). */
  isArtistVerifiedAnonymous?: boolean | null;
  is_artist_verified_anonymous?: boolean | null;
  /** Optional public track title while anonymously identified. */
  anonymousTrackTitle?: string | null;
  anonymous_track_title?: string | null;
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

/** Server-allowed createdVia for comments decline-flow anonymous identify. */
export const ANONYMOUS_IDENTIFY_CREATED_VIA = "tag_decline" as const;

/** Server-allowed createdVia for main ArtistVerificationDialog anonymous identify. */
export const ANONYMOUS_IDENTIFY_CONFIRM_CREATED_VIA = "confirm_dialog" as const;

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
  const isArtistVerifiedAnonymous = !!(
    post.isArtistVerifiedAnonymous ?? post.is_artist_verified_anonymous
  );
  const artistVerifiedBy = post.artistVerifiedBy ?? post.artist_verified_by ?? null;

  const isAnyIdentifiedState =
    isVerifiedCommunity ||
    status === "community_approved" ||
    status === "verified" ||
    status === "identified" ||
    status === "community" ||
    isModeratorVerified ||
    isArtistVerified ||
    isArtistVerifiedAnonymous ||
    !!artistVerifiedBy;

  if (isAnyIdentifiedState) return false;

  const alreadyArtistConfirmed = isArtistVerified && artistVerifiedBy === currentUserId;
  if (alreadyArtistConfirmed) return false;

  const alreadyArtistVerifiedBySomeone = isArtistVerified && !!artistVerifiedBy;
  return !alreadyArtistVerifiedBySomeone;
}

/** Client-side viewer denial flags after successful POST /artist-deny (Comments refresh). */
export function markViewerArtistDeniedOnPost<T extends ArtistPendingActionPostFields>(post: T): T {
  return {
    ...post,
    currentUserDeniedAsArtist: true,
    current_user_denied_as_artist: true,
  };
}

/**
 * Optimistic public projection after POST /artist-identify-anonymous.
 * Matches server public scrub: anonymous flag on, no public artist id.
 */
export function markViewerArtistAnonymouslyIdentifiedOnPost<
  T extends ArtistPendingActionPostFields,
>(post: T, anonymousTrackTitle?: string | null): T {
  const trimmed =
    typeof anonymousTrackTitle === "string" && anonymousTrackTitle.trim()
      ? anonymousTrackTitle.trim()
      : null;
  return {
    ...post,
    isArtistVerifiedAnonymous: true,
    is_artist_verified_anonymous: true,
    isVerifiedArtist: false,
    is_verified_artist: false,
    artistVerifiedBy: null,
    artist_verified_by: null,
    verificationStatus: "identified",
    verification_status: "identified",
    anonymousTrackTitle: trimmed,
    anonymous_track_title: trimmed,
  };
}

/**
 * Optimistic public projection after POST /artist-reveal-identification.
 * Clears anonymous scrub; exposes current viewer as public verifying artist.
 */
export function markViewerArtistRevealedOnPost<
  T extends ArtistPendingActionPostFields,
>(post: T, artistId: string): T {
  return {
    ...post,
    isArtistVerifiedAnonymous: false,
    is_artist_verified_anonymous: false,
    isVerifiedArtist: true,
    is_verified_artist: true,
    artistVerifiedBy: artistId,
    artist_verified_by: artistId,
    verificationStatus: "identified",
    verification_status: "identified",
    anonymousTrackTitle: null,
    anonymous_track_title: null,
  };
}

/** VAT-ANON-5.1: copy for anonymous-ID info popover (no identity leak). */
export const ANONYMOUS_ID_INFO_TITLE = "Why is the artist hidden?";
export const ANONYMOUS_ID_INFO_BODY =
  "An artist has confirmed this track but is keeping their identity private for now. Like this post and we’ll let you know when they reveal the full ID or link it to a release.";

function readAnonymousFlag(post: ArtistPendingActionPostFields): boolean {
  return !!(post.isArtistVerifiedAnonymous ?? post.is_artist_verified_anonymous);
}

function readArtistVerifiedFlag(post: ArtistPendingActionPostFields): boolean {
  return !!(post.isVerifiedArtist ?? post.is_verified_artist);
}

function readArtistVerifiedBy(post: ArtistPendingActionPostFields): string | null {
  const raw = post.artistVerifiedBy ?? post.artist_verified_by ?? null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readAnonymousTrackTitle(post: ArtistPendingActionPostFields): string | null {
  const raw = post.anonymousTrackTitle ?? post.anonymous_track_title ?? null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readVerificationStatus(post: ArtistPendingActionPostFields): string | null {
  const raw = post.verificationStatus ?? post.verification_status ?? null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * VAT-ANON-5.1: Comments keeps an open-time `commentsPost` snapshot.
 * Feed pill updates from live `post`, but Comments stays stale unless these
 * identification fields are merged from the live feed row.
 */
export function commentsPostNeedsIdentificationSync(
  live: ArtistPendingActionPostFields,
  frozen: ArtistPendingActionPostFields,
): boolean {
  return (
    readAnonymousFlag(live) !== readAnonymousFlag(frozen) ||
    readArtistVerifiedFlag(live) !== readArtistVerifiedFlag(frozen) ||
    readArtistVerifiedBy(live) !== readArtistVerifiedBy(frozen) ||
    readAnonymousTrackTitle(live) !== readAnonymousTrackTitle(frozen) ||
    readVerificationStatus(live) !== readVerificationStatus(frozen)
  );
}

/**
 * Merge live feed identification projection into the open Comments snapshot.
 * Does not touch comment draft, scroll, or unrelated post fields.
 */
export function syncCommentsPostIdentificationFromLiveFeed<
  T extends ArtistPendingActionPostFields,
>(live: T, frozen: T): T {
  if (!commentsPostNeedsIdentificationSync(live, frozen)) return frozen;
  const anon = readAnonymousFlag(live);
  const title = readAnonymousTrackTitle(live);
  const verifiedBy = readArtistVerifiedBy(live);
  const status = readVerificationStatus(live);
  return {
    ...frozen,
    isArtistVerifiedAnonymous: anon,
    is_artist_verified_anonymous: anon,
    isVerifiedArtist: readArtistVerifiedFlag(live),
    is_verified_artist: readArtistVerifiedFlag(live),
    artistVerifiedBy: verifiedBy,
    artist_verified_by: verifiedBy,
    verificationStatus: status ?? frozen.verificationStatus ?? frozen.verification_status,
    verification_status: status ?? frozen.verification_status ?? frozen.verificationStatus,
    anonymousTrackTitle: title,
    anonymous_track_title: title,
  };
}

export type AnonymousIdentifyErrorCopy = {
  title: string;
  description: string;
};

/** Map anonymous-identify API error codes to user-facing copy (no raw codes). */
export function resolveAnonymousIdentifyErrorCopy(
  code: string | null | undefined,
  fallbackMessage?: string | null,
): AnonymousIdentifyErrorCopy {
  switch (code) {
    case "PAID_ARTIST_TOOL_REQUIRED":
      return {
        title: "Verified Artist Tools required",
        description:
          "Identify anonymously is included with Verified Artist Tools. Artist verification remains free.",
      };
    case "FEATURE_DISABLED":
      return {
        title: "Unavailable",
        description: "Anonymous identification is temporarily unavailable.",
      };
    case "ARTIST_ALREADY_VERIFIED":
      return {
        title: "Already identified",
        description:
          fallbackMessage?.trim() ||
          "This post has already been identified by an artist.",
      };
    case "ANONYMOUS_CLAIM_EXISTS":
      return {
        title: "Already identified anonymously",
        description:
          fallbackMessage?.trim() ||
          "An anonymous identification already exists for this post.",
      };
    case "VERIFIED_ARTIST_REQUIRED":
      return {
        title: "Verified Artist required",
        description: "Verified artist profile required to identify tracks.",
      };
    case "TAG_REQUIRED":
    case "COMMENT_INVALID":
    case "COMMENT_NOT_FOUND":
      return {
        title: "Couldn't identify",
        description:
          fallbackMessage?.trim() ||
          "Open the tagged comment again, then try identifying anonymously.",
      };
    case "CLAIM_NOT_FOUND":
      return {
        title: "Nothing to reveal",
        description: "No anonymous identification was found for this post.",
      };
    case "NOT_CLAIM_OWNER":
      return {
        title: "Can't reveal",
        description: "Only the artist who identified this track anonymously can reveal it.",
      };
    case "POST_NOT_FOUND":
      return {
        title: "Couldn't identify",
        description: "This post is no longer available.",
      };
    default:
      return {
        title: "Couldn't identify anonymously",
        description:
          fallbackMessage?.trim() ||
          "Something went wrong. Try again in a moment.",
      };
  }
}

/** Parse ApiRequestError / legacy body shapes for anonymous-identify errors. */
export function readAnonymousIdentifyErrorCode(error: unknown): {
  code: string | null;
  message: string | null;
} {
  if (!error || typeof error !== "object") {
    return { code: null, message: null };
  }
  const record = error as {
    body?: { code?: unknown; message?: unknown };
    responseBody?: unknown;
    message?: unknown;
  };
  if (record.body && typeof record.body === "object") {
    return {
      code: typeof record.body.code === "string" ? record.body.code : null,
      message: typeof record.body.message === "string" ? record.body.message : null,
    };
  }
  if (typeof record.responseBody === "string" && record.responseBody.trim()) {
    try {
      const parsed = JSON.parse(record.responseBody) as {
        code?: unknown;
        message?: unknown;
      };
      return {
        code: typeof parsed.code === "string" ? parsed.code : null,
        message: typeof parsed.message === "string" ? parsed.message : null,
      };
    } catch {
      /* fall through */
    }
  }
  return {
    code: null,
    message: typeof record.message === "string" ? record.message : null,
  };
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
