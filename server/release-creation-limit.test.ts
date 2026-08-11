import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { subMonths } from "date-fns";
import type { Pool, PoolClient, QueryResult } from "pg";
import { createReleaseWithLimit } from "./create-release-with-limit";
import {
  FREE_RELEASE_LIMIT,
  FREE_RELEASE_LIMIT_CODE,
  FreeReleaseLimitReachedError,
  evaluateFreeReleaseSlot,
  getReleaseLimitRollingWindow,
  isFreeReleaseLimitReachedError,
  isReleaseLimitEnforcementEnabled,
} from "./release-creation-limit";

const ARTIST_A = "00000000-0000-4000-8000-0000000000a1";
const ARTIST_B = "00000000-0000-4000-8000-0000000000b2";
const NOW = new Date("2026-08-01T12:00:00.000Z");

type LedgerRow = { artistId: string; releaseId: string; createdAt: Date };
type ReleaseRow = {
  id: string;
  artist_id: string;
  title: string;
  release_date: Date | null;
  artwork_url: string | null;
  notified_at: null;
  created_at: Date;
  updated_at: Date;
  is_public: boolean;
  is_coming_soon: boolean;
  release_timing_mode: string;
  release_at: Date | null;
  release_timezone: string | null;
  release_announced_at: null;
};

class FakeDb {
  releases: ReleaseRow[] = [];
  ledger: LedgerRow[] = [];
  failNextReleaseInsert = false;
  failNextLedgerInsert = false;
  private locks = new Map<string, Promise<void>>();

