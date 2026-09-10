import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARD_CONTENT_TOP_GAP_CLASS,
  LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
  LEADERBOARD_PRIMARY_INACTIVE_CLASS,
  LEADERBOARD_PRIZE_SECTION_CLASS,
  LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS,
  LEADERBOARD_REWARD_HERO_IMAGE_CLASS,
  LEADERBOARD_REWARD_HERO_META_CLASS,
  LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS,
  LEADERBOARD_REWARD_HERO_META_WRAP_CLASS,
  LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
  LEADERBOARD_REWARD_HERO_SENTINEL_CLASS,
  LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS,
  LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS,
  LEADERBOARD_SECONDARY_INACTIVE_CLASS,
  LEADERBOARD_STICKY_CHROME_CLASS,
  LEADERBOARD_STICKY_FADE_CLASS,
} from "@/lib/leaderboard-presentation";
import {
  getLeaderboardRewardHeroConfig,
  LEADERBOARD_REWARD_HERO_ARTISTS_COMING_SOON,
  LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON,
  LEADERBOARD_REWARD_HERO_BY_SCOPE,
  LEADERBOARD_REWARD_HERO_COMMUNITY_COMING_SOON,
  LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN,
  LEADERBOARD_REWARD_HERO_NAVY,
  leaderboardRewardHeroIsComingSoon,
  leaderboardRewardHeroShowsCountdown,
  type LeaderboardRewardHeroConfig,
} from "@/lib/leaderboard-reward-hero";
import {
  LEADERBOARD_SCOPE_COMMIT_PROGRESS,
  LEADERBOARD_SCOPE_DRAG_START_PX,
  LEADERBOARD_SCOPE_EDGE_START_PX,
  LEADERBOARD_SCOPE_FLICK_MIN_DX_PX,
  LEADERBOARD_SCOPE_FLICK_PX_PER_MS,
  LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO,
  LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX,
} from "@/lib/leaderboard-scope-swipe";
import { STICKY_TAB_CHROME_CLASS } from "@/lib/sticky-tab-chrome";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const rewardHeroSrc = readFileSync(join(here, "./leaderboard-reward-hero.ts"), "utf8");
const swipeSrc = readFileSync(join(here, "./leaderboard-scope-swipe.ts"), "utf8");
const stickyChromeSrc = readFileSync(join(here, "./sticky-tab-chrome.ts"), "utf8");

describe("LEADERBOARD-REWARD-HERO-2 — config module", () => {
  it("keeps Community and Artists independently configurable", () => {
    assert.notEqual(
      LEADERBOARD_REWARD_HERO_BY_SCOPE.users,
      LEADERBOARD_REWARD_HERO_BY_SCOPE.artists,
    );
    assert.equal(
      getLeaderboardRewardHeroConfig("users"),
      LEADERBOARD_REWARD_HERO_BY_SCOPE.users,
    );
    assert.equal(
      getLeaderboardRewardHeroConfig("artists"),
      LEADERBOARD_REWARD_HERO_BY_SCOPE.artists,
    );
  });

  it("references Boomtown artwork only from QA config, not page markup", () => {
    assert.match(rewardHeroSrc, /boomtown-hero-qa\.jpg/);
    assert.match(rewardHeroSrc, /assets\/rewards\/boomtown-hero-qa/);
    assert.doesNotMatch(leaderboardSrc, /boomtown-hero-qa|Boomtown_1/i);
    assert.equal(
      LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN.prizeTitle,
      "2 × VIP Boomtown Tickets",
    );
    assert.equal(
      LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN.sponsor,
      "Presented by Boomtown",
    );
    assert.match(
      String(LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN.imageSrc),
      /boomtown-hero-qa\.jpg/,
    );
  });

  it("does not reuse Boomtown for Artists", () => {
    assert.equal(LEADERBOARD_REWARD_HERO_BY_SCOPE.artists.state, "active");
    assert.match(
      String(LEADERBOARD_REWARD_HERO_BY_SCOPE.artists.imageSrc),
      /artist-placeholder-push-qa\.png/,
    );
    assert.doesNotMatch(
      String(LEADERBOARD_REWARD_HERO_BY_SCOPE.artists.imageSrc),
      /boomtown/i,
    );
    assert.doesNotMatch(
      String(LEADERBOARD_REWARD_HERO_BY_SCOPE.artists.prizeTitle),
      /Boomtown/i,
    );
    assert.equal(
      LEADERBOARD_REWARD_HERO_BY_SCOPE.artists,
      LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON,
    );
  });

  it("Coming Soon configs omit sponsor; Community Coming Soon omits image", () => {
    assert.equal(LEADERBOARD_REWARD_HERO_COMMUNITY_COMING_SOON.imageSrc, undefined);
    assert.equal(LEADERBOARD_REWARD_HERO_COMMUNITY_COMING_SOON.sponsor, undefined);
    assert.equal(LEADERBOARD_REWARD_HERO_COMMUNITY_COMING_SOON.state, "coming_soon");
    assert.equal(
      LEADERBOARD_REWARD_HERO_COMMUNITY_COMING_SOON.prizeTitle,
      "Monthly reward coming soon",
    );
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_COMING_SOON.sponsor, undefined);
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_COMING_SOON.imageSrc, undefined);
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_COMING_SOON.state, "coming_soon");
  });

  it("countdown only for active prizes; Coming Soon suppresses deadline", () => {
    assert.equal(
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN),
      true,
    );
    assert.equal(
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON),
      true,
    );
    assert.equal(
      leaderboardRewardHeroIsComingSoon(LEADERBOARD_REWARD_HERO_ARTISTS_COMING_SOON),
      true,
    );
    assert.equal(
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_ARTISTS_COMING_SOON),
      false,
    );
    assert.equal(
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_COMMUNITY_COMING_SOON),
      false,
    );
  });

  it("optional logo/sponsor/terms fields are safe when absent", () => {
    const minimal: LeaderboardRewardHeroConfig = {
      accentColor: "#0a83ff",
      backgroundColor: "#162038",
      prizeTitle: "Monthly reward coming soon",
      eligibilityCopy: "Top ranked community member this month wins.",
      state: "coming_soon",
    };
    assert.equal(minimal.imageSrc, undefined);
    assert.equal(minimal.logoSrc, undefined);
    assert.equal(minimal.sponsor, undefined);
    assert.equal(minimal.termsLabel, undefined);
    assert.equal(minimal.termsHref, undefined);
    assert.equal(leaderboardRewardHeroShowsCountdown(minimal), false);
    assert.equal(LEADERBOARD_REWARD_HERO_NAVY, "#0f1324");
  });
});

