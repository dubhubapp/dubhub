import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runNotifyAnonymousTrackIdentified,
  runNotifyAnonymousTrackRevealed,
  type NotifyAnonymousIdentifiedDeps,
  type NotifyAnonymousRevealedDeps,
} from "./notify-anonymous-track-identified";
import {
  TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
  formatAnonymousTrackIdentifiedLikerMessage,
  formatAnonymousTrackIdentifiedUploaderMessage,
  formatAnonymousTrackRevealedLikerMessage,
  formatAnonymousTrackRevealedUploaderMessage,
} from "@shared/notification-messages";
import { isAlwaysOnNotificationType } from "@shared/notification-types";
import { evaluatePushPreferenceGate } from "@shared/push-notification-preferences";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const POST_ID = "00000000-0000-0000-0000-0000000000p1";
const ARTIST_ID = "00000000-0000-0000-0000-0000000000aa";
const UPLOADER = "00000000-0000-0000-0000-0000000000u1";
const LIKER = "00000000-0000-0000-0000-0000000000l1";
const LIKER2 = "00000000-0000-0000-0000-0000000000l2";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "./routes.ts"), "utf8");
const pushSendSrc = readFileSync(join(here, "./push/pushSend.ts"), "utf8");
const revealAttachSrc = readFileSync(join(here, "./reveal-and-attach-posts.ts"), "utf8");

type CreatedNotif = {
  recipientId: string;
  notificationType: string;
  message: string;
  postId: string;
  triggeredBy: string | null;
};

type FakeIdentifyState = {
  alreadyNotified: boolean;
  ownerId: string | null;
  likerIds: string[];
  notifications: CreatedNotif[];
  pushes: Array<Record<string, unknown>>;
};

function createIdentifyDeps(state: FakeIdentifyState): NotifyAnonymousIdentifiedDeps {
  return {
    getPostOwnerId: async () => state.ownerId,
    getLikerIds: async () => state.likerIds,
    hasExistingFirstIdentificationNotification: async () => state.alreadyNotified,
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
      state.pushes.push({ ...args });
    },
  };
}

describe("VAT-ANON-5 anonymous_track_identified fan-out", () => {
  it("notifies uploader + likers once, actor-less, excludes claiming artist", async () => {
    const state: FakeIdentifyState = {
      alreadyNotified: false,
      ownerId: UPLOADER,
      likerIds: [LIKER, ARTIST_ID, UPLOADER],
      notifications: [],
      pushes: [],
    };
    const result = await runNotifyAnonymousTrackIdentified(
      { postId: POST_ID, claimingArtistId: ARTIST_ID, trackTitle: "Test Song" },
      createIdentifyDeps(state),
    );

    assert.equal(result.outcome, "delivered");
    assert.equal(result.uploaderNotified, true);
    assert.deepEqual(result.likerRecipientIds, [LIKER]);
    assert.equal(state.notifications.length, 2);

    const uploaderNotif = state.notifications.find((n) => n.recipientId === UPLOADER)!;
    assert.equal(uploaderNotif.notificationType, "anonymous_track_identified");
    assert.equal(uploaderNotif.triggeredBy, null);
    assert.equal(
      uploaderNotif.message,
      formatAnonymousTrackIdentifiedUploaderMessage("Test Song"),
    );

    const likerNotif = state.notifications.find((n) => n.recipientId === LIKER)!;
    assert.equal(likerNotif.triggeredBy, null);
    assert.equal(
      likerNotif.message,
      formatAnonymousTrackIdentifiedLikerMessage("Test Song"),
    );

    assert.ok(!state.notifications.some((n) => n.recipientId === ARTIST_ID));
    assert.equal(state.notifications.filter((n) => n.recipientId === UPLOADER).length, 1);

    for (const push of state.pushes) {
      assert.equal(push.postId, POST_ID);
      assert.ok(!("actorUserId" in push));
      assert.ok(!("artistId" in push));
      assert.doesNotMatch(String(push.message), new RegExp(ARTIST_ID, "i"));
    }
  });

  it("uploader who also liked gets one uploader notification only", async () => {
    const state: FakeIdentifyState = {
      alreadyNotified: false,
      ownerId: UPLOADER,
      likerIds: [UPLOADER, LIKER],
      notifications: [],
      pushes: [],
    };
    await runNotifyAnonymousTrackIdentified(
      { postId: POST_ID, claimingArtistId: ARTIST_ID, trackTitle: null },
      createIdentifyDeps(state),
    );
    assert.equal(state.notifications.filter((n) => n.recipientId === UPLOADER).length, 1);
    assert.equal(
      state.notifications.find((n) => n.recipientId === UPLOADER)!.message,
      formatAnonymousTrackIdentifiedUploaderMessage(null),
    );
    assert.equal(state.notifications.filter((n) => n.recipientId === LIKER).length, 1);
    assert.equal(
      state.notifications.find((n) => n.recipientId === LIKER)!.message,
      TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
    );
  });

  it("retries skip when first-identification notification already exists", async () => {
    const state: FakeIdentifyState = {
      alreadyNotified: true,
      ownerId: UPLOADER,
      likerIds: [LIKER, LIKER2],
      notifications: [],
      pushes: [],
    };
    const result = await runNotifyAnonymousTrackIdentified(
      { postId: POST_ID, claimingArtistId: ARTIST_ID, trackTitle: null },
      createIdentifyDeps(state),
    );
    assert.equal(result.outcome, "skipped_already_notified");
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pushes.length, 0);
  });
});