  connect(): Promise<PoolClient> {
    let inTx = false;
    let heldArtistId: string | null = null;
    let unlock: (() => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;

    const client = {
      async query(text: string, params?: unknown[]): Promise<QueryResult> {
        const sql = text.replace(/\s+/g, " ").trim();

        if (sql === "BEGIN") {
          inTx = true;
          return { rows: [], rowCount: 0, command: "BEGIN", oid: 0, fields: [] };
        }
        if (sql === "COMMIT") {
          inTx = false;
          if (unlock) {
            unlock();
            unlock = null;
            heldArtistId = null;
          }
          return { rows: [], rowCount: 0, command: "COMMIT", oid: 0, fields: [] };
        }
        if (sql === "ROLLBACK") {
          inTx = false;
          if (unlock) {
            unlock();
            unlock = null;
            heldArtistId = null;
          }
          return { rows: [], rowCount: 0, command: "ROLLBACK", oid: 0, fields: [] };
        }

        if (sql.includes("pg_advisory_xact_lock")) {
          const artistId = String(params?.[0]);
          heldArtistId = artistId;
          const prev = db.locks.get(artistId) ?? Promise.resolve();
          let releaseLock!: () => void;
          const gate = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          db.locks.set(
            artistId,
            prev.then(() => gate),
          );
          await prev;
          unlock = releaseLock;
          return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
        }

        if (sql.includes("FROM artist_release_creation_ledger") && sql.includes("COUNT")) {
          const artistId = String(params?.[0]);
          const start = params?.[1] as Date;
          const end = params?.[2] as Date;
          const c = db.ledger.filter(
            (r) =>
              r.artistId === artistId &&
              r.createdAt.getTime() >= start.getTime() &&
              r.createdAt.getTime() <= end.getTime(),
          ).length;
          return { rows: [{ c }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
        }

        if (sql.startsWith("INSERT INTO releases")) {
          if (!inTx) throw new Error("INSERT releases outside transaction");
          if (db.failNextReleaseInsert) {
            db.failNextReleaseInsert = false;
            throw new Error("simulated release insert failure");
          }
          const id = randomUUID();
          const row: ReleaseRow = {
            id,
            artist_id: String(params?.[0]),
            title: String(params?.[1]),
            release_date: (params?.[2] as Date | null) ?? null,
            artwork_url: (params?.[3] as string | null) ?? null,
            notified_at: null,
            is_public: true,
            is_coming_soon: Boolean(params?.[4]),
            release_timing_mode: String(params?.[5] ?? "midnight"),
            release_at: (params?.[6] as Date | null) ?? null,
            release_timezone: (params?.[7] as string | null) ?? null,
            release_announced_at: (params?.[8] as Date | null) ?? null,
            created_at: params?.[9] as Date,
            updated_at: params?.[9] as Date,
          };
          db.releases.push(row);
          return { rows: [row], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
        }

        if (sql.startsWith("INSERT INTO artist_release_creation_ledger")) {
          if (!inTx) throw new Error("INSERT ledger outside transaction");
          if (db.failNextLedgerInsert) {
            // Simulate atomicity: remove the release that was inserted in this tx.
            const releaseId = String(params?.[1]);
            db.releases = db.releases.filter((r) => r.id !== releaseId);
            db.failNextLedgerInsert = false;
            throw new Error("simulated ledger insert failure");
          }
          const releaseId = String(params?.[1]);
          if (db.ledger.some((r) => r.releaseId === releaseId)) {
            throw new Error("unique_violation release_id");
          }
          db.ledger.push({
            artistId: String(params?.[0]),
            releaseId,
            createdAt: params?.[2] as Date,
          });
          return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
        }

        if (sql.startsWith("DELETE FROM releases")) {
          const releaseId = String(params?.[0]);
          db.releases = db.releases.filter((r) => r.id !== releaseId);
          return { rows: [], rowCount: 1, command: "DELETE", oid: 0, fields: [] };
        }

        throw new Error(`Unhandled fake SQL: ${sql}`);
      },
      release() {
        if (unlock) {
          unlock();
          unlock = null;
          heldArtistId = null;
        }
      },
    } as unknown as PoolClient;

    void heldArtistId;
    return Promise.resolve(client);
  }

  asPool(): Pool {
    return {
      connect: () => this.connect(),
    } as unknown as Pool;
  }
}

describe("release-creation-limit flag and window", () => {
  it("enables only for exact string true", () => {
    assert.equal(
      isReleaseLimitEnforcementEnabled({
        ARTIST_SUBSCRIPTION_RELEASE_LIMIT_ENFORCEMENT: "true",
      } as NodeJS.ProcessEnv),
      true,
    );
    assert.equal(
      isReleaseLimitEnforcementEnabled({
        ARTIST_SUBSCRIPTION_RELEASE_LIMIT_ENFORCEMENT: "TRUE",
      } as NodeJS.ProcessEnv),
      false,
    );
    assert.equal(
      isReleaseLimitEnforcementEnabled({
        ARTIST_SUBSCRIPTION_RELEASE_LIMIT_ENFORCEMENT: "1",
      } as NodeJS.ProcessEnv),
      false,
    );
    assert.equal(
      isReleaseLimitEnforcementEnabled({} as NodeJS.ProcessEnv),
      false,
    );
  });

  it("rolling window is now minus 12 calendar months through now", () => {
    const window = getReleaseLimitRollingWindow(NOW);
    assert.equal(window.end.toISOString(), NOW.toISOString());
    assert.equal(window.start.toISOString(), subMonths(NOW, 12).toISOString());
  });

  it("free slot evaluation", () => {
    assert.deepEqual(evaluateFreeReleaseSlot(0), { allowed: true, used: 0 });
    assert.deepEqual(evaluateFreeReleaseSlot(1), { allowed: true, used: 1 });
    assert.deepEqual(evaluateFreeReleaseSlot(2), { allowed: false, used: 2 });
    assert.deepEqual(evaluateFreeReleaseSlot(5), { allowed: false, used: 5 });
  });

  it("error contract shape", () => {
    const err = new FreeReleaseLimitReachedError(3);
    assert.equal(err.statusCode, 403);
    assert.deepEqual(err.toJSON(), {
      message: "You've used your 2 free releases in the last 12 months.",
      code: FREE_RELEASE_LIMIT_CODE,
      limit: FREE_RELEASE_LIMIT,
      used: 3,
    });
    assert.equal(isFreeReleaseLimitReachedError(err), true);
    assert.equal(isFreeReleaseLimitReachedError(new Error("x")), false);
    const json = err.toJSON() as Record<string, unknown>;
    assert.equal("entitlementIdentifier" in json, false);
    assert.equal("expiresAt" in json, false);
    assert.equal("productIdentifier" in json, false);
  });
});

describe("createReleaseWithLimit ledger + free/paid policy", () => {
  it("successful create writes release + matching ledger row with shared timestamp", async () => {
    const db = new FakeDb();
    const created = await createReleaseWithLimit(
      {
        artistId: ARTIST_A,
        title: "First",
        releaseDate: new Date("2026-09-01T00:00:00.000Z"),
        artworkUrl: null,
        isComingSoon: false,
      },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
        now: () => NOW,
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      },
    );
    assert.equal(db.releases.length, 1);
    assert.equal(db.ledger.length, 1);
    assert.equal(db.ledger[0].releaseId, created.id);
    assert.equal(db.ledger[0].createdAt.toISOString(), NOW.toISOString());
    assert.equal(created.createdAt?.toString(), NOW.toString());
    assert.equal(
      created.releaseAnnouncedAt?.toString(),
      NOW.toString(),
      "dated create sets release_announced_at",
    );
  });

  it("Coming Soon create leaves release_announced_at null", async () => {
    const db = new FakeDb();
    const created = await createReleaseWithLimit(
      {
        artistId: ARTIST_A,
        title: "Soon",
        releaseDate: null,
        isComingSoon: true,
      },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
        now: () => NOW,
        enforcementEnabled: true,
        paidToolAccessOverride: true,
      },
    );
    assert.equal(created.releaseAnnouncedAt, null);
    assert.equal(db.releases[0].release_announced_at, null);
  });

  it("release insert failure creates no ledger row", async () => {
    const db = new FakeDb();
    db.failNextReleaseInsert = true;
    await assert.rejects(
      () =>
        createReleaseWithLimit(
          {
            artistId: ARTIST_A,
            title: "Fail",
            releaseDate: null,
            isComingSoon: true,
          },
          {
            pool: db.asPool(),
            getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
            now: () => NOW,
            enforcementEnabled: true,
            paidToolAccessOverride: false,
          },
        ),
      /simulated release insert failure/,
    );
    assert.equal(db.releases.length, 0);
    assert.equal(db.ledger.length, 0);
  });

  it("ledger insert failure rolls back release row", async () => {
    const db = new FakeDb();
    db.failNextLedgerInsert = true;
    await assert.rejects(
      () =>
        createReleaseWithLimit(
          {
            artistId: ARTIST_A,
            title: "Fail ledger",
            releaseDate: null,
            isComingSoon: true,
          },
          {
            pool: db.asPool(),
            getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
            now: () => NOW,
            enforcementEnabled: true,
            paidToolAccessOverride: false,
          },
        ),
      /simulated ledger insert failure/,
    );
    assert.equal(db.releases.length, 0);
    assert.equal(db.ledger.length, 0);
  });

  it("hard-delete release leaves ledger row intact", async () => {
    const db = new FakeDb();
    const created = await createReleaseWithLimit(
      {
        artistId: ARTIST_A,
        title: "Keep ledger",
        releaseDate: null,
        isComingSoon: true,
      },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
        now: () => NOW,
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      },
    );
    const client = await db.connect();
    await client.query("DELETE FROM releases WHERE id = $1", [created.id]);
    client.release();
    assert.equal(db.releases.length, 0);
    assert.equal(db.ledger.length, 1);
    assert.equal(db.ledger[0].releaseId, created.id);
  });

  it("free artist 0 and 1 allowed; 2 and 3+ blocked with used count", async () => {
    const db = new FakeDb();
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    } as const;

    await createReleaseWithLimit(
      { artistId: ARTIST_A, title: "R1", releaseDate: null, isComingSoon: true },
      deps,
    );
    await createReleaseWithLimit(
      { artistId: ARTIST_A, title: "R2", releaseDate: null, isComingSoon: true },
      deps,
    );
    await assert.rejects(
      () =>
        createReleaseWithLimit(
          { artistId: ARTIST_A, title: "R3", releaseDate: null, isComingSoon: true },
          deps,
        ),
      (err: unknown) => {
        assert.equal(isFreeReleaseLimitReachedError(err), true);
        if (isFreeReleaseLimitReachedError(err)) {
          assert.equal(err.used, 2);
          assert.equal(err.limit, 2);
          assert.equal(err.code, FREE_RELEASE_LIMIT_CODE);
        }
        return true;
      },
    );
    assert.equal(db.releases.length, 2);
    assert.equal(db.ledger.length, 2);

    db.ledger.push({
      artistId: ARTIST_A,
      releaseId: randomUUID(),
      createdAt: NOW,
    });
    await assert.rejects(
      () =>
        createReleaseWithLimit(
          { artistId: ARTIST_A, title: "R4", releaseDate: null, isComingSoon: true },
          deps,
        ),
      (err: unknown) => {
        assert.equal(isFreeReleaseLimitReachedError(err), true);
        if (isFreeReleaseLimitReachedError(err)) assert.equal(err.used, 3);
        return true;
      },
    );
  });

  it("row exactly outside 12-month boundary is not counted; boundary inclusive", async () => {
    const db = new FakeDb();
    const window = getReleaseLimitRollingWindow(NOW);
    db.ledger.push({
      artistId: ARTIST_A,
      releaseId: randomUUID(),
      createdAt: new Date(window.start.getTime() - 1),
    });
    db.ledger.push({
      artistId: ARTIST_A,
      releaseId: randomUUID(),
      createdAt: window.start,
    });

    await createReleaseWithLimit(
      { artistId: ARTIST_A, title: "Boundary", releaseDate: null, isComingSoon: true },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
        now: () => NOW,
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      },
    );
    // outside ignored + boundary counted → 1 before create → allow → 2 ledger after
    assert.equal(db.releases.length, 1);
    assert.equal(
      db.ledger.filter((r) => r.artistId === ARTIST_A).length,
      3,
    );

    await assert.rejects(
      () =>
        createReleaseWithLimit(
          { artistId: ARTIST_A, title: "Blocked", releaseDate: null, isComingSoon: true },
          {
            pool: db.asPool(),
            getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
            now: () => NOW,
            enforcementEnabled: true,
            paidToolAccessOverride: false,
          },
        ),
      isFreeReleaseLimitReachedError,
    );
  });