describe("LEADERBOARD-REWARD-HERO-2 — page wiring", () => {
  it("RewardsBanner reads config helper; no hardwired Boomtown / boxed card themes", () => {
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig\(tab\)/);
    assert.match(leaderboardSrc, /data-testid="rewards-banner"/);
    assert.match(leaderboardSrc, /data-testid="rewards-banner-image"/);
    assert.match(leaderboardSrc, /data-testid="rewards-banner-fallback"/);
    assert.match(leaderboardSrc, /leaderboardRewardHeroShowsCountdown/);
    assert.doesNotMatch(leaderboardSrc, /MONTHLY_REWARDS|PRIZE_CARD_THEMES/);
    assert.doesNotMatch(leaderboardSrc, /border-amber-500\/30|border-purple-500\/30/);
    assert.doesNotMatch(leaderboardSrc, /Presented by Music Festival|4 hours studio time/);
    assert.doesNotMatch(leaderboardSrc, /Ticket className|Headphones className/);
  });

  it("preserves dynamic month label + countdown helpers for active prizes", () => {
    assert.match(leaderboardSrc, /getCurrentMonth\(\)\.toUpperCase\(\)/);
    assert.match(leaderboardSrc, /getDaysRemainingInMonth/);
    assert.match(leaderboardSrc, /formatDaysRemaining/);
    assert.match(leaderboardSrc, /\{monthUpper\} PRIZE/);
    assert.match(leaderboardSrc, /rewards-banner-countdown/);
  });

  it("hero sits between sticky chrome and pager (full-bleed, not clipped by swipe viewport)", () => {
    const stickyIdx = leaderboardSrc.indexOf("LEADERBOARD_STICKY_CHROME_CLASS");
    const gestureIdx = leaderboardSrc.indexOf('data-testid="leaderboard-gesture-host"');
    const heroTrackIdx = leaderboardSrc.indexOf('data-testid="leaderboard-hero-track"');
    const swipeIdx = leaderboardSrc.indexOf('data-testid="leaderboard-swipe-region"');
    assert.notEqual(stickyIdx, -1);
    assert.notEqual(gestureIdx, -1);
    assert.notEqual(heroTrackIdx, -1);
    assert.notEqual(swipeIdx, -1);
    assert.ok(stickyIdx < gestureIdx && gestureIdx < heroTrackIdx && heroTrackIdx < swipeIdx);
    assert.doesNotMatch(
      leaderboardSrc.slice(
        leaderboardSrc.indexOf("leaderboard-pager-panel"),
        leaderboardSrc.lastIndexOf("LeaderboardList"),
      ),
      /RewardsBanner/,
    );
  });

  it("uses clamped cover stage with absolute object-cover poster", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /overflow-hidden/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /-mt-\[env\(safe-area-inset-top/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /absolute/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /inset-0/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-\[center_22%\]/);
    assert.match(LEADERBOARD_PRIZE_SECTION_CLASS, /mb-1\.5/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /-mt-\[calc\(env\(safe-area-inset-top/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /-mx-4/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /min-h-\[clamp/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_IMAGE_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /objectPosition/);
  });

  it("both pager panels still mount; swipe geometry file untouched", () => {
    assert.match(leaderboardSrc, /leaderboard-pager-panel-\$\{scope\}/);
    assert.match(leaderboardSrc, /LEADERBOARD_SCOPES\.map/);
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
    assert.match(swipeSrc, /LEADERBOARD_SCOPE_PAGER_TRACK_CLASS/);
    assert.match(swipeSrc, /useLeaderboardScopeSwipe/);
    assert.doesNotMatch(swipeSrc, /reward|Boomtown|RewardsBanner/i);
  });
});

describe("LEADERBOARD-REWARD-HERO-2 — Leaderboard-only transparent sticky", () => {
  it("drops opaque navy strip classes on Leaderboard only", () => {
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /sticky top-0/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /safe-area-inset-top/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /bg-transparent/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /dubhub-lb-sticky-chrome/);
    assert.match(
      LEADERBOARD_STICKY_CHROME_CLASS,
      /\[text-shadow:0_1px_2px_rgba\(0,0,0,0\.94\),0_2px_18px_rgba\(15,19,36,0\.94\)\]/,
    );
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /bg-background\/80/);
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /backdrop-blur/);
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /dubhub-app-releases-sticky/);
    assert.doesNotMatch(LEADERBOARD_STICKY_FADE_CLASS, /bg-background\/35/);
    assert.doesNotMatch(LEADERBOARD_STICKY_FADE_CLASS, /dubhub-app-releases-sticky-fade/);
    assert.doesNotMatch(LEADERBOARD_STICKY_FADE_CLASS, /backdrop-blur/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /h-0/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /dubhub-lb-sticky-fade/);
  });

  it("does not edit shared Releases sticky chrome constant", () => {
    assert.match(STICKY_TAB_CHROME_CLASS, /bg-background\/80/);
    assert.match(STICKY_TAB_CHROME_CLASS, /backdrop-blur-md/);
    assert.match(stickyChromeSrc, /bg-background\/80/);
    assert.notEqual(LEADERBOARD_STICKY_CHROME_CLASS, STICKY_TAB_CHROME_CLASS);
  });

  it("keeps primary/secondary tab behaviour hooks", () => {
    assert.match(leaderboardSrc, /data-testid="leaderboard-tabs"/);
    assert.match(leaderboardSrc, /data-testid="time-filters"/);
    assert.match(leaderboardSrc, /data-testid="leaderboard-primary-indicator"/);
    assert.match(leaderboardSrc, /LEADERBOARD_PRIMARY_INDICATOR_CLASS/);
    assert.match(leaderboardSrc, /LEADERBOARD_SECONDARY_ACTIVE_CLASS/);
  });
});