describe("VAT-ANON-5.1 anonymous_track_revealed (manual uploader + likers)", () => {
  it("notifies uploader + likers; overlap gets one uploader copy; artist excluded; retry dedupes", async () => {
    const notifications: CreatedNotif[] = [];
    const pushes: Array<Record<string, unknown>> = [];
    let already = false;
    const deps: NotifyAnonymousRevealedDeps = {
      getPostOwnerId: async () => UPLOADER,
      getLikerIds: async () => [LIKER, ARTIST_ID, UPLOADER, LIKER2],
      hasExistingRevealNotification: async () => already,
      createNotification: async (input) => {
        notifications.push({
          recipientId: input.recipientId,
          notificationType: input.notificationType,
          message: input.message,
          postId: input.postId,
          triggeredBy: input.triggeredBy,
        });
        return { id: `reveal-${notifications.length}` };
      },
      sendPush: (args) => {
        pushes.push({ ...args });
      },
    };

    const first = await runNotifyAnonymousTrackRevealed(
      {
        postId: POST_ID,
        revealedArtistId: ARTIST_ID,
        revealedArtistUsername: "RevealArtist",
        trackTitle: "Test Song",
      },
      deps,
    );
    assert.equal(first.notified, true);
    assert.equal(first.uploaderNotified, true);
    assert.deepEqual(first.likerRecipientIds.sort(), [LIKER, LIKER2].sort());
    assert.equal(notifications.length, 3);
    assert.ok(!notifications.some((n) => n.recipientId === ARTIST_ID));
    assert.equal(notifications.filter((n) => n.recipientId === UPLOADER).length, 1);
    assert.equal(
      notifications.find((n) => n.recipientId === UPLOADER)!.message,
      formatAnonymousTrackRevealedUploaderMessage("RevealArtist", "Test Song"),
    );
    assert.equal(
      notifications.find((n) => n.recipientId === LIKER)!.message,
      formatAnonymousTrackRevealedLikerMessage("RevealArtist", "Test Song"),
    );
    assert.equal(notifications[0].triggeredBy, ARTIST_ID);
    assert.equal(notifications[0].notificationType, "anonymous_track_revealed");
    assert.ok(!notifications.some((n) => n.notificationType === "track_identified"));
    assert.ok(!notifications.some((n) => n.notificationType === "artist_identified_post"));

    already = true;
    const second = await runNotifyAnonymousTrackRevealed(
      {
        postId: POST_ID,
        revealedArtistId: ARTIST_ID,
        revealedArtistUsername: "RevealArtist",
        trackTitle: "Test Song",
      },
      deps,
    );
    assert.equal(second.notified, false);
    assert.equal(notifications.length, 3);
  });

  it("does not notify when only recipient would be the revealing artist", async () => {
    const deps: NotifyAnonymousRevealedDeps = {
      getPostOwnerId: async () => ARTIST_ID,
      getLikerIds: async () => [ARTIST_ID],
      hasExistingRevealNotification: async () => false,
      createNotification: async () => {
        throw new Error("should not create");
      },
      sendPush: () => {
        throw new Error("should not push");
      },
    };
    const result = await runNotifyAnonymousTrackRevealed(
      {
        postId: POST_ID,
        revealedArtistId: ARTIST_ID,
        revealedArtistUsername: "Self",
        trackTitle: null,
      },
      deps,
    );
    assert.equal(result.notified, false);
  });
});

