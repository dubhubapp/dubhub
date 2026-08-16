import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deriveTrustLevel } from "@shared/trust-level";
import { GENRE_ENTRIES, getGenreChipStyle } from "@/lib/genre-styles";
import {
  LEADERBOARD_LIST_CLASS,
  LEADERBOARD_PRIMARY_INDICATOR_CLASS,
  LEADERBOARD_PRIMARY_ROW_CLASS,
  LEADERBOARD_PRIZE_SECTION_CLASS,
  LEADERBOARD_REP_FILL_CLASS,
  LEADERBOARD_REP_MIN_WIDTH_PX,
  LEADERBOARD_REP_TRACK_CLASS,
  LEADERBOARD_REP_VISIBLE_FLOOR_PCT,
  LEADERBOARD_ROW_BASE_CLASS,
  LEADERBOARD_ROW_CURRENT_CLASS,
  LEADERBOARD_SCORE_COLUMN_CLASS,
  LEADERBOARD_SECONDARY_ROW_CLASS,
  LEADERBOARD_STICKY_CHROME_CLASS,
  LEADERBOARD_TIME_FILTERS,
  LEADERBOARD_TOP_LIMIT,
  leaderboardArtistsMyRankQueryKey,
  leaderboardArtistsQueryKey,
  leaderboardRepProgressAriaValueText,
  leaderboardUsersMyRankQueryKey,
  leaderboardUsersQueryKey,
  leaderboardVisibleProgressPct,
} from "@/lib/leaderboard-presentation";
import {
  repProgressPremiumGradientFromGenreBg,
  whiteRepProgressGradient,
} from "@/lib/profile-rep-styles";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");

describe("Leaderboard presentation — primary / secondary nav", () => {
  it("exposes Community and Artists as primary scope tabs", () => {
    assert.match(leaderboardSrc, /data-testid="tab-users"/);
    assert.match(leaderboardSrc, /data-testid="tab-artists"/);
    assert.match(leaderboardSrc, />\s*Community\s*</);
    assert.match(leaderboardSrc, />\s*Artists\s*</);
    assert.match(leaderboardSrc, /LEADERBOARD_PRIMARY_ROW_CLASS/);
    assert.match(leaderboardSrc, /LEADERBOARD_PRIMARY_INDICATOR_CLASS/);
    assert.equal(LEADERBOARD_PRIMARY_ROW_CLASS.includes("flex"), true);
    assert.match(LEADERBOARD_PRIMARY_INDICATOR_CLASS, /after:bg-accent/);
  });

  it("replaces timeframe dropdown with This Month / This Year / All Time tabs", () => {
    assert.deepEqual(
      LEADERBOARD_TIME_FILTERS.map((f) => f.value),
      ["month", "year", "all"],
    );
    assert.deepEqual(
      LEADERBOARD_TIME_FILTERS.map((f) => f.label),
      ["This Month", "This Year", "All Time"],
    );
    assert.deepEqual(
      LEADERBOARD_TIME_FILTERS.map((f) => f.testId),
      ["filter-month", "filter-year", "filter-all"],
    );
    assert.match(leaderboardSrc, /LEADERBOARD_TIME_FILTERS\.map/);
    assert.match(leaderboardSrc, /data-testid=\{filter\.testId\}/);
    assert.match(leaderboardSrc, /aria-selected=\{timeFilter === filter\.value\}/);
    assert.doesNotMatch(leaderboardSrc, /SelectTrigger|SelectContent|SelectItem/);
    assert.match(leaderboardSrc, /LEADERBOARD_SECONDARY_ROW_CLASS/);
    assert.match(LEADERBOARD_SECONDARY_ROW_CLASS, /min-h-11/);
  });

  it("keeps scope change on a single handler suitable for a later gesture slice", () => {
    assert.match(leaderboardSrc, /handleLeaderboardTabChange|setLeaderboardScope/);
    assert.match(leaderboardSrc, /onValueChange=\{handleLeaderboardTabChange\}/);
    // Gesture implementation lives in leaderboard-scope-swipe.ts — page must not embed Embla.
    assert.doesNotMatch(leaderboardSrc, /useEmblaCarousel|embla-carousel/i);
  });
});

