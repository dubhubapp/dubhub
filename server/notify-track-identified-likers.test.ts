import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
  runNotifyTrackIdentifiedLikers,
  type NotifyTrackIdentifiedLikersDeps,
} from "./notify-track-identified-likers";
import {
  COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
  TRACK_ID_CONFIRMED_TITLE,
  formatArtistIdentifiedPostMessage,
} from "@shared/notification-messages";
import { notificationTypeToGroupKind } from "@shared/notification-types";

const POST_ID = "00000000-0000-0000-0000-0000000000p1";
const ACTOR_ID = "00000000-0000-0000-0000-0000000000aa";
const LISTENER = "00000000-0000-0000-0000-0000000000l1";
const ARTIST_LIKER = "00000000-0000-0000-0000-0000000000a1";
const MOD_LIKER = "00000000-0000-0000-0000-0000000000m1";
const UPLOADER = "00000000-0000-0000-0000-0000000000u1";

type CreatedNotif = {
  recipientId: string;
  notificationType: string;
  message: string;
  postId: string;
  triggeredBy: string;
};

type FakeState = {
  isFirstListenerVisibleIdentification: boolean;
  alreadyNotified: boolean;
  likerIds: string[];
  excludeRecipientIds: string[];
  notifications: CreatedNotif[];
  pushes: unknown[];
};

function createDeps(state: FakeState): NotifyTrackIdentifiedLikersDeps {
  return {
    isFirstListenerVisibleIdentification: state.isFirstListenerVisibleIdentification,
    getLikerIds: async () => state.likerIds,
    hasExistingTrackIdentifiedNotification: async () => state.alreadyNotified,
    createNotification: async (input) => {
      const id = `notif-${state.notifications.length + 1}`;
      state.notifications.push({
        recipientId: input.recipientId,
        notificationType: input.notificationType,
        message: input.message,
        postId: input.postId,
        triggeredBy: input.triggeredBy,
      });
      return { id };
    },
    sendPush: (args) => {
      state.pushes.push(args);
    },
    excludeRecipientIds: state.excludeRecipientIds,
  };
}

function baseState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    isFirstListenerVisibleIdentification: true,
    alreadyNotified: false,
    likerIds: [LISTENER],
    excludeRecipientIds: [ACTOR_ID],
    notifications: [],
    pushes: [],
    ...overrides,
  };
}

describe("Track ID recipient split + copy", () => {
  it("saver fan-out uses approved saved-track copy", async () => {
    const state = baseState({
      likerIds: [LISTENER, ARTIST_LIKER, MOD_LIKER, UPLOADER],
      excludeRecipientIds: [UPLOADER],
    });
    const result = await runNotifyTrackIdentifiedLikers(
      { postId: POST_ID, actorUserId: UPLOADER },
      createDeps(state),
    );
    assert.equal(result.outcome, "delivered");
    assert.equal(result.notificationCount, 3);
    assert.ok(!result.recipientIds.includes(UPLOADER));
    for (const n of state.notifications) {
      assert.equal(n.notificationType, "track_identified");
      assert.equal(n.message, TRACK_IDENTIFIED_NOTIFICATION_MESSAGE);
      assert.equal(
        n.message,
        "You finally found it - that track you saved has been identified.",
      );
    }
  });

  it("excludes uploader who also liked from saved-track fan-out", async () => {
    const state = baseState({
      likerIds: [UPLOADER, LISTENER],
      excludeRecipientIds: [UPLOADER],
    });
    const result = await runNotifyTrackIdentifiedLikers(
      { postId: POST_ID, actorUserId: UPLOADER },
      createDeps(state),
    );
    assert.deepEqual(result.recipientIds, [LISTENER]);
  });

  it("community then mod/artist later: no second track_identified", async () => {
    const first = baseState({ likerIds: [LISTENER], excludeRecipientIds: [UPLOADER] });
    assert.equal(
      (await runNotifyTrackIdentifiedLikers({ postId: POST_ID, actorUserId: UPLOADER }, createDeps(first)))
        .outcome,
      "delivered",
    );

    const later = baseState({
      isFirstListenerVisibleIdentification: false,
      alreadyNotified: true,
      likerIds: [LISTENER],
      excludeRecipientIds: [ACTOR_ID, UPLOADER],
    });
    const second = await runNotifyTrackIdentifiedLikers(
      { postId: POST_ID, actorUserId: ACTOR_ID },
      createDeps(later),
    );
    assert.equal(second.outcome, "skipped_not_first_transition");
    assert.equal(later.notifications.length, 0);
  });

  it("approved titles and bodies stay distinct across the three variants", () => {
    assert.equal(TRACK_ID_CONFIRMED_TITLE, "🔌 Track ID Confirmed");
    assert.equal(
      COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
      "Great news - your post has just been identified by the community.",
    );
    assert.equal(
      formatArtistIdentifiedPostMessage("ChaseAndStatus"),
      "@ChaseAndStatus just confirmed the track you uploaded.",
    );
    assert.equal(
      TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
      "You finally found it - that track you saved has been identified.",
    );
    assert.notEqual(COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE, TRACK_IDENTIFIED_NOTIFICATION_MESSAGE);
    assert.notEqual(
      formatArtistIdentifiedPostMessage("ChaseAndStatus"),
      TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
    );
  });

  it("Track ID types do not group under release_event", () => {
    assert.equal(notificationTypeToGroupKind("track_identified"), "single");
    assert.equal(notificationTypeToGroupKind("artist_identified_post"), "single");
    assert.equal(notificationTypeToGroupKind("community_identified_post"), "single");
    assert.equal(notificationTypeToGroupKind("release_attached"), "release_event");
  });
});
