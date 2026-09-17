import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const invalidateSrc = readFileSync(
  join(root, "client/src/lib/leaderboard-country-invalidate.ts"),
  "utf8",
);
const settingsCountrySrc = readFileSync(
  join(root, "client/src/pages/settings-country.tsx"),
  "utf8",
);

describe("leaderboard country cache invalidation", () => {
  it("exports invalidate helper covering community, artists, and my-rank", () => {
    assert.match(invalidateSrc, /export function invalidateLeaderboardCountryQueries/);
    assert.match(invalidateSrc, /queryKey: \["\/api\/leaderboard\/users"\]/);
    assert.match(invalidateSrc, /queryKey: \["\/api\/leaderboard\/artists"\]/);
    assert.match(invalidateSrc, /queryKey: \["\/api\/leaderboard\/users\/my-rank"\]/);
    assert.match(invalidateSrc, /queryKey: \["\/api\/leaderboard\/artists\/my-rank"\]/);
  });

  it("settings country persist calls invalidate after successful save", () => {
    assert.match(settingsCountrySrc, /invalidateLeaderboardCountryQueries\(\)/);
    const persistIdx = settingsCountrySrc.indexOf("const persist = async");
    const invalidateIdx = settingsCountrySrc.indexOf(
      "invalidateLeaderboardCountryQueries()",
    );
    assert.ok(persistIdx >= 0);
    assert.ok(invalidateIdx > persistIdx);
  });
});
