/**
 * Phase 3B.4 — profile stats fade clearance, segment contrast, dense genre labels, Rep track.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE } from "./profile-banner-presentation";
import {
  PROFILE_METRIC_SELECTOR_ACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_INACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_TRACK_CLASS,
} from "./profile-overview-metric-selector-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const repSrc = readFileSync(join(here, "../components/profile-rep-overview.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");

function lightRule(selector: string): string {
  const start = cssSrc.indexOf(selector);
  assert.ok(start >= 0, selector);
  return cssSrc.slice(start, cssSrc.indexOf("}", start));
}

describe("phase 3B.4 profile contrast", () => {
  it("restores the pre-3B.4 Light dissolve stops and leaves Dark at top 36%", () => {
    const darkBg = String(PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE.background);
    assert.match(darkBg, /rgba\(15,19,36,0\.16\) 22%/);
    assert.match(darkBg, /#0f1324 100%/);
    assert.match(PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, /top-\[36%\]/);
    const light = lightRule(":root:not(.dark) .dubhub-profile-banner-dissolve");
    assert.match(light, /rgba\(246, 248, 252, 0\) 0%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.16\) 22%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.42\) 48%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.72\) 72%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.92\) 88%/);
    assert.match(light, /#F6F8FC 100%/);
    assert.doesNotMatch(light, /top: auto|--profile-hero-below-stats/);
    assert.doesNotMatch(userProfileSrc, /--profile-hero-below-stats/);
    assert.doesNotMatch(publicProfileSrc, /--profile-hero-below-stats/);
    assert.match(userProfileSrc, /text-gray-300\/90/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-profile-banner-dissolve/);
  });

  it("separates the Light metric segments and keeps the Dark glass classes", () => {
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /border-\[#DCE3EC\]/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /bg-\[#EEF3FF\]/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /dark:border-white\/10/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /dark:bg-black\/30/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /bg-white/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /text-\[#101828\]/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:bg-transparent/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:from-white\/\[0\.11\]/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:to-white\/\[0\.04\]/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:text-white/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:font-semibold/);
    assert.doesNotMatch(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:from-white\/\[0\.16\]/);
    assert.match(
      PROFILE_METRIC_SELECTOR_ACTIVE_CLASS,
      /dark:shadow-\[inset_0_1px_0_0_rgba\(255,255,255,0\.18\),inset_0_-0\.5px_0_0_rgba\(0,0,0,0\.25\)\]/,
    );
    assert.doesNotMatch(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /#0a83ff|bg-primary/);
    assert.match(PROFILE_METRIC_SELECTOR_INACTIVE_CLASS, /text-\[#667085\]/);
    assert.match(PROFILE_METRIC_SELECTOR_INACTIVE_CLASS, /dark:text-white\/55/);
    assert.match(userProfileSrc, /artistStatsMode === "artist"/);
    assert.match(userProfileSrc, /setArtistStatsMode/);
  });

  it("darkens dense profile genre chips and the owner fav-genre pill, not Home", () => {
    const chip = lightRule(":root:not(.dark) .dubhub-profile-dense-genre-chip");
    assert.match(chip, /color: #101828 !important/);
    assert.doesNotMatch(chip, /background|box-shadow|border/);
    assert.match(userProfileSrc, /dubhub-profile-dense-genre-chip/);
    assert.match(userProfileSrc, /getGenreGlowPillStyle\(chip\.bgColor, chip\.textClass\)/);
    assert.match(userProfileSrc, /getGenreGlowPillStyle\(repBarGenreChip\.bgColor, repBarGenreChip\.textClass\)/);
    assert.match(
      userProfileSrc,
      /OWNER_PROFILE_GENRE_VALUE_PILL_CLASS[\s\S]{0,280}hasReadyUploadedBanner \? undefined : "dubhub-profile-dense-genre-chip"/,
    );
    assert.match(
      userProfileSrc,
      /ACTIVITY_GENRE_VALUE_PILL_CLASS\} dubhub-profile-dense-genre-chip/,
    );
    assert.doesNotMatch(videoCardSrc, /dubhub-profile-dense-genre-chip/);
    assert.doesNotMatch(homeSrc, /dubhub-profile-dense-genre-chip/);
    assert.match(videoCardSrc, /getGenreGlowPillStyle\(genreChip\.bgColor, genreChip\.textClass\)/);
  });

  it("gives the Light Rep track a visible edge and leaves fill logic and the Leaderboard track", () => {
    assert.match(repSrc, /bg-\[#E7EDF5\]/);
    assert.match(repSrc, /ring-\[#DCE3EC\]/);
    assert.match(repSrc, /dark:bg-black\/55/);
    assert.match(repSrc, /dark:ring-0/);
    assert.match(repSrc, /width: `\$\{barWidth\}%`/);
    assert.match(repSrc, /repProgressGradientFromGenreBg\(genreBarColorHex\)/);
    assert.match(leaderboardSrc, /LEADERBOARD_REP_TRACK_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /bg-\[#E7EDF5\]/);
  });
});
