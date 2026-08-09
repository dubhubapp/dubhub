import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool, PoolClient, QueryResult } from "pg";
import {
  FREE_LINK_LIMIT_CODE,
  FREE_RELEASE_LINK_LIMIT,
  INVALID_RELEASE_LINK_TYPE_CODE,
  INVALID_RELEASE_LINK_TYPE_MESSAGE,
  PAID_LINK_TYPE_REQUIRED_CODE,
  assertReleaseLinkTypeCompatible,
  decideFreeLinkUpsert,
  decideFreePrimaryReplace,
  isAcceptedReleaseLinkPlatform,
  isApprovedReleaseLinkPlatform,
  isFreePrimaryReleaseLink,
  isLinkLimitEnforcementEnabled,
  isPaidOnlyReleaseLink,
  FreeLinkLimitReachedError,
  InvalidReleaseLinkTypeError,
  PaidLinkTypeRequiredError,
} from "./release-link-limit";
import {
  replaceReleasePrimaryLink,
  upsertReleaseLinkWithLimit,
} from "./upsert-release-link-with-limit";

const OWNER = "00000000-0000-4000-8000-0000000000d1";
const RELEASE = "00000000-0000-4000-8000-0000000000e1";

type LinkRow = {
  id: string;
  release_id: string;
  platform: string;
  url: string;
  link_type: string | null;
  created_at: Date;
};

class FakeLinkDb {
  links = new Map<string, LinkRow>(); // platform -> row
  locks = new Map<string, Promise<void>>();
  failNextInsert = false;
  private snapshot: Map<string, LinkRow> | null = null;

  seed(platform: string, url: string, linkType: string | null = null) {
    this.links.set(platform, {
      id: `id-${platform}`,
      release_id: RELEASE,
      platform,
      url,
      link_type: linkType,
      created_at: new Date(),
    });
  }

  private cloneLinks(): Map<string, LinkRow> {
    return new Map(
      [...this.links.entries()].map(([k, v]) => [k, { ...v }]),
    );
  }