describe("LEADERBOARD-REWARD-HERO-4 — depth + adaptive sticky glass", () => {
  const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

  it("A: fade overlays clamped cover stage", () => {
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
  });

  it("B: single overlap fade into navy (no stacked washes)", () => {
    assert.match(leaderboardSrc, /overlapFade/);
    assert.match(leaderboardSrc, /data-testid="rewards-banner-fade"/);
    assert.doesNotMatch(leaderboardSrc, /\bbrandFade\b|\bextensionFade\b|BOTTOM_WASH|bottom-0 h-1[06]/);
    assert.match(
      leaderboardSrc,
      /transparent 0%, \$\{accentWhisper\} 25%, \$\{bgSoft\} 50%, \$\{navyMid\} 72%, \$\{navy\} 88%, \$\{navy\} 100%/,
    );
  });

  it("C: post-hero spacing tight; metadata in overlap wrap", () => {
    assert.match(LEADERBOARD_PRIZE_SECTION_CLASS, /mb-1\.5/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /mb-5/);
    assert.equal(LEADERBOARD_CONTENT_TOP_GAP_CLASS, "pt-0");
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_META_CLASS, /pt-\[calc\(env\(safe-area-inset-top/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4.5rem/);
    assert.match(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /radial-gradient/);
  });

  it("D/E/F: hero-end sentinel + pageScrollRef IO; no window scroll listener", () => {
    assert.match(LEADERBOARD_REWARD_HERO_SENTINEL_CLASS, /h-px/);
    assert.match(leaderboardSrc, /data-testid="leaderboard-reward-hero-sentinel"/);
    assert.match(leaderboardSrc, /heroGlassSentinelRef/);
    assert.match(leaderboardSrc, /IntersectionObserver/);
    assert.match(leaderboardSrc, /rootMargin: `-\$\{stickyHeight\}px 0px 0px 0px`/);
    assert.match(leaderboardSrc, /pageScrollRef/);
    assert.doesNotMatch(leaderboardSrc, /addEventListener\("scroll"/);
    assert.doesNotMatch(leaderboardSrc, /document\.addEventListener\("scroll"/);
    assert.doesNotMatch(leaderboardSrc, /window\.addEventListener\("scroll"/);
  });

  it("G/H: sticky top transparent; scrolled glass via data attr + CSS blur", () => {
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /bg-transparent/);
    assert.match(leaderboardSrc, /data-lb-sticky-glass=\{stickyGlassActive \? "true" : "false"\}/);
    assert.match(cssSrc, /\.dubhub-lb-sticky-chrome/);
    assert.match(cssSrc, /data-lb-sticky-glass="true"/);
    assert.match(cssSrc, /backdrop-filter:\s*blur\(18px\)\s*saturate\(1\.2\)/);
    assert.match(cssSrc, /-webkit-backdrop-filter:\s*blur\(18px\)\s*saturate\(1\.2\)/);
    assert.match(cssSrc, /rgba\(15,\s*22,\s*48,\s*0\.62\)/);
    assert.match(cssSrc, /180ms ease-out/);
  });

  it("I/J: both tab rows remain; pager swipe file untouched", () => {
    assert.match(leaderboardSrc, /data-testid="leaderboard-tabs"/);
    assert.match(leaderboardSrc, /data-testid="time-filters"/);
    assert.match(leaderboardSrc, /Community/);
    assert.match(leaderboardSrc, /Artists/);
    assert.match(leaderboardSrc, /LEADERBOARD_TIME_FILTERS\.map/);
    assert.match(leaderboardSrc, /\{filter\.label\}/);
    assert.doesNotMatch(swipeSrc, /stickyGlass|IntersectionObserver|reward-hero-sentinel/i);
  });
});

describe("LEADERBOARD-HERO-5 — poster framing + single fade", () => {
  it("A/B/C: cover stage fills width; top-biased crop; soft top scrim", () => {
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /w-full/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-\[center_22%\]/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS/);
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.74\)_0%/);
  });

  it("D: only one lower fade path; bottom wash removed", () => {
    assert.match(leaderboardSrc, /rewards-banner-fade/);
    assert.doesNotMatch(leaderboardSrc, /LEADERBOARD_REWARD_HERO_BOTTOM_WASH|bottom-0 h-1[06]/);
    assert.match(leaderboardSrc, /overlapFade/);
  });

  it("E/F: metadata in overlap wrap with soft scrim + text shadows", () => {
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_META_WRAP_CLASS/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS/);
    assert.match(leaderboardSrc, /\[text-shadow:0_1px_2px_rgba\(0,0,0,0\.95\)/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_META_CLASS, /safe-area-inset-top/);
  });

  it("G/I: sticky glass wiring unchanged; future images stay config-driven", () => {
    assert.match(leaderboardSrc, /IntersectionObserver/);
    assert.match(leaderboardSrc, /data-lb-sticky-glass/);
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig\(tab\)/);
    assert.doesNotMatch(leaderboardSrc, /boomtown-hero-qa|objectPosition/);
  });
});