  it("future release_date does not affect counting; non-public status irrelevant", async () => {
    const db = new FakeDb();
    await createReleaseWithLimit(
      {
        artistId: ARTIST_A,
        title: "Future dated",
        releaseDate: new Date("2027-01-01T00:00:00.000Z"),
        isComingSoon: false,
      },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
        now: () => NOW,
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      },
    );
    assert.equal(db.ledger.length, 1);
    assert.equal(db.ledger[0].createdAt.toISOString(), NOW.toISOString());
  });

  it("previously paid-created and deleted-release ledger rows still count when free", async () => {
    const db = new FakeDb();
    db.ledger.push(
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
    );
    // No corresponding releases rows (deleted) — still blocked.
    await assert.rejects(
      () =>
        createReleaseWithLimit(
          { artistId: ARTIST_A, title: "After delete", releaseDate: null, isComingSoon: true },
          {
            pool: db.asPool(),
            getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
            now: () => NOW,
            enforcementEnabled: true,
            paidToolAccessOverride: false,
          },
        ),
      isFreeReleaseLimitReachedError,
    );
  });

  it("paid override allows unlimited creates beyond 2", async () => {
    const db = new FakeDb();
    db.ledger.push(
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
    );
    for (let i = 0; i < 2; i++) {
      await createReleaseWithLimit(
        { artistId: ARTIST_A, title: `Paid ${i}`, releaseDate: null, isComingSoon: true },
        {
          pool: db.asPool(),
          getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
          now: () => NOW,
          enforcementEnabled: true,
          paidToolAccessOverride: true,
        },
      );
    }
    assert.equal(db.releases.length, 2);
    assert.equal(db.ledger.length, 4);
  });

  it("policy lookup failure falls back to free rules, not unlimited", async () => {
    const db = new FakeDb();
    db.ledger.push(
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
    );
    await assert.rejects(
      () =>
        createReleaseWithLimit(
          { artistId: ARTIST_A, title: "Lookup fail", releaseDate: null, isComingSoon: true },
          {
            pool: db.asPool(),
            getSnapshotsForUser: async () => {
              throw new Error("DB_DOWN");
            },
            now: () => NOW,
            enforcementEnabled: true,
          },
        ),
      isFreeReleaseLimitReachedError,
    );
    assert.equal(db.releases.length, 0);
  });

  it("owner ledger only; collaborator artist rows do not count against collaborator", async () => {
    const db = new FakeDb();
    db.ledger.push(
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
    );
    // Collaborator B has no own ledger rows — can still create.
    await createReleaseWithLimit(
      { artistId: ARTIST_B, title: "Collab own", releaseDate: null, isComingSoon: true },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
        now: () => NOW,
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      },
    );
    assert.equal(db.ledger.filter((r) => r.artistId === ARTIST_B).length, 1);
  });

  it("collaborator entitlement cannot bypass owner capacity when creating as owner (unpaid)", async () => {
    const db = new FakeDb();
    db.ledger.push(
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
    );
    await assert.rejects(
      () =>
        createReleaseWithLimit(
          { artistId: ARTIST_A, title: "Owner still free-limited", releaseDate: null, isComingSoon: true },
          {
            pool: db.asPool(),
            getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
            now: () => NOW,
            enforcementEnabled: true,
            paidToolAccessOverride: false,
          },
        ),
      isFreeReleaseLimitReachedError,
    );
  });

  it("enforcement false allows beyond 2 but still writes ledger", async () => {
    const db = new FakeDb();
    db.ledger.push(
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
      { artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW },
    );
    await createReleaseWithLimit(
      { artistId: ARTIST_A, title: "Bypass", releaseDate: null, isComingSoon: true },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
        now: () => NOW,
        enforcementEnabled: false,
        paidToolAccessOverride: false,
      },
    );
    assert.equal(db.releases.length, 1);
    assert.equal(db.ledger.length, 3);
  });

  it("two concurrent free creates with one slot: exactly one succeeds", async () => {
    const db = new FakeDb();
    db.ledger.push({ artistId: ARTIST_A, releaseId: randomUUID(), createdAt: NOW });
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    } as const;

    const results = await Promise.allSettled([
      createReleaseWithLimit(
        { artistId: ARTIST_A, title: "C1", releaseDate: null, isComingSoon: true },
        deps,
      ),
      createReleaseWithLimit(
        { artistId: ARTIST_A, title: "C2", releaseDate: null, isComingSoon: true },
        deps,
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(isFreeReleaseLimitReachedError((rejected[0] as PromiseRejectedResult).reason), true);
    assert.equal(db.releases.length, 1);
    assert.equal(db.ledger.filter((r) => r.artistId === ARTIST_A).length, 2);
  });

  it("two concurrent paid creates both succeed", async () => {
    const db = new FakeDb();
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      paidToolAccessOverride: true,
    } as const;

    const results = await Promise.all([
      createReleaseWithLimit(
        { artistId: ARTIST_A, title: "P1", releaseDate: null, isComingSoon: true },
        deps,
      ),
      createReleaseWithLimit(
        { artistId: ARTIST_A, title: "P2", releaseDate: null, isComingSoon: true },
        deps,
      ),
    ]);
    assert.equal(results.length, 2);
    assert.equal(db.releases.length, 2);
    assert.equal(db.ledger.length, 2);
  });
});
