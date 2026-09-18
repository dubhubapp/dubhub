import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countVisibleUnreadNotifications } from "./nav-notification-unread-count";
import type { NotificationPreferences } from "./notification-preferences";

const prefsAllOn: NotificationPreferences = {
  releaseNotifications: true,
  commentNotifications: true,
  likeNotifications: true,
};

const prefsLikesOff: NotificationPreferences = {
  releaseNotifications: true,
  commentNotifications: true,
  likeNotifications: false,
};

describe("PROFILE-NAV-BADGE-1 countVisibleUnreadNotifications", () => {
  it("counts unread rows and ignores read", () => {
    assert.equal(
      countVisibleUnreadNotifications(
        [
          { id: "1", read: false, notificationType: "post_like" },
          { id: "2", read: true, notificationType: "post_like" },
        ],
        prefsAllOn,
        { isModerator: false },
      ),
      1,
    );
  });

  it("applies user preference visibility", () => {
    assert.equal(
      countVisibleUnreadNotifications(
        [{ id: "1", read: false, notificationType: "post_like" }],
        prefsLikesOff,
        { isModerator: false },
      ),
      0,
    );
  });

  it("excludes moderator-queue notifications only when isModerator", () => {
    const queueRow = {
      id: "q",
      read: false,
      message: "Post reported for review",
      notificationType: "moderator_post_report",
    };
    assert.equal(
      countVisibleUnreadNotifications([queueRow], prefsAllOn, { isModerator: true }),
      0,
    );
    // Community/artist accounts are not moderators — filter does not apply.
    assert.equal(
      countVisibleUnreadNotifications([queueRow], prefsAllOn, { isModerator: false }),
      1,
    );
  });

  it("is account-type agnostic (artist vs community use same path)", () => {
    const rows = [
      { id: "1", read: false, notificationType: "comment_on_post" },
      { id: "2", read: false, notificationType: "post_like" },
    ];
    assert.equal(
      countVisibleUnreadNotifications(rows, prefsAllOn, { isModerator: false }),
      2,
    );
  });

  it("USER-MENTION-1: unread user_mention_comment increments badge via comment prefs", () => {
    const prefsCommentsOff: NotificationPreferences = {
      releaseNotifications: true,
      commentNotifications: false,
      likeNotifications: true,
    };
    assert.equal(
      countVisibleUnreadNotifications(
        [{ id: "1", read: false, notificationType: "user_mention_comment" }],
        prefsAllOn,
        { isModerator: false },
      ),
      1,
    );
    assert.equal(
      countVisibleUnreadNotifications(
        [{ id: "1", read: false, notificationType: "user_mention_comment" }],
        prefsCommentsOff,
        { isModerator: false },
      ),
      0,
    );
  });

  it("returns 0 for empty / non-array", () => {
    assert.equal(countVisibleUnreadNotifications([], prefsAllOn, { isModerator: false }), 0);
    assert.equal(countVisibleUnreadNotifications(null, prefsAllOn, { isModerator: false }), 0);
    assert.equal(countVisibleUnreadNotifications(undefined, prefsAllOn, { isModerator: false }), 0);
  });
});