  asPool(): Pool {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;
    return {
      connect: async () => {
        let unlock: (() => void) | null = null;
        const client = {
          async query(text: string, params?: unknown[]): Promise<QueryResult> {
            const sql = text.replace(/\s+/g, " ").trim();
            if (sql === "BEGIN") {
              db.snapshot = db.cloneLinks();
              return { rows: [], rowCount: 0, command: "BEGIN", oid: 0, fields: [] };
            }
            if (sql === "COMMIT") {
              db.snapshot = null;
              if (unlock) {
                unlock();
                unlock = null;
              }
              return { rows: [], rowCount: 0, command: "COMMIT", oid: 0, fields: [] };
            }
            if (sql === "ROLLBACK") {
              if (db.snapshot) {
                db.links = db.snapshot;
                db.snapshot = null;
              }
              if (unlock) {
                unlock();
                unlock = null;
              }
              return { rows: [], rowCount: 0, command: "ROLLBACK", oid: 0, fields: [] };
            }
            if (sql.includes("pg_advisory_xact_lock")) {
              const key = String(params?.[0]);
              const prev = db.locks.get(key) ?? Promise.resolve();
              let releaseLock!: () => void;
              const gate = new Promise<void>((resolve) => {
                releaseLock = resolve;
              });
              db.locks.set(key, prev.then(() => gate));
              await prev;
              unlock = releaseLock;
              return { rows: [{}], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
            }
            if (sql.includes("FROM releases") && sql.includes("artist_id")) {
              return {
                rows: [{ artist_id: OWNER }],
                rowCount: 1,
                command: "SELECT",
                oid: 0,
                fields: [],
              };
            }
            if (sql.includes("COUNT(*)") && sql.includes("release_links")) {
              return {
                rows: [{ c: db.links.size }],
                rowCount: 1,
                command: "SELECT",
                oid: 0,
                fields: [],
              };
            }
            if (
              sql.includes("FROM release_links") &&
              sql.includes("platform = $2") &&
              sql.includes("LIMIT 1")
            ) {
              const platform = String(params?.[1]);
              const row = db.links.get(platform);
              return {
                rows: row ? [row] : [],
                rowCount: row ? 1 : 0,
                command: "SELECT",
                oid: 0,
                fields: [],
              };
            }
            if (sql.startsWith("UPDATE release_links")) {
              const url = String(params?.[0]);
              const linkType = (params?.[1] as string | null) ?? null;
              const platform = String(params?.[3]);
              const row = db.links.get(platform);
              if (row) {
                row.url = url;
                row.link_type = linkType;
              }
              return { rows: [], rowCount: 1, command: "UPDATE", oid: 0, fields: [] };
            }
            if (sql.startsWith("INSERT INTO release_links")) {
              if (db.failNextInsert) {
                db.failNextInsert = false;
                throw new Error("insert failed");
              }
              const platform = String(params?.[1]);
              const url = String(params?.[2]);
              const linkType = (params?.[3] as string | null) ?? null;
              db.links.set(platform, {
                id: `id-${platform}`,
                release_id: RELEASE,
                platform,
                url,
                link_type: linkType,
                created_at: new Date(),
              });
              return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
            }
            if (sql.startsWith("DELETE FROM release_links")) {
              const platform = String(params?.[1]);
              db.links.delete(platform);
              return { rows: [], rowCount: 1, command: "DELETE", oid: 0, fields: [] };
            }
            if (sql.includes("FROM release_links") && sql.includes("ORDER BY platform")) {
              const rows = [...db.links.values()].sort((a, b) =>
                a.platform.localeCompare(b.platform),
              );
              return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
          release() {},
        };
        return client as unknown as PoolClient;
      },
      query: async () => {
        throw new Error("pool.query not used");
      },
    } as unknown as Pool;
  }
}

describe("assertReleaseLinkTypeCompatible", () => {
  it("rejects unsupported platform/type combinations", () => {
    assert.throws(
      () =>
        assertReleaseLinkTypeCompatible({
          platform: "spotify",
          linkType: "download",
        }),
      (e: unknown) =>
        e instanceof InvalidReleaseLinkTypeError &&
        e.statusCode === 400 &&
        e.code === INVALID_RELEASE_LINK_TYPE_CODE,
    );
    assert.throws(
      () =>
        assertReleaseLinkTypeCompatible({
          platform: "free_download",
          linkType: "listen",
        }),
      (e: unknown) => e instanceof InvalidReleaseLinkTypeError,
    );
    assert.throws(
      () =>
        assertReleaseLinkTypeCompatible({
          platform: "dub_pack",
          linkType: "presave",
        }),
      (e: unknown) => e instanceof InvalidReleaseLinkTypeError,
    );
  });

  it("accepts supported combinations including null legacy live", () => {
    assert.doesNotThrow(() =>
      assertReleaseLinkTypeCompatible({ platform: "beatport", linkType: "listen" }),
    );
    assert.doesNotThrow(() =>
      assertReleaseLinkTypeCompatible({ platform: "beatport", linkType: "presave" }),
    );
    assert.doesNotThrow(() =>
      assertReleaseLinkTypeCompatible({ platform: "spotify", linkType: null }),
    );
    assert.doesNotThrow(() =>
      assertReleaseLinkTypeCompatible({
        platform: "free_download",
        linkType: "download",
      }),
    );
    assert.doesNotThrow(() =>
      assertReleaseLinkTypeCompatible({
        platform: "dub_pack",
        linkType: "download",
      }),
    );
    assert.doesNotThrow(() =>
      assertReleaseLinkTypeCompatible({ platform: "other", linkType: "listen" }),
    );
  });

  it("preserves historical unsupported rows on URL-only same-purpose edit", () => {
    assert.doesNotThrow(() =>
      assertReleaseLinkTypeCompatible({
        platform: "spotify",
        linkType: "download",
        existingRow: { platform: "spotify", linkType: "download" },
      }),
    );
  });

  it("does not allow changing into a new unsupported combination", () => {
    assert.throws(
      () =>
        assertReleaseLinkTypeCompatible({
          platform: "spotify",
          linkType: "download",
          existingRow: { platform: "spotify", linkType: "listen" },
        }),
      (e: unknown) => e instanceof InvalidReleaseLinkTypeError,
    );
  });

  it("error JSON has stable message and no subscription internals", () => {
    const err = new InvalidReleaseLinkTypeError();
    assert.deepEqual(err.toJSON(), {
      message: INVALID_RELEASE_LINK_TYPE_MESSAGE,
      code: INVALID_RELEASE_LINK_TYPE_CODE,
    });
    assert.equal(err.message.toLowerCase().includes("subscription"), false);
    assert.equal(err.message.toLowerCase().includes("revenuecat"), false);
  });
});

describe("release-link-limit classification", () => {
  it("rejects new Juno writes via selectable allowlist", () => {
    assert.equal(isApprovedReleaseLinkPlatform("juno"), false);
    assert.equal(isAcceptedReleaseLinkPlatform("juno"), true);
  });

  it("classifies free primary listen links", () => {
    assert.equal(isFreePrimaryReleaseLink("spotify", null), true);
    assert.equal(isFreePrimaryReleaseLink("spotify", "listen"), true);
    assert.equal(isFreePrimaryReleaseLink("apple_music", ""), true);
    assert.equal(isFreePrimaryReleaseLink("soundcloud", null), true);
  });

  it("classifies paid-only as pre-release only (not platform)", () => {
    assert.equal(isPaidOnlyReleaseLink("spotify", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("apple_music", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("beatport", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("other", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("spotify", "download"), false);
    assert.equal(isPaidOnlyReleaseLink("free_download", null), false);
    assert.equal(isPaidOnlyReleaseLink("free_download", "download"), false);
    assert.equal(isPaidOnlyReleaseLink("dub_pack", null), false);
    assert.equal(isPaidOnlyReleaseLink("dub_pack", "download"), false);
    assert.equal(isPaidOnlyReleaseLink("other", "listen"), false);
    assert.equal(isFreePrimaryReleaseLink("free_download", null), true);
    assert.equal(isFreePrimaryReleaseLink("free_download", "download"), true);
    assert.equal(isFreePrimaryReleaseLink("dub_pack", "download"), true);
    assert.equal(isFreePrimaryReleaseLink("other", "listen"), true);
    assert.equal(isFreePrimaryReleaseLink("beatport", "listen"), true);
    assert.equal(isFreePrimaryReleaseLink("spotify", "presave"), false);
    assert.equal(isFreePrimaryReleaseLink("other", "presave"), false);
  });
});

describe("isLinkLimitEnforcementEnabled", () => {
  it("requires exact true", () => {
    assert.equal(isLinkLimitEnforcementEnabled({ ARTIST_SUBSCRIPTION_LINK_LIMIT_ENFORCEMENT: "true" } as NodeJS.ProcessEnv), true);
    assert.equal(isLinkLimitEnforcementEnabled({ ARTIST_SUBSCRIPTION_LINK_LIMIT_ENFORCEMENT: "1" } as NodeJS.ProcessEnv), false);
    assert.equal(isLinkLimitEnforcementEnabled({} as NodeJS.ProcessEnv), false);
  });
});

describe("decideFreeLinkUpsert", () => {
  it("allows first free primary insert", () => {
    assert.deepEqual(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "spotify", linkType: null },
      }),
      { outcome: "allow" },
    );
  });

  it("blocks second insert at limit", () => {
    assert.deepEqual(
      decideFreeLinkUpsert({
        used: 1,
        existingRow: null,
        proposed: { platform: "apple_music", linkType: "listen" },
      }),
      { outcome: "block_limit", used: 1 },
    );
  });

  it("allows free Download / Dub Pack / Other as the one primary link", () => {
    assert.equal(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "free_download", linkType: "download" },
      }).outcome,
      "allow",
    );
    assert.equal(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "dub_pack", linkType: "download" },
      }).outcome,
      "allow",
    );
    assert.equal(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "other", linkType: null },
      }).outcome,
      "allow",
    );
  });

  it("blocks free pre-release (presave) inserts on any platform", () => {
    assert.equal(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "spotify", linkType: "presave" },
      }).outcome,
      "block_paid_type",
    );
    assert.equal(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "apple_music", linkType: "presave" },
      }).outcome,
      "block_paid_type",
    );
    assert.equal(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "beatport", linkType: "presave" },
      }).outcome,
      "block_paid_type",
    );
    assert.equal(
      decideFreeLinkUpsert({
        used: 0,
        existingRow: null,
        proposed: { platform: "other", linkType: "presave" },
      }).outcome,
      "block_paid_type",
    );
  });

  it("allows URL edit without counting as insert", () => {
    assert.deepEqual(
      decideFreeLinkUpsert({
        used: 1,
        existingRow: { platform: "spotify", linkType: null },
        proposed: { platform: "spotify", linkType: null },
      }),
      { outcome: "allow" },
    );
  });

  it("allows paid-era paid-only URL correction after downgrade", () => {
    assert.deepEqual(
      decideFreeLinkUpsert({
        used: 5,
        existingRow: { platform: "free_download", linkType: "download" },
        proposed: { platform: "free_download", linkType: "download" },
      }),
      { outcome: "allow" },
    );
  });

  it("blocks converting free listen into paid type", () => {
    assert.equal(
      decideFreeLinkUpsert({
        used: 1,
        existingRow: { platform: "spotify", linkType: "listen" },
        proposed: { platform: "spotify", linkType: "presave" },
      }).outcome,
      "block_paid_type",
    );
  });

  it("blocks insert when over-limit", () => {
    assert.deepEqual(
      decideFreeLinkUpsert({
        used: 5,
        existingRow: null,
        proposed: { platform: "bandcamp", linkType: null },
      }),
      { outcome: "block_limit", used: 5 },
    );
  });
});

