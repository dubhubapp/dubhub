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

describe("leaderboard read timing", () => {
  it("reports list and my-rank stages only through Server-Timing", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/leaderboard/users"',
      'app.get("/api/artists/verified"',
    );
    assert.match(block, /getLeaderboard\("user", timeFilter, stage\)/);
    assert.match(block, /getLeaderboard\("artist", timeFilter, stage\)/);
    assert.match(block, /getLeaderboardUserRank\("user", userId, timeFilter, stage\)/);
    assert.match(block, /getLeaderboardUserRank\("artist", userId, timeFilter, stage\)/);
    assert.match(block, /setLeaderboardReadTiming\(res, started, stage\)/);
    const helper = sliceBetween(routesSrc, "function setLeaderboardReadTiming", 'app.get("/api/leaderboard/users"');
    assert.match(helper, /window;dur=/);
    assert.match(helper, /ranking;dur=/);
    assert.match(helper, /handler;dur=/);
    assert.match(block, /res\.json\(leaderboard\)/);
    assert.match(block, /res\.json\(result\)/);
    assert.doesNotMatch(block, /res\.json\(\{[^}]*dur/);
  });

  it("keeps genre inside the ranking statement and the top-100 limit", () => {
    const list = sliceBetween(storageSrc, "async getLeaderboard(", "async getLeaderboardUserRank(");
    const rank = sliceBetween(storageSrc, "async getLeaderboardUserRank(", "async rankLeaderboardPeriod(");
    for (const block of [list, rank]) {
      assert.match(block, /timing\.window/);
      assert.match(block, /timing\.ranking/);
      assert.match(block, /AS favorite_genre/);
      assert.match(block, /ORDER BY/);
    }
    assert.match(list, /LIMIT 100/);
    assert.match(rank, /ROW_NUMBER\(\) OVER/);
    assert.match(rank, /WHERE user_id = \$\{userId\}/);
    assert.match(rank, /COUNT\(\*\) OVER \(\) AS community_total/);
  });
});
