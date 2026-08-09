import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatArtistReleaseAlertMessage,
  RELEASE_ATTACHED_NOTIFICATION_MESSAGE,
  runMaybeNotifyReleasePublic,
  type MaybeNotifyReleasePublicDeps,
} from "./maybe-notify-release-public";

const RELEASE_ID = "00000000-0000-0000-0000-0000000000r1";
const ARTIST_ID = "00000000-0000-0000-0000-0000000000aa";
const LISTENER_A = "00000000-0000-0000-0000-0000000000a1";
const LISTENER_B = "00000000-0000-0000-0000-0000000000a2";
const LISTENER_C = "00000000-0000-0000-0000-0000000000a3";
const ATTACHED_LIKER = "00000000-0000-0000-0000-0000000000b1";
const POST_ID = "00000000-0000-0000-0000-0000000000p1";

type CreatedNotif = {
  recipientId: string;
  notificationType: string;
  message: string;
  releaseId: string;
  triggeredBy: string;
  postId: string | null;
};

type FakeState = {
  notifiedAt: Date | string | null;
  isPublic: boolean;
  subscriptionSuspendedAt: Date | string | null;
  markNotifiedCalls: number;
  notifications: CreatedNotif[];
  attachedFanoutCalls: string[][];
  alertPushes: unknown[];
  canDeliverCalls: number;
  canDeliverResult: boolean | (() => Promise<boolean>);
  alertSubscribers: string[];
  attachedRecipients: string[];
  logs: Record<string, unknown>[];
};

function createDeps(state: FakeState): MaybeNotifyReleasePublicDeps {
  return {
    loadRelease: async () => ({
      id: RELEASE_ID,
      artistId: ARTIST_ID,
      title: "Night Bus",
      isPublic: state.isPublic,
      notifiedAt: state.notifiedAt,
      subscriptionSuspendedAt: state.subscriptionSuspendedAt,
    }),
    getPostIds: async () => [POST_ID],
    notifyNewlyAttachedPostAudience: async (_releaseId, postIds) => {
      state.attachedFanoutCalls.push([...postIds]);
      // Simulate marker-backed free path creating release_attached for attached recipients.
      for (const recipientId of state.attachedRecipients) {
        state.notifications.push({
          recipientId,
          notificationType: "release_attached",
          message: RELEASE_ATTACHED_NOTIFICATION_MESSAGE,
          releaseId: RELEASE_ID,
          triggeredBy: ARTIST_ID,
          postId: POST_ID,
        });
      }
      return { notifiedRecipientIds: [...state.attachedRecipients] };
    },
    getAttachedRecipientIds: async () => state.attachedRecipients,
    getAlertSubscriberIds: async () => state.alertSubscribers,
    getOwnerUsername: async () => "dj_test",
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
        releaseId: input.releaseId,
        triggeredBy: input.triggeredBy,
        postId: input.postId,
      });
      return { id };
    },
    sendArtistReleaseAlertPush: (args) => {
      state.alertPushes.push(args);
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
    attachedFanoutCalls: [],
    alertPushes: [],
    canDeliverCalls: 0,
    canDeliverResult: true,
    alertSubscribers: [LISTENER_A, LISTENER_B, LISTENER_C],
    attachedRecipients: [],
    logs: [],
    ...overrides,
  };
}

describe("formatArtistReleaseAlertMessage", () => {
  it("preserves existing copy", () => {
    assert.equal(
      formatArtistReleaseAlertMessage("dj_test", "Night Bus"),
      "@dj_test announced a new release: Night Bus",
    );
    assert.equal(
      formatArtistReleaseAlertMessage("dj_test", ""),
      "@dj_test announced a new release.",
    );
  });
});

