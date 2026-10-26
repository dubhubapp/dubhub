import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const authSrc = readFileSync(join(here, "authMiddleware.ts"), "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `missing slice ${startNeedle}`);
  return source.slice(start, end);
}

describe("releases feed timing", () => {
  it("reports feed stages only through Server-Timing", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/releases/feed"',
      'app.get("/api/releases/creation-capacity"',
    );
    assert.match(block, /storage\.getReleasesFeed\(userId, view, scope\)/);
    assert.match(block, /storage\.getReleaseLinksForReleases\(/);
    assert.doesNotMatch(block, /getReleaseLinks\(r\.id\)/);
    assert.match(block, /feed\.length > 0 \? 1 : 0/);
    assert.match(block, /setReleasesFeedTiming\(res, started, stage\)/);
    const helper = sliceBetween(routesSrc, "function setReleasesFeedTiming", 'app.get("/api/releases/feed"');
    assert.match(block, /releasesFeedViewer/);
    assert.doesNotMatch(block, /optionalSupabaseUser/);
    assert.match(helper, /auth;dur=/);
    assert.match(helper, /profileState;dur=/);
    assert.doesNotMatch(helper, /profile;dur=/);
    assert.match(helper, /feed;dur=/);
    assert.match(helper, /links;dur=/);
    assert.match(helper, /releaseCount;dur=/);
    assert.match(helper, /linkQueryCount;dur=/);
    assert.match(helper, /handler;dur=/);
    assert.match(block, /res\.json\(withArtworkAndLinks\)/);
    assert.match(block, /attachBatchedReleaseLinks\(feed, linksByReleaseId\)/);
    assert.doesNotMatch(block, /res\.json\(\{[^}]*dur/);
  });

  it("keeps the single-release lookup and adds one ordered batch lookup", () => {
    const links = sliceBetween(storageSrc, "async getReleaseLinks(", "async getReleaseLinksForReleases(");
    assert.match(links, /WHERE release_id = \$\{releaseId\}/);
    assert.match(links, /ORDER BY sort_order ASC, platform ASC/);
    assert.doesNotMatch(links, /ANY\(/);
    const batch = sliceBetween(storageSrc, "async getReleaseLinksForReleases(", "async upsertReleaseLink(");
    assert.match(batch, /ANY\(\$1::uuid\[\]\)/);
    assert.match(batch, /created_at::text AS created_at/);
    assert.match(batch, /ORDER BY sort_order ASC, platform ASC/);
    assert.match(batch, /if \(ids\.length === 0\) return new Map\(\)/);
  });

  it("times releases auth without changing the optional-auth profile lookup", () => {
    const block = authSrc.slice(authSrc.indexOf("export async function optionalSupabaseUser"));
    assert.match(block, /releasesFeedClock/);
    assert.match(authSrc, /req\.path !== "\/api\/releases\/feed"/);
    assert.match(block, /supabase\.auth\.getUser\(accessToken\)/);
    assert.match(block, /\.from\('profiles'\)/);
    assert.match(block, /if \(isBanned \|\| isSuspended\)/);
    assert.match(block, /releasesFeedPerf/);
  });
});