describe("decideFreePrimaryReplace", () => {
  it("allows replace at exactly one", () => {
    assert.deepEqual(
      decideFreePrimaryReplace({
        used: 1,
        fromExists: true,
        proposed: { platform: "apple_music", linkType: null },
        targetPlatformAlreadyExists: false,
      }),
      { outcome: "allow" },
    );
  });

  it("blocks replace when over-limit", () => {
    assert.equal(
      decideFreePrimaryReplace({
        used: 5,
        fromExists: true,
        proposed: { platform: "apple_music", linkType: null },
        targetPlatformAlreadyExists: false,
      }).outcome,
      "block_limit",
    );
  });
});

describe("error contracts", () => {
  it("formats FREE_LINK_LIMIT_REACHED", () => {
    const err = new FreeLinkLimitReachedError(5);
    assert.deepEqual(err.toJSON(), {
      message: "Free artists can add 1 primary link per release.",
      code: FREE_LINK_LIMIT_CODE,
      limit: FREE_RELEASE_LINK_LIMIT,
      used: 5,
    });
    assert.equal(err.statusCode, 403);
  });

  it("formats PAID_LINK_TYPE_REQUIRED without download/dub-pack wording", () => {
    const err = new PaidLinkTypeRequiredError();
    assert.deepEqual(err.toJSON(), {
      message: "Upgrade to add pre-save, pre-add and pre-order links.",
      code: PAID_LINK_TYPE_REQUIRED_CODE,
    });
    assert.equal(err.message.toLowerCase().includes("download"), false);
    assert.equal(err.message.toLowerCase().includes("dub"), false);
  });
});