describe("LEADERBOARD-REWARD-HERO-6 — fade overlap + tab contrast", () => {
  it("fade starts mid-stage; metadata stays low in overlap wrap", () => {
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /bottom-0/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4.5rem,16vw,7.25rem\)\]/);
  });

  it("top tab scrim is soft gradient, not a navbar bar", () => {
    assert.match(
      LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS,
      /h-\[calc\(env\(safe-area-inset-top,0px\)\+6\.5rem\)\]/,
    );
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.74\)_0%/);
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.5\)_72%/);
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /transparent_100%/);
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /bg-background\/80|dubhub-app-releases-sticky/);
  });

  it("inactive tab labels slightly stronger; underline/weights unchanged", () => {
    assert.match(LEADERBOARD_PRIMARY_INACTIVE_CLASS, /text-white\/72/);
    assert.match(LEADERBOARD_SECONDARY_INACTIVE_CLASS, /text-white\/70/);
    assert.doesNotMatch(LEADERBOARD_PRIMARY_INACTIVE_CLASS, /text-white\/55/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /text-shadow/);
  });
});

describe("LEADERBOARD-REWARD-HERO-8 — controlled cover + seamless fade + tab scrim", () => {
  it("A: hero uses clamped cover stage", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /relative/);
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /w-full/);
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /overflow-hidden/);
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
  });

  it("B: image is absolute and fills the stage", () => {
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /absolute/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /inset-0/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-\[center_22%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /h-full/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /\bh-auto\b/);
  });

  it("C: top safe-area bleed via heroViewport pull-under (not clipped child)", () => {
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /-mt-\[env\(safe-area-inset-top/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /-mt-\[calc\(env\(safe-area-inset-top/);
    assert.match(
      LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
      /min-h-\[clamp\(12rem,34dvh,20rem\)\]/,
    );
  });

  it("D: single lower fade overlays the same hero stage", () => {
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /bottom-0/);
    const stageOpen = leaderboardSrc.indexOf("LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS");
    const stageClose = leaderboardSrc.indexOf("LEADERBOARD_REWARD_HERO_META_WRAP_CLASS", stageOpen);
    const stageBlock = leaderboardSrc.slice(stageOpen, stageClose);
    assert.match(stageBlock, /LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS/);
    assert.match(stageBlock, /LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /LEADERBOARD_REWARD_HERO_BOTTOM_WASH|extensionFade|brandFade/);
  });

  it("E: no in-flow bitmap-bottom seam architecture remains", () => {
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /\bh-auto\b|relative z-0 block/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /absolute/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
  });

  it("F: top scrim covers full sticky tab depth", () => {
    assert.match(
      LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS,
      /h-\[calc\(env\(safe-area-inset-top,0px\)\+6\.5rem\)\]/,
    );
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.74\)_0%/);
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.5\)_72%/);
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /transparent_100%/);
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /backdrop-blur|bg-background\/80/);
  });

  it("G: final fade color remains #0f1324", () => {
    assert.equal(LEADERBOARD_REWARD_HERO_NAVY, "#0f1324");
    assert.match(leaderboardSrc, /\$\{navy\} 100%/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_NAVY/);
  });

  it("H: sticky glass IO behavior unchanged", () => {
    assert.match(leaderboardSrc, /IntersectionObserver/);
    assert.match(leaderboardSrc, /rootMargin: `-\$\{stickyHeight\}px 0px 0px 0px`/);
    assert.match(leaderboardSrc, /heroGlassSentinelRef/);
    assert.match(leaderboardSrc, /data-lb-sticky-glass=\{stickyGlassActive \? "true" : "false"\}/);
    assert.doesNotMatch(leaderboardSrc, /addEventListener\("scroll"/);
  });

  it("I: pager/swipe files untouched", () => {
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
    assert.doesNotMatch(swipeSrc, /reward|Boomtown|RewardsBanner|POSTER_STAGE|object-cover/i);
  });
});

