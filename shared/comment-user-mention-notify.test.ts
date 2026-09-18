import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectUserMentionNotifyRecipients } from "./comment-user-mention-notify";
import {
  getEffectiveNotificationType,
  getPreferenceBucketForNotificationType,
  notificationTypeToToggleableKind,
} from "./notification-types";
import { evaluatePushPreferenceGate } from "./push-notification-preferences";

describe("USER-MENTION-1 selectUserMentionNotifyRecipients", () => {
  it("notifies normal mentioned users", () => {
    const result = selectUserMentionNotifyRecipients({
      mentionedUserIds: ["user-a", "user-b"],
      alreadyNotified: new Set(),
      commenterUserId: "commenter",
    });
    assert.deepEqual(result.notifyIds, ["user-a", "user-b"]);
    assert.deepEqual(result.skippedSelfIds, []);
    assert.deepEqual(result.skippedDedupedIds, []);
  });

  it("skips self mentions", () => {
    const result = selectUserMentionNotifyRecipients({
      mentionedUserIds: ["commenter", "user-a"],
      alreadyNotified: new Set(),
      commenterUserId: "commenter",
    });
    assert.deepEqual(result.notifyIds, ["user-a"]);
    assert.deepEqual(result.skippedSelfIds, ["commenter"]);
  });

  it("dedupes recipients already covered by artist/reply/owner", () => {
    const result = selectUserMentionNotifyRecipients({
      mentionedUserIds: ["artist-1", "reply-author", "owner", "other"],
      alreadyNotified: new Set(["artist-1", "reply-author", "owner"]),
      commenterUserId: "commenter",
    });
    assert.deepEqual(result.notifyIds, ["other"]);
    assert.deepEqual(result.skippedDedupedIds, ["artist-1", "reply-author", "owner"]);
  });

  it("dedupes duplicate ids in the mention list", () => {
    const result = selectUserMentionNotifyRecipients({
      mentionedUserIds: ["user-a", "user-a"],
      alreadyNotified: new Set(),
      commenterUserId: "commenter",
    });
    assert.deepEqual(result.notifyIds, ["user-a"]);
  });

  it("returns empty for unknown/empty mention lists", () => {
    const result = selectUserMentionNotifyRecipients({
      mentionedUserIds: [],
      alreadyNotified: new Set(),
      commenterUserId: "commenter",
    });
    assert.deepEqual(result.notifyIds, []);
  });
});

describe("USER-MENTION-1 notification type + preference contract", () => {
  it("classifies stored and legacy mention copy as user_mention_comment", () => {
    assert.equal(
      getEffectiveNotificationType({ notificationType: "user_mention_comment" }),
      "user_mention_comment",
    );
    assert.equal(
      getEffectiveNotificationType({
        message: "@alice mentioned you in a comment",
      }),
      "user_mention_comment",
    );
    assert.equal(
      getEffectiveNotificationType({
        message: "@alice tagged you in a comment. Open the post",
      }),
      "artist_tag_comment",
    );
  });

  it("gates push under comments_and_replies (not artist_tags)", () => {
    const disabledComments = evaluatePushPreferenceGate("user_mention_comment", {
      commentsAndRepliesPush: false,
      artistTagsPush: true,
      releaseUpdatesPush: true,
      devicePushAlerts: true,
    });
    assert.equal(disabledComments.allowed, false);
    if (!disabledComments.allowed) {
      assert.equal(disabledComments.preferenceKey, "comments_and_replies");
    }

    const artistTagsOff = evaluatePushPreferenceGate("user_mention_comment", {
      commentsAndRepliesPush: true,
      artistTagsPush: false,
      releaseUpdatesPush: true,
      devicePushAlerts: true,
    });
    assert.equal(artistTagsOff.allowed, true);

    const deviceOff = evaluatePushPreferenceGate("user_mention_comment", {
      commentsAndRepliesPush: true,
      artistTagsPush: true,
      releaseUpdatesPush: true,
      devicePushAlerts: false,
    });
    assert.equal(deviceOff.allowed, false);
  });

  it("maps to comments preference bucket and comment toggleable kind", () => {
    assert.equal(getPreferenceBucketForNotificationType("user_mention_comment"), "comments");
    assert.equal(notificationTypeToToggleableKind("user_mention_comment"), "comment");
  });
});
