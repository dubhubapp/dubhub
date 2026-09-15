import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatBestMonthlyRankHeaderLabel,
  formatBestMonthlyRankMonth,
  formatBestMonthlyRankValue,
} from "./monthly-top-100-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const shareButtonSrc = readFileSync(
  join(here, "../components/artist-profile-share-button.tsx"),
  "utf8",
);
const bestMonthlyChipSrc = readFileSync(
  join(here, "../components/best-monthly-rank-row.tsx"),
  "utf8",
);
const badgeSrc = readFileSync(join(here, "../components/monthly-top-100-badge.tsx"), "utf8");

function publicKeyStatsBlock(): string {
  const idx = publicProfileSrc.indexOf('data-testid="public-profile-key-stats"');
  assert.ok(idx >= 0, "missing public-profile-key-stats");
  return publicProfileSrc.slice(idx, idx + 900);
}

function publicActionsBlock(): string {
  const idx = publicProfileSrc.indexOf('data-testid="artist-profile-actions"');
  assert.ok(idx >= 0, "missing artist-profile-actions");
  return publicProfileSrc.slice(Math.max(0, idx - 120), idx + 1400);
}

function publicStatsToRepSlice(): string {
  const statsIdx = publicProfileSrc.indexOf('data-testid="public-profile-key-stats"');
  const repIdx = publicProfileSrc.indexOf('data-testid="public-profile-rep"');
  assert.ok(statsIdx >= 0 && repIdx > statsIdx, "stats→rep order");
  return publicProfileSrc.slice(statsIdx, repIdx);
}

