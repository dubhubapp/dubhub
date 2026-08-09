import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RELEASE_ATTACHED_NOTIFICATION_MESSAGE } from "./maybe-notify-release-public";
import {
  notifyNewlyAttachedPostAudience,
  type NotifyNewlyAttachedPostAudienceDeps,
  type NotifyNewlyAttachedPostAudienceTx,
} from "./notify-newly-attached-post-audience";

const RELEASE_ID = "00000000-0000-0000-0000-0000000000r1";
const ARTIST_ID = "00000000-0000-0000-0000-0000000000aa";
const POST_A = "00000000-0000-0000-0000-0000000000a1";
const POST_B = "00000000-0000-0000-0000-0000000000b1";
const POST_C = "00000000-0000-0000-0000-0000000000c1";
const POST_D = "00000000-0000-0000-0000-0000000000d1";
const USER_A = "00000000-0000-0000-0000-0000000000u1";
const USER_B = "00000000-0000-0000-0000-0000000000u2";
const USER_C = "00000000-0000-0000-0000-0000000000u3";
const USER_D = "00000000-0000-0000-0000-0000000000u4";
const OVERLAP = "00000000-0000-0000-0000-0000000000ov";

type Notif = {
  recipientId: string;
  postId: string;
  releaseId: string;
  message: string;
  triggeredBy: string;
};

type FakeState = {
  isPublic: boolean;
  subscriptionSuspendedAt: Date | string | null;
  markers: Set<string>;
  notifications: Notif[];
  pushes: Array<{ recipientId: string; postId: string; releaseId: string; artistId: string }>;
  recipientsByPost: Record<string, string[]>;
  failNextNotification: boolean;
};

function markerKey(releaseId: string, postId: string, recipientId: string): string {
  return `${releaseId}::${postId}::${recipientId}`;
}

function createFake(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    isPublic: true,
    subscriptionSuspendedAt: null,
    markers: new Set(),
    notifications: [],
    pushes: [],
    recipientsByPost: {},
    failNextNotification: false,
    ...overrides,
  };

  let chain: Promise<unknown> = Promise.resolve();
  function exclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = chain.then(() => fn());
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const tx: NotifyNewlyAttachedPostAudienceTx = {
    claimMarker: (releaseId, postId, recipientId) =>
      exclusive(() => {
        const key = markerKey(releaseId, postId, recipientId);
        if (state.markers.has(key)) return false;
        state.markers.add(key);
        return true;
      }),
    insertReleaseAttachedNotification: async ({
      recipientId,
      triggeredBy,
      postId,
      releaseId,
      message,
    }) => {
      if (state.failNextNotification) {
        state.failNextNotification = false;
        throw new Error("NOTIFICATION_INSERT_FAILED");
      }
      const id = `notif-${state.notifications.length + 1}`;
      state.notifications.push({
        recipientId,
        postId,
        releaseId,
        message,
        triggeredBy,
      });
      return { id };
    },
  };

  async function runInTransaction<T>(
    fn: (tx: NotifyNewlyAttachedPostAudienceTx) => Promise<T>,
  ): Promise<T> {
    const snap = {
      markers: new Set(state.markers),
      notifications: [...state.notifications],
    };
    try {
      return await fn(tx);
    } catch (error) {
      state.markers = new Set(snap.markers);
      state.notifications = [...snap.notifications];
      throw error;
    }
  }

  const deps: NotifyNewlyAttachedPostAudienceDeps = {
    loadRelease: async () => ({
      id: RELEASE_ID,
      artistId: ARTIST_ID,
      isPublic: state.isPublic,
      subscriptionSuspendedAt: state.subscriptionSuspendedAt,
    }),
    getPostRecipientIds: async (postId, ownerId) =>
      (state.recipientsByPost[postId] ?? []).filter((id) => id && id !== ownerId),
    runInTransaction,
    sendAttachedPush: (args) => {
      state.pushes.push(args);
    },
  };

  return { state, deps };
}

