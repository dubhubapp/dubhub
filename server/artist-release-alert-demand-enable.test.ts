import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  enableArtistReleaseAlertWithDemandDedup,
  formatReleaseAlertEnabledDemandMessage,
  isArtistOpenForReleaseAlertSubscriptions,
  type ArtistReleaseAlertDemandEnableTx,
} from "./artist-release-alert-demand-enable";

const LISTENER_A = "00000000-0000-0000-0000-0000000000aa";
const LISTENER_B = "00000000-0000-0000-0000-0000000000bb";
const ARTIST_ID = "00000000-0000-0000-0000-0000000000cc";

type FakeState = {
  membership: Set<string>;
  markers: Set<string>;
  notifications: Array<{ listenerId: string; artistId: string; message: string }>;
  failNextNotification: boolean;
};

function pairKey(listenerId: string, artistId: string): string {
  return `${listenerId}::${artistId}`;
}

function createFakeStore(initial?: Partial<FakeState>) {
  const state: FakeState = {
    membership: new Set(initial?.membership ?? []),
    markers: new Set(initial?.markers ?? []),
    notifications: [...(initial?.notifications ?? [])],
    failNextNotification: initial?.failNextNotification ?? false,
  };

  /** Serialize claim operations to mirror Postgres unique-constraint races. */
  let chain: Promise<unknown> = Promise.resolve();
  function exclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = chain.then(() => fn());
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const tx: ArtistReleaseAlertDemandEnableTx = {
    insertMembership: (listenerId, artistId) =>
      exclusive(() => {
        const key = pairKey(listenerId, artistId);
        if (state.membership.has(key)) return false;
        state.membership.add(key);
        return true;
      }),
    claimDemandMarker: (listenerId, artistId) =>
      exclusive(() => {
        const key = pairKey(listenerId, artistId);
        if (state.markers.has(key)) return false;
        state.markers.add(key);
        return true;
      }),
    insertDemandNotification: async ({ listenerId, artistId, message }) => {
      if (state.failNextNotification) {
        state.failNextNotification = false;
        throw new Error("NOTIFICATION_INSERT_FAILED");
      }
      state.notifications.push({ listenerId, artistId, message });
    },
  };

  async function runInTransaction<T>(
    fn: (tx: ArtistReleaseAlertDemandEnableTx) => Promise<T>,
  ): Promise<T> {
    // Snapshot for rollback of membership + marker + notifications on failure.
    const snap = {
      membership: new Set(state.membership),
      markers: new Set(state.markers),
      notifications: [...state.notifications],
    };
    try {
      return await fn(tx);
    } catch (error) {
      state.membership = new Set(snap.membership);
      state.markers = new Set(snap.markers);
      state.notifications = [...snap.notifications];
      throw error;
    }
  }

  function disable(listenerId: string, artistId: string) {
    state.membership.delete(pairKey(listenerId, artistId));
  }

  function seedBackfilledMarker(listenerId: string, artistId: string) {
    state.markers.add(pairKey(listenerId, artistId));
  }

  return {
    state,
    disable,
    seedBackfilledMarker,
    deps: {
      getArtist: async () =>
        ({ account_type: "artist", verified_artist: true }) as const,
      getListenerUsername: async (listenerId: string) =>
        listenerId === LISTENER_A ? "listener_a" : "listener_b",
      runInTransaction,
    },
  };
}

describe("formatReleaseAlertEnabledDemandMessage", () => {
  it("keeps existing copy shape", () => {
    assert.equal(
      formatReleaseAlertEnabledDemandMessage("coolfan"),
      "@coolfan is waiting for your next release.",
    );
    assert.equal(
      formatReleaseAlertEnabledDemandMessage("@coolfan"),
      "@coolfan is waiting for your next release.",
    );
    assert.equal(
      formatReleaseAlertEnabledDemandMessage(null),
      "@Someone is waiting for your next release.",
    );
  });
});

