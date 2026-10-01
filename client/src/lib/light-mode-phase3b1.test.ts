/**
 * Phase 3B.1 — Light-surface contrast corrections from device QA.
 * Dark media treatments stay on their existing strings.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTIST_GOLD_CANONICAL,
  ARTIST_GOLD_LIGHT_SURFACE_EDGE,
  LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS,
} from "./leaderboard-presentation";
import {
  PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS,
  PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE,
  PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS,
} from "./profile-banner-presentation";
import {
  MONTHLY_TOP_100_BADGE_BASE_CLASS,
  MONTHLY_TOP_100_BADGE_LEADERBOARD_CLASS,
  MONTHLY_TOP_100_BADGE_PROFILE_CLASS,
} from "./monthly-top-100-presentation";
import { getGenreGlowPillStyle } from "./genre-styles";
import {
  ARTIST_IDENTITY_DISPLAY_CLASS,
  ARTIST_IDENTITY_MEDIA_CLASS,
} from "./artist-identity-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const shieldSrc = readFileSync(join(here, "../components/moderator-shield.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const genreSrc = readFileSync(join(here, "./genre-styles.ts"), "utf8");

function lightRule(selector: string): string {
  const start = cssSrc.indexOf(selector);
  assert.ok(start >= 0, selector);
  return cssSrc.slice(start, cssSrc.indexOf("}", start));
}

describe("phase 3B.1 light-surface corrections", () => {
  it("fades a Light profile banner into the pale canvas and leaves the Dark dissolve", () => {
    const darkBg = String(PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE.background);
    assert.match(darkBg, /rgba\(15,19,36,0\) 0%/);
    assert.match(darkBg, /rgba\(15,19,36,0\.16\) 22%/);
    assert.match(darkBg, /rgba\(15,19,36,0\.42\) 48%/);
    assert.match(darkBg, /rgba\(15,19,36,0\.72\) 72%/);
    assert.match(darkBg, /#0f1324 100%/);
    assert.match(PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, /dubhub-profile-banner-dissolve/);
    assert.match(PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, /top-\[36%\]/);
    assert.doesNotMatch(PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, /-bottom-/);

    const light = lightRule(":root:not(.dark) .dubhub-profile-banner-dissolve");
    assert.match(light, /rgba\(246, 248, 252, 0\) 0%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.16\) 22%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.42\) 48%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.72\) 72%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.92\) 88%/);
    assert.match(light, /#F6F8FC 100%/);
    assert.doesNotMatch(light, /top: auto/);
    assert.doesNotMatch(light, /rgba\(15, 19, 36/);
    assert.doesNotMatch(light, /#0f1324 100%/);
    assert.match(cssSrc, /:root:not\(\.dark\) \[data-profile-hero="media"\]/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-profile-banner-dissolve/);
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
  });

  it("gives leaderboard moderator and 100 Club badges a Light treatment and keeps Dark chrome", () => {
    assert.match(shieldSrc, /text-blue-400\/80/);
    assert.match(shieldSrc, /fill="#FFFFFF"/);
    assert.match(shieldSrc, /dubhub-moderator-shield-stroke/);
    assert.match(shieldSrc, /dubhub-moderator-shield-mark/);
    const mod = lightRule(
      ':root:not(.dark) [data-testid^="leaderboard-entry-"] .dubhub-moderator-shield-stroke',
    );
    assert.match(mod, /#1d4ed8/);
    const mark = lightRule(
      ':root:not(.dark) [data-testid^="leaderboard-entry-"] .dubhub-moderator-shield-mark',
    );
    assert.match(mark, /#101828/);
    assert.doesNotMatch(cssSrc, /\.dark \[data-testid\^="leaderboard-entry-"\] \.dubhub-moderator-shield/);

    assert.match(MONTHLY_TOP_100_BADGE_BASE_CLASS, /border-white\/35/);
    assert.match(MONTHLY_TOP_100_BADGE_BASE_CLASS, /from-white\/\[0\.16\]/);
    assert.match(MONTHLY_TOP_100_BADGE_BASE_CLASS, /text-white\/90/);
    assert.match(MONTHLY_TOP_100_BADGE_LEADERBOARD_CLASS, /dubhub-hundred-club-on-surface/);
    assert.doesNotMatch(MONTHLY_TOP_100_BADGE_PROFILE_CLASS, /dubhub-hundred-club-on-surface/);
    const club = lightRule(":root:not(.dark) .dubhub-hundred-club-on-surface");
    assert.match(club, /#101828/);
    assert.match(club, /#667085/);
    assert.match(club, /rgba\(255, 255, 255, 0\.94\)/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-hundred-club-on-surface/);
  });

  it("uses a Light frost for the prize surround and keeps the Dark radial", () => {
    assert.match(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /rgba\(15,19,36,0\.48\)/);
    assert.match(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /top-\[54%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /dubhub-lb-hero-meta-scrim/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /0\.62_|top-\[46%\]/);
    const frost = lightRule(":root:not(.dark) .dubhub-lb-hero-meta-scrim");
    assert.match(frost, /rgba\(246, 248, 252, 0\.72\)/);
    assert.match(frost, /transparent 86%/);
    assert.doesNotMatch(frost, /rgba\(15, 19, 36/);
    const title = lightRule(':root:not(.dark) [data-testid="rewards-banner-title"]');
    assert.match(title, /#101828/);
    assert.match(leaderboardSrc, /color: accent/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-lb-hero-meta-scrim/);
  });

  it("keeps canonical gold on leaderboard rows and on profile media", () => {
    assert.equal(ARTIST_GOLD_CANONICAL, "#FFD700");
    assert.match(ARTIST_GOLD_LIGHT_SURFACE_EDGE, /0 1px 0 rgba\(16, 24, 40, 0\.45\)/);
    assert.equal(ARTIST_IDENTITY_DISPLAY_CLASS, "dubhub-gold-text-surface text-[#FFD700]");
    assert.equal(ARTIST_IDENTITY_MEDIA_CLASS, "text-[#FFD700]");
    assert.match(leaderboardSrc, /ARTIST_IDENTITY_DISPLAY_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /#7A5E16/);
    assert.match(userProfileSrc, /ARTIST_IDENTITY_MEDIA_CLASS/);
    assert.match(userProfileSrc, /ARTIST_IDENTITY_DISPLAY_CLASS/);
    assert.doesNotMatch(userProfileSrc, /#7A5E16/);
    assert.match(publicProfileSrc, /ARTIST_IDENTITY_MEDIA_CLASS/);
    assert.doesNotMatch(publicProfileSrc, /#7A5E16/);
    assert.doesNotMatch(videoCardSrc, /#7A5E16/);
    assert.doesNotMatch(videoCardSrc, /dubhub-gold-text-surface/);
  });

  it("paints the Light profile fav-genre pill with navy type and leaves the glow recipe and VideoCard", () => {
    const glow = getGenreGlowPillStyle("#8f57b3", "text-white");
    assert.match(String(glow.color), /^rgb\(/);
    assert.match(String(glow.boxShadow), /0 0 14px/);
    assert.match(String(glow.textShadow), /0 0 10px/);
    assert.match(String(glow.background), /rgba\(143,87,179/);
    assert.match(userProfileSrc, /getGenreGlowPillStyle\(repBarGenreChip\.bgColor/);
    assert.match(userProfileSrc, /getGenreGlowPillStyle\(chip\.bgColor/);
    assert.match(publicProfileSrc, /getGenreGlowPillStyle\(genreChip\.bgColor/);
    assert.match(videoCardSrc, /getGenreGlowPillStyle/);
    assert.doesNotMatch(cssSrc, /dubhub-profile-fav-genre-pill/);
    assert.doesNotMatch(userProfileSrc, /profileFavGenreSurfaceVars/);
    assert.doesNotMatch(videoCardSrc, /dubhub-profile-fav-genre-pill/);
    const glowFn = genreSrc.slice(genreSrc.indexOf("export function getGenreGlowPillStyle"));
    assert.match(glowFn, /mixTowardWhite/);
    assert.doesNotMatch(glowFn, /#101828/);
  });

  it("aligns avatar and banner image-edit controls on one glass treatment", () => {
    assert.match(PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS, /bg-white\/60/);
    assert.match(PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS, /text-\[#101828\]/);
    assert.match(PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS, /backdrop-blur-md/);
    assert.match(PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS, /dark:bg-white\/\[0\.12\]/);
    assert.match(PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS, /dark:text-white/);
    assert.match(PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS, /dark:border-white\/25/);
    assert.doesNotMatch(PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS, /bg-primary|0A83FF|#0a83ff/);
    assert.match(userProfileSrc, /button-edit-profile-picture/);
    assert.match(userProfileSrc, /button-edit-profile-banner/);
    const avatar = userProfileSrc.slice(
      userProfileSrc.indexOf("button-edit-profile-picture") - 400,
      userProfileSrc.indexOf("button-edit-profile-picture"),
    );
    const bannerAt = userProfileSrc.indexOf("button-edit-profile-banner");
    const banner = userProfileSrc.slice(bannerAt - 500, bannerAt + 180);
    assert.match(avatar, /PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS/);
    assert.doesNotMatch(avatar, /dark:bg-primary|dark:text-black/);
    assert.match(avatar, /handleProfileImageChange/);
    assert.match(banner, /PROFILE_IMAGE_EDIT_CONTROL_LIGHT_CLASS/);
    assert.doesNotMatch(banner, /dark:bg-black\/45/);
    assert.match(banner, /aria-label="Edit profile banner"/);
  });
});
