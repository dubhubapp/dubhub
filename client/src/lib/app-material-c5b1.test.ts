/**
 * Slice C5B.1 — Leaderboard alignment + current-user + profile banner dissolve.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARD_ROW_BASE_CLASS,
  LEADERBOARD_ROW_CURRENT_CLASS,
  LEADERBOARD_SCORE_COLUMN_CLASS,
  LEADERBOARD_YOU_PILL_CLASS,
  leaderboardIdsUnitLabel,
} from "@/lib/leaderboard-presentation";
import {
  PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS,
  PROFILE_BANNER_BOTTOM_FADE_STYLE,
  PROFILE_BANNER_NO_BANNER_GRADIENT,
  PROFILE_BANNER_SURFACE,
} from "@/lib/profile-banner-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const releaseAlertsBtnSrc = readFileSync(
  join(here, "../components/artist-release-alerts-button.tsx"),
  "utf8",
);
const bannerHelperSrc = readFileSync(join(here, "./profile-banner-presentation.tsx"), "utf8");

describe("C5B.1 leaderboard IDs pluralisation", () => {
  it("uses singular ID for 1 and IDs otherwise", () => {
    assert.equal(leaderboardIdsUnitLabel(0), "IDs");
    assert.equal(leaderboardIdsUnitLabel(1), "ID");
    assert.equal(leaderboardIdsUnitLabel(2), "IDs");
    assert.equal(leaderboardIdsUnitLabel(100), "IDs");
  });

  it("wires the helper into the score column label", () => {
    assert.match(leaderboardSrc, /leaderboardIdsUnitLabel\(entry\.correct_ids\)/);
    assert.doesNotMatch(leaderboardSrc, />\s*IDs\s*</);
  });
});

describe("C5B.1 leaderboard score column inset", () => {
  it("keeps right-aligned score with balanced right padding", () => {
    assert.match(LEADERBOARD_SCORE_COLUMN_CLASS, /text-right/);
    assert.match(LEADERBOARD_SCORE_COLUMN_CLASS, /pr-3/);
    assert.match(LEADERBOARD_SCORE_COLUMN_CLASS, /w-\[68px\]/);
    assert.match(leaderboardSrc, /LEADERBOARD_SCORE_COLUMN_CLASS/);
  });
});

describe("C5B.1 current-user row", () => {
  it("C5B.2: You pill only — no wash/ring/border (supersedes C5B.1 quiet wash)", () => {
    assert.equal(LEADERBOARD_ROW_CURRENT_CLASS, "");
    assert.doesNotMatch(LEADERBOARD_ROW_CURRENT_CLASS, /ring-|border|rounded-|shadow-|bg-/);
    assert.match(LEADERBOARD_YOU_PILL_CLASS, /bg-\[#0a83ff\]/);
    assert.match(leaderboardSrc, /LEADERBOARD_YOU_PILL_CLASS/);
    assert.match(LEADERBOARD_ROW_BASE_CLASS, /flex items-center gap-3 px-1 py-3/);
  });
});

describe("C5B.1 profile banner dissolve", () => {
  it("C5C: restores historical h-48 contained fade to navy (supersedes h-80 experiment)", () => {
    assert.equal(PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS, "h-48");
    const bg = String(PROFILE_BANNER_BOTTOM_FADE_STYLE.background);
    assert.match(bg, /linear-gradient\(to bottom/);
    assert.match(bg, /rgba\(15,19,36,0\)/);
    assert.match(bg, /0\.65\) 45%/);
    assert.match(bg, /0\.92\) 72%/);
    assert.match(bg, /#0f1324/);
    assert.equal(PROFILE_BANNER_SURFACE, "#0f1324");
  });

  it("applies the shared uploaded dissolve on own and public profiles", () => {
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
    assert.match(userProfileSrc, /PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS/);
  });

  it("keeps uploaded-banner readability scrims and no-banner atmosphere", () => {
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /10,131,255/);
    assert.doesNotMatch(PROFILE_BANNER_NO_BANNER_GRADIENT, /74,233,223/);
    assert.doesNotMatch(bannerHelperSrc, /filter:|backdrop-filter/);
  });
});

describe("C5B.1 semantic safety", () => {
  it("preserves medals, gold, rewards, and Release Alerts colours", () => {
    assert.match(leaderboardSrc, /text-yellow-500/);
    assert.match(leaderboardSrc, /text-amber-600/);
    assert.match(leaderboardSrc, /border-amber-500\/30/);
    assert.match(leaderboardSrc, /border-purple-500\/30/);
    assert.match(leaderboardSrc, /#FFD700/);
    assert.match(userProfileSrc, /#FFD700/);
    assert.match(publicProfileSrc, /#FFD700/);
    assert.match(releaseAlertsBtnSrc, /green-500/);
    assert.match(userProfileSrc, /text-green-300/);
    assert.match(userProfileSrc, /text-pink-300/);
  });
});
