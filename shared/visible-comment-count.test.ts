import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELETED_COMMENT_BODY,
  countVisibleComments,
} from "./deleted-comment";

describe("COMMENT-COUNT-2 visible post comment count", () => {
  it("2 live top-level + 1 live reply → 3", () => {
    assert.equal(countVisibleComments(["id this", "sounds like x", "reply: y"]), 3);
  });

  it("one leaf tombstoned → 2", () => {
    assert.equal(
      countVisibleComments(["id this", DELETED_COMMENT_BODY, "reply: y"]),
      2,
    );
  });

  it("deleted parent + two live replies → 2", () => {
    assert.equal(
      countVisibleComments([DELETED_COMMENT_BODY, "reply a", "reply b"]),
      2,
    );
  });

  it("only tombstones → 0", () => {
    assert.equal(
      countVisibleComments([DELETED_COMMENT_BODY, DELETED_COMMENT_BODY]),
      0,
    );
  });
});
