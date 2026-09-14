/**
 * ARTIST-ID-UX-2C — immediate Comments UI refresh after Not my track.
 * Helpers + source wiring. Does not hit network / mutate APIs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { CommentWithUser } from "@shared/schema";
import {
  markViewerArtistDeniedOnPost,
  resolveArtistPendingActionsVisible,
} from "./artist-id-comments-actions";

const here = dirname(fileURLToPath(import.meta.url));
const actionsSrc = readFileSync(join(here, "./artist-id-comments-actions.ts"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");

const artist = { id: "artist-a", username: "alpha" };

const pendingTaggedPost = {
  current_user_tagged_as_artist: true,
  currentUserTaggedAsArtist: true,
  verificationStatus: "unverified",
  isVerifiedArtist: false,
  artistVerifiedBy: null,
  deniedByArtist: false,
};

function taggingComment(): CommentWithUser {
  return {
    id: "c1",
    userId: "u1",
    postId: "p1",
    parentId: null,
    body: "this is @alpha",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    user: { id: "u1", username: "fan" } as CommentWithUser["user"],
    replies: [],
  } as CommentWithUser;
}

describe("ARTIST-ID-UX-2C immediate denial refresh", () => {
  it("before deny, contextual card gate is visible for tagged artist", () => {
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: pendingTaggedPost,
        currentUserId: artist.id,
        verifiedArtist: true,
        feedFlagEnabled: true,
        comments: [taggingComment()],
        artist,
      }),
      true,
    );
  });

  it("markViewerArtistDeniedOnPost flips denial flags immediately", () => {
    const next = markViewerArtistDeniedOnPost(pendingTaggedPost);
    assert.equal(next.currentUserDeniedAsArtist, true);
    assert.equal(next.current_user_denied_as_artist, true);
    assert.equal(next.currentUserTaggedAsArtist, true);
    assert.equal(next.current_user_tagged_as_artist, true);
  });

  it("after denial mark, contextual card / Confirm ID gate hides without reopening", () => {
    const denied = markViewerArtistDeniedOnPost(pendingTaggedPost);
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: denied,
        currentUserId: artist.id,
        verifiedArtist: true,
        feedFlagEnabled: true,
        comments: [taggingComment()],
        artist,
      }),
      false,
    );
    // Even if feed flag lags true and comments still @tag the artist.
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: denied,
        currentUserId: artist.id,
        verifiedArtist: true,
        feedFlagEnabled: false,
        comments: [taggingComment()],
        artist,
      }),
      false,
    );
  });

  it("denied state still wins after close/reopen-style snapshot with denial flags", () => {
    const reopened = {
      ...pendingTaggedPost,
      currentUserDeniedAsArtist: true,
      current_user_denied_as_artist: true,
    };
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: reopened,
        currentUserId: artist.id,
        verifiedArtist: true,
        feedFlagEnabled: false,
        comments: [taggingComment()],
        artist,
      }),
      false,
    );
  });

  it("unrelated artist controls unaffected — different viewer still eligible when tagged", () => {
    const deniedForA = markViewerArtistDeniedOnPost(pendingTaggedPost);
    // Denial flags are viewer-scoped on the client snapshot; another artist's
    // eligibility uses their own post fields (untouched here → still pending-tagged).
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: pendingTaggedPost,
        currentUserId: "artist-b",
        verifiedArtist: true,
        feedFlagEnabled: true,
        comments: [
          {
            ...taggingComment(),
            body: "this is @beta",
          },
        ],
        artist: { id: "artist-b", username: "beta" },
      }),
      true,
    );
    assert.equal(deniedForA.currentUserDeniedAsArtist, true);
  });
});

describe("ARTIST-ID-UX-2C VideoCard wiring", () => {
  it("deny onSuccess patches commentsPost + feed/artist-tags before invalidate", () => {
    const denyMut = videoCardSrc.slice(
      videoCardSrc.indexOf("artistDenyFromCommentsMutation = useMutation"),
      videoCardSrc.indexOf("onError: (error: Error & { body?: { code?: string; message?: string } }) => {"),
    );
    assert.match(denyMut, /setCommentsPost\(\(prev\) =>/);
    assert.match(denyMut, /markViewerArtistDeniedOnPost\(prev\)/);
    assert.match(denyMut, /setQueriesData\(\{ queryKey: \["\/api\/posts"\], exact: false \}/);
    assert.match(denyMut, /\["\/api\/posts", post\.id, "artist-tags"\]/);
    assert.match(denyMut, /status: "denied"/);
    const patchAt = denyMut.indexOf("markViewerArtistDeniedOnPost(prev)");
    const invalidateAt = denyMut.indexOf('invalidateQueries({ queryKey: ["/api/posts"] })');
    assert.ok(patchAt >= 0 && invalidateAt > patchAt);
  });

  it("live commentsPost sync also copies denial from feed post", () => {
    const sync = videoCardSrc.slice(
      videoCardSrc.indexOf("// Live feed post for eligibility"),
      videoCardSrc.indexOf("useEffect(() => {\n    if (!requestOpenComments || !isActive) return;"),
    );
    assert.match(sync, /liveDenied/);
    assert.match(sync, /frozenDenied/);
    assert.match(sync, /needsDenied/);
    assert.match(sync, /markViewerArtistDeniedOnPost\(next\)/);
  });

  it("Comments still gates card on resolveArtistPendingActionsVisible", () => {
    assert.match(commentsSrc, /artist-tag-comments-banner/);
    assert.match(commentsSrc, /resolveArtistPendingActionsVisible/);
    assert.match(commentsSrc, /reviewingArtistForIdActions && artistTagActionsVisible/);
  });

  it("keeps existing artist-deny API semantics unchanged", () => {
    assert.match(actionsSrc, /export function markViewerArtistDeniedOnPost/);
    assert.match(videoCardSrc, /\/api\/posts\/\$\{post\.id\}\/artist-deny/);
    assert.match(routesSrc, /app\.post\("\/api\/posts\/:id\/artist-deny"/);
    assert.match(routesSrc, /markArtistDeniedOnPost/);
    assert.doesNotMatch(videoCardSrc, /apiRequest\("POST", `\/api\/posts\/\$\{post\.id\}\/artist-deny`[\s\S]{0,200}apiRequest\("POST"/);
  });
});
