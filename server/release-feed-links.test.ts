import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachBatchedReleaseLinks,
  groupReleaseLinksByReleaseId,
  mapReleaseLinkRow,
} from "./release-feed-links";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");

function link(releaseId: string, platform: string, sortOrder: number) {
  return mapReleaseLinkRow({
    id: `${releaseId}-${platform}`,
    release_id: releaseId,
    platform,
    url: `https://example.test/${platform}`,
    link_type: "listen",
    sort_order: sortOrder,
    created_at: "2026-10-01T00:00:00.000Z",
  });
}

describe("batched release feed links", () => {
  const orderedRows = [
    link("past", "apple_music", 0),
    link("past", "beatport", 0),
    link("upcoming", "spotify", 0),
    link("upcoming", "soundcloud", 1),
  ];

  it("groups one batch onto the correct releases and keeps link order", () => {
    const grouped = groupReleaseLinksByReleaseId(["upcoming", "past", "saved"], orderedRows);
    assert.deepEqual(
      grouped.get("upcoming")?.map((row) => row.platform),
      ["spotify", "soundcloud"],
    );
    assert.deepEqual(
      grouped.get("past")?.map((row) => row.platform),
      ["apple_music", "beatport"],
    );
    assert.deepEqual(grouped.get("saved"), []);
  });

  it("gives a release with zero link rows an empty array", () => {
    const grouped = groupReleaseLinksByReleaseId(["solo"], []);
    assert.deepEqual(grouped.get("solo"), []);
  });

  it("keeps My, Saved, and Collaborations row order and fields", () => {
    const feed = [
      { id: "mine", view: "upcoming", scope: "my", title: "Mine" },
      { id: "saved", view: "past", scope: "saved", title: "Saved" },
      { id: "collab", view: "collaborations", scope: "my", title: "Collab" },
    ];
    const grouped = groupReleaseLinksByReleaseId(
      feed.map((row) => row.id),
      [link("collab", "beatport", 0), link("mine", "spotify", 0)],
    );
    const attached = attachBatchedReleaseLinks(feed, grouped);
    assert.deepEqual(
      attached.map((row) => row.id),
      ["mine", "saved", "collab"],
    );
    assert.equal(attached[0]?.title, "Mine");
    assert.equal(attached[0]?.scope, "my");
    assert.equal(attached[0]?.links[0]?.platform, "spotify");
    assert.equal(attached[0]?.links[0]?.releaseId, "mine");
    assert.equal(attached[0]?.links[0]?.linkType, "listen");
    assert.equal(attached[0]?.links[0]?.sortOrder, 0);
    assert.equal(attached[0]?.links[0]?.createdAt, "2026-10-01T00:00:00.000Z");
    assert.deepEqual(attached[1]?.links, []);
    assert.equal(attached[1]?.view, "past");
    assert.equal(attached[2]?.links[0]?.platform, "beatport");
    assert.equal(attached[2]?.view, "collaborations");
  });

  it("does not query links for an empty feed", () => {
    const feedStart = routesSrc.indexOf('app.get("/api/releases/feed"');
    const feedEnd = routesSrc.indexOf('app.get("/api/releases/creation-capacity"', feedStart);
    const block = routesSrc.slice(feedStart, feedEnd);
    assert.match(block, /feed\.length > 0/);
    assert.match(block, /: new Map\(\)/);
    assert.match(block, /feed\.length > 0 \? 1 : 0/);
  });
});
