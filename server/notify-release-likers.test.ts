import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatReleaseAnnounceMessage } from "@shared/notification-messages";
import {
  runNotifyReleaseLikers,
  type NotifyReleaseLikersDeps,
} from "./notify-release-likers";

const RELEASE_ID = "00000000-0000-0000-0000-0000000000r1";
const ARTIST_ID = "00000000-0000-0000-0000-0000000000aa";
const LIKER = "00000000-0000-0000-0000-0000000000b1";
const UPLOADER = "00000000-0000-0000-0000-0000000000b2";
const SUBSCRIBER = "00000000-0000-0000-0000-0000000000a1";
const NON_MEMBER = "00000000-0000-0000-0000-0000000000zz";
const POST_ID = "00000000-0000-0000-0000-0000000000p1";

type FakeState = {
  notifiedAt: Date | string | null;
  isPublic: boolean;
  subscriptionSuspendedAt: Date | string | null;
  markNotifiedCalls: number;
  notifications: Array<{
    recipientId: string;
    notificationType: string;
    message: string;
    triggeredBy: string;
    releaseId: string;
    postId: string | null;
  }>;
  pushes: unknown[];
  canDeliverCalls: number;
  canDeliverResult: boolean | (() => Promise<boolean>);
  freeRecipients: string[];
  alertSubscribers: string[];
  membershipMutations: number;
  logs: Record<string, unknown>[];
};

function createDeps(state: FakeState): NotifyReleaseLikersDeps {
  return {
    loadRelease: async (id, ownerId) => {
      if (id !== RELEASE_ID || ownerId !== ARTIST_ID) return null;
      return {
        id: RELEASE_ID,
        artistId: ARTIST_ID,
        title: "Night Bus",
        notifiedAt: state.notifiedAt,
        isPublic: state.isPublic,
        subscriptionSuspendedAt: state.subscriptionSuspendedAt,
      };
    },
    getPostIds: async () => [POST_ID],
    getFreeRecipientIds: async () => state.freeRecipients,
    getAlertSubscriberIds: async () => state.alertSubscribers,
    getArtistUsername: async () => "dj_test",
    canArtistDeliverReleaseAlerts: async () => {
      state.canDeliverCalls += 1;
      if (typeof state.canDeliverResult === "function") {
        return state.canDeliverResult();
      }
      return state.canDeliverResult;
    },
    providerEnvironment: "production",
    createNotification: async (input) => {
      const id = `notif-${state.notifications.length + 1}`;
      state.notifications.push({
        recipientId: input.recipientId,
        notificationType: input.notificationType,
        message: input.message,
        triggeredBy: input.triggeredBy,
        releaseId: input.releaseId,
        postId: input.postId,
      });
      return { id };
    },
    sendReleaseAnnouncePush: (args) => {
      state.pushes.push(args);
    },
    markNotified: async () => {
      state.markNotifiedCalls += 1;
      state.notifiedAt = new Date("2026-07-30T12:00:00.000Z");
    },
    log: (payload) => {
      state.logs.push(payload);
    },
  };
}

function baseState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    notifiedAt: null,
    isPublic: true,
    subscriptionSuspendedAt: null,
    markNotifiedCalls: 0,
    notifications: [],
    pushes: [],
    canDeliverCalls: 0,
    canDeliverResult: false,
    freeRecipients: [],
    alertSubscribers: [],
    membershipMutations: 0,
    logs: [],
    ...overrides,
  };
}

