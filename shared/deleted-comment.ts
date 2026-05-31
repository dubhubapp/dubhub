/** Stored in `comments.body` when a user soft-deletes their own comment. */
export const DELETED_COMMENT_BODY = "[[dh_comment_deleted]]" as const;

/** User-facing label rendered in the comments UI. */
export const DELETED_COMMENT_DISPLAY = "Comment deleted";

export const COMMENT_DELETED_INTERACTION_MESSAGE = "This comment has been deleted.";

export const COMMENT_ATTACHED_TO_IDENTIFICATION_MESSAGE =
  "This comment cannot be deleted because it is attached to an identification.";

const VERIFICATION_DEPENDENT_STATUSES = new Set([
  "community",
  "community_approved",
  "identified",
]);

export function isDeletedCommentBody(body: unknown): body is typeof DELETED_COMMENT_BODY {
  return body === DELETED_COMMENT_BODY;
}

/** True when this comment is pinned as the post's verified ID and must not be soft-deleted. */
export function isCommentDeletionBlockedByVerification(params: {
  commentId: string;
  verifiedCommentId: string | null | undefined;
  verificationStatus: string | null | undefined;
  isVerifiedArtist?: boolean | null;
}): boolean {
  const { commentId, verifiedCommentId, verificationStatus, isVerifiedArtist } = params;
  if (!verifiedCommentId || String(verifiedCommentId) !== String(commentId)) {
    return false;
  }
  const status = (verificationStatus ?? "").trim().toLowerCase();
  if (VERIFICATION_DEPENDENT_STATUSES.has(status)) {
    return true;
  }
  if (isVerifiedArtist === true) {
    return true;
  }
  return false;
}
