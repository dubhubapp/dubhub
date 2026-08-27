import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { countVisibleComments, DELETED_COMMENT_BODY } from "@shared/deleted-comment";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

const deleteMutation = commentsSrc.slice(
  commentsSrc.indexOf("const deleteCommentMutation = useMutation"),
  commentsSrc.indexOf("const requestDeleteComment"),
);

const addMutationOnMutate = commentsSrc.slice(
  commentsSrc.indexOf("onMutate: () => {"),
  commentsSrc.indexOf("onSuccess: (data, variables) => {"),
);

describe("COMMENT-COUNT-2 client decrement and cache", () => {
  it("successful first delete decrements feed cache and mounted bump by 1", () => {
    assert.match(
      deleteMutation,
      /patchPostInFeedCaches\(queryClient, post\.id, \(p\) => bumpPostCommentCount\(p, -1\)\)/,
    );
    assert.match(deleteMutation, /onCommentCountDelta\?\.\(-1\)/);
  });

  it("alreadyDeleted: true does not decrement", () => {
    assert.match(deleteMutation, /if \(data\?\.alreadyDeleted === true\) return;/);
    const decrementIdx = deleteMutation.indexOf("bumpPostCommentCount(p, -1)");
    const guardIdx = deleteMutation.indexOf("alreadyDeleted === true");
    assert.ok(guardIdx >= 0 && decrementIdx > guardIdx);
  });

  it("failed delete does not decrement", () => {
    assert.match(deleteMutation, /onError: \(error: unknown\) => \{/);
    const onError = deleteMutation.slice(deleteMutation.indexOf("onError:"));
    assert.doesNotMatch(onError, /bumpPostCommentCount/);
    assert.doesNotMatch(onError, /onCommentCountDelta/);
  });

  it("create still increments by 1", () => {
    assert.match(
      addMutationOnMutate,
      /patchPostInFeedCaches\(queryClient, post\.id, \(p\) => bumpPostCommentCount\(p, 1\)\)/,
    );
    assert.match(addMutationOnMutate, /onCommentCountDelta\?\.\(1\)/);
  });

  it("patches infinite feed, single post, profile posts, and liked-posts caches", () => {
    assert.match(commentsSrc, /queryKey: \["\/api\/posts"\], exact: false/);
    assert.match(commentsSrc, /\(old as PostWithUser\)\.id === postId/);
    assert.match(commentsSrc, /key\[0\] === "\/api\/user"/);
    assert.match(commentsSrc, /key\[2\] === "posts"/);
    assert.match(commentsSrc, /key\[2\] === "liked-posts"/);
  });

  it("keeps VideoCard commentCountBump plumbing for -1", () => {
    assert.match(
      videoCardSrc,
      /onCommentCountDelta=\{\(delta\) => setCommentCountBump\(\(n\) => n \+ delta\)\}/,
    );
    assert.match(
      videoCardSrc,
      /formatCount\(Number\(post\.comments \?\? 0\) \+ commentCountBump\)/,
    );
  });

  it("immediate decrement matches fresh backend visible count", () => {
    const before = ["live a", "live b", "live reply"];
    const afterFirstDelete = ["id this", DELETED_COMMENT_BODY, "live reply"];
    assert.equal(countVisibleComments(before), 3);
    assert.equal(countVisibleComments(afterFirstDelete), 2);
    assert.equal(
      countVisibleComments(afterFirstDelete),
      countVisibleComments(before) - 1,
    );
  });
});