describe("LEADERBOARD-HERO-9 — later lower fade + stronger top scrim", () => {
  it("top scrim and lower fade remain separate layers", () => {
    assert.notEqual(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS);
    const stageOpen = leaderboardSrc.indexOf("LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS");
    const stageClose = leaderboardSrc.indexOf("LEADERBOARD_REWARD_HERO_META_WRAP_CLASS", stageOpen);
    const stageBlock = leaderboardSrc.slice(stageOpen, stageClose);
    assert.match(stageBlock, /LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS/);
    assert.match(stageBlock, /LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS/);
    assert.ok(
      stageBlock.indexOf("LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS") <
        stageBlock.indexOf("LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS"),
    );
  });

  it("lower fade begins mid-stage on shorter hero (HERO-18)", () => {
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[45%\]|top-\[71%\]/);
    assert.match(
      leaderboardSrc,
      /transparent 0%, \$\{accentWhisper\} 25%, \$\{bgSoft\} 50%, \$\{navyMid\} 72%, \$\{navy\} 88%, \$\{navy\} 100%/,
    );
  });

  it("top scrim is stronger for tab readability over busy art", () => {
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.74\)_0%/);
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.5\)_72%/);
    assert.match(
      LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS,
      /h-\[calc\(env\(safe-area-inset-top,0px\)\+6\.5rem\)\]/,
    );
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /backdrop-blur/);
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /bg-background\/80|backdrop-blur/);
  });

  it("image remains full-bleed cover with top flush", () => {
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-\[center_22%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /inset-0/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /-mt-\[env\(safe-area-inset-top/);
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /\bh-auto\b/);
  });

  it("sticky glass + pager/swipe unchanged", () => {
    assert.match(leaderboardSrc, /IntersectionObserver/);
    assert.match(leaderboardSrc, /rootMargin: `-\$\{stickyHeight\}px 0px 0px 0px`/);
    assert.match(leaderboardSrc, /data-lb-sticky-glass/);
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
    assert.doesNotMatch(swipeSrc, /reward|TOP_SCRIM|FADE_OVERLAP|58dvh/i);
  });
});

