import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient, QueryResult } from "pg";
import { mapReleaseLinkRow } from "./release-feed-links";
import { FREE_RELEASE_LINK_LIMIT } from "./release-link-limit";
import {
  InvalidPostReleaseUrlError,
  readPostReleaseUrlFromBody,
} from "./release-link-post-release-url";
import { reorderReleaseLinks } from "./reorder-release-links";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const reorderSrc = readFileSync(join(here, "reorder-release-links.ts"), "utf8");
const migrationSrc = readFileSync(
  join(here, "../supabase/migrations/20261104120000_release_links_post_release_url.sql"),
  "utf8",
);

describe("readPostReleaseUrlFromBody", () => {
  it("treats a missing field as omit and blank as removal", () => {
    assert.equal(readPostReleaseUrlFromBody({ url: "https://pre.example" }), undefined);
    assert.equal(readPostReleaseUrlFromBody({ post_release_url: null }), null);
    assert.equal(readPostReleaseUrlFromBody({ post_release_url: "  " }), null);
    assert.equal(
      readPostReleaseUrlFromBody({ post_release_url: " https://live.example/a " }),
      "https://live.example/a",
    );
  });

  it("rejects a non-string released URL", () => {
    assert.throws(
      () => readPostReleaseUrlFromBody({ post_release_url: 12 }),
      (error: unknown) =>
        error instanceof InvalidPostReleaseUrlError && error.statusCode === 400,
    );
  });
});

describe("stored link mapping", () => {
  it("returns an old row without rewriting url", () => {
    const row = mapReleaseLinkRow({
      id: "link-1",
      release_id: "release-1",
      platform: "spotify",
      url: "https://pre.example/spotify",
      link_type: "presave",
      sort_order: 0,
      created_at: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(row.url, "https://pre.example/spotify");
    assert.equal(row.linkType, "presave");
    assert.equal(row.postReleaseUrl, null);
    assert.equal(row.sortOrder, 0);
  });

  it("returns both stored URLs unchanged", () => {
    const row = mapReleaseLinkRow({
      id: "link-1",
      release_id: "release-1",
      platform: "apple_music",
      url: "https://pre.example/apple",
      post_release_url: "https://music.apple.com/album/1",
      link_type: "presave",
      sort_order: 1,
      created_at: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(row.url, "https://pre.example/apple");
    assert.equal(row.postReleaseUrl, "https://music.apple.com/album/1");
    assert.notEqual(row.url, row.postReleaseUrl);
  });
});

describe("reorder preserves both destinations", () => {
  it("changes sort order only", async () => {
    const links = new Map([
      [
        "a",
        {
          id: "a",
          release_id: "release-1",
          platform: "spotify",
          url: "https://pre.example/spotify",
          link_type: "presave",
          post_release_url: "https://live.example/spotify",
          sort_order: 0,
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
      [
        "b",
        {
          id: "b",
          release_id: "release-1",
          platform: "beatport",
          url: "https://pre.example/beatport",
          link_type: "presave",
          post_release_url: "https://live.example/beatport",
          sort_order: 1,
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
    ]);
    const pool = {
      connect: async () => {
        const client = {
          async query(text: string, params?: unknown[]): Promise<QueryResult> {
            const sql = text.replace(/\s+/g, " ").trim();
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
              return { rows: [], rowCount: 0, command: sql, oid: 0, fields: [] };
            }
            if (sql.includes("FOR UPDATE")) {
              return {
                rows: [...links.values()].map((row) => ({ id: row.id })),
                rowCount: links.size,
                command: "SELECT",
                oid: 0,
                fields: [],
              };
            }
            if (sql.startsWith("UPDATE release_links SET sort_order")) {
              const sortOrder = Number(params?.[0]);
              const id = String(params?.[1]);
              const row = links.get(id);
              if (row) row.sort_order = sortOrder;
              assert.equal(sql.includes("post_release_url"), false);
              assert.equal(sql.includes(" url "), false);
              return { rows: [], rowCount: 1, command: "UPDATE", oid: 0, fields: [] };
            }
            if (sql.includes("ORDER BY sort_order")) {
              const rows = [...links.values()].sort((a, b) => a.sort_order - b.sort_order);
              return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
          release() {},
        };
        return client as unknown as PoolClient;
      },
    } as unknown as Pool;

    const ordered = await reorderReleaseLinks("release-1", ["b", "a"], { pool });
    assert.deepEqual(
      ordered.map((row) => ({
        platform: row.platform,
        url: row.url,
        postReleaseUrl: row.postReleaseUrl,
        sortOrder: row.sortOrder,
      })),
      [
        {
          platform: "beatport",
          url: "https://pre.example/beatport",
          postReleaseUrl: "https://live.example/beatport",
          sortOrder: 0,
        },
        {
          platform: "spotify",
          url: "https://pre.example/spotify",
          postReleaseUrl: "https://live.example/spotify",
          sortOrder: 1,
        },
      ],
    );
  });
});

describe("release link API contract", () => {
  it("keeps the free primary limit at one platform", () => {
    assert.equal(FREE_RELEASE_LINK_LIMIT, 1);
  });

  it("adds a nullable column without rewriting existing link fields", () => {
    assert.match(migrationSrc, /ADD COLUMN IF NOT EXISTS post_release_url text NULL/);
    assert.doesNotMatch(migrationSrc, /UPDATE\s+release_links/i);
    assert.doesNotMatch(migrationSrc, /SET\s+url/i);
  });

  it("returns stored link rows and still hides them on a suspended public release", () => {
    const detailStart = routesSrc.indexOf('app.get("/api/releases/:id"');
    const detailEnd = routesSrc.indexOf('app.delete("/api/releases/:id/save"', detailStart);
    const detail = routesSrc.slice(detailStart, detailEnd);
    assert.match(detail, /subscriptionSuspendedAt && !isOwner && !isCollab/);
    assert.match(detail, /links: \[\]/);
    assert.doesNotMatch(detail, /post_release_url/);
    assert.doesNotMatch(detail, /resolvePublicLinkCta/);

    const upsertStart = routesSrc.indexOf('app.post("/api/releases/:id/links"');
    const upsertEnd = routesSrc.indexOf('app.put("/api/releases/:id/links/order"', upsertStart);
    const upsert = routesSrc.slice(upsertStart, upsertEnd);
    assert.match(upsert, /readPostReleaseUrlFromBody\(req\.body\)/);
    assert.match(upsert, /res\.json\(links\)/);
    assert.doesNotMatch(upsert, /resolvePublicLinkCta/);

    assert.match(reorderSrc, /SET sort_order = \$1/);
    assert.match(reorderSrc, /post_release_url/);
    assert.doesNotMatch(
      reorderSrc.slice(reorderSrc.indexOf("for (let i = 0;")),
      /post_release_url/,
    );
  });
});
