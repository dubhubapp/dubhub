import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `missing slice ${startNeedle}`);
  return source.slice(start, end);
}

describe("Own Profile cold-open stats and karma", () => {
  it("keeps the stats JSON fields and loads the counts in one statement", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/user/:id/stats"',
      'app.get("/api/user/:id/identified-posts-genres"',
    );
    assert.match(block, /Promise\.all/);
    assert.match(block, /AS total_ids/);
    assert.match(block, /AS confirmed_ids/);
    assert.match(block, /AS total_likes/);
    assert.match(block, /AS tracks_identified/);
    assert.match(block, /AS identification_attempts/);
    assert.match(block, /AS likes_on_posts/);
    assert.match(block, /AS comments_on_posts/);
    assert.match(block, /AS artist_ids/);
    assert.match(block, /AS comments_written/);
    assert.match(block, /countSavedReleasesForProfile/);
    assert.match(block, /totalIDs,/);
    assert.match(block, /confirmedIDs,/);
    assert.match(block, /accuracyPercent,/);
    assert.match(block, /releasesSaved,/);
    assert.match(block, /artistIds,/);
    assert.match(block, /\.\.\.achievements/);
    assert.equal(block.match(/db\.execute\(/g)?.length, 1);
  });

  it("skips the community ranking when includeRank=0 and keeps it otherwise", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/user/:id/karma"',
      'app.get("/api/user/:id/stats"',
    );
    assert.match(block, /includeRank/);
    assert.match(block, /!== "0"/);
    assert.match(block, /getUserKarmaAggregate/);
    assert.match(block, /if \(!includeRank\)/);
    const skip = block.slice(block.indexOf("if (!includeRank)"));
    const skipBody = skip.slice(0, skip.indexOf("const rankMeta"));
    assert.doesNotMatch(skipBody, /getLeaderboardUserRank/);
    assert.match(block, /getLeaderboardUserRank\("user", userId, "all"\)/);
    assert.match(block, /communityTopPercent: rankMeta\.communityTopPercent/);
  });

  it("counts saved releases with the feed predicates instead of materialising feeds", () => {
    const block = sliceBetween(
      storageSrc,
      "async countSavedReleasesForProfile",
      "async getReleasesDropDayBannerCandidates",
    );
    assert.match(block, /savedReleasesFeedWhereSql/);
    assert.match(block, /sqlReleaseFeedUpcoming/);
    assert.match(block, /sqlReleaseFeedPast/);
    assert.doesNotMatch(block, /getReleasesFeed/);
  });
});
