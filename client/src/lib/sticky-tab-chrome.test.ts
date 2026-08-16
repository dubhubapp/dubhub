import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS,
  STICKY_TAB_CHROME_CLASS,
  STICKY_TAB_CHROME_FADE_CLASS,
  STICKY_TAB_CONTENT_TOP_GAP_CLASS,
  STICKY_TAB_PRIMARY_ROW_CLASS,
} from "@/lib/sticky-tab-chrome";
import {
  LEADERBOARD_CONTENT_TOP_GAP_CLASS,
  LEADERBOARD_PRIMARY_ROW_CLASS,
  LEADERBOARD_STICKY_CHROME_CLASS,
  LEADERBOARD_STICKY_FADE_CLASS,
} from "@/lib/leaderboard-presentation";
import {
  RELEASE_TRACKER_CONTENT_TOP_GAP_CLASS,
  RELEASE_TRACKER_PRIMARY_ROW_CLASS,
  RELEASE_TRACKER_STICKY_CHROME_CLASS,
  RELEASE_TRACKER_STICKY_FADE_CLASS,
} from "@/lib/release-tracker-presentation";
import { ARTWORK_SECTION_TOP_PAD_CLASS } from "@/lib/artwork-release-browser";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const releasesSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const swipeSrc = readFileSync(join(here, "./leaderboard-scope-swipe.ts"), "utf8");
const artworkSrc = readFileSync(
  join(here, "../components/artwork-release-browser.tsx"),
  "utf8",
);
const artworkLibSrc = readFileSync(join(here, "./artwork-release-browser.ts"), "utf8");

describe("shared sticky tab chrome contract", () => {
  it("keeps frosted blur + translucent background (not a solid slab)", () => {
    assert.match(STICKY_TAB_CHROME_CLASS, /sticky top-0/);
    assert.match(STICKY_TAB_CHROME_CLASS, /backdrop-blur-md/);
    assert.match(STICKY_TAB_CHROME_CLASS, /bg-background\/80/);
    assert.match(STICKY_TAB_CHROME_CLASS, /safe-area-inset-top/);
    assert.match(STICKY_TAB_CHROME_CLASS, /\+0\.25rem/);
    assert.match(STICKY_TAB_CHROME_CLASS, /pb-1/);
    assert.doesNotMatch(STICKY_TAB_CHROME_CLASS, /border-b|rounded-2xl/);
  });

  it("defines a pointer-events-none bottom fade", () => {
    assert.match(STICKY_TAB_CHROME_FADE_CLASS, /pointer-events-none/);
    assert.match(STICKY_TAB_CHROME_FADE_CLASS, /top-full/);
    assert.match(STICKY_TAB_CHROME_FADE_CLASS, /bg-gradient-to-b/);
    assert.match(STICKY_TAB_CHROME_FADE_CLASS, /from-background\/80/);
    assert.match(STICKY_TAB_CHROME_FADE_CLASS, /to-transparent/);
    assert.match(STICKY_TAB_CHROME_FADE_CLASS, /h-4/);
  });

  it("tightens primary→secondary gap without collapsing rows", () => {
    assert.equal(STICKY_TAB_PRIMARY_ROW_CLASS, "mb-1 flex");
    assert.equal(LEADERBOARD_PRIMARY_ROW_CLASS, STICKY_TAB_PRIMARY_ROW_CLASS);
    assert.equal(RELEASE_TRACKER_PRIMARY_ROW_CLASS, STICKY_TAB_PRIMARY_ROW_CLASS);
  });

  it("Leaderboard and Releases share chrome, content-gap, and blur-dissolve fade", () => {
    assert.equal(LEADERBOARD_STICKY_CHROME_CLASS, STICKY_TAB_CHROME_CLASS);
    assert.equal(RELEASE_TRACKER_STICKY_CHROME_CLASS, STICKY_TAB_CHROME_CLASS);
    assert.equal(LEADERBOARD_CONTENT_TOP_GAP_CLASS, STICKY_TAB_CONTENT_TOP_GAP_CLASS);
    assert.equal(RELEASE_TRACKER_CONTENT_TOP_GAP_CLASS, STICKY_TAB_CONTENT_TOP_GAP_CLASS);
    assert.equal(STICKY_TAB_CONTENT_TOP_GAP_CLASS, "pt-2");
    assert.equal(LEADERBOARD_STICKY_FADE_CLASS, STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS);
    assert.equal(RELEASE_TRACKER_STICKY_FADE_CLASS, STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS);
    assert.match(STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS, /leaderboard-sticky-blur-dissolve/);
    assert.match(STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS, /h-12/);
    assert.match(STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS, /backdrop-blur-md/);
    assert.match(STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS, /pointer-events-none/);
    assert.match(STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS, /absolute/);
  });
});

