import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NotificationWithUser } from "@shared/schema";
import { getNotificationTapRoute } from "./notification-routing";

function notif(
  overrides: Partial<NotificationWithUser> & {
    notificationType?: string | null;
    triggeredByUser?: { id: string; username: string; avatarUrl?: string | null };
  },
): NotificationWithUser {
  return {
    id: "n1",
    artistId: "artist-1",
    triggeredBy: "listener-1",
    postId: null,
    releaseId: null,
    message: "@listener is waiting for your next release.",
    notificationType: "release_alert_enabled",
    read: false,
    createdAt: new Date(),
    triggeredByUser: {
      id: "listener-1",
      username: "cool_listener",
      avatarUrl: null,
    },
    post: null,
    release: null,
    ...overrides,
  } as NotificationWithUser;
}

describe("getNotificationTapRoute", () => {
  it("release_alert_enabled routes to listener public profile", () => {
    assert.equal(
      getNotificationTapRoute(notif({})),
      "/profile/cool_listener",
    );
  });

  it("release_alert_enabled with missing username does not invent a route", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          triggeredByUser: { id: "listener-1", username: "  ", avatarUrl: null },
        }),
      ),
      "",
    );
  });

  it("comment notifications still open comments", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "comment_on_post",
          postId: "post-1",
          message: "commented",
        }),
      ),
      "/?post=post-1&openComments=1",
    );
  });

  it("reply notifications still open comments", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "reply_to_comment",
          postId: "post-2",
          message: "replied",
        }),
      ),
      "/?post=post-2&openComments=1",
    );
  });

  it("artist_tag_comment still opens comments", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "artist_tag_comment",
          postId: "post-3",
          message: "tagged",
        }),
      ),
      "/?post=post-3&openComments=1",
    );
  });

  it("release notifications still open release detail", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "artist_release_alert",
          releaseId: "rel-1",
          message: "announced a new release",
        }),
      ),
      "/releases/rel-1",
    );
  });

  it("track_identified opens the post", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "track_identified",
          postId: "post-identified",
          message: "You finally found it - that track you saved has been identified.",
        }),
      ),
      "/?post=post-identified",
    );
  });

  it("community_identified_post opens the post", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "community_identified_post",
          postId: "post-community",
          message: "Great news - your post has just been identified by the community.",
        }),
      ),
      "/?post=post-community",
    );
  });

  it("artist_identified_post opens the post", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "artist_identified_post",
          postId: "post-artist",
          message: "@ChaseAndStatus just confirmed the track you uploaded.",
        }),
      ),
      "/?post=post-artist",
    );
  });

  it("release_attached opens the release independently of track_identified", () => {
    assert.equal(
      getNotificationTapRoute(
        notif({
          notificationType: "release_attached",
          postId: "post-identified",
          releaseId: "rel-attached",
          message: "That tune you've been waiting for? It's finally got a release date.",
        }),
      ),
      "/releases/rel-attached",
    );
  });
});
