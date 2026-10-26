import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveCommentsReadViewerId } from "./comments-read-viewer-state";

const here = dirname(fileURLToPath(import.meta.url));
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const now = Date.parse("2026-10-26T16:00:00.000Z");
const viewerId = "viewer-1";

describe("comments read viewer state", () => {
  it("keeps an active viewer's id for has_liked", () => {
    assert.equal(
      resolveCommentsReadViewerId(viewerId, { banned: false, suspended_until: null }, now),
      viewerId,
    );
    const comments = storageSrc.slice(
      storageSrc.indexOf("async getPostComments("),
      storageSrc.indexOf("async createComment("),
    );
    const signedIn = comments.slice(comments.indexOf("if (currentUserId)"), comments.indexOf("} else {"));
    assert.match(signedIn, /cv2\.user_id = \$2/);
    assert.match(signedIn, /AS has_liked/);
  });

  it("suppresses viewer state when the profile is banned", () => {
    assert.equal(
      resolveCommentsReadViewerId(
        viewerId,
        { banned: true, suspended_until: null },
        now,
      ),
      undefined,
    );
  });

  it("suppresses viewer state during a current suspension", () => {
    assert.equal(
      resolveCommentsReadViewerId(
        viewerId,
        { banned: false, suspended_until: "2026-10-27T00:00:00.000Z" },
        now,
      ),
      undefined,
    );
  });

  it("treats an expired suspension as an active viewer", () => {
    assert.equal(
      resolveCommentsReadViewerId(
        viewerId,
        { banned: false, suspended_until: "2026-10-26T15:00:00.000Z" },
        now,
      ),
      viewerId,
    );
  });

  it("suppresses viewer state when the profile row is missing", () => {
    assert.equal(resolveCommentsReadViewerId(viewerId, null, now), undefined);
    assert.equal(resolveCommentsReadViewerId(viewerId, undefined, now), undefined);
  });

  it("leaves an anonymous read without a viewer id", () => {
    assert.equal(
      resolveCommentsReadViewerId(null, { banned: false, suspended_until: null }, now),
      undefined,
    );
    assert.equal(
      resolveCommentsReadViewerId(undefined, { banned: false, suspended_until: null }, now),
      undefined,
    );
  });
});