describe("PROFILE-REFINEMENT-C3B — public stat strip white chrome (preserved)", () => {
  it("public stat icons use white", () => {
    assert.match(publicProfileSrc, /PUBLIC_KEY_STAT_ICON_CLASS/);
    assert.match(publicProfileSrc, /text-white drop-shadow-\[0_1px_2px_rgba\(0,0,0,0\.35\)\]/);
    assert.doesNotMatch(publicKeyStatsBlock(), /tone="text-(green|pink|cyan|amber|gray)-/);
  });

  it("public stat values use white", () => {
    assert.match(publicProfileSrc, /PUBLIC_KEY_STAT_VALUE_CLASS/);
    assert.match(
      publicProfileSrc,
      /text-base font-bold tabular-nums leading-none text-white drop-shadow/,
    );
  });

  it("stat labels remain muted", () => {
    assert.match(publicProfileSrc, /PUBLIC_KEY_STAT_LABEL_CLASS/);
    assert.match(publicProfileSrc, /text-\[10px\] leading-tight text-gray-300\/90/);
  });

  it("Artist IDs remains in public Community stat strip; Artist verified keeps four core stats", () => {
    const block = publicKeyStatsBlock();
    assert.match(block, /label="Posts"/);
    assert.match(block, /label="IDs"/);
    assert.match(block, /label="Likes"/);
    assert.match(block, /label="Comments"/);
    assert.match(block, /label="Artist IDs"/);
    assert.match(block, /!isVerifiedArtist \? \(/);
    assert.match(publicProfileSrc, /isVerifiedArtist \? "grid-cols-4" : "grid-cols-5"/);
    assert.doesNotMatch(block, /label="Rep"/);
  });
});

describe("PROFILE-REFINEMENT-C3C — Best rank in header; body restored", () => {
  it("standalone public Best Monthly Rank row is gone", () => {
    assert.doesNotMatch(publicProfileSrc, /BestMonthlyRankRow/);
    assert.doesNotMatch(publicStatsToRepSlice(), /BestMonthlyRank|public-best-monthly-rank/);
    assert.doesNotMatch(publicProfileSrc, /border-t border-white\/5/);
  });

  it("Best rank appears in header action area when available", () => {
    const block = publicActionsBlock();
    assert.match(block, /BestMonthlyRankHeaderChip/);
    assert.match(block, /showBestMonthlyRankHeader/);
    assert.match(block, /rank=\{profile\.bestMonthlyRank\}/);
    assert.match(block, /month=\{profile\.bestMonthlyRankMonth\}/);
    assert.match(bestMonthlyChipSrc, /BestMonthlyRankHeaderChip/);
    assert.match(bestMonthlyChipSrc, /formatBestMonthlyRankHeaderLabel/);
    assert.equal(formatBestMonthlyRankHeaderLabel(3), "Top Rank #3");
    assert.equal(formatBestMonthlyRankValue(3), "#3");
    assert.equal(formatBestMonthlyRankMonth("2026-08"), "Aug ’26");
  });

  it("null rank → header rank item omitted (no — in action row)", () => {
    assert.equal(formatBestMonthlyRankHeaderLabel(null), null);
    assert.equal(formatBestMonthlyRankHeaderLabel(undefined), null);
    assert.equal(formatBestMonthlyRankHeaderLabel(0), null);
    assert.match(bestMonthlyChipSrc, /if \(label == null\) return null/);
    assert.match(publicProfileSrc, /showBestMonthlyRankHeader \?/);
    assert.doesNotMatch(publicActionsBlock(), /formatBestMonthlyRankValue/);
    // Own Profile still shows explicit Best Monthly Rank in Your Activity
    assert.match(userProfileSrc, /label: "Best Monthly Rank"/);
    assert.match(userProfileSrc, /formatBestMonthlyRankValue/);
  });

  it("Fav Genre + Share remain in same row; Best rank joins that action area", () => {
    const block = publicActionsBlock();
    assert.match(block, /data-testid="artist-profile-actions"/);
    assert.match(block, /flex flex-wrap items-end gap-2/);
    assert.match(block, /data-testid="public-profile-fav-genre"/);
    assert.match(block, /ArtistProfileShareButton/);
    assert.match(block, /BestMonthlyRankHeaderChip/);
    const genreIdx = block.indexOf("public-profile-fav-genre");
    const shareIdx = block.indexOf("ArtistProfileShareButton");
    const bestIdx = block.indexOf("BestMonthlyRankHeaderChip");
    assert.ok(genreIdx > 0 && shareIdx > genreIdx && bestIdx > shareIdx);
  });

  it("divider below stats removed; Rep returns to previous spacing/position", () => {
    const slice = publicStatsToRepSlice();
    assert.doesNotMatch(slice, /border-t|BestMonthlyRank|mt-1 border/);
    assert.match(publicProfileSrc, /Equal vertical rhythm: stats → rep → releases/);
    assert.match(publicProfileSrc, /PUBLIC_PROFILE_SECTION_GAP_CLASS = "flex flex-col gap-5"/);
    assert.match(publicProfileSrc, /data-testid="public-profile-rep"/);
    assert.match(publicProfileSrc, /ProfileRepOverview/);
    assert.match(publicProfileSrc, /percentileVariant="public"/);
    assert.match(publicProfileSrc, /compact/);
  });

  it("Share / Fav Genre chrome + lighter Best pill", () => {
    assert.match(shareButtonSrc, /min-h-\[1\.625rem\]/);
    assert.match(shareButtonSrc, /border-white\/15 bg-black\/40/);
    assert.match(publicActionsBlock(), /variant="onDark"/);
    assert.match(publicProfileSrc, /getGenreGlowPillStyle\(genreChip\.bgColor/);
    assert.match(bestMonthlyChipSrc, /PUBLIC_BEST_MONTHLY_RANK_PILL_CLASS/);
    assert.match(bestMonthlyChipSrc, /bg-white\/5/);
    assert.match(bestMonthlyChipSrc, /ring-white\/10/);
    assert.doesNotMatch(bestMonthlyChipSrc, /#FFD700|GoldVerified|text-yellow/);
  });
});

describe("PROFILE-REFINEMENT-C3C — Artist / Community parity + Top 100 badge", () => {
  it("Community + Artist share the same header-action / white-stat paths", () => {
    assert.match(publicProfileSrc, /showArtistProfileActions/);
    assert.match(
      publicProfileSrc,
      /canShareProfile \|\|[\s\S]*showArtistReleaseAlerts \|\|[\s\S]*showFavGenrePill \|\|[\s\S]*showBestMonthlyRankHeader/,
    );
    assert.match(publicProfileSrc, /BestMonthlyRankHeaderChip/);
    assert.match(publicProfileSrc, /PUBLIC_KEY_STAT_ICON_CLASS/);
    assert.match(publicProfileSrc, /!isVerifiedArtist \?[\s\S]*label="Artist IDs"/);
  });

  it("Monthly Top 100 badge unchanged and distinct from Best rank", () => {
    assert.match(publicProfileSrc, /MonthlyTop100Badge/);
    assert.match(publicProfileSrc, /earned=\{profile\.hasMonthlyTop100 === true\}/);
    assert.match(badgeSrc, /HundredClubMark|MONTHLY_TOP_100_BADGE_PROFILE_CLASS|MONTHLY_TOP_100_BADGE_BASE_CLASS/);
    assert.doesNotMatch(badgeSrc, /#FFD700|GoldVerified/);
    assert.match(publicProfileSrc, /UserRoleInlineIcons/);
    // Not merged into Top 100 badge
    assert.doesNotMatch(badgeSrc, /BestMonthlyRank|bestMonthlyRank|formatBestMonthlyRank/);
    assert.match(bestMonthlyChipSrc, /Top Rank|formatBestMonthlyRankHeaderLabel/);
  });
});
