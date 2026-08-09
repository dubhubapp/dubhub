import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool, PoolClient } from "pg";
import {
  reconcileArtistFutureReleaseSuspensions,
  type ReconcileArtistFutureReleaseSuspensionsDeps,
} from "./reconcile-artist-future-release-suspensions";

const ARTIST_ID = "00000000-0000-0000-0000-0000000000a1";
const NOW = new Date("2026-08-02T12:00:00.000Z");

type FakeReleaseRow = {
  id: string;
  is_public: boolean;
  is_coming_soon: boolean;
  release_date: string | null;
  created_at: string;
  subscription_suspended_at: string | null;
};

function release(partial: Partial<FakeReleaseRow> & Pick<FakeReleaseRow, "id">): FakeReleaseRow {
  return {
    is_public: true,
    is_coming_soon: false,
    release_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    subscription_suspended_at: null,
    ...partial,
  };
}

/** Minimal pg Pool/PoolClient fake covering exactly the queries the module issues. */
function fakePool(rows: FakeReleaseRow[]): { pool: Pool; connectCalls: number } {
  let connectCalls = 0;
  const client: Pick<PoolClient, "query" | "release"> = {
    query: (async (text: string, params?: unknown[]) => {
      if (text.startsWith("BEGIN") || text.startsWith("COMMIT") || text.startsWith("ROLLBACK")) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("pg_advisory_xact_lock")) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("FROM releases") && text.includes("WHERE artist_id = $1")) {
        const artistId = params?.[0];
        return {
          rows: artistId === ARTIST_ID ? rows : [],
          rowCount: artistId === ARTIST_ID ? rows.length : 0,
        };
      }
      if (text.includes("subscription_suspension_reason = $2")) {
        // applySuspend
        const [suspendedAt, reason, ids] = params as [Date, string, string[]];
        let count = 0;
        for (const row of rows) {
          if (ids.includes(row.id) && row.subscription_suspended_at == null) {
            row.subscription_suspended_at = suspendedAt.toISOString();
            row.created_at = row.created_at; // unchanged
            (row as any).subscription_suspension_reason = reason;
            count += 1;
          }
        }
        return { rows: [], rowCount: count };
      }
      if (text.includes("SET subscription_suspended_at = NULL")) {
        // applyClearSuspension
        const [, ids] = params as [Date, string[]];
        let count = 0;
        for (const row of rows) {
          if (ids.includes(row.id) && row.subscription_suspended_at != null) {
            row.subscription_suspended_at = null;
            count += 1;
          }
        }
        return { rows: [], rowCount: count };
      }
      throw new Error(`Unexpected query in test fake: ${text}`);
    }) as PoolClient["query"],
    release: () => undefined,
  };

  const pool = {
    connect: async () => {
      connectCalls += 1;
      return client as PoolClient;
    },
  } as unknown as Pool;

  return { pool, connectCalls };
}

function baseDeps(
  rows: FakeReleaseRow[],
  overrides: Partial<ReconcileArtistFutureReleaseSuspensionsDeps> = {},
): { deps: ReconcileArtistFutureReleaseSuspensionsDeps; pool: Pool } {
  const { pool } = fakePool(rows);
  return {
    pool,
    deps: {
      pool,
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      ...overrides,
    },
  };
}

