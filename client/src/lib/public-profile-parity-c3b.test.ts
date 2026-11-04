import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BEST_MONTHLY_RANK_HELP,
  BEST_MONTHLY_RANK_POPOVER_TITLE,
  formatBestMonthlyRankHeaderLabel,
  formatBestMonthlyRankMonth,
  formatBestMonthlyRankPopoverDetail,
  formatBestMonthlyRankValue,
} from "./monthly-top-100-presentation";
import { APP_MATERIAL_TOAST_SURFACE_CLASS } from "./app-material";

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

function publicAchievementsBlock(): string {
  const idx = publicProfileSrc.indexOf('data-testid="public-profile-achievements"');
  assert.ok(idx >= 0, "missing public-profile-achievements");
  return publicProfileSrc.slice(Math.max(0, idx - 500), idx + 700);
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
    assert.match(
      publicProfileSrc,
      /text-\[10px\] leading-tight text-muted-foreground dark:text-gray-300\/90/,
    );
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

  it("Best rank sits in the achievement row, not the action row", () => {
    const achievements = publicAchievementsBlock();
    assert.match(achievements, /MonthlyTop100Badge/);
    assert.match(achievements, /BestMonthlyRankHeaderChip/);
    assert.match(achievements, /showBestMonthlyRankHeader/);
    assert.match(achievements, /rank=\{profile\.bestMonthlyRank\}/);
    assert.match(achievements, /month=\{profile\.bestMonthlyRankMonth\}/);
    assert.match(achievements, /flex max-w-full flex-wrap items-center gap-1\.5/);
    assert.doesNotMatch(publicActionsBlock(), /BestMonthlyRankHeaderChip/);
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
    assert.match(bestMonthlyChipSrc, /if \(label == null \|\| detail == null\) return null/);
    assert.match(publicProfileSrc, /showBestMonthlyRankHeader \?/);
    assert.doesNotMatch(publicActionsBlock(), /formatBestMonthlyRankValue/);
    // Own Profile still shows explicit Best Monthly Rank in Your Activity
    assert.match(userProfileSrc, /label: "Best Monthly Rank"/);
    assert.match(userProfileSrc, /formatBestMonthlyRankValue/);
  });

  it("Fav Genre + Share + Release Alerts share the action row", () => {
    const block = publicActionsBlock();
    assert.match(block, /data-testid="artist-profile-actions"/);
    assert.match(block, /flex flex-wrap items-end gap-2/);
    assert.match(block, /data-testid="public-profile-fav-genre"/);
    assert.match(block, /ArtistProfileShareButton/);
    assert.match(block, /ArtistReleaseAlertsButton/);
    assert.doesNotMatch(block, /BestMonthlyRankHeaderChip/);
    const genreIdx = block.indexOf("public-profile-fav-genre");
    const shareIdx = block.indexOf("ArtistProfileShareButton");
    const alertsIdx = block.indexOf("ArtistReleaseAlertsButton");
    assert.ok(genreIdx > 0 && shareIdx > genreIdx && alertsIdx > shareIdx);
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

  it("Release Alerts stays content-sized inside the wrapping action row", () => {
    const alertsSrc = readFileSync(
      join(here, "../components/artist-release-alerts-button.tsx"),
      "utf8",
    );
    assert.match(publicProfileSrc, /flex flex-wrap items-end gap-2/);
    assert.match(publicProfileSrc, /<ArtistReleaseAlertsButton artistId=\{profileId\} \/>/);
    assert.doesNotMatch(
      publicProfileSrc,
      /ArtistReleaseAlertsButton artistId=\{profileId\} className="min-w-0 flex-1"/,
    );
    const classLine = alertsSrc.match(/const RELEASE_ALERTS_BUTTON_CLASS =\n  "([^"]+)"/);
    assert.ok(classLine);
    assert.equal(classLine[1].includes("w-full"), false);
    assert.match(alertsSrc, /whitespace-nowrap/);
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
      /canShareProfile \|\|[\s\S]*showArtistReleaseAlerts \|\|[\s\S]*showFavGenrePill;/,
    );
    assert.match(publicProfileSrc, /data-testid="public-profile-achievements"/);
    assert.doesNotMatch(publicActionsBlock(), /BestMonthlyRankHeaderChip/);
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

describe("public profile achievement row — Top Rank beside 100 Club", () => {
  it("100 Club + Top Rank share the achievement row", () => {
    const block = publicAchievementsBlock();
    const clubIdx = block.indexOf("MonthlyTop100Badge");
    const rankIdx = block.indexOf("BestMonthlyRankHeaderChip");
    assert.ok(clubIdx > 0 && rankIdx > clubIdx);
    assert.match(block, /profile\.hasMonthlyTop100 === true \|\| showBestMonthlyRankHeader|showPublicAchievements/);
    assert.match(publicProfileSrc, /showPublicAchievements/);
  });

  it("Top Rank only still occupies that row; 100 Club only stays; neither skips the row", () => {
    assert.match(
      publicProfileSrc,
      /profile\.hasMonthlyTop100 === true \|\| showBestMonthlyRankHeader/,
    );
    assert.match(publicProfileSrc, /\{showPublicAchievements \? \(/);
    assert.match(badgeSrc, /if \(!hasEarnedMonthlyTop100\(earned\)\) return null/);
    assert.match(bestMonthlyChipSrc, /if \(label == null \|\| detail == null\) return null/);
    assert.doesNotMatch(publicActionsBlock(), /BestMonthlyRank|public-best-monthly-rank/);
  });

  it("Release Alerts returns beside Share without the shrink-to-zero setup", () => {
    const block = publicActionsBlock();
    const shareIdx = block.indexOf("ArtistProfileShareButton");
    const alertsIdx = block.indexOf("ArtistReleaseAlertsButton");
    assert.ok(shareIdx > 0 && alertsIdx > shareIdx);
    assert.doesNotMatch(block, /min-w-0 flex-1/);
    assert.match(publicProfileSrc, /<ArtistReleaseAlertsButton artistId=\{profileId\} \/>/);
  });

  it("Top Rank popover uses the shared info surface and short finish copy", () => {
    assert.equal(APP_MATERIAL_TOAST_SURFACE_CLASS, "dubhub-app-toast-surface");
    assert.match(bestMonthlyChipSrc, /APP_MATERIAL_TOAST_SURFACE_CLASS/);
    assert.match(
      bestMonthlyChipSrc,
      /border-transparent bg-transparent p-3 text-sm leading-relaxed text-muted-foreground shadow-none/,
    );
    assert.doesNotMatch(bestMonthlyChipSrc, /bg-black\/90|border-white\/15/);
    assert.equal(BEST_MONTHLY_RANK_POPOVER_TITLE, "Best monthly finish");
    assert.match(bestMonthlyChipSrc, /BEST_MONTHLY_RANK_POPOVER_TITLE/);
    assert.doesNotMatch(bestMonthlyChipSrc, /BEST_MONTHLY_RANK_HELP/);
    assert.equal(formatBestMonthlyRankPopoverDetail(1, "2026-08"), "#1 · Aug ’26");
    assert.equal(formatBestMonthlyRankPopoverDetail(2, "2026-09"), "#2 · Sep ’26");
    assert.equal(formatBestMonthlyRankPopoverDetail(7, "2026-03"), "#7 · Mar ’26");
    assert.equal(formatBestMonthlyRankPopoverDetail(2, null), "#2");
    assert.equal(formatBestMonthlyRankPopoverDetail(2, undefined), "#2");
    assert.equal(formatBestMonthlyRankPopoverDetail(2, ""), "#2");
    assert.equal(formatBestMonthlyRankPopoverDetail(null, "2026-09"), null);
    assert.match(userProfileSrc, /bestMonthlyRank: BEST_MONTHLY_RANK_HELP/);
    assert.equal(
      BEST_MONTHLY_RANK_HELP,
      "Your best final place on a completed monthly leaderboard. The current month does not count until it finishes.",
    );
  });
});