describe("runMaybeNotifyReleasePublic entitlement gate", () => {
  it("eligible artist: loads audience, creates artist_release_alert rows, invokes push", async () => {
    const state = baseState({ canDeliverResult: true });
    const outcome = await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));

    assert.equal(outcome, "delivered");
    assert.equal(state.canDeliverCalls, 1);
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      3,
    );
    assert.equal(state.alertPushes.length, 3);
    assert.equal(state.attachedFanoutCalls.length, 1);
    assert.deepEqual(state.attachedFanoutCalls[0], [POST_ID]);
    assert.equal(state.logs[0]?.deliveryAllowed, true);
    assert.equal(state.logs[0]?.outcome, "delivered");
    assert.equal(state.logs[0]?.providerEnvironment, "production");
  });

  it("ineligible artist: no alert rows, no alert pushes, still marks notified_at", async () => {
    const state = baseState({ canDeliverResult: false });
    const outcome = await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));

    assert.equal(outcome, "skipped_ineligible");
    assert.equal(state.canDeliverCalls, 1);
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      0,
    );
    assert.equal(state.alertPushes.length, 0);
    assert.equal(state.attachedFanoutCalls.length, 1);
    assert.equal(state.logs[0]?.deliveryAllowed, false);
    assert.equal(state.logs[0]?.outcome, "skipped_ineligible");
  });

  it("policy helper throw → fail closed, no alert delivery, marks notified", async () => {
    const state = baseState({
      canDeliverResult: async () => {
        throw new Error("snapshot lookup failed");
      },
    });
    const outcome = await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));

    assert.equal(outcome, "skipped_ineligible");
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(state.alertPushes.length, 0);
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      0,
    );
    assert.equal(state.logs[0]?.deliveryAllowed, false);
  });

  it("free release_attached still sends via per-post helper when paid delivery is skipped", async () => {
    const state = baseState({
      canDeliverResult: false,
      attachedRecipients: [ATTACHED_LIKER],
      alertSubscribers: [LISTENER_A, ATTACHED_LIKER],
    });
    const outcome = await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));

    assert.equal(outcome, "skipped_ineligible");
    const attached = state.notifications.filter((n) => n.notificationType === "release_attached");
    assert.equal(attached.length, 1);
    assert.equal(attached[0]?.recipientId, ATTACHED_LIKER);
    assert.equal(attached[0]?.message, RELEASE_ATTACHED_NOTIFICATION_MESSAGE);
    assert.equal(state.attachedFanoutCalls.length, 1);
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      0,
    );
    assert.equal(state.markNotifiedCalls, 1);
  });

  it("eligible with three alert-only listeners creates three alerts", async () => {
    const state = baseState({
      canDeliverResult: true,
      alertSubscribers: [LISTENER_A, LISTENER_B, LISTENER_C],
      attachedRecipients: [],
    });
    await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      3,
    );
    assert.ok(
      state.notifications
        .filter((n) => n.notificationType === "artist_release_alert")
        .every((n) => n.notificationType === "artist_release_alert"),
    );
  });

  it("listener in both attached and alert sets receives release_attached only", async () => {
    const state = baseState({
      canDeliverResult: true,
      attachedRecipients: [ATTACHED_LIKER],
      alertSubscribers: [ATTACHED_LIKER, LISTENER_A],
    });
    await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));

    const forAttached = state.notifications.filter((n) => n.recipientId === ATTACHED_LIKER);
    assert.equal(forAttached.length, 1);
    assert.equal(forAttached[0]?.notificationType, "release_attached");
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      1,
    );
    assert.equal(
      state.notifications.find((n) => n.notificationType === "artist_release_alert")?.recipientId,
      LISTENER_A,
    );
  });

  it("eligible with no alert-only audience marks notified without alert pushes", async () => {
    const state = baseState({
      canDeliverResult: true,
      alertSubscribers: [],
      attachedRecipients: [ATTACHED_LIKER],
    });
    const outcome = await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));
    assert.equal(outcome, "skipped_no_audience");
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(state.alertPushes.length, 0);
    assert.equal(state.attachedFanoutCalls.length, 1);
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "release_attached").length,
      1,
    );
  });

  it("duplicate invocation after notified_at skips without re-delivery", async () => {
    const state = baseState({ canDeliverResult: true });
    const deps = createDeps(state);

    const first = await runMaybeNotifyReleasePublic(RELEASE_ID, deps);
    assert.equal(first, "delivered");
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      3,
    );

    const second = await runMaybeNotifyReleasePublic(RELEASE_ID, deps);
    assert.equal(second, "skipped_already_processed");
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      3,
    );
    assert.equal(state.alertPushes.length, 3);
    assert.equal(state.canDeliverCalls, 1);
    assert.equal(state.markNotifiedCalls, 1);
    // Per-post helper must not be invoked again after notified_at.
    assert.equal(state.attachedFanoutCalls.length, 1);
  });

  it("ineligible first then eligible re-invocation does not back-send after notified_at", async () => {
    const state = baseState({ canDeliverResult: false });
    const deps = createDeps(state);

    const first = await runMaybeNotifyReleasePublic(RELEASE_ID, deps);
    assert.equal(first, "skipped_ineligible");
    assert.equal(state.markNotifiedCalls, 1);
    assert.equal(state.alertPushes.length, 0);

    state.canDeliverResult = true;
    const second = await runMaybeNotifyReleasePublic(RELEASE_ID, deps);
    assert.equal(second, "skipped_already_processed");
    assert.equal(state.alertPushes.length, 0);
    assert.equal(
      state.notifications.filter((n) => n.notificationType === "artist_release_alert").length,
      0,
    );
  });

  it("calls entitlement helper once per delivery event", async () => {
    const state = baseState({
      canDeliverResult: true,
      alertSubscribers: [LISTENER_A, LISTENER_B, LISTENER_C],
    });
    await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));
    assert.equal(state.canDeliverCalls, 1);
  });

  it("does not expose private subscription fields in logs", async () => {
    const state = baseState({ canDeliverResult: false });
    await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));
    const log = state.logs[0] ?? {};
    for (const key of [
      "state",
      "expiresAt",
      "productIdentifier",
      "willRenew",
      "billingIssue",
      "gracePeriod",
      "entitlementIdentifier",
      "CustomerInfo",
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(log, key), false);
    }
    assert.equal(typeof log.deliveryAllowed, "boolean");
  });

  it("preserves alert message and actor/release wiring", async () => {
    const state = baseState({
      canDeliverResult: true,
      alertSubscribers: [LISTENER_A],
    });
    await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));
    const alert = state.notifications.find((n) => n.notificationType === "artist_release_alert");
    assert.equal(alert?.message, "@dj_test announced a new release: Night Bus");
    assert.equal(alert?.triggeredBy, ARTIST_ID);
    assert.equal(alert?.releaseId, RELEASE_ID);
    assert.equal(alert?.postId, POST_ID);
    assert.equal((state.alertPushes[0] as { artistUsername: string }).artistUsername, "dj_test");
    assert.equal((state.alertPushes[0] as { releaseTitle: string }).releaseTitle, "Night Bus");
  });

  it("suspended release skips entirely without fan-out or marking notified", async () => {
    const state = baseState({
      canDeliverResult: true,
      subscriptionSuspendedAt: new Date("2026-07-25T00:00:00.000Z"),
    });
    const outcome = await runMaybeNotifyReleasePublic(RELEASE_ID, createDeps(state));

    assert.equal(outcome, "skipped_suspended");
    assert.equal(state.markNotifiedCalls, 0);
    assert.equal(state.attachedFanoutCalls.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.alertPushes.length, 0);
    assert.equal(state.canDeliverCalls, 0);
  });

  it("notified_at does not need to suppress later per-post fan-out (attach path independent)", async () => {
    // Documented contract: after release-level processing, attach path may still call
    // notifyNewlyAttachedPostAudience directly. This suite only proves maybeNotify skips.
    const state = baseState({ canDeliverResult: true });
    const deps = createDeps(state);
    await runMaybeNotifyReleasePublic(RELEASE_ID, deps);
    assert.ok(state.notifiedAt);
    const second = await runMaybeNotifyReleasePublic(RELEASE_ID, deps);
    assert.equal(second, "skipped_already_processed");
    assert.equal(state.attachedFanoutCalls.length, 1);
  });
});
