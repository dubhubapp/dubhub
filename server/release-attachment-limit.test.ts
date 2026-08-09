import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResult } from "pg";
import { attachPostsWithLimit } from "./attach-posts-with-limit";
import {
  FREE_ATTACHMENT_LIMIT,
  FREE_ATTACHMENT_LIMIT_CODE,
  FreeAttachmentLimitReachedError,
  isAttachmentLimitEnforcementEnabled,
  isFreeAttachmentLimitReachedError,
} from "./release-attachment-limit";

const OWNER = "00000000-0000-4000-8000-0000000000d1";
const CALLER = OWNER;
const RELEASE = "00000000-0000-4000-8000-0000000000e1";

type PostRow = {
  id: string;
  artist_verified_by: string;
  is_verified_artist: boolean;
  denied_by_artist: boolean;
  verification_status: string | null;
};

class FakeAttachDb {
  posts = new Map<string, PostRow>();
  attachments = new Map<string, string>(); // postId -> releaseId
  locks = new Map<string, Promise<void>>();

  addEligiblePost(id: string) {
    this.posts.set(id, {
      id,
      artist_verified_by: CALLER,
      is_verified_artist: true,
      denied_by_artist: false,
      verification_status: "identified",
    });
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
              return { rows: [], rowCount: 0, command: "BEGIN", oid: 0, fields: [] };
            }
            if (sql === "COMMIT" || sql === "ROLLBACK") {
              if (unlock) {
                unlock();
                unlock = null;
              }
              return { rows: [], rowCount: 0, command: sql, oid: 0, fields: [] };
            }
            if (sql.includes("pg_advisory_xact_lock")) {
              const key = String(params?.[0]);
              const prev = db.locks.get(key) ?? Promise.resolve();
              let releaseLock!: () => void;
              const gate = new Promise<void>((resolve) => {
                releaseLock = resolve;
              });
              db.locks.set(
                key,
                prev.then(() => gate),
              );
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
            if (sql.includes("COUNT(*)") && sql.includes("release_posts")) {
              const releaseId = String(params?.[0]);
              const c = [...db.attachments.values()].filter((r) => r === releaseId).length;
              return { rows: [{ c }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
            }
            if (sql.includes("FROM posts p")) {
              const postId = String(params?.[0]);
              const callerId = String(params?.[1]);
              const post = db.posts.get(postId);
              if (
                post &&
                post.artist_verified_by === callerId &&
                post.is_verified_artist &&
                !post.denied_by_artist
              ) {
                return { rows: [{ id: postId }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
              }
              return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
            }
            if (sql.includes("FROM release_posts WHERE post_id")) {
              const postId = String(params?.[0]);
              const releaseId = db.attachments.get(postId);
              if (!releaseId) {
                return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
              }
              return {
                rows: [{ release_id: releaseId }],
                rowCount: 1,
                command: "SELECT",
                oid: 0,
                fields: [],
              };
            }
            if (sql.startsWith("INSERT INTO release_posts")) {
              const releaseId = String(params?.[0]);
              const postId = String(params?.[1]);
              db.attachments.set(postId, releaseId);
              return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
            }
            throw new Error(`Unhandled SQL: ${sql}`);
          },
          release() {
            if (unlock) {
              unlock();
              unlock = null;
            }
          },
        } as unknown as PoolClient;
        return client;
      },
      query: async (text: string, params?: unknown[]) => {
        // used by capacity helpers
        const sql = String(text).replace(/\s+/g, " ");
        if (sql.includes("FROM releases")) {
          return { rows: [{ artist_id: OWNER }] };
        }
        if (sql.includes("COUNT(*)")) {
          const releaseId = String(params?.[0]);
          const c = [...db.attachments.values()].filter((r) => r === releaseId).length;
          return { rows: [{ c }] };
        }
        return { rows: [] };
      },
    } as unknown as Pool;
  }
}