describe("LEADERBOARD-HERO-11 — final geometry correction", () => {
  it("A: hero stage uses ~34dvh shallow contract", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /58dvh|36rem|22rem/);
  });

  it("B: stage/top model supports y<=0 bleed", () => {
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /-mt-\[env\(safe-area-inset-top/);
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /overflow-hidden/);
    assert.doesNotMatch(
      LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
      /\+env\(safe-area-inset-top,0px\)\+0\.25rem\+6rem/,
    );
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /-top-\[env\(safe-area-inset-top/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /inset-0/);
  });

  it("C: fade starts mid shorter stage (~58%)", () => {
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[71%\]|top-\[45%\]/);
  });

  it("D: top scrim retains opacity through secondary tabs", () => {
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.5\)_72%/);
    assert.match(LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS, /rgba\(15,19,36,0\.22\)_90%/);
    assert.match(
      LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS,
      /h-\[calc\(env\(safe-area-inset-top,0px\)\+6\.5rem\)\]/,
    );
  });

  it("E: metadata scrim reduced/lowered", () => {
    assert.match(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /rgba\(15,19,36,0\.48\)/);
    assert.match(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /top-\[54%\]/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /0\.62_|top-\[46%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4.5rem,16vw,7.25rem\)\]/);
  });

  it("F: final fade ends #0f1324", () => {
    assert.equal(LEADERBOARD_REWARD_HERO_NAVY, "#0f1324");
    assert.match(leaderboardSrc, /\$\{navy\} 88%, \$\{navy\} 100%/);
  });

  it("G: no extra wash layers added", () => {
    assert.doesNotMatch(leaderboardSrc, /BOTTOM_WASH|brandFade|extensionFade|bottom-0 h-1[06]/);
    const stageOpen = leaderboardSrc.indexOf("LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS");
    const stageClose = leaderboardSrc.indexOf("LEADERBOARD_REWARD_HERO_META_WRAP_CLASS", stageOpen);
    const stageBlock = leaderboardSrc.slice(stageOpen, stageClose);
    assert.match(stageBlock, /LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS/);
    assert.match(stageBlock, /LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS/);
  });

  it("H: sticky glass behavior unchanged", () => {
    assert.match(leaderboardSrc, /IntersectionObserver/);
    assert.match(leaderboardSrc, /rootMargin: `-\$\{stickyHeight\}px 0px 0px 0px`/);
    assert.match(leaderboardSrc, /data-lb-sticky-glass=\{stickyGlassActive \? "true" : "false"\}/);
  });

  it("I: pager/swipe untouched", () => {
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
    assert.doesNotMatch(swipeSrc, /reward|71%|58dvh|6\.25rem/i);
  });
});

describe("LEADERBOARD-HERO-12 — softer lower fade progression", () => {
  it("keeps fade start region; only softens stop progression", () => {
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(
      leaderboardSrc,
      /transparent 0%, \$\{accentWhisper\} 25%, \$\{bgSoft\} 50%, \$\{navyMid\} 72%, \$\{navy\} 88%, \$\{navy\} 100%/,
    );
    assert.doesNotMatch(
      leaderboardSrc,
      /\$\{accentSoft\} 24%, \$\{config\.backgroundColor\} 52%, \$\{navy\} 79%/,
    );
  });

  it("does not change hero geometry, metadata, or sticky glass", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-\[center_22%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4.5rem,16vw,7.25rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS, /rgba\(15,19,36,0\.48\)/);
    assert.match(leaderboardSrc, /IntersectionObserver/);
    assert.match(leaderboardSrc, /data-lb-sticky-glass/);
  });
});