describe("Leaderboard presentation — sticky chrome + prize", () => {
  it("uses Releases-like sticky chrome without a giant enclosing card", () => {
    assert.match(leaderboardSrc, /LEADERBOARD_STICKY_CHROME_CLASS/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /sticky top-0/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /safe-area-inset-top/);
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /rounded-2xl/);
    assert.doesNotMatch(leaderboardSrc, /rounded-2xl border border-white\/10 bg-black\/35/);
  });

  it("keeps Community and Artists prize copy + themes", () => {
    assert.match(leaderboardSrc, /2 x VIP Music Festival Tickets/);
    assert.match(leaderboardSrc, /4 hours studio time/);
    assert.match(leaderboardSrc, /Presented by Music Festival/);
    assert.match(leaderboardSrc, /Presented by Industry Partner/);
    assert.match(leaderboardSrc, /Top ranked community member this month/);
    assert.match(leaderboardSrc, /Top ranked artist this month/);
    assert.match(leaderboardSrc, /rewards-banner/);
    assert.match(leaderboardSrc, /border-amber-500\/30/);
    assert.match(leaderboardSrc, /border-purple-500\/30/);
  });

  it("gives the prize a little extra top room so the glow clears the sticky fade", () => {
    assert.match(leaderboardSrc, /LEADERBOARD_PRIZE_SECTION_CLASS/);
    assert.match(LEADERBOARD_PRIZE_SECTION_CLASS, /mt-3/);
    assert.match(LEADERBOARD_PRIZE_SECTION_CLASS, /mb-4/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /shadow-/);
    assert.match(leaderboardSrc, /glowShadow/);
  });

  it("does not make the prize sticky", () => {
    const stickyOpen = leaderboardSrc.indexOf("<div className={LEADERBOARD_STICKY_CHROME_CLASS}>");
    assert.notEqual(stickyOpen, -1);
    const stickyClose = leaderboardSrc.indexOf("</div>", stickyOpen);
    const stickyMarkup = leaderboardSrc.slice(stickyOpen, stickyClose);
    assert.doesNotMatch(stickyMarkup, /RewardsBanner|rewards-banner|MONTHLY_REWARDS/);
    assert.match(stickyMarkup, /leaderboard-tabs/);
    assert.match(stickyMarkup, /time-filters/);
  });
});

