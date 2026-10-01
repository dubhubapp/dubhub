/**
 * Phase 4.1 — restore pre-Light Dark presentation.
 * Light contracts stay. Native appearance resolution stays.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTIST_IDENTITY_COMPACT_CLASS,
  ARTIST_IDENTITY_DISPLAY_CLASS,
  ARTIST_IDENTITY_MEDIA_CLASS,
  ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS,
} from "./artist-identity-presentation";
import {
  PROFILE_METRIC_SELECTOR_ACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_INACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_TRACK_CLASS,
} from "./profile-overview-metric-selector-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const bylineSrc = readFileSync(join(here, "../components/release-detail-artist-byline.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");
const nativeSrc = readFileSync(join(here, "./native-appearance.ts"), "utf8");
const themeSrc = readFileSync(join(here, "./theme.ts"), "utf8");

function slice(startNeedle: string, endNeedle: string): string {
  const start = cssSrc.indexOf(startNeedle);
  assert.ok(start >= 0, startNeedle);
  const end = cssSrc.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, endNeedle);
  return cssSrc.slice(start, end);
}

describe("phase 4.1 dark regression repair", () => {
  it("restores the pre-Light Dark profile segment and keeps the Light platter", () => {
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /border-\[#DCE3EC\] bg-\[#EEF3FF\]/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /shadow-none/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /dark:border-white\/10 dark:bg-black\/30 dark:backdrop-blur-md/);
    assert.match(
      PROFILE_METRIC_SELECTOR_TRACK_CLASS,
      /dark:shadow-\[inset_0_0_0_1px_rgba\(255,255,255,0\.03\)\]/,
    );
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /bg-white/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /text-\[#101828\]/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:bg-transparent/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:bg-gradient-to-b dark:from-white\/\[0\.16\] dark:to-white\/\[0\.06\]/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /dark:text-white/);
    assert.match(
      PROFILE_METRIC_SELECTOR_ACTIVE_CLASS,
      /dark:shadow-\[inset_0_1px_0_0_rgba\(255,255,255,0\.28\),inset_0_-0\.5px_0_0_rgba\(0,0,0,0\.35\)\]/,
    );
    assert.match(PROFILE_METRIC_SELECTOR_INACTIVE_CLASS, /text-\[#667085\]/);
    assert.match(PROFILE_METRIC_SELECTOR_INACTIVE_CLASS, /dark:text-white\/55 dark:hover:text-white\/80/);
    assert.doesNotMatch(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /#0a83ff|bg-primary/);
  });

  it("uses a white Dark Release Detail name, keeps the gold tick, and leaves other gold contexts", () => {
    assert.equal(ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS, "dark:!text-white");
    assert.match(bylineSrc, /ARTIST_IDENTITY_COMPACT_CLASS/);
    assert.match(bylineSrc, /ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS/);
    assert.match(bylineSrc, /text-\[#FFD700\]/);
    assert.match(ARTIST_IDENTITY_COMPACT_CLASS, /text-foreground/);
    assert.match(ARTIST_IDENTITY_COMPACT_CLASS, /dark:text-\[#FFD700\]/);
    assert.match(commentsSrc, /ARTIST_IDENTITY_COMPACT_CLASS/);
    assert.doesNotMatch(commentsSrc, /ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS/);
    assert.match(leaderboardSrc, /ARTIST_IDENTITY_DISPLAY_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS/);
    assert.equal(ARTIST_IDENTITY_DISPLAY_CLASS, "dubhub-gold-text-surface text-[#FFD700]");
    assert.equal(ARTIST_IDENTITY_MEDIA_CLASS, "text-[#FFD700]");
    assert.match(videoCardSrc, /text-\[#FFD700\]/);
    assert.doesNotMatch(videoCardSrc, /ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS/);
    assert.match(cssSrc, /\.dark \.dubhub-artist-identity-compact \{\s*color:\s*#ffd700;/);
    assert.match(cssSrc, /:root:not\(\.dark\) \.dubhub-artist-identity-compact \{\s*color:\s*#101828;/);
  });

  it("keeps the pre-Light Dark leaderboard wash and the Light atmosphere", () => {
    const darkCanvas = slice(
      ".dark .dubhub-app-releases-canvas {",
      ":root:not(.dark) .dubhub-app-releases-canvas {",
    );
    assert.match(darkCanvas, /background-color:\s*#0f1324 !important/);
    assert.match(darkCanvas, /ellipse 120% 70% at 50% -35%/);
    assert.match(darkCanvas, /rgba\(10, 131, 255, 0\.14\) 0%/);
    assert.match(darkCanvas, /rgba\(0, 29, 249, 0\.06\) 42%/);
    assert.match(darkCanvas, /rgba\(22, 38, 92, 0\.28\) 0%/);
    assert.match(darkCanvas, /rgba\(15, 22, 48, 0\.12\) 32%/);
    assert.match(darkCanvas, /rgba\(15, 19, 36, 0\.04\) 58%/);
    assert.match(darkCanvas, /#0f1324 100%/);
    assert.match(darkCanvas, /!important/);
    const lightCanvas = slice(
      ":root:not(.dark) .dubhub-app-releases-canvas {",
      "/*\n * Leaderboard only.",
    );
    assert.match(lightCanvas, /background-color:\s*#F6F8FC/);
    assert.match(lightCanvas, /background-image:\s*var\(--page-canvas-atmosphere\)/);
    assert.doesNotMatch(lightCanvas, /#0f1324/);
    const darkSticky = slice(
      '.dark .dubhub-lb-sticky-chrome[data-lb-sticky-glass="true"] {',
      '.dark .dubhub-lb-sticky-chrome[data-lb-sticky-glass="true"] .dubhub-lb-sticky-fade {',
    );
    assert.match(darkSticky, /rgba\(15, 22, 48, 0\.62\)/);
    assert.match(darkSticky, /blur\(18px\)/);
    assert.match(leaderboardSrc, /dubhub-lb-page-atmosphere/);
    assert.match(leaderboardSrc, /--dubhub-lb-dark-hero-fade/);
    assert.match(leaderboardSrc, /backgroundImage: gradients\.overlapFade/);
    const lbAtmosphere = slice("html.dark .dubhub-lb-page-atmosphere {", ":root:not(.dark) .dubhub-lb-page-atmosphere {");
    assert.match(lbAtmosphere, /background-color:\s*#0f1324 !important/);
    assert.match(lbAtmosphere, /ellipse 120% 70% at 50% -35%/);
    assert.match(lbAtmosphere, /rgba\(10, 131, 255, 0\.14\) 0%/);
    assert.match(lbAtmosphere, /ellipse 110% 48% at 50% 82%/);
    assert.match(lbAtmosphere, /rgba\(10, 131, 255, 0\.07\) 0%/);
    assert.match(lbAtmosphere, /rgba\(22, 38, 92, 0\.11\) 68%/);
    assert.match(lbAtmosphere, /rgba\(15, 22, 48, 0\.07\) 100%/);
    assert.doesNotMatch(lbAtmosphere, /#0f1324 100%/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_NAVY/);
    assert.match(cssSrc, /html\.dark \.dubhub-lb-hero-fade \{\s*background-image:\s*var\(--dubhub-lb-dark-hero-fade\) !important;/);
    const lightFade = slice(":root:not(.dark) .dubhub-lb-hero-fade {", "html.dark .dubhub-lb-hero-fade {");
    assert.match(lightFade, /#F6F8FC 100%/);
    assert.doesNotMatch(leaderboardSrc, /activePostId/);
  });

  it("restores Dark Add Clip glass and leaves Light rows and picker actions", () => {
    assert.match(drawerSrc, /border border-\[#DCE3EC\] bg-white/);
    assert.match(drawerSrc, /hover:bg-\[#F6F8FC\]/);
    assert.match(drawerSrc, /dark:border-gray-800 dark:bg-surface\/98 dark:backdrop-blur-md/);
    assert.match(drawerSrc, /dark:border-gray-800\/80 dark:bg-gray-900\/60 dark:hover:bg-gray-800\/80 dark:active:bg-gray-800/);
    assert.match(drawerSrc, /dark:text-white">Choose Video/);
    assert.match(drawerSrc, /dark:text-white">Take Video/);
    assert.match(drawerSrc, /onClick=\{triggerPickGallery\}/);
    assert.match(drawerSrc, /onClick=\{triggerPickCamera\}/);
    const submitGlass = slice("html.dark .dark\\:bg-surface\\/98 {", "html.dark [data-testid=\"button-select-video\"]");
    assert.match(submitGlass, /background-color:\s*rgba\(18, 24, 48, 0\.58\)/);
    assert.match(submitGlass, /backdrop-filter:\s*blur\(12px\) saturate\(1\.2\)/);
    assert.match(submitGlass, /inset 0 1px 0 rgba\(255, 255, 255, 0\.12\)/);
    assert.doesNotMatch(submitGlass, /0\.98/);
    const submitRows = slice(
      "html.dark [data-testid=\"button-select-video\"]",
      ".bg-dark {",
    );
    assert.match(submitRows, /background-color:\s*rgba\(12, 16, 32, 0\.72\)/);
    assert.match(submitRows, /border-color:\s*rgba\(255, 255, 255, 0\.1\)/);
    assert.match(submitRows, /backdrop-filter:\s*blur\(12px\) saturate\(1\.15\)/);
    assert.doesNotMatch(drawerSrc, /dark:bg-\[rgba\(20,26,48,0\.97\)\]/);
    assert.doesNotMatch(drawerSrc, /APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS/);
  });

  it("leaves the Phase 4 native appearance resolver in place", () => {
    assert.match(nativeSrc, /if \(input\.authOrOnboarding\) return "dark"/);
    assert.match(nativeSrc, /if \(!input\.selectedTabKnown\) return "dark"/);
    assert.match(nativeSrc, /if \(input\.selectedTabId === "home"\) return "dark"/);
    assert.match(nativeSrc, /return input\.userTheme === "light" \? "light" : "dark"/);
    assert.match(themeSrc, /export function publishNativeUserTheme\(mode: ThemeMode\)/);
    assert.match(themeSrc, /NATIVE_THEME_MESSAGE = "dubhubTabItemTint"/);
    assert.doesNotMatch(nativeSrc, /UITabBarAppearance/);
  });
});
