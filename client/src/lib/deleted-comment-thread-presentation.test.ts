/**
 * COMMENT-DELETE-2 — deleted-leaf hiding + deleted-parent tombstone.
 * Source + helper only: does not exercise fetch, delete mutations, or sheet lifecycle.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DELETED_COMMENT_BODY,
  DELETED_COMMENT_DISPLAY,
  shouldHideDeletedCommentLeaf,
} from "@shared/deleted-comment";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");

describe("COMMENT-DELETE-2 hide-leaf helper", () => {
  it("omits a deleted comment with zero replies", () => {
    assert.equal(
      shouldHideDeletedCommentLeaf({ body: DELETED_COMMENT_BODY, replies: [] }),
      true,
    );
    assert.equal(
      shouldHideDeletedCommentLeaf({ body: DELETED_COMMENT_BODY }),
      true,
    );
  });

  it("keeps a deleted parent when any replies remain", () => {
    assert.equal(
      shouldHideDeletedCommentLeaf({
        body: DELETED_COMMENT_BODY,
        replies: [{ id: "r1" }],
      }),
      false,
    );
  });

  it("never hides a live comment, even with zero replies", () => {
    assert.equal(
      shouldHideDeletedCommentLeaf({ body: "nice ID", replies: [] }),
      false,
    );
  });
});

describe("COMMENT-DELETE-2 comments-modal presentation", () => {
  const topLevel = commentsSrc.slice(
    commentsSrc.indexOf("renderTopLevelComment ="),
    commentsSrc.indexOf("identificationClusterComments.map"),
  );

  it("filters deleted leaves out of top-level collections before mapping rows", () => {
    assert.equal((commentsSrc.match(/filter\(isVisibleInCommentsThread\)/g) ?? []).length, 2);
    assert.match(
      topLevel,
      /if \(commentIsDeleted && visibleReplies\.length === 0\) \{\s*return null;/,
    );
  });

  it("filters deleted reply leaves before REPLY_BATCH_SIZE slicing", () => {
    assert.match(commentsSrc, /visibleRepliesForComment/);
    assert.match(
      commentsSrc,
      /visibleReplies\s*\n\s*\.slice\(0, visibleReplyCountByParent\[comment\.id\] \?\? 0\)/,
    );
    assert.doesNotMatch(
      commentsSrc,
      /sortedRepliesChronological\(comment\.replies\)\s*\n\s*\.slice\(0, visibleReplyCountByParent/,
    );
  });

  it("deleted parent tombstone uses a generic avatar and Comment deleted, not identity chrome", () => {
    assert.match(topLevel, /getDefaultAvatarPublicUrl\("user"\)/);
    assert.match(topLevel, /avatar-default-media/);
    const displayBranch = topLevel.slice(
      topLevel.indexOf("{DELETED_COMMENT_DISPLAY}"),
      topLevel.indexOf("flex flex-wrap items-center gap-x-1.5 gap-y-0.5"),
    );
    assert.match(displayBranch, /DELETED_COMMENT_DISPLAY/);
    assert.doesNotMatch(displayBranch, /formatUsernameDisplay\(comment\.user\.username\)/);
    assert.doesNotMatch(displayBranch, /UserRoleInlineIcons/);
    assert.doesNotMatch(displayBranch, /formatTimeAgo\(comment\.createdAt\)/);
    assert.equal(DELETED_COMMENT_DISPLAY, "Comment deleted");
  });

  it("keeps data-comment-id on remaining parent rows and live replies", () => {
    assert.match(topLevel, /data-comment-id=\{comment\.id\}/);
    assert.match(commentsSrc, /data-comment-id=\{reply\.id\}/);
  });

  it("does not change ordinary comment like/reply contracts", () => {
    assert.match(commentsSrc, /data-testid=\{`button-like-\$\{comment\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`reply-button-\$\{comment\.id\}`\}/);
    assert.match(commentsSrc, /flex w-8 shrink-0 flex-col items-center/);
    assert.match(commentsSrc, /className=\{cn\("flex items-start space-x-2", highlightClass\)\}/);
  });

  it("does not duplicate or weaken server verification deletion protection", () => {
    assert.doesNotMatch(commentsSrc, /isCommentDeletionBlockedByVerification/);
    assert.match(commentsSrc, /apiRequest\("DELETE", `\/api\/comments\/\$\{commentId\}`\)/);
  });
});