describe("LEADERBOARD-HERO-13 — readability polish + raise metadata", () => {
  it("strengthens sticky tab text-shadow (near + soft depth)", () => {
    assert.match(
      LEADERBOARD_STICKY_CHROME_CLASS,
      /\[text-shadow:0_1px_2px_rgba\(0,0,0,0\.94\),0_2px_18px_rgba\(15,19,36,0\.94\)\]/,
    );
    assert.match(
      LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
      /\[text-shadow:0_1px_2px_rgba\(0,0,0,0\.96\),0_2px_16px_rgba\(15,19,36,0\.94\)\]/,
    );
    assert.match(
      LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS,
      /\[text-shadow:0_1px_2px_rgba\(0,0,0,0\.98\),0_2px_18px_rgba\(15,19,36,0\.98\)\]/,
    );
  });

  it("strengthens metadata text shadows without adding a card", () => {
    assert.match(
      leaderboardSrc,
      /text-shadow:0_1px_2px_rgba\(0,0,0,0\.95\),0_3px_16px_rgba\(0,0,0,0\.72\).*rewards-banner-title/s,
    );
    assert.match(
      leaderboardSrc,
      /text-shadow:0_1px_2px_rgba\(0,0,0,0\.85\),0_2px_10px_rgba\(0,0,0,0\.55\).*rewards-banner-prize-label/s,
    );
    assert.match(
      leaderboardSrc,
      /text-shadow:0_1px_2px_rgba\(0,0,0,0\.85\),0_2px_10px_rgba\(0,0,0,0\.55\).*rewards-banner-countdown/s,
    );
    assert.match(
      leaderboardSrc,
      /text-shadow:0_1px_2px_rgba\(0,0,0,0\.8\),0_2px_12px_rgba\(0,0,0,0\.55\).*rewards-banner-sponsor/s,
    );
    assert.match(
      leaderboardSrc,
      /text-shadow:0_1px_2px_rgba\(0,0,0,0\.75\),0_2px_12px_rgba\(0,0,0,0\.5\).*rewards-banner-eligibility/s,
    );
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_META_CLASS, /rounded-xl|bg-black\/|backdrop-blur/);
  });

  it("nudges metadata up and tightens hero-to-list spacing", () => {
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4.5rem,16vw,7.25rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /pb-1/);
    assert.match(LEADERBOARD_PRIZE_SECTION_CLASS, /mb-1\.5/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /\bmb-3\b/);
  });

  it("leaves hero image/fade and sticky glass unchanged", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(leaderboardSrc, /accentWhisper\} 25%/);
    assert.match(leaderboardSrc, /IntersectionObserver/);
    assert.match(leaderboardSrc, /data-lb-sticky-glass/);
  });
});

describe("LEADERBOARD-HERO-16 — gesture host + neutral Artist Coming Soon", () => {
  it("A–D: gesture host wraps RewardsBanner, sentinel, pagerViewport; sticky outside", () => {
    const stickyIdx = leaderboardSrc.indexOf("LEADERBOARD_STICKY_CHROME_CLASS");
    const hostOpen = leaderboardSrc.indexOf('data-testid="leaderboard-gesture-host"');
    const hostClose = leaderboardSrc.indexOf("</div>", leaderboardSrc.lastIndexOf("LeaderboardList"));
    assert.ok(stickyIdx > -1 && stickyIdx < hostOpen);
    const hostBlock = leaderboardSrc.slice(hostOpen, hostClose);
    assert.match(hostBlock, /leaderboard-hero-track/);
    assert.match(hostBlock, /<RewardsBanner tab=\{scope\} \/>/);
    assert.match(hostBlock, /leaderboard-reward-hero-sentinel/);
    assert.match(hostBlock, /leaderboard-swipe-region/);
    assert.match(hostBlock, /ref=\{pagerViewportRef\}/);
    assert.doesNotMatch(hostBlock, /LEADERBOARD_STICKY_CHROME_CLASS/);
  });

  it("E–F: touch listeners on gestureHost; widthOf still uses pager viewport", () => {
    assert.match(leaderboardSrc, /gestureHostRef/);
    assert.match(leaderboardSrc, /gestureHostRef,/);
    assert.match(swipeSrc, /gestureHostRef\?\.current \?\? viewport/);
    assert.match(swipeSrc, /gestureHost\.addEventListener\("touchstart"/);
    assert.match(swipeSrc, /gestureHost\.addEventListener\("touchmove"/);
    assert.match(
      swipeSrc,
      /Always pager viewport width[\s\S]*?viewport\.getBoundingClientRect\(\)\.width/,
    );
    assert.doesNotMatch(
      swipeSrc,
      /widthOf = \(\) =>[\s\S]*?gestureHost\.getBoundingClientRect/,
    );
  });

  it("G–H: hero can seed; tabs remain interactive-excluded; thresholds unchanged", () => {
    assert.match(swipeSrc, /isLeaderboardScopeSwipeInteractiveTarget/);
    assert.match(
      swipeSrc,
      /input, textarea, select, button, a, \[contenteditable\], \[role='button'\], \[role='tab'\], \[role='dialog'\]/,
    );
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
  });

  it("Artist QA uses neutral Dub Hub wash + Push placeholder image", () => {
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.accentColor, "#0a83ff");
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.backgroundColor, "#162038");
    assert.notEqual(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.accentColor, "#a78bfa");
    assert.notEqual(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.backgroundColor, "#1a1530");
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.state, "active");
    assert.match(
      String(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.imageSrc),
      /artist-placeholder-push-qa\.png/,
    );
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.sponsor, "Ableton");
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.prizeTitle, "Ableton Push 3");
    assert.equal(
      LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.eligibilityCopy,
      "Top ranked artist this month wins.",
    );
    assert.equal(
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON),
      true,
    );
  });

  it("Coming Soon and image-backed share the same stage / fade / meta geometry classes", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4.5rem,16vw,7.25rem\)\]/);
    assert.match(leaderboardSrc, /hasImage \? \(/);
    assert.match(leaderboardSrc, /rewards-banner-fallback/);
    assert.match(leaderboardSrc, /rewards-banner-image/);
  });

  it("Artist imageSrc uses the same hasImage cover path as Community", () => {
    assert.match(leaderboardSrc, /Boolean\(config\.imageSrc\?\.trim\(\)\)/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_IMAGE_CLASS/);
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig\(tab\)/);
    assert.equal(typeof getLeaderboardRewardHeroConfig, "function");
  });
});