describe("VAT-ANON-5 wiring + security surface", () => {
  it("types are always-on for push preference gate (device_push_alerts only)", () => {
    assert.equal(isAlwaysOnNotificationType("anonymous_track_identified"), true);
    assert.equal(isAlwaysOnNotificationType("anonymous_track_revealed"), true);
    const prefs = {
      commentsAndRepliesPush: false,
      artistTagsPush: false,
      releaseUpdatesPush: false,
      devicePushAlerts: true,
    };
    assert.equal(
      evaluatePushPreferenceGate("anonymous_track_identified", prefs).allowed,
      true,
    );
    assert.equal(
      evaluatePushPreferenceGate("anonymous_track_revealed", prefs).allowed,
      true,
    );
    assert.equal(
      evaluatePushPreferenceGate("anonymous_track_identified", {
        ...prefs,
        devicePushAlerts: false,
      }).allowed,
      false,
    );
  });

  it("manual reveal route notifies; identify route notifies; reveal+attach does not reveal-notify", () => {
    const identifyIdx = routesSrc.indexOf('"/api/posts/:id/artist-identify-anonymous"');
    assert.ok(identifyIdx >= 0);
    const identifySlice = routesSrc.slice(identifyIdx, identifyIdx + 2500);
    assert.match(identifySlice, /notifyAnonymousTrackIdentified/);

    const revealIdx = routesSrc.indexOf('"/api/posts/:id/artist-reveal-identification"');
    assert.ok(revealIdx >= 0);
    const revealSlice = routesSrc.slice(revealIdx, revealIdx + 2500);
    assert.match(revealSlice, /notifyAnonymousTrackRevealed/);
    assert.match(revealSlice, /alreadyRevealed/);
    assert.doesNotMatch(revealSlice, /notifyTrackIdentifiedLikers/);
    assert.doesNotMatch(revealSlice, /artist_identified_post/);

    const attachIdx = routesSrc.indexOf('"/api/releases/:id/reveal-and-attach"');
    assert.ok(attachIdx >= 0);
    const attachSlice = routesSrc.slice(attachIdx, attachIdx + 2200);
    assert.doesNotMatch(attachSlice, /notifyAnonymousTrackRevealed/);
    assert.doesNotMatch(attachSlice, /\banonymous_track_revealed\b/);
    assert.match(attachSlice, /notifyNewlyAttachedPostAudience|maybeNotifyReleasePublic/);

    assert.doesNotMatch(revealAttachSrc, /notifyAnonymousTrackRevealed|\banonymous_track_revealed\b/);
  });

  it("pushSend supports actor-less anonymous_track_identified payload", () => {
    assert.match(pushSendSrc, /"anonymous_track_identified"/);
    assert.match(pushSendSrc, /"anonymous_track_revealed"/);
    assert.match(pushSendSrc, /TRACK_ID_REVEALED_TITLE/);
    assert.match(pushSendSrc, /Actor-less: no artistId/);
  });
});