describe("release-attachment-limit flag", () => {
  it("enables only for exact true", () => {
    assert.equal(
      isAttachmentLimitEnforcementEnabled({
        ARTIST_SUBSCRIPTION_ATTACHMENT_LIMIT_ENFORCEMENT: "true",
      } as NodeJS.ProcessEnv),
      true,
    );
    assert.equal(
      isAttachmentLimitEnforcementEnabled({
        ARTIST_SUBSCRIPTION_ATTACHMENT_LIMIT_ENFORCEMENT: "1",
      } as NodeJS.ProcessEnv),
      false,
    );
  });

  it("error contract", () => {
    const err = new FreeAttachmentLimitReachedError(3);
    assert.deepEqual(err.toJSON(), {
      message:
        "You've reached the free limit of 3 attached posts per release. Upgrade for unlimited attachments.",
      code: FREE_ATTACHMENT_LIMIT_CODE,
      limit: FREE_ATTACHMENT_LIMIT,
      used: 3,
    });
    assert.equal(isFreeAttachmentLimitReachedError(err), true);
  });
});

describe("attachPostsWithLimit", () => {
  it("free artist can attach up to 3", async () => {
    const db = new FakeAttachDb();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    ids.forEach((id) => db.addEligiblePost(id));
    const result = await attachPostsWithLimit(RELEASE, CALLER, ids, {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.equal(result.newlyAttached.length, 3);
    assert.equal(db.attachments.size, 3);
  });

  it("free artist blocked when attaching would exceed 3", async () => {
    const db = new FakeAttachDb();
    const existing = [randomUUID(), randomUUID(), randomUUID()];
    existing.forEach((id) => {
      db.addEligiblePost(id);
      db.attachments.set(id, RELEASE);
    });
    const next = randomUUID();
    db.addEligiblePost(next);
    await assert.rejects(
      () =>
        attachPostsWithLimit(RELEASE, CALLER, [next], {
          pool: db.asPool(),
          getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
          enforcementEnabled: true,
          paidToolAccessOverride: false,
          resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
        }),
      (err: unknown) => {
        assert.equal(isFreeAttachmentLimitReachedError(err), true);
        if (isFreeAttachmentLimitReachedError(err)) assert.equal(err.used, 3);
        return true;
      },
    );
    assert.equal(db.attachments.size, 3);
  });

  it("paid artist unlimited beyond 3", async () => {
    const db = new FakeAttachDb();
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    ids.forEach((id) => db.addEligiblePost(id));
    const result = await attachPostsWithLimit(RELEASE, CALLER, ids, {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      enforcementEnabled: true,
      paidToolAccessOverride: true,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.equal(result.newlyAttached.length, 4);
  });

  it("idempotent re-attach of existing does not consume slots", async () => {
    const db = new FakeAttachDb();
    const existing = [randomUUID(), randomUUID(), randomUUID()];
    existing.forEach((id) => {
      db.addEligiblePost(id);
      db.attachments.set(id, RELEASE);
    });
    const result = await attachPostsWithLimit(RELEASE, CALLER, existing, {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.equal(result.newlyAttached.length, 0);
    assert.equal(result.attached.length, 3);
  });

  it("enforcement disabled allows beyond 3", async () => {
    const db = new FakeAttachDb();
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    ids.forEach((id) => db.addEligiblePost(id));
    const result = await attachPostsWithLimit(RELEASE, CALLER, ids, {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      enforcementEnabled: false,
      paidToolAccessOverride: false,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.equal(result.newlyAttached.length, 4);
  });

  it("concurrent free attaches with 2 existing: only one new succeeds", async () => {
    const db = new FakeAttachDb();
    const existing = [randomUUID(), randomUUID()];
    existing.forEach((id) => {
      db.addEligiblePost(id);
      db.attachments.set(id, RELEASE);
    });
    const a = randomUUID();
    const b = randomUUID();
    db.addEligiblePost(a);
    db.addEligiblePost(b);
    const deps = {
      pool: db.asPool(),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      enforcementEnabled: true,
      paidToolAccessOverride: false,
      resolveEnvironment: () => ({ environment: "sandbox" as const, reason: "test" }),
    };
    const results = await Promise.allSettled([
      attachPostsWithLimit(RELEASE, CALLER, [a], deps),
      attachPostsWithLimit(RELEASE, CALLER, [b], deps),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.equal(
      isFreeAttachmentLimitReachedError((failed[0] as PromiseRejectedResult).reason),
      true,
    );
    assert.equal(db.attachments.size, 3);
  });
});
