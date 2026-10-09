/**
 * Phase 3B — Leaderboard, Notifications list, and profile page chrome.
 * Media/artwork treatments and Dark contracts stay in place.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LEADERBOARD_LIST_CLASS, LEADERBOARD_SKELETON_BONE_CLASS } from "./leaderboard-presentation";
import { LEADERBOARD_REWARD_HERO_NAVY } from "./leaderboard-reward-hero";
import {
  PROFILE_NOTIFICATION_BODY_CLASS,
  PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS,
  PROFILE_NOTIFICATION_UNREAD_DOT_CLASS,
} from "./profile-notifications-presentation";
import { PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS } from "./profile-primary-nav-presentation";
import { APP_MATERIAL_BACK_BUTTON_CLASS, APP_MATERIAL_PAGE_BACK_BUTTON_CLASS } from "./app-material";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const bannerSrc = readFileSync(join(here, "../components/in-app-notification-banner.tsx"), "utf8");
const routingSrc = readFileSync(join(here, "./notification-routing.ts"), "utf8");
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const themeSrc = readFileSync(join(here, "./theme.ts"), "utf8");

describe("phase 3B authenticated page chrome", () => {
  it("themes Leaderboard list chrome and keeps the hero navy contract", () => {
    assert.match(LEADERBOARD_LIST_CLASS, /divide-border/);
    assert.match(LEADERBOARD_LIST_CLASS, /dark:divide-white\/\[0\.08\]/);
    assert.match(LEADERBOARD_SKELETON_BONE_CLASS, /bg-foreground\/12/);
    assert.match(LEADERBOARD_SKELETON_BONE_CLASS, /dark:bg-white\/15/);
    assert.match(leaderboardSrc, /dubhub-lb-hero-fade/);
    assert.match(leaderboardSrc, /APP_MATERIAL_AUTH_CANVAS_CLASS/);
    assert.equal(LEADERBOARD_REWARD_HERO_NAVY, "#0f1324");
    assert.match(cssSrc, /\.dark \.dubhub-lb-sticky-chrome\[data-lb-sticky-glass="true"\]/);
    assert.match(cssSrc, /:root:not\(\.dark\) \.dubhub-lb-sticky-chrome\[data-lb-sticky-glass="true"\]/);
    assert.match(cssSrc, /--background:\s*#F6F8FC/);
    assert.match(cssSrc, /--page-canvas-atmosphere:/);
  });

  it("themes the Notifications list without touching routing or the floating banner", () => {
    assert.match(PROFILE_NOTIFICATION_BODY_CLASS, /text-foreground/);
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /border-border/);
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /dark:border-white\/10/);
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /dark:bg-black\/25/);
    assert.match(PROFILE_NOTIFICATION_UNREAD_DOT_CLASS, /bg-\[#0a83ff\]/);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATION_ROW_SURFACE_CLASS/);
    assert.match(routingSrc, /function routeNotification|export function/);
    assert.match(bannerSrc, /text-white/);
    assert.match(bannerSrc, /bg-\[#0f1324\]\/92|bg-\[#0f1324\]/);
    assert.doesNotMatch(bannerSrc, /text-foreground/);
  });

  it("themes profile page chrome and keeps media Back and banner photography fixed", () => {
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /text-muted-foreground/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /dark:text-white\/55/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /data-\[state=active\]:text-foreground/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /dark:data-\[state=active\]:text-white/);
    assert.match(userProfileSrc, /data-profile-hero=\{hasReadyUploadedBanner \? "media" : "canvas"\}/);
    assert.match(publicProfileSrc, /data-profile-hero=\{hasReadyUploadedBanner \? "media" : "canvas"\}/);
    assert.match(publicProfileSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /text-white/);
    assert.match(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, /text-foreground/);
    assert.doesNotMatch(publicProfileSrc, /APP_MATERIAL_PAGE_BACK_BUTTON_CLASS/);
    assert.match(cssSrc, /:root:not\(\.dark\) \.dubhub-app-profile-canvas-with-banner/);
    assert.match(cssSrc, /background-image:\s*var\(--page-canvas-atmosphere\)/);
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-canvas/);
    assert.match(cssSrc, /rgba\(10, 131, 255, 0\.14\)/);
  });

  it("keeps auth Dark, the Settings toggle, and Home/video files untouched by this chrome", () => {
    assert.match(cssSrc, /\.dubhub-auth-surface \{\n {2}color-scheme: dark/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \{\s*background-color:\s*#0f1324/);
    assert.match(settingsSrc, /data-testid="switch-light-mode"/);
    assert.match(settingsSrc, /applyTheme\(enabled \? "light" : "dark"\)/);
    assert.doesNotMatch(homeSrc, /dubhub-lb-hero-fade|data-profile-hero|switch-light-mode/);
    assert.doesNotMatch(videoCardSrc, /data-profile-hero|switch-light-mode|--page-canvas-atmosphere/);
    assert.match(themeSrc, /THEME_EPOCH_SEMANTIC_LIGHT = "semantic-light-1"/);
    assert.match(themeSrc, /writeStorage\(THEME_STORAGE_KEY, "dark"\)/);
    assert.match(themeSrc, /return "dark"/);
  });
});