describe("upsertReleaseLinkWithLimit", () => {
  it("rejects Spotify + download for paid and free alike", async () => {
    const db = new FakeLinkDb();
    for (const paid of [true, false]) {
      await assert.rejects(
        () =>
          upsertReleaseLinkWithLimit(
            RELEASE,
            { platform: "spotify", url: "https://s/dl", linkType: "download" },
            {
              pool: db.asPool(),
              getSnapshotsForUser: async () => ({}),
              enforcementEnabled: true,
              paidToolAccessOverride: paid,
            },
          ),
        (e: unknown) => e instanceof InvalidReleaseLinkTypeError,
      );
    }
    assert.equal(db.links.size, 0);
  });

  it("Beatport + presave: free gets paid-type; paid succeeds", async () => {
    const freeDb = new FakeLinkDb();
    await assert.rejects(
      () =>
        upsertReleaseLinkWithLimit(
          RELEASE,
          { platform: "beatport", url: "https://bp/1", linkType: "presave" },
          {
            pool: freeDb.asPool(),
            getSnapshotsForUser: async () => ({}),
            enforcementEnabled: true,
            paidToolAccessOverride: false,
          },
        ),
      (e: unknown) => e instanceof PaidLinkTypeRequiredError,
    );

    const paidDb = new FakeLinkDb();
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "beatport", url: "https://bp/1", linkType: "presave" },
      {
        pool: paidDb.asPool(),
        getSnapshotsForUser: async () => ({}),
        enforcementEnabled: true,
        paidToolAccessOverride: true,
      },
    );
    assert.equal(paidDb.links.size, 1);
  });

  it("Other + presave requires paid; Other + listen free ok", async () => {
    const freeDb = new FakeLinkDb();
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "other", url: "https://o/1", linkType: "listen" },
      {
        pool: freeDb.asPool(),
        getSnapshotsForUser: async () => ({}),
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      },
    );
    assert.equal(freeDb.links.size, 1);

    await assert.rejects(
      () =>
        upsertReleaseLinkWithLimit(
          RELEASE,
          { platform: "other", url: "https://o/2", linkType: "presave" },
          {
            pool: new FakeLinkDb().asPool(),
            getSnapshotsForUser: async () => ({}),
            enforcementEnabled: true,
            paidToolAccessOverride: false,
          },
        ),
      (e: unknown) => e instanceof PaidLinkTypeRequiredError,
    );
  });

  it("URL-only edit preserves historical unsupported Spotify + download", async () => {
    const db = new FakeLinkDb();
    db.seed("spotify", "https://s/old", "download");
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "spotify", url: "https://s/new", linkType: "download" },
      {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({}),
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      },
    );
    assert.equal(db.links.size, 1);
    assert.equal(db.links.get("spotify")?.url, "https://s/new");
    assert.equal(db.links.get("spotify")?.link_type, "download");
  });

  it("free zero links → one listen allowed; second blocked", async () => {
    const db = new FakeLinkDb();
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "spotify", url: "https://open.spotify.com/a", linkType: null },
      deps,
    );
    assert.equal(db.links.size, 1);
    await assert.rejects(
      () =>
        upsertReleaseLinkWithLimit(
          RELEASE,
          { platform: "apple_music", url: "https://music.apple.com/a", linkType: null },
          deps,
        ),
      (e: unknown) => e instanceof FreeLinkLimitReachedError && e.used === 1,
    );
  });

  it("free zero links → Free Download / Dub Pack / Other allowed once", async () => {
    for (const platform of ["free_download", "dub_pack", "other"] as const) {
      const db = new FakeLinkDb();
      const deps = {
        pool: db.asPool(),
        getSnapshotsForUser: async () => ({}),
        enforcementEnabled: true,
        paidToolAccessOverride: false,
      };
      await upsertReleaseLinkWithLimit(
        RELEASE,
        {
          platform,
          url: `https://example.com/${platform}`,
          linkType: platform === "other" ? null : "download",
        },
        deps,
      );
      assert.equal(db.links.size, 1);
      await assert.rejects(
        () =>
          upsertReleaseLinkWithLimit(
            RELEASE,
            { platform: "spotify", url: "https://s/2", linkType: null },
            deps,
          ),
        (e: unknown) => e instanceof FreeLinkLimitReachedError && e.used === 1,
      );
    }
  });

  it("free Spotify / Apple / Beatport / Other presave blocked", async () => {
    const db = new FakeLinkDb();
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    for (const platform of ["spotify", "apple_music", "beatport", "other"]) {
      await assert.rejects(
        () =>
          upsertReleaseLinkWithLimit(
            RELEASE,
            { platform, url: `https://x/${platform}`, linkType: "presave" },
            deps,
          ),
        (e: unknown) => e instanceof PaidLinkTypeRequiredError,
      );
    }
    assert.equal(db.links.size, 0);
  });

  it("paid artist can add multiple including paid types", async () => {
    const db = new FakeLinkDb();
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: true,
    };
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "spotify", url: "https://s/1", linkType: "presave" },
      deps,
    );
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "free_download", url: "https://dl/1", linkType: "download" },
      deps,
    );
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "dub_pack", url: "https://dp/1", linkType: null },
      deps,
    );
    assert.equal(db.links.size, 3);
  });

  it("enforcement disabled preserves unrestricted inserts", async () => {
    const db = new FakeLinkDb();
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: false,
      paidToolAccessOverride: false,
    };
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "spotify", url: "https://s/1", linkType: "presave" },
      deps,
    );
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "apple_music", url: "https://a/1", linkType: null },
      deps,
    );
    assert.equal(db.links.size, 2);
  });

  it("URL edit on existing does not increase count", async () => {
    const db = new FakeLinkDb();
    db.seed("spotify", "https://s/old", null);
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "spotify", url: "https://s/new", linkType: null },
      deps,
    );
    assert.equal(db.links.size, 1);
    assert.equal(db.links.get("spotify")?.url, "https://s/new");
  });

  it("downgrade with five links: URL edit preserves all five; insert blocked", async () => {
    const db = new FakeLinkDb();
    for (const p of ["spotify", "apple_music", "soundcloud", "beatport", "bandcamp"]) {
      db.seed(p, `https://${p}`, null);
    }
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    await upsertReleaseLinkWithLimit(
      RELEASE,
      { platform: "spotify", url: "https://spotify/new", linkType: null },
      deps,
    );
    assert.equal(db.links.size, 5);
    await assert.rejects(
      () =>
        upsertReleaseLinkWithLimit(
          RELEASE,
          { platform: "tidal", url: "https://tidal/1", linkType: null },
          deps,
        ),
      (e: unknown) => e instanceof FreeLinkLimitReachedError && e.used === 5,
    );
  });

  it("concurrent inserts cannot exceed one free link", async () => {
    const db = new FakeLinkDb();
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    const results = await Promise.allSettled([
      upsertReleaseLinkWithLimit(
        RELEASE,
        { platform: "spotify", url: "https://s/1", linkType: null },
        deps,
      ),
      upsertReleaseLinkWithLimit(
        RELEASE,
        { platform: "apple_music", url: "https://a/1", linkType: null },
        deps,
      ),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(db.links.size, 1);
    assert.ok(rejected[0].status === "rejected");
    assert.ok(rejected[0].reason instanceof FreeLinkLimitReachedError);
  });
});