describe("runNotifyReleaseLikers paid audience gate", () => {
  it("unpaid + liker only → release_announce and push", async () => {
    const state = baseState({
      canDeliverResult: false,
      freeRecipients: [LIKER],
      alertSubscribers: [],
    });
    const outcome = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(outcome, "delivered");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0]?.recipientId, LIKER);
    assert.equal(state.notifications[0]?.notificationType, "release_announce");
    assert.equal(
      state.notifications[0]?.message,
      formatReleaseAnnounceMessage("dj_test", "Night Bus"),
    );
    assert.equal(state.pushes.length, 1);
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(state.canDeliverCalls, 1);
  });

  it("unpaid + uploader only → delivered", async () => {
    const state = baseState({
      canDeliverResult: false,
      freeRecipients: [UPLOADER],
    });
    const outcome = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(outcome, "delivered");
    assert.equal(state.notifications[0]?.recipientId, UPLOADER);
    assert.equal(state.pushes.length, 1);
  });

  it("unpaid + Release Alert subscriber only → no notification or push", async () => {
    const state = baseState({
      canDeliverResult: false,
      freeRecipients: [],
      alertSubscribers: [SUBSCRIBER],
    });
    const outcome = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(outcome, "skipped_ineligible_paid_audience");
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pushes.length, 0);
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(state.logs[0]?.deliveryAllowed, false);
  });

  it("unpaid + liker and subscriber → exactly one notification/push", async () => {
    const state = baseState({
      canDeliverResult: false,
      freeRecipients: [LIKER],
      alertSubscribers: [LIKER, SUBSCRIBER],
    });
    await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0]?.recipientId, LIKER);
    assert.equal(state.pushes.length, 1);
    assert.ok(!state.notifications.some((n) => n.recipientId === SUBSCRIBER));
  });

  it("paid + subscriber only → delivered", async () => {
    const state = baseState({
      canDeliverResult: true,
      freeRecipients: [],
      alertSubscribers: [SUBSCRIBER],
    });
    const outcome = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(outcome, "delivered");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0]?.recipientId, SUBSCRIBER);
    assert.equal(state.pushes.length, 1);
    assert.equal(state.logs[0]?.deliveryAllowed, true);
  });

  it("paid + liker and subscriber → exactly one each, no duplicate for overlap", async () => {
    const state = baseState({
      canDeliverResult: true,
      freeRecipients: [LIKER],
      alertSubscribers: [LIKER, SUBSCRIBER],
    });
    await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(state.notifications.length, 2);
    const recipients = state.notifications.map((n) => n.recipientId).sort();
    assert.deepEqual(recipients, [LIKER, SUBSCRIBER].sort());
    assert.equal(state.pushes.length, 2);
  });

  it("entitlement throw → free still deliver; subscriber-only skipped", async () => {
    const state = baseState({
      canDeliverResult: async () => {
        throw new Error("lookup failed");
      },
      freeRecipients: [LIKER],
      alertSubscribers: [SUBSCRIBER],
    });
    const outcome = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(outcome, "delivered");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0]?.recipientId, LIKER);
    assert.ok(!state.notifications.some((n) => n.recipientId === SUBSCRIBER));
    assert.equal(state.logs[0]?.deliveryAllowed, false);
  });

  it("membership rows remain untouched", async () => {
    const state = baseState({
      canDeliverResult: false,
      alertSubscribers: [SUBSCRIBER],
    });
    await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(state.membershipMutations, 0);
  });

  it("disabled/non-member listener does not receive anything", async () => {
    const state = baseState({
      canDeliverResult: true,
      freeRecipients: [LIKER],
      alertSubscribers: [SUBSCRIBER],
    });
    await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.ok(!state.notifications.some((n) => n.recipientId === NON_MEMBER));
  });

  it("notified_at idempotency unchanged", async () => {
    const state = baseState({
      canDeliverResult: true,
      freeRecipients: [LIKER],
      alertSubscribers: [SUBSCRIBER],
    });
    const deps = createDeps(state);
    const first = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, deps);
    assert.equal(first, "delivered");
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(state.notifications.length, 2);

    const second = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, deps);
    assert.equal(second, "skipped_already_processed");
    assert.equal(state.notifications.length, 2);
    assert.equal(state.canDeliverCalls, 1);
    assert.equal(state.markNotifiedCalls, 1);
  });

  it("preserves actor/release/post payload fields", async () => {
    const state = baseState({
      canDeliverResult: true,
      freeRecipients: [LIKER],
    });
    await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(state.notifications[0]?.triggeredBy, ARTIST_ID);
    assert.equal(state.notifications[0]?.releaseId, RELEASE_ID);
    assert.equal(state.notifications[0]?.postId, POST_ID);
    assert.equal((state.pushes[0] as { artistId: string }).artistId, ARTIST_ID);
  });

  it("skips when release is not public", async () => {
    const state = baseState({
      isPublic: false,
      freeRecipients: [LIKER],
    });
    const outcome = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(outcome, "skipped_not_public");
    assert.equal(state.notifications.length, 0);
    assert.equal(state.markNotifiedCalls, 0);
  });

  it("skips when release is subscription-suspended", async () => {
    const state = baseState({
      subscriptionSuspendedAt: new Date("2026-07-25T00:00:00.000Z"),
      freeRecipients: [LIKER],
    });
    const outcome = await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(outcome, "skipped_suspended");
    assert.equal(state.notifications.length, 0);
    assert.equal(state.markNotifiedCalls, 0);
  });

  it("calls entitlement helper once per event", async () => {
    const state = baseState({
      canDeliverResult: true,
      freeRecipients: [LIKER, UPLOADER],
      alertSubscribers: [SUBSCRIBER],
    });
    await runNotifyReleaseLikers(RELEASE_ID, ARTIST_ID, createDeps(state));
    assert.equal(state.canDeliverCalls, 1);
  });
});