describe("reconcileArtistFutureReleaseSuspensions", () => {
  it("enforcement disabled → no DB access, outcome enforcement_disabled", async () => {
    let connectCalled = false;
    const pool = {
      connect: async () => {
        connectCalled = true;
        throw new Error("pool.connect should not be called when enforcement is disabled");
      },
    } as unknown as Pool;

    const result = await reconcileArtistFutureReleaseSuspensions(ARTIST_ID, {
      pool,
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: false,
    });

    assert.equal(result.outcome, "enforcement_disabled");
    assert.equal(result.accessCategory, "disabled");
    assert.equal(result.suspendedCount, 0);
    assert.equal(result.restoredCount, 0);
    assert.equal(connectCalled, false);
  });

  it("no_write access category → no DB access, outcome no_write", async () => {
    let connectCalled = false;
    const pool = {
      connect: async () => {
        connectCalled = true;
        throw new Error("pool.connect should not be called for no_write");
      },
    } as unknown as Pool;

    const result = await reconcileArtistFutureReleaseSuspensions(ARTIST_ID, {
      pool,
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      accessCategoryOverride: "no_write",
    });

    assert.equal(result.outcome, "no_write");
    assert.equal(result.accessCategory, "no_write");
    assert.equal(connectCalled, false);
  });

  it("confirmed_paid restores all suspended releases for the artist", async () => {
    const rows = [
      release({ id: "r1", subscription_suspended_at: "2026-07-01T00:00:00.000Z" }),
      release({ id: "r2", subscription_suspended_at: "2026-07-02T00:00:00.000Z" }),
      release({ id: "r3", subscription_suspended_at: null }),
    ];
    const { deps } = baseDeps(rows, { accessCategoryOverride: "confirmed_paid" });

    const result = await reconcileArtistFutureReleaseSuspensions(ARTIST_ID, deps);

    assert.equal(result.outcome, "restored");
    assert.equal(result.accessCategory, "confirmed_paid");
    assert.equal(result.restoredCount, 2);
    assert.equal(result.suspendedCount, 0);
    assert.equal(rows.find((r) => r.id === "r1")?.subscription_suspended_at, null);
    assert.equal(rows.find((r) => r.id === "r2")?.subscription_suspended_at, null);
  });

  it("confirmed_paid with nothing suspended → noop_unpaid outcome, no writes", async () => {
    const rows = [release({ id: "r1", subscription_suspended_at: null })];
    const { deps } = baseDeps(rows, { accessCategoryOverride: "confirmed_paid" });

    const result = await reconcileArtistFutureReleaseSuspensions(ARTIST_ID, deps);

    assert.equal(result.outcome, "noop_unpaid");
    assert.equal(result.restoredCount, 0);
  });

  it("confirmed_unpaid suspends the newest eligible future beyond the free limit", async () => {
    const rows = [
      release({ id: "r1", release_date: "2026-08-10T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }),
      release({ id: "r2", release_date: "2026-08-15T00:00:00.000Z", created_at: "2026-01-02T00:00:00.000Z" }),
      release({ id: "r3", release_date: "2026-08-20T00:00:00.000Z", created_at: "2026-01-03T00:00:00.000Z" }),
    ];
    const { deps } = baseDeps(rows, { accessCategoryOverride: "confirmed_unpaid" });

    const result = await reconcileArtistFutureReleaseSuspensions(ARTIST_ID, deps);

    assert.equal(result.outcome, "reconciled_unpaid");
    assert.equal(result.accessCategory, "confirmed_unpaid");
    assert.equal(result.suspendedCount, 1);
    assert.equal(result.promotedCount, 0);
    // Free limit keeps the two soonest dated releases active; the latest is suspended.
    assert.equal(rows.find((r) => r.id === "r1")?.subscription_suspended_at, null);
    assert.equal(rows.find((r) => r.id === "r2")?.subscription_suspended_at, null);
    assert.ok(rows.find((r) => r.id === "r3")?.subscription_suspended_at);
  });

  it("confirmed_unpaid within limit → noop_unpaid, no suspensions", async () => {
    const rows = [
      release({ id: "r1", release_date: "2026-08-10T00:00:00.000Z" }),
      release({ id: "r2", release_date: "2026-08-15T00:00:00.000Z" }),
    ];
    const { deps } = baseDeps(rows, { accessCategoryOverride: "confirmed_unpaid" });

    const result = await reconcileArtistFutureReleaseSuspensions(ARTIST_ID, deps);

    assert.equal(result.outcome, "noop_unpaid");
    assert.equal(result.suspendedCount, 0);
    assert.equal(result.promotedCount, 0);
  });

  it("missing artistId fails closed without accessing the pool", async () => {
    let connectCalled = false;
    const pool = {
      connect: async () => {
        connectCalled = true;
        throw new Error("should not connect");
      },
    } as unknown as Pool;

    const result = await reconcileArtistFutureReleaseSuspensions("", {
      pool,
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
    });

    assert.equal(result.outcome, "failed");
    assert.equal(connectCalled, false);
  });
});
