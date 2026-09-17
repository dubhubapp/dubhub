/**
 * Slice C5B.2 — current-user pill-only + non-sticky Profile tabs + banner dissolve.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARD_ROW_BASE_CLASS,
  LEADERBOARD_ROW_CURRENT_CLASS,
  LEADERBOARD_YOU_PILL_CLASS,
} from "@/lib/leaderboard-presentation";
import {
  PROFILE_PRIMARY_NAV_LABEL_CLASS,
  PROFILE_PRIMARY_NAV_SHELL_CLASS,
} from "@/lib/profile-primary-nav-presentation";
import {
  PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS,
  PROFILE_BANNER_BOTTOM_FADE_STYLE,
  PROFILE_BANNER_NO_BANNER_GRADIENT,
  PROFILE_BANNER_PAGE_CANVAS_CLASS,
  PROFILE_BANNER_SURFACE,
  PROFILE_BANNER_UPLOADED_SCRIM_STYLE,
} from "@/lib/profile-banner-presentation";
import { APP_MATERIAL_AUTH_CANVAS_CLASS } from "@/lib/app-material";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const releaseAlertsBtnSrc = readFileSync(
  join(here, "../components/artist-release-alerts-button.tsx"),
  "utf8",
);

describe("C5B.2 leaderboard current-user", () => {
  it("removes wash/ring/border; keeps You pill and row geometry", () => {
    assert.equal(LEADERBOARD_ROW_CURRENT_CLASS, "");
    assert.doesNotMatch(LEADERBOARD_ROW_CURRENT_CLASS, /bg-|ring-|border|shadow|rounded/);
    assert.match(LEADERBOARD_YOU_PILL_CLASS, /bg-\[#0a83ff\]/);
    assert.match(leaderboardSrc, /LEADERBOARD_YOU_PILL_CLASS/);
    assert.match(LEADERBOARD_ROW_BASE_CLASS, /flex items-center gap-3 px-1 py-3/);
  });

  it("preserves top-3 medallions, gold username, and config-driven reward hero", () => {
    assert.match(leaderboardSrc, /LeaderboardTopRankMark/);
    assert.doesNotMatch(leaderboardSrc, /text-yellow-500|text-amber-600|text-gray-400/);
    assert.match(leaderboardSrc, /#FFD700/);
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig/);
    assert.doesNotMatch(leaderboardSrc, /border-amber-500\/30|border-purple-500\/30/);
  });
});

describe("C5B.2 profile primary tabs non-sticky", () => {
  it("drops sticky chrome while keeping blue underline", () => {
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /sticky|backdrop-blur|releases-sticky/);
    assert.match(PROFILE_PRIMARY_NAV_LABEL_CLASS, /truncate/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_SHELL_CLASS/);
    // Painted nav fade removed (PROFILE-TABS-2A-FIX-3); content mask lives on Notifications viewport.
    assert.doesNotMatch(userProfileSrc, /PROFILE_PRIMARY_NAV_STICKY_FADE_CLASS/);
    assert.doesNotMatch(userProfileSrc, /PROFILE_PRIMARY_NAV_FADE_CLASS|profile-primary-nav-fade/);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATIONS_VIEWPORT_CLASS/);
  });

  it("preserves tab selection wiring", () => {
    assert.match(userProfileSrc, /handleProfileTabChange/);
    assert.match(userProfileSrc, /consumeProfileNotificationsTabIntent/);
    assert.match(userProfileSrc, /data-testid="tab-notifications"/);
  });
});

describe("C5B.2 banner dissolve", () => {
  it("uses contained fade into canvas base (C5C restored historical contract)", () => {
    const scrim = String(PROFILE_BANNER_UPLOADED_SCRIM_STYLE.background);
    assert.match(scrim, /linear-gradient\(to bottom/);
    assert.match(scrim, /rgba\(0,0,0,0\.42\)/);

    const fade = String(PROFILE_BANNER_BOTTOM_FADE_STYLE.background);
    assert.match(fade, /linear-gradient\(to bottom/);
    assert.match(fade, /rgba\(15,19,36,0\)/);
    assert.match(fade, /#0f1324/);
    assert.equal(PROFILE_BANNER_SURFACE, "#0f1324");
    assert.equal(PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS, "h-48");
    assert.equal(PROFILE_BANNER_PAGE_CANVAS_CLASS, APP_MATERIAL_AUTH_CANVAS_CLASS);
  });

  it("shares uploaded dissolve contract on own and public; keeps no-banner", () => {
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /10,131,255/);
    assert.doesNotMatch(PROFILE_BANNER_NO_BANNER_GRADIENT, /74,233,223/);
  });

  it("preserves object-cover geometry and overflow clipping", () => {
    assert.match(userProfileSrc, /object-cover/);
    assert.match(publicProfileSrc, /object-cover/);
    assert.match(userProfileSrc, /overflow-hidden/);
    assert.match(publicProfileSrc, /overflow-hidden/);
  });
});

describe("C5B.2 semantic safety", () => {
  it("keeps verification, Release Alerts, and profile stat colours", () => {
    assert.match(userProfileSrc, /#FFD700/);
    assert.match(publicProfileSrc, /#FFD700/);
    assert.match(releaseAlertsBtnSrc, /green-500/);
    assert.match(userProfileSrc, /text-green-300/);
    assert.match(userProfileSrc, /text-pink-300/);
  });
});
