import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BEST_MONTHLY_RANK_POPOVER_TITLE,
  formatBestMonthlyRankHeaderLabel,
  formatBestMonthlyRankMonth,
  hasEarnedMonthlyTop100,
  HUNDRED_CLUB_MARK_VIEWBOX,
  monthlyTop100BadgeLabel,
  monthlyTop100MarkSize,
  MONTHLY_TOP_100_ACHIEVEMENT_A11Y_LABEL,
  MONTHLY_TOP_100_BADGE_BASE_CLASS,
  MONTHLY_TOP_100_BADGE_LABEL_CLASS,
  MONTHLY_TOP_100_BADGE_LEADERBOARD_CLASS,
  MONTHLY_TOP_100_BADGE_POPUP_CLASS,
  MONTHLY_TOP_100_BADGE_PROFILE_CLASS,
} from "./monthly-top-100-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const badgeSrc = readFileSync(join(here, "../components/monthly-top-100-badge.tsx"), "utf8");
const markSrc = readFileSync(join(here, "../components/hundred-club-mark.tsx"), "utf8");
const bestMonthlyChipSrc = readFileSync(
  join(here, "../components/best-monthly-rank-row.tsx"),
  "utf8",
);
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const presentationSrc = readFileSync(join(here, "monthly-top-100-presentation.ts"), "utf8");

function leaderboardEntryRowSlice(): string {
  const rowFn = leaderboardSrc.indexOf("export function LeaderboardEntryRow");
  assert.ok(rowFn >= 0);
  return leaderboardSrc.slice(rowFn, rowFn + 5500);
}

describe("100 Club achievement polish — pill + label", () => {
  it("achievement still renders as icon + Club on supported surfaces", () => {
    assert.equal(monthlyTop100BadgeLabel("profile"), "Club");
    assert.equal(monthlyTop100BadgeLabel("popup"), "Club");
    assert.equal(monthlyTop100BadgeLabel("leaderboard"), "Club");
    assert.match(badgeSrc, /<HundredClubMark/);
    assert.match(badgeSrc, /MONTHLY_TOP_100_BADGE_LABEL_CLASS/);
    assert.match(userProfileSrc, /context="profile"/);
    assert.match(publicProfileSrc, /context="profile"/);
    assert.match(popupSrc, /context="popup"/);
    assert.match(leaderboardSrc, /context="leaderboard"/);
  });

  it("styling/variant helpers resolve premium ice-glass chrome", () => {
    assert.match(MONTHLY_TOP_100_BADGE_BASE_CLASS, /border-white\/35/);
    assert.match(MONTHLY_TOP_100_BADGE_BASE_CLASS, /from-white\/\[0\.16\]/);
    assert.match(MONTHLY_TOP_100_BADGE_BASE_CLASS, /inset_0_1px_0/);
    assert.match(MONTHLY_TOP_100_BADGE_BASE_CLASS, /justify-center/);
    assert.doesNotMatch(MONTHLY_TOP_100_BADGE_BASE_CLASS, /#FFD700|0a83ff|bg-black\/30/);
    assert.match(MONTHLY_TOP_100_BADGE_PROFILE_CLASS, /pr-\[9px\]/);
    assert.match(MONTHLY_TOP_100_BADGE_POPUP_CLASS, /text-\[10px\]/);
    assert.match(MONTHLY_TOP_100_BADGE_LEADERBOARD_CLASS, /border-white\/35|from-white/);
    assert.match(MONTHLY_TOP_100_BADGE_LABEL_CLASS, /translate-y-\[0\.5px\]/);
    assert.equal(monthlyTop100MarkSize("profile"), "md");
    assert.equal(monthlyTop100MarkSize("popup"), "sm");
    assert.equal(monthlyTop100MarkSize("leaderboard"), "micro");
  });

  it("accessible label + unearned null unchanged", () => {
    assert.equal(
      MONTHLY_TOP_100_ACHIEVEMENT_A11Y_LABEL,
      "100 Club — monthly Top 100 achievement",
    );
    assert.equal(hasEarnedMonthlyTop100(false), false);
    assert.match(badgeSrc, /if \(!hasEarnedMonthlyTop100\(earned\)\) return null/);
  });

  it("icon polish keeps silhouette; adds glimmer + brighter rim", () => {
    assert.equal(HUNDRED_CLUB_MARK_VIEWBOX, "0 0 56 32");
    assert.match(markSrc, /cx=\{23\}/);
    assert.match(markSrc, /cx=\{39\.5\}/);
    assert.match(markSrc, /glimmer/);
    assert.match(markSrc, /stroke="#f2f5fa"/);
    assert.match(markSrc, /fill="#ffffff"/);
    assert.doesNotMatch(markSrc, /crown|shield|star|FFD700/i);
  });
});

describe("100 Club achievement polish — placement preserved", () => {
  it("leaderboard pill still appears in the same identity-cluster position", () => {
    const row = leaderboardEntryRowSlice();
    const iconsIdx = row.indexOf("<UserRoleInlineIcons");
    const badgeIdx = row.indexOf("<MonthlyTop100Badge");
    const youIdx = row.indexOf("LEADERBOARD_YOU_PILL_CLASS");
    assert.ok(iconsIdx > 0 && badgeIdx > iconsIdx && youIdx > badgeIdx);
    assert.match(row, /overflow-hidden[\s\S]*UserRoleInlineIcons[\s\S]*MonthlyTop100Badge[\s\S]*<\/button>/);
  });

  it("popup behaviour remains valid", () => {
    assert.match(popupSrc, /MonthlyTop100Badge/);
    assert.match(popupSrc, /earned=\{user\.hasMonthlyTop100 === true\}/);
    assert.equal(monthlyTop100BadgeLabel("popup"), "Club");
    assert.doesNotMatch(popupSrc, /Best Monthly Rank|Top Rank|bestMonthlyRankMonth/);
  });

  it("no regressions to Top Rank pill", () => {
    assert.equal(formatBestMonthlyRankHeaderLabel(3), "Top Rank #3");
    assert.equal(BEST_MONTHLY_RANK_POPOVER_TITLE, "Best monthly finish");
    assert.equal(formatBestMonthlyRankMonth("2026-09"), "Sep ’26");
    assert.match(bestMonthlyChipSrc, /BestMonthlyRankHeaderChip/);
    assert.match(bestMonthlyChipSrc, /<Popover/);
    assert.match(publicProfileSrc, /BestMonthlyRankHeaderChip/);
    assert.doesNotMatch(badgeSrc, /BestMonthlyRank|Top Rank|formatBestMonthlyRank/);
    assert.doesNotMatch(presentationSrc, /#FFD700|0a83ff/);
  });
});
