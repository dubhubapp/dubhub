import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARD_TOP_RANK_METAL,
  isLeaderboardTopRank,
} from "@/components/leaderboard-top-rank-mark";
import { LEADERBOARD_ROW_BASE_CLASS } from "@/lib/leaderboard-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const markSrc = readFileSync(
  join(here, "../components/leaderboard-top-rank-mark.tsx"),
  "utf8",
);

describe("LeaderboardTopRankMark — geometry + metal", () => {
  it("uses one shared circular coin geometry for all three tiers", () => {
    assert.match(markSrc, /viewBox="0 0 28 28"/);
    assert.match(markSrc, /r="13"/); // outer rim
    assert.match(markSrc, /r="11\.15"/); // face
    assert.match(markSrc, /LEADERBOARD_TOP_RANK_METAL\[rank\]/);
    // Single silhouette family — no trophy/ribbon/crown paths.
    assert.doesNotMatch(markSrc, /trophy|ribbon|crown|lucide/i);
  });

  it("exports restrained gold / silver / bronze hex metals (not Tailwind yellow/gray/amber)", () => {
    assert.equal(LEADERBOARD_TOP_RANK_METAL[1].face, "#C4A24A");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[1].rim, "#7A5C1C");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[1].numeral, "#6E5418");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[1].numeralEmboss, "#D8BC6A");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[2].face, "#A8B2C0");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[2].rim, "#5A6470");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[2].numeral, "#4E5864");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[2].numeralEmboss, "#C8D0DA");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[3].face, "#A8784A");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[3].rim, "#6A4228");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[3].numeral, "#5A351C");
    assert.equal(LEADERBOARD_TOP_RANK_METAL[3].numeralEmboss, "#C4925E");
    assert.doesNotMatch(markSrc, /text-yellow-500|text-gray-400|text-amber-600/);
    // No bright-white / sticker numerals.
    assert.doesNotMatch(markSrc, /#FFF4D4|#F5F7FA|#F3DFC6|#FFFFFF|#fff\b/i);
  });

  it("uses mono/semibold embossed text numerals (aligned with #4+ rank type)", () => {
    assert.match(markSrc, /NUMERAL_FONT_FAMILY/);
    assert.match(markSrc, /ui-monospace/);
    assert.match(markSrc, /NUMERAL_FONT_WEIGHT = 600/);
    assert.match(markSrc, /NUMERAL_FONT_SIZE = 13/);
    assert.match(markSrc, /fill=\{metal\.numeral\}/);
    assert.match(markSrc, /fill=\{metal\.numeralEmboss\}/);
    assert.match(markSrc, /transform="translate\(-0\.55 -0\.55\)"/);
    assert.match(markSrc, /\{rank\}/);
    // Old quirky stroke-path numerals removed.
    assert.doesNotMatch(markSrc, /NUMERAL_PATH|NUMERAL_STROKE_WIDTH/);
    assert.doesNotMatch(markSrc, /strokeLinecap="round"/);
  });

  it("targets 28px visible size (h-7 w-7) inside w-10 slot", () => {
    assert.match(markSrc, /const SIZE_PX = 28/);
    assert.match(markSrc, /h-7 w-7/);
    assert.match(markSrc, /width=\{SIZE_PX\}/);
    assert.match(markSrc, /height=\{SIZE_PX\}/);
  });

  it("isLeaderboardTopRank gates only 1–3", () => {
    assert.equal(isLeaderboardTopRank(1), true);
    assert.equal(isLeaderboardTopRank(2), true);
    assert.equal(isLeaderboardTopRank(3), true);
    assert.equal(isLeaderboardTopRank(4), false);
    assert.equal(isLeaderboardTopRank(0), false);
  });
});

describe("LeaderboardTopRankMark — leaderboard integration", () => {
  it("ranks 1–3 use LeaderboardTopRankMark; 4+ stays #N mono", () => {
    assert.match(leaderboardSrc, /LeaderboardTopRankMark rank=\{rank\}/);
    assert.match(leaderboardSrc, /isLeaderboardTopRank\(rank\)/);
    assert.match(leaderboardSrc, /formatRank\(rank\)/);
    assert.match(leaderboardSrc, /font-mono text-base font-semibold text-muted-foreground/);
    assert.doesNotMatch(leaderboardSrc, /getRankIcon/);
    assert.doesNotMatch(leaderboardSrc, /\bMedal\b|\bAward\b/);
  });

  it("preserves rank testids, w-10 column, and accessible Rank N labels", () => {
    assert.match(leaderboardSrc, /data-testid=\{`rank-\$\{rank\}`\}/);
    assert.match(leaderboardSrc, /className="w-10 flex items-center justify-center"/);
    assert.match(
      leaderboardSrc,
      /aria-label=\{isLeaderboardTopRank\(rank\) \? `Rank \$\{rank\}` : undefined\}/,
    );
    assert.match(markSrc, /aria-hidden/);
  });

  it("does not change row layout geometry", () => {
    assert.equal(
      LEADERBOARD_ROW_BASE_CLASS,
      "flex items-center gap-3 px-1 py-3 transition-colors",
    );
    assert.match(leaderboardSrc, /LEADERBOARD_ROW_BASE_CLASS/);
    assert.match(leaderboardSrc, /avatar-media w-10 h-10 rounded-full/);
    assert.match(leaderboardSrc, /LEADERBOARD_SCORE_COLUMN_CLASS/);
  });

  it("Community + Artists share LeaderboardEntryRow (no per-tab fork)", () => {
    assert.match(leaderboardSrc, /export function LeaderboardEntryRow/);
    const rowUses = leaderboardSrc.match(/<LeaderboardEntryRow\b/g) ?? [];
    assert.ok(rowUses.length >= 2, "shared row used for list + outside-top paths");
    assert.doesNotMatch(leaderboardSrc, /ArtistsEntryRow|CommunityEntryRow/);
  });

  it("leaves reward-hero Trophy chip untouched", () => {
    assert.match(leaderboardSrc, /import \{ Trophy, Calendar \} from "lucide-react"/);
    assert.match(leaderboardSrc, /Trophy className="h-3 w-3 shrink-0 opacity-90"/);
    assert.match(leaderboardSrc, /data-testid="rewards-banner-prize-label"/);
  });
});
