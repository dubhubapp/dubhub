import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DELETED_COMMENT_BODY } from "@shared/deleted-comment";

const here = dirname(fileURLToPath(import.meta.url));
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");

function methodSource(startMarker: string, endMarker: string): string {
  const start = storageSrc.indexOf(startMarker);
  const end = storageSrc.indexOf(endMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `end marker ${endMarker} should follow ${startMarker}`);
  return storageSrc.slice(start, end);
}

const boundTombstoneFilter = /c\.body <> \$\{DELETED_COMMENT_BODY\}/;
const rawTombstoneLiteral = /'\[\[dh_comment_deleted\]\]'/;

describe("COMMENT-COUNT-2 storage post comment counts", () => {
  it("imports DELETED_COMMENT_BODY instead of duplicating the sentinel", () => {
    assert.match(
      storageSrc,
      /import \{ DELETED_COMMENT_BODY \} from "@shared\/deleted-comment"/,
    );
    assert.equal(DELETED_COMMENT_BODY, "[[dh_comment_deleted]]");
    assert.doesNotMatch(storageSrc, rawTombstoneLiteral);
  });

  it("binds the tombstone filter on all five canonical post count queries", () => {
    const getPosts = methodSource("async getPosts(", "async getPost(");
    const getPost = methodSource("async getPost(", "async getPostLikeCount(");
    const getUserLikedPosts = methodSource(
      "async getUserLikedPosts(",
      "async getPostComments(",
    );
    const getPostsByArtist = methodSource(
      "async getPostsByArtist(",
      "async getUserPostsWithDetails(",
    );
    const getUserPostsWithDetails = methodSource(
      "async getUserPostsWithDetails(",
      "async createCommentUserMention(",
    );

    for (const [name, src] of [
      ["getPosts", getPosts],
      ["getPost", getPost],
      ["getUserLikedPosts", getUserLikedPosts],
      ["getPostsByArtist", getPostsByArtist],
      ["getUserPostsWithDetails", getUserPostsWithDetails],
    ] as const) {
      assert.match(src, boundTombstoneFilter, `${name} must exclude tombstones`);
      assert.doesNotMatch(src, rawTombstoneLiteral, `${name} must not inline the sentinel`);
    }

    assert.equal((storageSrc.match(new RegExp(boundTombstoneFilter, "g")) ?? []).length, 5);
  });

  it("does not filter tombstones out of getPostComments thread rows", () => {
    const getPostComments = methodSource(
      "async getPostComments(",
      "async createComment(",
    );
    assert.doesNotMatch(getPostComments, boundTombstoneFilter);
    assert.doesNotMatch(getPostComments, /DELETED_COMMENT_BODY/);
    assert.match(getPostComments, /WHERE c\.post_id = \$1/);
  });

  it("does not change like-route counts.comments in this slice", () => {
    assert.match(
      routesSrc,
      /const counts = \{ likes: likesCount, comments: comments\.length, saves: 0 \}/,
    );
  });

  it("protected-ID delete still rejects and does not tombstone", () => {
    const deleteHandler = routesSrc.slice(
      routesSrc.indexOf('app.delete("/api/comments/:id"'),
      routesSrc.indexOf('app.get("/api/posts/:id/comments"'),
    );
    assert.match(deleteHandler, /isCommentDeletionBlockedByVerification/);
    assert.match(deleteHandler, /COMMENT_ATTACHED_TO_IDENTIFICATION_MESSAGE/);
    assert.match(deleteHandler, /alreadyDeleted: true/);
    assert.doesNotMatch(deleteHandler, /bumpPostCommentCount/);
  });
});
