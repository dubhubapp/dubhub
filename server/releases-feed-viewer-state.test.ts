import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveReleasesFeedViewerId } from "./releases-feed-viewer-state";

const here = dirname(fileURLToPath(import.meta.url));
const viewerSrc = readFileSync(join(here, "releases-feed-viewer.ts"), "utf8");
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const authSrc = readFileSync(join(here, "authMiddleware.ts"), "utf8");
const now = Date.parse("2026-10-26T16:00:00.000Z");
const viewerId = "viewer-1";

function feedRoute(): string {
  const start = routesSrc.indexOf('app.get("/api/releases/feed"');
  const end = routesSrc.indexOf('app.get("/api/releases/creation-capacity"', start);
  return routesSrc.slice(start, end);
}

describe("releases feed viewer state", () => {
  it("keeps an active signed-in viewer", () => {
    assert.equal(
      resolveReleasesFeedViewerId(viewerId, { banned: false, suspended_until: null }, now),
      viewerId,
    );
  });

  it("returns no viewer when the profile is banned", () => {
    assert.equal(
      resolveReleasesFeedViewerId(viewerId, { banned: true, suspended_until: null }, now),
      undefined,
    );
  });

  it("returns no viewer during a current suspension", () => {
    assert.equal(
      resolveReleasesFeedViewerId(
        viewerId,
        { banned: false, suspended_until: "2026-10-27T00:00:00.000Z" },
        now,
      ),
      undefined,
    );
  });

  it("keeps the viewer after the suspension has expired", () => {
    assert.equal(
      resolveReleasesFeedViewerId(
        viewerId,
        { banned: false, suspended_until: "2026-10-26T15:00:00.000Z" },
        now,
      ),
      viewerId,
    );
  });

  it("returns no viewer when the profile row is missing", () => {
    assert.equal(resolveReleasesFeedViewerId(viewerId, null, now), undefined);
    assert.equal(resolveReleasesFeedViewerId(viewerId, undefined, now), undefined);
  });

  it("leaves anonymous and invalid-token requests without a viewer id", () => {
    assert.equal(
      resolveReleasesFeedViewerId(undefined, { banned: false, suspended_until: null }, now),
      undefined,
    );
    assert.match(viewerSrc, /if \(!authHeader \|\| !authHeader\.startsWith\("Bearer "\)\)/);
    assert.match(viewerSrc, /if \(error \|\| !user\?\.id\)/);
    assert.match(feedRoute(), /if \(!userId\)/);
    assert.match(feedRoute(), /return res\.json\(\[\]\)/);
  });

  it("loads only ban and suspension state from the pooled primary key", () => {
    assert.match(viewerSrc, /supabase\.auth\.getUser\(accessToken\)/);
    assert.match(
      viewerSrc,
      /SELECT banned, suspended_until\s+FROM profiles\s+WHERE id = \$1\s+LIMIT 1/,
    );
    assert.match(viewerSrc, /resolveReleasesFeedViewerId\(user\.id, profile\)/);
    assert.match(viewerSrc, /profileState: profileStateMs/);
    assert.doesNotMatch(viewerSrc, /\.from\('profiles'\)/);
    assert.doesNotMatch(viewerSrc, /optionalSupabaseUser/);
  });

  it("keeps the feed JSON and the batched link lookup", () => {
    const block = feedRoute();
    assert.match(block, /res\.json\(withArtworkAndLinks\)/);
    assert.match(block, /getReleaseLinksForReleases\(/);
    assert.match(block, /attachBatchedReleaseLinks\(feed, linksByReleaseId\)/);
    assert.doesNotMatch(block, /getReleaseLinks\(r\.id\)/);
  });

  it("does not change the shared optional-auth profile lookup", () => {
    const block = authSrc.slice(authSrc.indexOf("export async function optionalSupabaseUser"));
    assert.match(block, /\.from\('profiles'\)/);
    assert.match(block, /if \(isBanned \|\| isSuspended\)/);
  });
});