describe("Leaderboard sticky polish wiring", () => {
  it("keeps primary/secondary semantics and mounts overlay dissolve outside prize", () => {
    assert.match(leaderboardSrc, /data-testid="leaderboard-tabs"/);
    assert.match(leaderboardSrc, /data-testid="time-filters"/);
    assert.match(leaderboardSrc, /LEADERBOARD_STICKY_CHROME_CLASS/);
    assert.match(leaderboardSrc, /LEADERBOARD_STICKY_FADE_CLASS/);
    assert.match(leaderboardSrc, /data-testid="leaderboard-sticky-fade"/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /pointer-events-none/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /absolute/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /top-full/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /h-12/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /backdrop-blur-md/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /leaderboard-sticky-blur-dissolve/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /bg-background\/35/);
    assert.doesNotMatch(LEADERBOARD_STICKY_FADE_CLASS, /\bmb-|\bmt-|\bpy-/);
    const stickyOpen = leaderboardSrc.indexOf("<div className={LEADERBOARD_STICKY_CHROME_CLASS}>");
    const stickyClose = leaderboardSrc.indexOf("leaderboard-swipe-region");
    const stickyBlock = leaderboardSrc.slice(stickyOpen, stickyClose);
    assert.match(stickyBlock, /leaderboard-sticky-fade/);
    assert.doesNotMatch(stickyBlock, /RewardsBanner|rewards-banner/);
    assert.doesNotMatch(stickyBlock, /border-b /);
  });

  it("CSS mask dissolve utility is present for WKWebView", () => {
    const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
    assert.match(cssSrc, /\.leaderboard-sticky-blur-dissolve/);
    assert.match(cssSrc, /-webkit-mask-image/);
    assert.match(cssSrc, /mask-image/);
  });

  it("does not modify swipe implementation", () => {
    assert.match(swipeSrc, /useLeaderboardScopeSwipe/);
    assert.match(swipeSrc, /LEADERBOARD_SCOPE_COMMIT_PROGRESS/);
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
    assert.match(leaderboardSrc, /leaderboard-swipe-region/);
  });
});

describe("Releases sticky polish parity", () => {
  it("applies shared chrome + Leaderboard dissolve fade without changing Artwork / scope behaviour", () => {
    assert.match(releasesSrc, /RELEASE_TRACKER_STICKY_CHROME_CLASS/);
    assert.match(releasesSrc, /RELEASE_TRACKER_STICKY_FADE_CLASS/);
    assert.match(releasesSrc, /data-testid="releases-sticky-fade"/);
    assert.match(releasesSrc, /data-testid="releases-layout-toggle"/);
    assert.match(releasesSrc, /ArtworkReleaseBrowser/);
    assert.match(releasesSrc, /aria-pressed=\{scope === s\}/);
    assert.match(releasesSrc, /My Releases/);
    assert.match(releasesSrc, /Saved Releases/);
    assert.match(releasesSrc, /Collaborations/);
    assert.match(releasesSrc, /RELEASE_TRACKER_ADD_HREF/);
    assert.doesNotMatch(releasesSrc, /useLeaderboardScopeSwipe|leaderboard-scope-swipe/);
    assert.doesNotMatch(releasesSrc, /My Releases ↔|scope swipe/i);
    assert.equal(RELEASE_TRACKER_STICKY_FADE_CLASS, LEADERBOARD_STICKY_FADE_CLASS);
  });

  it("ArtworkReleaseBrowser keeps local top pad and Embla ownership", () => {
    assert.match(artworkSrc, /useEmblaCarousel/);
    assert.match(artworkSrc, /embla-carousel-react/);
    assert.match(artworkSrc, /ARTWORK_SECTION_TOP_PAD_CLASS/);
    assert.match(ARTWORK_SECTION_TOP_PAD_CLASS, /pt-\[clamp\(/);
    assert.match(ARTWORK_SECTION_TOP_PAD_CLASS, /10vh/);
    assert.match(artworkLibSrc, /ARTWORK_SECTION_TOP_PAD_CLASS/);
  });
});
