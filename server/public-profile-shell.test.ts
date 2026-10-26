import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");

function sliceFunction(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const next = source.indexOf("\n  async ", start + signature.length);
  assert.ok(next > start, `missing end of ${signature}`);
  return source.slice(start, next);
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `missing slice ${startNeedle}`);
  return source.slice(start, end);
}

describe("public profile light shell", () => {
  it("returns identity, karma, publicLight, and achievements without discography", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/user/profile/:username"',
      'app.get("/api/user/:id/public-profile-sections"',
    );
    assert.match(block, /getUserKarmaAggregate/);
    assert.match(block, /fetchPublicLightProfileStats/);
    assert.match(block, /getUserLeaderboardAchievements/);
    assert.match(block, /Promise\.all/);
    assert.match(block, /\.\.\.achievements/);
    assert.match(block, /publicLight/);
    assert.doesNotMatch(block, /buildPublicReleasesPayload/);
    assert.doesNotMatch(block, /buildPublicSavedReleasesPayload/);
    assert.doesNotMatch(block, /fetchPublicCommunityOverviewStats/);
    assert.doesNotMatch(block, /getArtistProfileQuestionAnswers/);
  });

  it("loads discography and saved releases on the sections route", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/user/:id/public-profile-sections"',
      'app.get("/api/posts"',
    );
    assert.match(block, /verified_artist === true && user\.account_type === "artist"/);
    assert.match(block, /buildPublicReleasesPayload/);
    assert.match(block, /getArtistProfileQuestionAnswers/);
    assert.match(block, /fetchPublicCommunityOverviewStats/);
    assert.match(block, /buildPublicSavedReleasesPayload/);
  });

  it("looks up the profile username on the pooled index and keeps the shell contract", () => {
    const lookup = sliceFunction(storageSrc, "async getUserByUsername(username: string)");
    assert.match(lookup, /if \(typeof username !== "string" \|\| !username\.trim\(\)\) return undefined/);
    assert.match(lookup, /db\.execute/);
    assert.match(lookup, /lower\(username\) = lower\(trim\(\$\{username\}\)\)/);
    assert.doesNotMatch(lookup, /\.from\("profiles"\)/);
    assert.doesNotMatch(lookup, /\.ilike\(/);
    assert.doesNotMatch(lookup, /SELECT \*/i);
    for (const column of [
      "id",
      "username",
      "avatar_url",
      "banner_url",
      "account_type",
      "moderator",
      "verified_artist",
      "banned",
      "suspended_until",
      "created_at",
    ]) {
      assert.match(lookup, new RegExp(`\\b${column}\\b`));
    }
    assert.doesNotMatch(lookup, /\bemail\b/);

    const block = sliceBetween(
      routesSrc,
      'app.get("/api/user/profile/:username"',
      'app.get("/api/user/:id/public-profile-sections"',
    );
    assert.match(block, /storage\.getUserByUsername\(username\)/);
    assert.match(block, /return res\.status\(404\)\.json\(\{ message: "User not found" \}\)/);
    assert.match(block, /Promise\.all/);
    assert.match(block, /getUserKarmaAggregate/);
    assert.match(block, /fetchPublicLightProfileStats/);
    assert.match(block, /getUserLeaderboardAchievements/);
    assert.match(block, /reputation: karmaAgg\.score/);
    assert.match(block, /correct_ids: karmaAgg\.correct_ids/);
    assert.match(block, /karma: karmaAgg\.score/);
    assert.match(block, /\.\.\.achievements/);
    assert.match(block, /publicLight/);
    assert.doesNotMatch(block, /Server-Timing/);
  });
});