describe("LEADERBOARD-HERO-18 — short stage + dual hero slots", () => {
  it("G: shared stage is ~34dvh; fade mid-stage; meta overlaps fade", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4\.5rem,16vw,7\.25rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /\bh-auto\b/);
  });
});

describe("LEADERBOARD-ARTIST-PLACEHOLDER-1 — Artist image-backed hero", () => {
  it("A/B: Artist has imageSrc and uses shared RewardsBanner path", () => {
    assert.match(
      String(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.imageSrc),
      /artist-placeholder-push-qa\.png/,
    );
    assert.match(leaderboardSrc, /<RewardsBanner tab=\{scope\} \/>/);
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig\(tab\)/);
    assert.match(leaderboardSrc, /Boolean\(config\.imageSrc\?\.trim\(\)\)/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_IMAGE_CLASS/);
  });

  it("C/D: stage height independent of image; object-cover remains", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[calc\(/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /absolute/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /inset-0/);
    assert.doesNotMatch(leaderboardSrc, /naturalWidth|image\.height|aspectRatio/);
  });

  it("E/F: Artist QA is active with image; Community unchanged", () => {
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.state, "active");
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.sponsor, "Ableton");
    assert.equal(
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON),
      true,
    );
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.prizeTitle, "Ableton Push 3");
    assert.equal(
      LEADERBOARD_REWARD_HERO_BY_SCOPE.users,
      LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN,
    );
    assert.match(
      String(LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN.imageSrc),
      /boomtown-hero-qa\.jpg/,
    );
  });
});

describe("LEADERBOARD-REWARD-META-1 — Artist metadata parity + optional terms", () => {
  it("Artist QA matches Community metadata slots (title, sponsor, countdown, eligibility)", () => {
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.prizeTitle, "Ableton Push 3");
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.sponsor, "Ableton");
    assert.equal(
      LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.eligibilityCopy,
      "Top ranked artist this month wins.",
    );
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.state, "active");
    assert.equal(
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON),
      leaderboardRewardHeroShowsCountdown(LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN),
    );
    assert.equal(
      LEADERBOARD_REWARD_HERO_BY_SCOPE.artists,
      LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON,
    );
    assert.match(leaderboardSrc, /rewards-banner-countdown/);
    assert.match(leaderboardSrc, /rewards-banner-sponsor/);
    assert.match(leaderboardSrc, /rewards-banner-eligibility/);
    assert.match(leaderboardSrc, /rewards-banner-title/);
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig\(tab\)/);
  });

  it("optional termsLabel/termsHref render under eligibility; QA leaves them unset", () => {
    assert.match(rewardHeroSrc, /termsLabel\?:/);
    assert.match(rewardHeroSrc, /termsHref\?:/);
    assert.match(leaderboardSrc, /config\.termsLabel/);
    assert.match(leaderboardSrc, /config\.termsHref/);
    assert.match(leaderboardSrc, /data-testid="rewards-banner-terms"/);
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.termsLabel, undefined);
    assert.equal(LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON.termsHref, undefined);
    assert.equal(LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN.termsLabel, undefined);
    assert.equal(LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN.termsHref, undefined);
    assert.doesNotMatch(leaderboardSrc, /Terms and Conditions|T&Cs apply|legal wording/i);
  });

  it("does not change hero geometry, crop, fade, or Community config", () => {
    assert.match(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[clamp\(12rem,34dvh,20rem\)\]/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-\[center_22%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.equal(
      LEADERBOARD_REWARD_HERO_BY_SCOPE.users,
      LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN,
    );
    assert.equal(
      LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN.sponsor,
      "Presented by Boomtown",
    );
  });
});
