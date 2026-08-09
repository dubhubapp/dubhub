import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getNotificationGroupKind,
  notificationTypeToGroupKind,
} from "@shared/notification-types";
import { buildNotificationListGroupKey } from "./notification-grouping";

describe("track_identified grouping separation", () => {
  it("maps track_identified and artist_identified_post to single, not release_event", () => {
    assert.equal(notificationTypeToGroupKind("track_identified"), "single");
    assert.equal(notificationTypeToGroupKind("artist_identified_post"), "single");
    assert.equal(notificationTypeToGroupKind("community_identified_post"), "single");
    assert.equal(notificationTypeToGroupKind("release_attached"), "release_event");
    assert.notEqual(
      notificationTypeToGroupKind("track_identified"),
      notificationTypeToGroupKind("release_attached"),
    );
  });

  it("does not collapse track_identified with release_attached for the same post", () => {
    const createdAt = new Date("2026-07-30T12:00:00.000Z");
    const trackKey = buildNotificationListGroupKey({
      id: "n-track",
      kind: getNotificationGroupKind({
        notificationType: "track_identified",
        postId: "post-1",
        message: "You finally found it - that track you saved has been identified.",
      }),
      postId: "post-1",
      releaseId: null,
      createdAt,
    });
    const releaseKey = buildNotificationListGroupKey({
      id: "n-release",
      kind: getNotificationGroupKind({
        notificationType: "release_attached",
        postId: "post-1",
        releaseId: "release-1",
        message: "That tune you've been waiting for? It's finally got a release date.",
      }),
      postId: "post-1",
      releaseId: "release-1",
      createdAt,
    });

    assert.match(trackKey, /^single:n-track$/);
    assert.match(releaseKey, /^release_event:post-1:/);
    assert.notEqual(trackKey, releaseKey);
  });

  it("leaves other release_event grouping unchanged", () => {
    const createdAt = new Date("2026-07-30T12:00:00.000Z");
    const a = buildNotificationListGroupKey({
      id: "a",
      kind: "release_event",
      postId: "post-1",
      releaseId: "r1",
      createdAt,
    });
    const b = buildNotificationListGroupKey({
      id: "b",
      kind: "release_event",
      postId: "post-1",
      releaseId: "r2",
      createdAt,
    });
    assert.equal(a, b);
  });
});