describe("replaceReleasePrimaryLink", () => {
  it("rejects incompatible replacement target type", async () => {
    const db = new FakeLinkDb();
    db.seed("spotify", "https://s/1", null);
    await assert.rejects(
      () =>
        replaceReleasePrimaryLink(
          RELEASE,
          {
            fromPlatform: "spotify",
            platform: "free_download",
            url: "https://dl/1",
            linkType: "listen",
          },
          {
            pool: db.asPool(),
            getSnapshotsForUser: async () => ({}),
            enforcementEnabled: true,
            paidToolAccessOverride: true,
          },
        ),
      (e: unknown) => e instanceof InvalidReleaseLinkTypeError,
    );
    assert.equal(db.links.size, 1);
    assert.ok(db.links.has("spotify"));
  });

  it("replaces one free primary atomically", async () => {
    const db = new FakeLinkDb();
    db.seed("spotify", "https://s/1", null);
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    const links = await replaceReleasePrimaryLink(
      RELEASE,
      {
        fromPlatform: "spotify",
        platform: "apple_music",
        url: "https://a/1",
        linkType: "listen",
      },
      deps,
    );
    assert.equal(db.links.size, 1);
    assert.ok(db.links.has("apple_music"));
    assert.equal(db.links.has("spotify"), false);
    assert.equal(links.length, 1);
  });

  it("failed replacement rolls back and leaves original intact", async () => {
    const db = new FakeLinkDb();
    db.seed("spotify", "https://s/1", null);
    db.failNextInsert = true;
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    await assert.rejects(() =>
      replaceReleasePrimaryLink(
        RELEASE,
        {
          fromPlatform: "spotify",
          platform: "apple_music",
          url: "https://a/1",
          linkType: null,
        },
        deps,
      ),
    );
    assert.equal(db.links.size, 1);
    assert.ok(db.links.has("spotify"));
    assert.equal(db.links.get("spotify")?.url, "https://s/1");
    assert.equal(db.links.has("apple_music"), false);
  });

  it("concurrent replacements produce one valid final primary", async () => {
    const db = new FakeLinkDb();
    db.seed("spotify", "https://s/1", null);
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({}),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
    };
    const results = await Promise.allSettled([
      replaceReleasePrimaryLink(
        RELEASE,
        {
          fromPlatform: "spotify",
          platform: "apple_music",
          url: "https://a/1",
          linkType: null,
        },
        deps,
      ),
      replaceReleasePrimaryLink(
        RELEASE,
        {
          fromPlatform: "spotify",
          platform: "tidal",
          url: "https://t/1",
          linkType: null,
        },
        deps,
      ),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.equal(fulfilled.length, 1);
    assert.equal(db.links.size, 1);
    const platform = [...db.links.keys()][0];
    assert.ok(platform === "apple_music" || platform === "tidal");
  });
});
