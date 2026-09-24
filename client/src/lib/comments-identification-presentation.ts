/**
 * Comments identification presentation helpers — UI only.
 * Does not mutate comments, posts, or identification backend state.
 */

import {
  extractArtistTrackTitleFromConfirmComment,
  formatAnonymousIdentificationTitleLabel,
} from "@shared/artist-private-identification";
import { formatUsernameDisplay } from "@/lib/utils";

export type CommentsIdentificationCommentLike = {
  id: string;
  body?: string | null;
  userId?: string | null;
  user?: {
    id?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    account_type?: string | null;
    verified_artist?: boolean | null;
    moderator?: boolean | null;
  } | null;
  replies?: CommentsIdentificationCommentLike[] | null;
};

/** Match stored artist helper bodies, including legacy leading ✅. */
export function isArtistConfirmationHelperBody(body: string | null | undefined): boolean {
  if (typeof body !== "string") return false;
  const normalized = body.trim().replace(/^✅\s*/, "");
  return normalized.toLowerCase().includes("confirmed:");
}

export function findArtistConfirmationCommentId(
  comments: CommentsIdentificationCommentLike[],
  artistVerifiedBy: string | null | undefined,
  isArtistVerifiedPost: boolean,
): string | null {
  if (!isArtistVerifiedPost || !artistVerifiedBy) return null;
  const match = comments.find((c) => {
    const userId = c.userId ?? c.user?.id ?? null;
    return userId === artistVerifiedBy && isArtistConfirmationHelperBody(c.body);
  });
  return match?.id ?? null;
}

/**
 * Discussion pin under an artist header: genuine source only.
 * Never pin the synthetic `@… confirmed:` helper as a discussion row.
 */
export function resolveArtistIdentificationDiscussionPinId(
  verifiedCommentId: string | null | undefined,
  artistConfirmationCommentId: string | null | undefined,
): string | null {
  if (verifiedCommentId == null || verifiedCommentId === "") return null;
  if (
    artistConfirmationCommentId != null &&
    artistConfirmationCommentId !== "" &&
    verifiedCommentId === artistConfirmationCommentId
  ) {
    return null;
  }
  return verifiedCommentId;
}

function trimTitle(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Anonymous header track title: prefer public post projection.
 * Owner-only fallback to private claim title — never for non-owners.
 */
export function resolveAnonymousHeaderTrackTitle(options: {
  anonymousTrackTitle?: string | null;
  ownerClaimTrackTitle?: string | null;
  isOwnerViewer: boolean;
}): string | null {
  const fromPost = trimTitle(options.anonymousTrackTitle);
  if (fromPost) return fromPost;
  if (!options.isOwnerViewer) return null;
  return trimTitle(options.ownerClaimTrackTitle);
}

/** Anonymous status text: `ID - {title}` or null when untitled. */
export function resolveAnonymousIdentificationHeaderLabel(
  trackTitle: string | null | undefined,
): string | null {
  return formatAnonymousIdentificationTitleLabel(trackTitle);
}

function findUsernameForUserId(
  comments: CommentsIdentificationCommentLike[],
  userId: string,
): string | null {
  for (const c of comments) {
    const id = c.userId ?? c.user?.id ?? null;
    const username = c.user?.username;
    if (id === userId && typeof username === "string" && username.trim()) {
      return username.trim();
    }
    const replies = c.replies;
    if (Array.isArray(replies) && replies.length > 0) {
      const nested = findUsernameForUserId(replies, userId);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Structured verifying-artist username: helper author first, else any comment by artistVerifiedBy.
 */
export function resolveVerifyingArtistUsername(
  comments: CommentsIdentificationCommentLike[],
  artistVerifiedBy: string | null | undefined,
  helperComment?: CommentsIdentificationCommentLike | null,
): string | null {
  const fromHelper = helperComment?.user?.username;
  if (typeof fromHelper === "string" && fromHelper.trim()) {
    return fromHelper.trim();
  }
  if (!artistVerifiedBy) return null;
  return findUsernameForUserId(comments, artistVerifiedBy);
}

/** Prefer helper author user, else first comment/reply by artistVerifiedBy. */
export function resolveVerifyingArtistUser(
  comments: CommentsIdentificationCommentLike[],
  artistVerifiedBy: string | null | undefined,
  helperComment?: CommentsIdentificationCommentLike | null,
): CommentsIdentificationCommentLike["user"] | null {
  if (helperComment?.user?.username?.trim()) {
    return helperComment.user;
  }
  if (!artistVerifiedBy) return null;
  for (const c of comments) {
    const id = c.userId ?? c.user?.id ?? null;
    if (id === artistVerifiedBy && c.user?.username?.trim()) {
      return c.user;
    }
    const replies = c.replies;
    if (Array.isArray(replies)) {
      for (const r of replies) {
        const rid = r.userId ?? r.user?.id ?? null;
        if (rid === artistVerifiedBy && r.user?.username?.trim()) {
          return r.user;
        }
      }
    }
  }
  return null;
}

export type PublicArtistIdentificationHeaderParts = {
  username: string;
  title: string | null;
};

/**
 * Public artist header parts: structured username + parsed track title.
 * Never uses anonymous `ID -` language or collaborator credit strings.
 */
export function resolvePublicArtistIdentificationHeaderParts(options: {
  verifyingArtistUsername?: string | null;
  confirmCommentBody?: string | null;
}): PublicArtistIdentificationHeaderParts | null {
  const raw =
    typeof options.verifyingArtistUsername === "string"
      ? options.verifyingArtistUsername.trim()
      : "";
  if (!raw) return null;
  return {
    username: raw,
    title: extractArtistTrackTitleFromConfirmComment(options.confirmCommentBody),
  };
}

/**
 * Public artist header copy: `@Artist - Title` or `@Artist` when title missing.
 * Prefer `resolvePublicArtistIdentificationHeaderParts` for interactive rendering.
 */
export function resolvePublicArtistIdentificationHeaderLabel(options: {
  verifyingArtistUsername?: string | null;
  confirmCommentBody?: string | null;
}): string | null {
  const parts = resolvePublicArtistIdentificationHeaderParts(options);
  if (!parts) return null;
  const handle = formatUsernameDisplay(parts.username);
  if (!handle) return null;
  return parts.title ? `${handle} - ${parts.title}` : handle;
}

/** @deprecated Prefer resolveAnonymous / resolvePublic helpers. */
export function resolveArtistIdentificationHeaderTitleLabel(options: {
  isAnonymousIdentified: boolean;
  anonymousTrackTitle?: string | null;
  confirmCommentBody?: string | null;
  verifyingArtistUsername?: string | null;
}): string | null {
  if (options.isAnonymousIdentified) {
    return resolveAnonymousIdentificationHeaderLabel(options.anonymousTrackTitle);
  }
  return resolvePublicArtistIdentificationHeaderLabel({
    verifyingArtistUsername: options.verifyingArtistUsername,
    confirmCommentBody: options.confirmCommentBody,
  });
}
