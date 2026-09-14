/**
 * ARTIST-ID-UX-1 / 1B — Comments Confirm ID + notification-open eligibility.
 * Helpers + source wiring contracts. Does not hit network / mutate APIs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DELETED_COMMENT_BODY } from "@shared/deleted-comment";
import type { CommentWithUser } from "@shared/schema";
import {
  commentTagsCurrentArtist,
  findEarliestCommentIdTaggingArtist,
  isArtistPendingActionEligible,
  isArtistPendingPostStateEligible,
  isCommentEligibleForArtistConfirmId,
  resolveArtistPendingActionsVisible,
} from "./artist-id-comments-actions";

const here = dirname(fileURLToPath(import.meta.url));
const actionsSrc = readFileSync(join(here, "./artist-id-comments-actions.ts"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const artistDialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");

const artistA = { id: "artist-a", username: "alpha" };
const artistB = { id: "artist-b", username: "beta" };

const pendingTaggedPost = {
  current_user_tagged_as_artist: true,
  verificationStatus: "unverified",
  isVerifiedArtist: false,
  artistVerifiedBy: null,
  deniedByArtist: false,
};

const pendingUntaggedPost = {
  ...pendingTaggedPost,
  current_user_tagged_as_artist: false,
  currentUserTaggedAsArtist: false,
};

function comment(partial: Partial<CommentWithUser> & { id: string; body: string }): CommentWithUser {
  return {
    userId: "u1",
    postId: "p1",
    parentId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    user: { id: "u1", username: "fan" } as CommentWithUser["user"],
    replies: [],
    ...partial,
  } as CommentWithUser;
}

describe("ARTIST-ID-UX-1 eligibility helpers", () => {
  it("tagged verified artist is pending-eligible; unrelated / identified / denied are not", () => {
    assert.equal(
      isArtistPendingActionEligible(pendingTaggedPost, "artist-a", { verifiedArtist: true }),
      true,
    );
    assert.equal(
      isArtistPendingActionEligible(
        { ...pendingTaggedPost, current_user_tagged_as_artist: false },
        "artist-a",
        { verifiedArtist: true },
      ),
      false,
    );
    assert.equal(
      isArtistPendingActionEligible(pendingTaggedPost, "artist-a", { verifiedArtist: false }),
      false,
    );
    assert.equal(
      isArtistPendingActionEligible(
        { ...pendingTaggedPost, verificationStatus: "identified", isVerifiedArtist: true, artistVerifiedBy: "x" },
        "artist-a",
        { verifiedArtist: true },
      ),
      false,
    );
    // Post-level denied_by_artist alone must NOT hide Confirm for other tagged artists.
    assert.equal(
      isArtistPendingActionEligible(
        { ...pendingTaggedPost, deniedByArtist: true },
        "artist-a",
        { verifiedArtist: true },
      ),
      true,
    );
    assert.equal(
      isArtistPendingActionEligible(
        { ...pendingTaggedPost, currentUserDeniedAsArtist: true },
        "artist-a",
        { verifiedArtist: true },
      ),
      false,
    );
  });

  it("Confirm ID only on comments tagging current artist; deleted / other artist excluded", () => {
    assert.equal(
      isCommentEligibleForArtistConfirmId(
        { body: "this is @alpha right?", artistTag: artistA.id },
        artistA,
      ),
      true,
    );
    assert.equal(
      isCommentEligibleForArtistConfirmId(
        { body: "this is @beta", artistTag: artistB.id },
        artistA,
      ),
      false,
    );
    assert.equal(
      isCommentEligibleForArtistConfirmId(
        { body: DELETED_COMMENT_BODY, artistTag: artistA.id },
        artistA,
      ),
      false,
    );
    assert.equal(
      commentTagsCurrentArtist({ body: "hey @alpha check", artist_tag: null }, artistA),
      true,
    );
  });

  it("multiple artist tags stay scoped; earliest tagging comment used for deny commentId", () => {
    const comments = [
      comment({
        id: "c-late",
        body: "@alpha later",
        artistTag: artistA.id,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      }),
      comment({
        id: "c-early",
        body: "@alpha first",
        artistTag: artistA.id,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
      comment({
        id: "c-other",
        body: "@beta only",
        artistTag: artistB.id,
        createdAt: new Date("2025-12-01T00:00:00Z"),
      }),
    ];
    assert.equal(findEarliestCommentIdTaggingArtist(comments, artistA), "c-early");
    assert.equal(findEarliestCommentIdTaggingArtist(comments, artistB), "c-other");
  });
});

describe("ARTIST-ID-UX-1B notification-open eligibility resolve", () => {
  it("stale feed flag + hydrated tagging comment → actions become visible while Comments mounted", () => {
    assert.equal(isArtistPendingPostStateEligible(pendingUntaggedPost, "artist-a"), true);
    assert.equal(
      isArtistPendingActionEligible(pendingUntaggedPost, "artist-a", { verifiedArtist: true }),
      false,
    );

    const beforeComments: CommentWithUser[] = [];
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: pendingUntaggedPost,
        currentUserId: "artist-a",
        verifiedArtist: true,
        feedFlagEnabled: false,
        comments: beforeComments,
        artist: artistA,
      }),
      false,
    );

    const afterComments = [
      comment({ id: "c1", body: "@alpha this yours?", artistTag: artistA.id }),
    ];
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: pendingUntaggedPost,
        currentUserId: "artist-a",
        verifiedArtist: true,
        feedFlagEnabled: false,
        comments: afterComments,
        artist: artistA,
      }),
      true,
    );
  });

  it("unrelated artist / ordinary user never get controls even with comments present", () => {
    const comments = [comment({ id: "c1", body: "@alpha", artistTag: artistA.id })];
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: pendingUntaggedPost,
        currentUserId: "artist-b",
        verifiedArtist: true,
        feedFlagEnabled: false,
        comments,
        artist: artistB,
      }),
      false,
    );
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: pendingUntaggedPost,
        currentUserId: "listener-1",
        verifiedArtist: false,
        feedFlagEnabled: false,
        comments,
        artist: { id: "listener-1", username: "fan" },
      }),
      false,
    );
  });

  it("Comments recompute visibility from comments; VideoCard uses live post for feed flag", () => {
    assert.match(commentsSrc, /resolveArtistPendingActionsVisible/);
    assert.match(commentsSrc, /artistTagActionsVisible/);
    assert.match(
      videoCardSrc,
      /artistPendingActionsEnabled=\{isArtistPendingActionEligible\(\s*post,/,
    );
    assert.match(videoCardSrc, /liveTagged/);
    assert.match(actionsSrc, /hasCommentTaggingArtist/);
  });

  it("notification openComments request is one-shot and consumed even if already open", () => {
    assert.match(homeSrc, /openCommentsArmedForPostRef/);
    assert.match(
      videoCardSrc,
      /if \(showComments\) \{\s*onOpenCommentsRequestHandled\?\.\(\)/,
    );
  });
});

describe("ARTIST-ID-UX-1 Confirm ID wiring", () => {
  it("Confirm ID opens existing artist dialog with exact commentId; does not submit", () => {
    assert.match(artistDialogSrc, /initialCommentId\?:/);
    assert.match(artistDialogSrc, /setSelectedCommentId\(trimmed\)/);
    assert.doesNotMatch(
      artistDialogSrc,
      /useEffect\([\s\S]{0,200}confirmMutation\.mutate/,
    );
    assert.match(commentsSrc, /confirm-id-button-/);
    assert.match(commentsSrc, /onRequestArtistConfirmId/);
    assert.match(commentsSrc, /Confirm ID/);
    assert.doesNotMatch(commentsSrc, /\/artist-confirm/);
    assert.match(
      videoCardSrc,
      /setArtistVerifyInitialCommentId\(commentId\)[\s\S]{0,120}setShowArtistVerificationDialog\(true\)/,
    );
  });

  it("rail ID still opens normal unselected picker", () => {
    assert.match(
      videoCardSrc,
      /setArtistVerifyInitialCommentId\(null\)[\s\S]{0,80}setShowArtistVerificationDialog\(true\)/,
    );
    assert.match(videoCardSrc, /button-artist-verify/);
  });
});

describe("ARTIST-ID-UX-1B card polish + Not my track", () => {
  it("uses compact gold-tinted Tagged as your track copy; Confirm ID stays on comment", () => {
    assert.match(commentsSrc, /Tagged as your track/);
    assert.match(commentsSrc, /Someone thinks this track is yours/);
    assert.match(commentsSrc, /border-\[#FFD700\]\/18/);
    assert.doesNotMatch(commentsSrc, /You&apos;ve been tagged in this track/);
    assert.match(commentsSrc, /confirm-id-button-/);
    assert.match(commentsSrc, /not-my-track-button/);
    // ARTIST-ID-UX-2B: symmetric py-2; compact label + after: hit area (no min-h / -mb hacks)
    assert.match(commentsSrc, /px-3 py-2 dark:border-\[#FFD700\]\/16/);
    assert.match(
      commentsSrc,
      /relative mt-1 inline-flex items-center text-\[13px\] font-semibold text-gray-800 leading-snug/,
    );
    assert.match(commentsSrc, /after:absolute after:-inset-y-3 after:inset-x-0 after:content-\[''\]/);
    assert.doesNotMatch(commentsSrc, /not-my-track-button[\s\S]{0,220}min-h-11/);
    assert.doesNotMatch(commentsSrc, /not-my-track-button[\s\S]{0,220}-mb-1\.5/);
    assert.doesNotMatch(commentsSrc, /inline-flex min-h-11 items-center px-0\.5 text-\[13px\]/);
  });

  it("Not my track uses existing artist-deny mutation contract", () => {
    assert.match(videoCardSrc, /\/api\/posts\/\$\{post\.id\}\/artist-deny/);
    assert.match(videoCardSrc, /onRequestArtistNotMyTrack/);
    assert.match(commentsSrc, /findEarliestCommentIdTaggingArtist|notMyTrackCommentId/);
  });

  it("denial confirmation promises per-artist re-tag block (not all notifications)", () => {
    assert.match(commentsSrc, /Not your track\?/);
    assert.match(
      commentsSrc,
      /People won&apos;t be able to tag you as the\s+artist on this post again/,
    );
    assert.doesNotMatch(commentsSrc, /won&apos;t receive any more artist ID/);
    assert.doesNotMatch(commentsSrc, /Confirm that this track isn&apos;t yours\./);
  });
});

describe("ARTIST-ID-UX-1 API semantics unchanged", () => {
  it("keeps artist-confirm / artist-deny routes; deny now marks artist_video_tags", () => {
    assert.match(routesSrc, /app\.post\("\/api\/posts\/:id\/artist-confirm"/);
    assert.match(routesSrc, /app\.post\("\/api\/posts\/:id\/artist-deny"/);
    assert.match(artistDialogSrc, /\/artist-confirm/);
    assert.match(artistDialogSrc, /\/artist-deny/);
    const denyBlock = routesSrc.slice(
      routesSrc.indexOf('app.post("/api/posts/:id/artist-deny"'),
      routesSrc.indexOf('app.get("/api/moderator/pending-verifications"'),
    );
    assert.match(denyBlock, /markArtistDeniedOnPost/);
  });
});