describe("notifyNewlyAttachedPostAudience", () => {
  it("initial A/B/C notifies eligible audiences once; overlap gets one visible notification; markers for all pairs", async () => {
    const { state, deps } = createFake({
      recipientsByPost: {
        [POST_A]: [USER_A, OVERLAP],
        [POST_B]: [USER_B, OVERLAP],
        [POST_C]: [USER_C],
      },
    });

    const result = await notifyNewlyAttachedPostAudience(
      RELEASE_ID,
      [POST_A, POST_B, POST_C],
      deps,
    );

    assert.equal(result.outcome, "delivered");
    assert.equal(result.notificationsCreated, 4); // A, overlap, B, C — overlap once
    assert.equal(result.markersClaimed, 5); // A+overlap, B+overlap, C
    assert.equal(state.notifications.length, 4);
    assert.equal(
      state.notifications.filter((n) => n.recipientId === OVERLAP).length,
      1,
    );
    assert.equal(state.pushes.length, 4);
    assert.ok(state.markers.has(markerKey(RELEASE_ID, POST_A, OVERLAP)));
    assert.ok(state.markers.has(markerKey(RELEASE_ID, POST_B, OVERLAP)));
    assert.ok(
      state.notifications.every((n) => n.message === RELEASE_ATTACHED_NOTIFICATION_MESSAGE),
    );
    assert.ok(state.notifications.every((n) => n.triggeredBy === ARTIST_ID));
  });

  it("adding D later notifies only D audience", async () => {
    const { state, deps } = createFake({
      recipientsByPost: {
        [POST_A]: [USER_A],
        [POST_B]: [USER_B],
        [POST_C]: [USER_C],
        [POST_D]: [USER_D],
      },
    });

    await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A, POST_B, POST_C], deps);
    const afterInitial = state.notifications.length;
    assert.equal(afterInitial, 3);

    const later = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_D], deps);
    assert.equal(later.notificationsCreated, 1);
    assert.equal(state.notifications.length, 4);
    assert.equal(state.notifications[3]?.recipientId, USER_D);
    assert.equal(state.notifications[3]?.postId, POST_D);
    assert.equal(
      state.notifications.filter((n) => [USER_A, USER_B, USER_C].includes(n.recipientId)).length,
      3,
    );
  });

  it("reattach after markers exist creates no notification or push", async () => {
    const { state, deps } = createFake({
      recipientsByPost: { [POST_C]: [USER_C] },
    });
    await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_C], deps);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.pushes.length, 1);

    const again = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_C], deps);
    assert.equal(again.notificationsCreated, 0);
    assert.equal(again.markersClaimed, 0);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.pushes.length, 1);
  });

  it("concurrent claims for same post–recipient yield one marker and one notification", async () => {
    const { state, deps } = createFake({
      recipientsByPost: { [POST_A]: [USER_A] },
    });

    const [r1, r2] = await Promise.all([
      notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps),
      notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps),
    ]);

    const created = r1.notificationsCreated + r2.notificationsCreated;
    assert.equal(created, 1);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.markers.size, 1);
    assert.equal(state.pushes.length, 1);
  });

  it("notification insert failure rolls back marker so retry can deliver", async () => {
    const { state, deps } = createFake({
      recipientsByPost: { [POST_A]: [USER_A] },
      failNextNotification: true,
    });

    await assert.rejects(
      () => notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps),
      /NOTIFICATION_INSERT_FAILED/,
    );
    assert.equal(state.markers.size, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pushes.length, 0);

    const retry = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps);
    assert.equal(retry.notificationsCreated, 1);
    assert.equal(state.markers.size, 1);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.pushes.length, 1);
  });

  it("existing marker skips notification and push", async () => {
    const { state, deps } = createFake({
      recipientsByPost: { [POST_A]: [USER_A] },
      markers: new Set([markerKey(RELEASE_ID, POST_A, USER_A)]),
    });

    const result = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps);
    assert.equal(result.notificationsCreated, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pushes.length, 0);
  });

  it("notification.post_id equals the newly attached post id", async () => {
    const { state, deps } = createFake({
      recipientsByPost: {
        [POST_A]: [USER_A],
        [POST_D]: [USER_D],
      },
    });
    await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A, POST_D], deps);
    assert.equal(state.notifications.find((n) => n.recipientId === USER_A)?.postId, POST_A);
    assert.equal(state.notifications.find((n) => n.recipientId === USER_D)?.postId, POST_D);
    assert.equal(state.pushes.find((p) => p.recipientId === USER_A)?.postId, POST_A);
  });

  it("excludes release owner even if returned by recipient helper", async () => {
    const { state, deps } = createFake({
      recipientsByPost: { [POST_A]: [ARTIST_ID, USER_A] },
    });
    // Helper filters owner; also guarded in fan-out.
    const result = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps);
    assert.equal(result.notificationsCreated, 1);
    assert.ok(state.notifications.every((n) => n.recipientId !== ARTIST_ID));
  });

  it("does not filter by account type — all recipient ids are eligible", async () => {
    const listener = USER_A;
    const artistAccount = USER_B;
    const { state, deps } = createFake({
      recipientsByPost: { [POST_A]: [listener, artistAccount] },
    });
    await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps);
    assert.equal(state.notifications.length, 2);
    assert.deepEqual(
      state.notifications.map((n) => n.recipientId).sort(),
      [listener, artistAccount].sort(),
    );
  });

  it("skips when release is not public", async () => {
    const { state, deps } = createFake({
      isPublic: false,
      recipientsByPost: { [POST_A]: [USER_A] },
    });
    const result = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps);
    assert.equal(result.outcome, "skipped_not_public");
    assert.equal(state.notifications.length, 0);
    assert.equal(state.markers.size, 0);
  });

  it("skips when release is subscription-suspended", async () => {
    const { state, deps } = createFake({
      subscriptionSuspendedAt: new Date("2026-07-25T00:00:00.000Z"),
      recipientsByPost: { [POST_A]: [USER_A] },
    });
    const result = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps);
    assert.equal(result.outcome, "skipped_suspended");
    assert.equal(state.notifications.length, 0);
    assert.equal(state.markers.size, 0);
  });

  it("does not assume historical markers exist (no backfill)", async () => {
    const { state, deps } = createFake({
      recipientsByPost: { [POST_A]: [USER_A] },
      markers: new Set(),
      notifications: [],
    });
    // Pre-cutover relationship with no marker still notifies once at cutover.
    const result = await notifyNewlyAttachedPostAudience(RELEASE_ID, [POST_A], deps);
    assert.equal(result.notificationsCreated, 1);
    assert.equal(state.markers.size, 1);
  });
});
