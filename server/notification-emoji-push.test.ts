import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RELEASE_ATTACHED_NOTIFICATION_MESSAGE } from "./maybe-notify-release-public";
import { buildTitleAndBody } from "./push/pushCopy";

const emoji = { notificationEmoji: "⚙️", notificationEmojiPaidAccess: true } as const;

describe("push bodies share the artist mention emoji", () => {
  it("eligible types include the owner emoji", () => {
    assert.equal(
      buildTitleAndBody({
        type: "artist_identified_post",
        postId: "p",
        artistId: "a",
        verifiedCommentId: "c",
        artistUsername: "sota",
        ...emoji,
      }).body,
      "@sota ⚙️ just confirmed the track you uploaded.",
    );
    assert.equal(
      buildTitleAndBody({
        type: "artist_release_alert",
        notificationId: "n",
        releaseId: "r",
        postId: null,
        artistId: "a",
        artistUsername: "sota",
        releaseTitle: "Night Bus",
        ...emoji,
      }).body,
      "@sota ⚙️ announced a new release: Night Bus",
    );
    assert.equal(
      buildTitleAndBody({
        type: "release_announce",
        notificationId: "n",
        releaseId: "r",
        artistId: "a",
        artistUsername: "sota",
        releaseTitle: "Night Bus",
        ...emoji,
      }).body,
      "@sota ⚙️ just announced Night Bus.",
    );
    assert.equal(
      buildTitleAndBody({
        type: "release_day_out_today",
        releaseId: "r",
        postId: null,
        artistId: "a",
        releaseTitle: "Night Bus",
        artistUsername: "sota",
        ...emoji,
      }).body,
      "@sota ⚙️ - Night Bus just dropped.",
    );
    assert.equal(
      buildTitleAndBody({
        type: "collab_invite",
        notificationId: "n",
        releaseId: "r",
        actorUserId: "a",
        actorUsername: "sota",
        releaseTitle: "Night Bus",
        ...emoji,
      }).body,
      "@sota ⚙️ invited you to collaborate on Night Bus.",
    );
  });

  it("release day keeps collaborator wording and does not emoji collaborators", () => {
    const body = buildTitleAndBody({
      type: "release_day_out_today",
      releaseId: "r",
      postId: null,
      artistId: "a",
      releaseTitle: "Night Bus",
      artistUsername: "sota",
      collaboratorUsernames: ["nova"],
      ...emoji,
    }).body;
    assert.equal(body, "@sota ⚙️ & @nova - Night Bus just dropped.");
    assert.equal(body.includes("@nova ⚙️"), false);
  });

  it("inactive paid access leaves push copy unchanged", () => {
    assert.equal(
      buildTitleAndBody({
        type: "release_announce",
        notificationId: "n",
        releaseId: "r",
        artistId: "a",
        artistUsername: "sota",
        releaseTitle: "Night Bus",
        notificationEmoji: "⚙️",
        notificationEmojiPaidAccess: false,
      }).body,
      "@sota just announced Night Bus.",
    );
  });

  it("ineligible push types stay on their current sentences", () => {
    assert.equal(
      buildTitleAndBody({
        type: "release_attached_to_liked_or_uploaded_post",
        releaseId: "r",
        postId: "p",
        artistId: "a",
      }).body,
      RELEASE_ATTACHED_NOTIFICATION_MESSAGE,
    );
    assert.equal(
      buildTitleAndBody({
        type: "comment_on_post",
        notificationId: "n",
        postId: "p",
        actorUserId: "u",
        actorUsername: "sota",
      }).body,
      "@sota commented on your post.",
    );
    assert.equal(
      buildTitleAndBody({
        type: "artist_tag_comment",
        notificationId: "n",
        postId: "p",
        actorUserId: "u",
        actorUsername: "sota",
      }).body,
      "@sota tagged you in a comment.",
    );
    assert.equal(
      buildTitleAndBody({
        type: "track_identified",
        notificationId: "n",
        postId: "p",
        actorUserId: "u",
      }).body,
      "You finally found it - that track you saved has been identified.",
    );
    assert.equal(
      buildTitleAndBody({
        type: "anonymous_track_identified",
        notificationId: "n",
        postId: "p",
        message: "A track you uploaded was identified.",
      }).body,
      "A track you uploaded was identified.",
    );
  });
});