describe("Leaderboard presentation — rows + identity", () => {
  it("uses divider rows instead of per-entry card containers", () => {
    assert.equal(LEADERBOARD_LIST_CLASS, "divide-y divide-white/10");
    assert.match(leaderboardSrc, /LEADERBOARD_ROW_BASE_CLASS/);
    assert.doesNotMatch(LEADERBOARD_ROW_BASE_CLASS, /rounded-xl|border|bg-black\/25|backdrop-blur/);
    assert.doesNotMatch(leaderboardSrc, /bg-black\/25 backdrop-blur-md border-white\/10/);
  });

  it("preserves top-three medal icons", () => {
    assert.match(leaderboardSrc, /rank === 1.*Trophy|Trophy.*rank === 1/s);
    assert.match(leaderboardSrc, /rank === 2.*Medal|Medal.*rank === 2/s);
    assert.match(leaderboardSrc, /rank === 3.*Award|Award.*rank === 3/s);
    assert.match(leaderboardSrc, /text-yellow-500/);
    assert.match(leaderboardSrc, /text-gray-400/);
    assert.match(leaderboardSrc, /text-amber-600/);
  });

  it("preserves You chip + restrained current-user tint", () => {
    assert.match(leaderboardSrc, /You/);
    assert.match(leaderboardSrc, /highlightAsCurrent && \(\s*<span[\s\S]*?You[\s\S]*?<\/span>/);
    assert.match(leaderboardSrc, /LEADERBOARD_ROW_CURRENT_CLASS/);
    assert.match(LEADERBOARD_ROW_CURRENT_CLASS, /bg-primary\/\[0\.08\]/);
    assert.doesNotMatch(LEADERBOARD_ROW_CURRENT_CLASS, /border-primary\/60/);
  });

  it("preserves verified artist gold username colour", () => {
    assert.match(leaderboardSrc, /text-\[#FFD700\]/);
    assert.match(leaderboardSrc, /verified_artist === true/);
  });
});

describe("Leaderboard query keys + domain freeze", () => {
  it("keeps historical query key shapes", () => {
    assert.deepEqual(leaderboardUsersQueryKey("month"), ["/api/leaderboard/users", "month"]);
    assert.deepEqual(leaderboardArtistsQueryKey("year"), ["/api/leaderboard/artists", "year"]);
    assert.deepEqual(leaderboardUsersMyRankQueryKey("u1", "all"), [
      "/api/leaderboard/users/my-rank",
      "u1",
      "all",
    ]);
    assert.deepEqual(leaderboardArtistsMyRankQueryKey("u1", "month"), [
      "/api/leaderboard/artists/my-rank",
      "u1",
      "month",
    ]);
    assert.equal(LEADERBOARD_TOP_LIMIT, 100);
  });

  it("does not touch ranking SQL / karma / swipe / releases", () => {
    assert.doesNotMatch(leaderboardSrc, /getLeaderboard|ROW_NUMBER|rank_score/);
    assert.doesNotMatch(leaderboardSrc, /release-tracker|ArtworkReleaseBrowser/);
  });
});

describe("Leaderboard reputation bar — semantics + premium treatment", () => {
  it("preserves deriveTrustLevel progress values and visual floor", () => {
    const zero = deriveTrustLevel(0);
    assert.equal(zero.progressPct, 0);
    assert.equal(leaderboardVisibleProgressPct(zero.progressPct), 0);

    const partial = deriveTrustLevel(10);
    assert.equal(partial.progressPct, 50);
    assert.equal(leaderboardVisibleProgressPct(partial.progressPct), 50);

    const tiny = 5;
    assert.equal(leaderboardVisibleProgressPct(tiny), LEADERBOARD_REP_VISIBLE_FLOOR_PCT);
    assert.equal(LEADERBOARD_REP_MIN_WIDTH_PX, 18);

    const boundary = deriveTrustLevel(20);
    assert.equal(boundary.displayName, "Trusted");
    assert.equal(boundary.progressPct, 0);
    assert.equal(leaderboardVisibleProgressPct(boundary.progressPct), 0);

    const top = deriveTrustLevel(300);
    assert.equal(top.isTopTier, true);
    assert.equal(top.progressPct, 100);
    assert.equal(leaderboardVisibleProgressPct(top.progressPct), 100);
  });

  it("builds accessible valuetext from actual tier labels", () => {
    const mid = deriveTrustLevel(10);
    assert.equal(
      leaderboardRepProgressAriaValueText(mid),
      "50% progress toward Trusted",
    );
    const selecta = deriveTrustLevel(250);
    assert.equal(
      leaderboardRepProgressAriaValueText(selecta),
      "50% progress within Selecta",
    );
    assert.match(leaderboardSrc, /role="progressbar"/);
    assert.match(leaderboardSrc, /aria-valuenow/);
    assert.match(leaderboardSrc, /aria-valuetext/);
  });

  it("uses favourite-genre colours via getGenreChipStyle + premium gradient (no neon glow)", () => {
    assert.match(leaderboardSrc, /getGenreChipStyle/);
    assert.match(leaderboardSrc, /repProgressPremiumGradientFromGenreBg/);
    assert.doesNotMatch(leaderboardSrc, /genreGlowShadow|repGenreGlowShadow|saturate\(1\.32\)/);
    assert.match(LEADERBOARD_REP_TRACK_CLASS, /h-2(?!\.5)/);
    assert.match(LEADERBOARD_REP_TRACK_CLASS, /bg-white\/\[0\.07\]/);
    assert.match(LEADERBOARD_REP_TRACK_CLASS, /ring-white\/\[0\.04\]/);
    assert.match(LEADERBOARD_REP_FILL_CLASS, /inset_0_1px_0_rgba\(255,255,255,0\.28\)/);

    for (const genre of GENRE_ENTRIES) {
      const style = getGenreChipStyle(genre.id);
      assert.equal(style.bgColor, genre.bgColor);
      const fill = repProgressPremiumGradientFromGenreBg(style.bgColor);
      assert.match(fill, /^linear-gradient\(90deg,/);
      assert.match(fill, new RegExp(genre.bgColor.replace("#", "\\#"), "i"));
      // Four tonal stops (dark → canonical → soft → leading edge).
      assert.equal((fill.match(/%/g) || []).length >= 4, true);
    }
    assert.match(whiteRepProgressGradient(), /^linear-gradient/);
  });

  it("does not render redundant You're #N rank-context copy", () => {
    assert.doesNotMatch(leaderboardSrc, /leaderboard-rank-context|You're #|resolveLeaderboardRankContext/);
  });

  it("shows visible metric label IDs (not CORRECT IDS / Correct IDs)", () => {
    assert.match(leaderboardSrc, />\s*IDs\s*</);
    assert.doesNotMatch(leaderboardSrc, />\s*Correct IDs\s*</);
    assert.doesNotMatch(leaderboardSrc, /uppercase tracking-wide text-muted-foreground">\s*IDs/);
    assert.match(leaderboardSrc, /entry\.correct_ids/);
    assert.match(LEADERBOARD_SCORE_COLUMN_CLASS, /w-\[68px\]/);
  });
});
