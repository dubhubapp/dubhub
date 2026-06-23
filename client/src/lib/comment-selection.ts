import type { CommentWithUser } from "@shared/schema";

export type CommentForIdSelection = CommentWithUser & {
  /** 0 = top-level, 1+ = nested reply depth */
  selectionDepth: number;
  /** Username of the parent comment author when this row is a reply */
  parentAuthorUsername?: string | null;
};

export type CommentTreeLookupResult = {
  comment: CommentWithUser;
  isReply: boolean;
  parentId: string | null;
  parentAuthorUsername: string | null;
};

/**
 * Depth-first search for a comment anywhere in the threaded tree.
 */
export function findCommentInTree(
  comments: CommentWithUser[],
  commentId: string | null | undefined,
): CommentTreeLookupResult | null {
  if (commentId == null || String(commentId).trim() === "") return null;
  const targetId = String(commentId);

  const walk = (
    items: CommentWithUser[],
    parentAuthorUsername: string | null,
  ): CommentTreeLookupResult | null => {
    for (const comment of items) {
      if (String(comment.id) === targetId) {
        const rawParentId = comment.parentId ?? (comment as { parent_id?: string | null }).parent_id ?? null;
        const parentId =
          rawParentId != null && String(rawParentId).trim() !== "" ? String(rawParentId) : null;
        return {
          comment,
          isReply: parentId != null,
          parentId,
          parentAuthorUsername: parentId != null ? parentAuthorUsername : null,
        };
      }
      const replies = Array.isArray(comment.replies) ? comment.replies : [];
      if (replies.length > 0) {
        const found = walk(replies, comment.user?.username ?? null);
        if (found) return found;
      }
    }
    return null;
  };

  return walk(Array.isArray(comments) ? comments : [], null);
}

/**
 * Depth-first flatten of threaded comments for correct-ID selection lists.
 * Preserves original comment objects; replies are included in document order under each parent.
 */
export function flattenCommentsForIdSelection(comments: CommentWithUser[]): CommentForIdSelection[] {
  const result: CommentForIdSelection[] = [];

  const walk = (items: CommentWithUser[], depth: number, parentUsername?: string | null) => {
    for (const comment of items) {
      result.push({
        ...comment,
        selectionDepth: depth,
        parentAuthorUsername: depth > 0 ? (parentUsername ?? null) : null,
      });
      const replies = Array.isArray(comment.replies) ? comment.replies : [];
      if (replies.length > 0) {
        walk(replies, depth + 1, comment.user?.username ?? null);
      }
    }
  };

  walk(Array.isArray(comments) ? comments : [], 0);
  return result;
}