describe("isArtistOpenForReleaseAlertSubscriptions", () => {
  it("requires verified artist", () => {
    assert.equal(
      isArtistOpenForReleaseAlertSubscriptions({
        account_type: "artist",
        verified_artist: true,
      }),
      true,
    );
    assert.equal(
      isArtistOpenForReleaseAlertSubscriptions({
        account_type: "artist",
        verified_artist: false,
      }),
      false,
    );
  });
});

describe("enableArtistReleaseAlertWithDemandDedup", () => {
  it("first enable creates membership, marker, and one notification", async () => {
    const fake = createFakeStore();
    const result = await enableArtistReleaseAlertWithDemandDedup(
      LISTENER_A,
      ARTIST_ID,
      fake.deps,
    );

    assert.equal(result.created, true);
    assert.equal(fake.state.membership.has(pairKey(LISTENER_A, ARTIST_ID)), true);
    assert.equal(fake.state.markers.has(pairKey(LISTENER_A, ARTIST_ID)), true);
    assert.equal(fake.state.notifications.length, 1);
    assert.equal(fake.state.notifications[0].artistId, ARTIST_ID);
    assert.equal(fake.state.notifications[0].listenerId, LISTENER_A);
    assert.equal(
      fake.state.notifications[0].message,
      "@listener_a is waiting for your next release.",
    );
  });

  it("repeat enable while active creates no second notification", async () => {
    const fake = createFakeStore();
    await enableArtistReleaseAlertWithDemandDedup(LISTENER_A, ARTIST_ID, fake.deps);
    const second = await enableArtistReleaseAlertWithDemandDedup(
      LISTENER_A,
      ARTIST_ID,
      fake.deps,
    );

    assert.equal(second.created, false);
    assert.equal(fake.state.membership.size, 1);
    assert.equal(fake.state.markers.size, 1);
    assert.equal(fake.state.notifications.length, 1);
  });

  it("disable then re-enable restores membership without a second notification", async () => {
    const fake = createFakeStore();
    await enableArtistReleaseAlertWithDemandDedup(LISTENER_A, ARTIST_ID, fake.deps);
    fake.disable(LISTENER_A, ARTIST_ID);
    assert.equal(fake.state.membership.has(pairKey(LISTENER_A, ARTIST_ID)), false);
    assert.equal(fake.state.markers.has(pairKey(LISTENER_A, ARTIST_ID)), true);

    const reenabled = await enableArtistReleaseAlertWithDemandDedup(
      LISTENER_A,
      ARTIST_ID,
      fake.deps,
    );

    assert.equal(reenabled.created, true);
    assert.equal(fake.state.membership.has(pairKey(LISTENER_A, ARTIST_ID)), true);
    assert.equal(fake.state.markers.size, 1);
    assert.equal(fake.state.notifications.length, 1);
  });

  it("concurrent first enables create one marker and one notification", async () => {
    const fake = createFakeStore();
    const [a, b] = await Promise.all([
      enableArtistReleaseAlertWithDemandDedup(LISTENER_A, ARTIST_ID, fake.deps),
      enableArtistReleaseAlertWithDemandDedup(LISTENER_A, ARTIST_ID, fake.deps),
    ]);

    assert.equal(a.created || b.created, true);
    assert.equal(a.created && b.created, false);
    assert.equal(fake.state.membership.size, 1);
    assert.equal(fake.state.markers.size, 1);
    assert.equal(fake.state.notifications.length, 1);
  });

  it("two different listeners each create one notification", async () => {
    const fake = createFakeStore();
    await enableArtistReleaseAlertWithDemandDedup(LISTENER_A, ARTIST_ID, fake.deps);
    await enableArtistReleaseAlertWithDemandDedup(LISTENER_B, ARTIST_ID, fake.deps);

    assert.equal(fake.state.membership.size, 2);
    assert.equal(fake.state.markers.size, 2);
    assert.equal(fake.state.notifications.length, 2);
  });

  it("backfilled historical marker blocks re-enable notification", async () => {
    const fake = createFakeStore();
    // Historical notification already delivered; migration backfilled the marker.
    fake.seedBackfilledMarker(LISTENER_A, ARTIST_ID);

    const result = await enableArtistReleaseAlertWithDemandDedup(
      LISTENER_A,
      ARTIST_ID,
      fake.deps,
    );

    assert.equal(result.created, true);
    assert.equal(fake.state.membership.has(pairKey(LISTENER_A, ARTIST_ID)), true);
    assert.equal(fake.state.notifications.length, 0);

    fake.disable(LISTENER_A, ARTIST_ID);
    const again = await enableArtistReleaseAlertWithDemandDedup(
      LISTENER_A,
      ARTIST_ID,
      fake.deps,
    );
    assert.equal(again.created, true);
    assert.equal(fake.state.notifications.length, 0);
  });

  it("notification failure rolls back marker claim so retry can notify", async () => {
    const fake = createFakeStore();
    fake.state.failNextNotification = true;

    await assert.rejects(
      () => enableArtistReleaseAlertWithDemandDedup(LISTENER_A, ARTIST_ID, fake.deps),
      /NOTIFICATION_INSERT_FAILED/,
    );

    assert.equal(fake.state.membership.has(pairKey(LISTENER_A, ARTIST_ID)), false);
    assert.equal(fake.state.markers.has(pairKey(LISTENER_A, ARTIST_ID)), false);
    assert.equal(fake.state.notifications.length, 0);

    const retry = await enableArtistReleaseAlertWithDemandDedup(
      LISTENER_A,
      ARTIST_ID,
      fake.deps,
    );
    assert.equal(retry.created, true);
    assert.equal(fake.state.markers.size, 1);
    assert.equal(fake.state.notifications.length, 1);
  });

  it("rejects self-alert and unverified artists before writing", async () => {
    const fake = createFakeStore();

    await assert.rejects(
      () => enableArtistReleaseAlertWithDemandDedup(ARTIST_ID, ARTIST_ID, fake.deps),
      /SELF_ALERT_NOT_ALLOWED/,
    );

    await assert.rejects(
      () =>
        enableArtistReleaseAlertWithDemandDedup(LISTENER_A, ARTIST_ID, {
          ...fake.deps,
          getArtist: async () => ({ account_type: "artist", verified_artist: false }),
        }),
      /ARTIST_NOT_VERIFIED/,
    );

    assert.equal(fake.state.membership.size, 0);
    assert.equal(fake.state.markers.size, 0);
    assert.equal(fake.state.notifications.length, 0);
  });

  it("does not require paid entitlement to enable or notify (free and paid artists)", async () => {
    const fake = createFakeStore();
    const result = await enableArtistReleaseAlertWithDemandDedup(
      LISTENER_A,
      ARTIST_ID,
      fake.deps,
    );
    assert.equal(result.created, true);
    assert.equal(fake.state.notifications.length, 1);
    const keys = Object.keys(fake.deps);
    assert.equal(keys.includes("canArtistUsePaidTools"), false);
    assert.equal(keys.includes("hasPaidToolAccess"), false);
  });
});

describe("ARTIST-SUB-INTRO-1 demand notification is in-app only", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("enableArtistReleaseAlert inserts release_alert_enabled without push fan-out", () => {
    const storageSrc = readFileSync(join(here, "./storage.ts"), "utf8");
    const start = storageSrc.indexOf("async enableArtistReleaseAlert(");
    const next = storageSrc.indexOf("async countArtistReleaseAlertsForArtist(");
    assert.ok(start > 0 && next > start);
    const block = storageSrc.slice(start, next);
    assert.match(block, /notification_type, read, created_at/);
    assert.match(block, /'release_alert_enabled'/);
    assert.doesNotMatch(block, /sendPushToUser/);
    assert.doesNotMatch(block, /canArtistUsePaidTools/);
    assert.doesNotMatch(block, /hasPaidToolAccess/);
  });

  it("demand enable module never imports push", () => {
    const src = readFileSync(join(here, "./artist-release-alert-demand-enable.ts"), "utf8");
    assert.doesNotMatch(src, /sendPushToUser|pushSend/);
    assert.doesNotMatch(src, /canArtistUsePaidTools|hasPaidToolAccess/);
  });
});
