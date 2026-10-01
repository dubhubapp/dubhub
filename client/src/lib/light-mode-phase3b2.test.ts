/**
 * Phase 3B.2 — later banner fade, genre fill, canonical gold edge, prize pill containers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTIST_GOLD_CANONICAL,
  ARTIST_GOLD_LIGHT_SURFACE_EDGE,
} from "./leaderboard-presentation";
import { PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE } from "./profile-banner-presentation";
import { VERIFIED_ARTIST_GOLD, goldTextClass } from "../components/verified-artist";
import {
  ARTIST_IDENTITY_COMPACT_CLASS,
  ARTIST_IDENTITY_DISPLAY_CLASS,
} from "./artist-identity-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const tickSrc = readFileSync(join(here, "../components/verified-artist.tsx"), "utf8");
const medalSrc = readFileSync(join(here, "../components/leaderboard-top-rank-mark.tsx"), "utf8");
const genreSrc = readFileSync(join(here, "./genre-styles.ts"), "utf8");

function lightRule(selector: string): string {
  const start = cssSrc.indexOf(selector);
  assert.ok(start >= 0, selector);
  return cssSrc.slice(start, cssSrc.indexOf("}", start));
}

describe("phase 3B.2 contrast calibration", () => {
  it("starts the Light banner fade near the bottom edge and leaves the Dark dissolve", () => {
    const darkBg = String(PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE.background);
    assert.match(darkBg, /rgba\(15,19,36,0\.16\) 22%/);
    assert.match(darkBg, /rgba\(15,19,36,0\.42\) 48%/);
    assert.match(darkBg, /rgba\(15,19,36,0\.72\) 72%/);
    assert.match(darkBg, /#0f1324 100%/);

    const light = lightRule(":root:not(.dark) .dubhub-profile-banner-dissolve");
    assert.match(light, /rgba\(246, 248, 252, 0\.16\) 22%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.42\) 48%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.72\) 72%/);
    assert.match(light, /rgba\(246, 248, 252, 0\.92\) 88%/);
    assert.match(light, /#F6F8FC 100%/);
    assert.doesNotMatch(light, /top: auto/);
    assert.doesNotMatch(light, /rgba\(15, 19, 36/);
    assert.doesNotMatch(light, /82%/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-profile-banner-dissolve/);
    assert.match(cssSrc, /#F6F8FC 0%[\s\S]*#F6F8FC 52%/);
  });

  it("reuses the Home genre glow helper on profile and leaves that helper unchanged", () => {
    assert.match(genreSrc, /bgColor: "#8f57b3"/);
    assert.match(genreSrc, /export function getGenreGlowPillStyle/);
    assert.doesNotMatch(genreSrc, /profileFavGenreSurfaceVars|dubhub-profile-fav-genre-pill/);
    assert.match(userProfileSrc, /getGenreGlowPillStyle\(repBarGenreChip\.bgColor, repBarGenreChip\.textClass\)/);
    assert.match(publicProfileSrc, /getGenreGlowPillStyle\(genreChip\.bgColor, genreChip\.textClass\)/);
    assert.doesNotMatch(cssSrc, /dubhub-profile-fav-genre-pill/);
    assert.match(videoCardSrc, /style=\{getGenreGlowPillStyle\(genreChip\.bgColor, genreChip\.textClass\)\}/);
    assert.doesNotMatch(videoCardSrc, /dubhub-profile-fav-genre-pill/);
    const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
    assert.doesNotMatch(homeSrc, /dubhub-profile-fav-genre-pill|profileFavGenreSurfaceVars/);
  });

  it("uses canonical gold plus one crisp Light edge, and leaves ticks and medals", () => {
    assert.equal(ARTIST_GOLD_CANONICAL, "#FFD700");
    assert.equal(VERIFIED_ARTIST_GOLD, "#FFD700");
    assert.equal(goldTextClass, "text-[#FFD700]");
    assert.equal(ARTIST_GOLD_LIGHT_SURFACE_EDGE, "0 1px 0 rgba(16, 24, 40, 0.45)");
    const edge = lightRule(":root:not(.dark) .dubhub-gold-text-surface");
    assert.match(edge, /#ffd700/);
    assert.match(edge, /text-shadow: 0 1px 0 rgba\(16, 24, 40, 0\.45\)/);
    assert.doesNotMatch(edge, /-0\.5px|0 0 8px|outline/);
    assert.equal(ARTIST_IDENTITY_DISPLAY_CLASS, "dubhub-gold-text-surface text-[#FFD700]");
    assert.match(ARTIST_IDENTITY_COMPACT_CLASS, /text-foreground/);
    assert.doesNotMatch(ARTIST_IDENTITY_COMPACT_CLASS, /dubhub-gold-text-surface/);
    assert.match(leaderboardSrc, /ARTIST_IDENTITY_DISPLAY_CLASS/);
    assert.match(userProfileSrc, /hasReadyUploadedBanner/);
    assert.match(userProfileSrc, /ARTIST_IDENTITY_DISPLAY_CLASS/);
    assert.match(publicProfileSrc, /ARTIST_IDENTITY_DISPLAY_CLASS/);
    assert.match(commentsSrc, /ARTIST_IDENTITY_COMPACT_CLASS/);
    assert.doesNotMatch(commentsSrc, /dubhub-gold-text-surface/);
    assert.doesNotMatch(leaderboardSrc, /#7A5E16/);
    assert.doesNotMatch(videoCardSrc, /dubhub-gold-text-surface/);
    assert.match(tickSrc, /export function GoldVerifiedTick/);
    assert.match(tickSrc, /dubhub-gold-verified-tick text-\[#FFD700\]/);
    assert.match(tickSrc, /CheckCircle/);
    assert.doesNotMatch(tickSrc, /dubhub-gold-text-surface/);
    const tickEdge = lightRule(":root:not(.dark) .dubhub-gold-text-surface .dubhub-gold-verified-tick");
    assert.match(tickEdge, /drop-shadow\(0 1px 0 rgba\(16, 24, 40, 0\.45\)\)/);
    assert.match(tickEdge, /dubhub-gold-text-surface \+ \*/);
    assert.doesNotMatch(medalSrc, /dubhub-gold-text-surface|#7A5E16/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-gold-text-surface/);
  });

  it("gives Artist and Community prize pills Light containers and leaves Dark inline accents", () => {
    assert.match(leaderboardSrc, /data-lb-prize-tone=\{accent\.toLowerCase\(\) === "#0a83ff" \? "blue" : "gold"\}/);
    assert.match(leaderboardSrc, /color: accent/);
    assert.match(leaderboardSrc, /backgroundColor: rewardHeroAccentRgba\(accent, 0\.14\)/);
    const blue = lightRule(':root:not(.dark) [data-lb-prize-tone="blue"] [data-testid="rewards-banner-prize-label"]');
    assert.match(blue, /rgba\(10, 131, 255, 0\.16\)/);
    assert.match(blue, /#0a83ff/);
    assert.match(blue, /#0757b8/);
    assert.match(blue, /rewards-banner-countdown/);
    assert.match(blue, /text-shadow: none/);
    const gold = lightRule(':root:not(.dark) [data-lb-prize-tone="gold"] [data-testid="rewards-banner-prize-label"]');
    assert.match(gold, /rgba\(229, 188, 5, 0\.22\)/);
    assert.match(gold, /#e5bc05/);
    assert.match(gold, /#8a6808/);
    assert.match(gold, /rewards-banner-countdown/);
    assert.doesNotMatch(cssSrc, /\.dark \[data-lb-prize-tone/);
  });

  it("darkens the Light 100 Club numeral and leaves the Dark mark white", () => {
    const markSrc = readFileSync(join(here, "../components/hundred-club-mark.tsx"), "utf8");
    assert.match(markSrc, /className="dubhub-hundred-club-numeral"/);
    assert.match(markSrc, /fill="#ffffff"/);
    assert.match(markSrc, /viewBox=\{HUNDRED_CLUB_MARK_VIEWBOX\}|0 0 56 32/);
    const numeral = lightRule(":root:not(.dark) .dubhub-hundred-club-on-surface .dubhub-hundred-club-numeral");
    assert.match(numeral, /fill: #101828/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-hundred-club-numeral|\.dark \.dubhub-hundred-club-on-surface \.dubhub-hundred-club-numeral/);
  });
});
