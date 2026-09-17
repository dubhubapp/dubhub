/**
 * Slice C5B — Profiles + Leaderboards premium presentation contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_AUTH_CANVAS_CLASS,
  APP_MATERIAL_AUTH_STICKY_CLASS,
  APP_MATERIAL_AUTH_STICKY_FADE_CLASS,
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
  APP_MATERIAL_INTERACTIVE_BLUE,
  APP_MATERIAL_RELEASES_CANVAS_CLASS,
} from "@/lib/app-material";
import {
  PROFILE_BANNER_LOADING_PLACEHOLDER_CLASS,
  PROFILE_BANNER_NO_BANNER_GRADIENT,
  PROFILE_BANNER_SURFACE,
} from "@/lib/profile-banner-presentation";
import {
  PROFILE_PRIMARY_NAV_GROUP_CLASS,
  PROFILE_PRIMARY_NAV_INDICATOR_CLASS,
  PROFILE_PRIMARY_NAV_SHELL_CLASS,
} from "@/lib/profile-primary-nav-presentation";
import { PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS } from "@/lib/profile-posts-filter-presentation";
import {
  LEADERBOARD_LIST_CLASS,
  LEADERBOARD_PRIMARY_INDICATOR_CLASS,
  LEADERBOARD_ROW_CURRENT_CLASS,
  LEADERBOARD_SECONDARY_ACTIVE_CLASS,
  LEADERBOARD_STICKY_CHROME_CLASS,
  LEADERBOARD_STICKY_FADE_CLASS,
  LEADERBOARD_YOU_PILL_CLASS,
  leaderboardUsersQueryKey,
} from "@/lib/leaderboard-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const bottomNavSrc = readFileSync(join(here, "../components/bottom-navigation.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const releaseAlertsBtnSrc = readFileSync(
  join(here, "../components/artist-release-alerts-button.tsx"),
  "utf8",
);
const bannerHelperSrc = readFileSync(join(here, "./profile-banner-presentation.tsx"), "utf8");

describe("C5B shared material aliases", () => {
  it("reuses Releases canvas class rather than inventing ProfileMaterial", () => {
    assert.equal(APP_MATERIAL_AUTH_CANVAS_CLASS, APP_MATERIAL_RELEASES_CANVAS_CLASS);
    assert.equal(APP_MATERIAL_AUTH_CANVAS_CLASS, "dubhub-app-releases-canvas");
    assert.equal(APP_MATERIAL_INTERACTIVE_BLUE, "#0a83ff");
    assert.match(APP_MATERIAL_AUTH_STICKY_CLASS, /dubhub-app-releases-sticky/);
    assert.match(APP_MATERIAL_AUTH_STICKY_FADE_CLASS, /dubhub-app-releases-sticky-fade/);
  });
});

describe("C5B profile canvas + banner", () => {
  it("applies authenticated canvas on own and public profile scroll roots", () => {
    assert.match(userProfileSrc, /profilePageCanvasClass/);
    assert.match(publicProfileSrc, /profilePageCanvasClass/);
    assert.doesNotMatch(
      userProfileSrc.replace(/APP_MATERIAL_AUTH_CANVAS_CLASS/g, "").replace(/profilePageCanvasClass/g, ""),
      /bg-\[var\(--dark\)\]/,
    );
  });

  it("keeps uploaded-banner readability scrims without new indigo overlay on the image", () => {
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(userProfileSrc, /from-slate-950\/35 via-transparent to-transparent/);
    assert.match(publicProfileSrc, /from-slate-950\/35 via-transparent to-transparent/);
    // No artwork-derived atmosphere wiring on profiles
    assert.doesNotMatch(userProfileSrc, /release-atmosphere|APP_MATERIAL_RELEASE_DETAIL/);
    assert.doesNotMatch(publicProfileSrc, /release-atmosphere|APP_MATERIAL_RELEASE_DETAIL/);
    assert.doesNotMatch(bannerHelperSrc, /--release-atmosphere/);
  });

  it("preserves banner object-cover + safe-area bleed geometry", () => {
    assert.match(userProfileSrc, /object-cover/);
    assert.match(publicProfileSrc, /object-cover/);
    assert.match(userProfileSrc, /-top-\[env\(safe-area-inset-top,0px\)\]/);
    assert.match(publicProfileSrc, /-top-\[env\(safe-area-inset-top,0px\)\]/);
    assert.match(userProfileSrc, /exportCroppedBanner/);
  });

  it("uses quiet navy placeholder while known banner_url loads", () => {
    assert.match(userProfileSrc, /showBannerLoadingPlaceholder/);
    assert.match(publicProfileSrc, /showBannerLoadingPlaceholder/);
    assert.match(userProfileSrc, /ProfileBannerLoadingPlaceholder/);
    assert.match(publicProfileSrc, /ProfileBannerLoadingPlaceholder/);
    assert.match(PROFILE_BANNER_LOADING_PLACEHOLDER_CLASS, /bg-\[#0f1324\]/);
    assert.equal(PROFILE_BANNER_SURFACE, "#0f1324");
  });

  it("retunes no-banner atmosphere away from teal celebration orbs", () => {
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /10,131,255/);
    assert.doesNotMatch(PROFILE_BANNER_NO_BANNER_GRADIENT, /74,233,223/);
    assert.doesNotMatch(bannerHelperSrc, /74,233,223/);
    assert.match(bannerHelperSrc, /profile-banner-no-banner-atmosphere/);
    assert.doesNotMatch(bannerHelperSrc, /PROFILE_DEFAULT_BANNER_PALETTE|getProfileDefaultBannerStyle|hashProfileBannerSeed/);
  });

  it("shows no-banner gradient only when banner absent or failed", () => {
    assert.match(userProfileSrc, /showBannerDefaultGradient = !hasProfileBanner \|\| bannerImageFailed/);
    assert.match(publicProfileSrc, /showBannerDefaultGradient = !bannerUrl \|\| bannerImageFailed/);
    assert.match(userProfileSrc, /showBannerDefaultGradient \? <ProfileBannerDefaultGradient \/>/);
    assert.match(publicProfileSrc, /showBannerDefaultGradient \? <ProfileBannerDefaultGradient \/>/);
    assert.doesNotMatch(userProfileSrc, /ProfileBannerDefaultGradient\s+userId=/);
    assert.doesNotMatch(publicProfileSrc, /ProfileBannerDefaultGradient\s+userId=/);
    assert.doesNotMatch(
      userProfileSrc,
      /showBannerDefaultGradient = !hasProfileBanner \|\| bannerImageFailed \|\| !bannerImageReady/,
    );
  });
});

describe("C5B public profile Back", () => {
  it("uses ChevronLeft + approved Back classes without visible Back text", () => {
    assert.match(publicProfileSrc, /ChevronLeft/);
    assert.match(publicProfileSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(publicProfileSrc, /APP_MATERIAL_BACK_ICON_CLASS/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /min-h-11 min-w-11/);
    assert.match(APP_MATERIAL_BACK_ICON_CLASS, /h-7 w-7/);
    assert.doesNotMatch(publicProfileSrc, /ArrowLeft/);
    // No visible "Back" label next to chevron in JSX text nodes
    assert.doesNotMatch(publicProfileSrc, /<\s*ArrowLeft[\s\S]*?\/>\s*Back/);
    assert.doesNotMatch(publicProfileSrc, /ChevronLeft[\s\S]{0,80}>\s*Back/);
    assert.match(publicProfileSrc, /aria-label="Back"/);
  });

  it("preserves handleBack history/fallback routing", () => {
    assert.match(
      publicProfileSrc,
      /const handleBack = \(\) => \{\s*if \(typeof window !== "undefined" && window\.history\.length > 1\) \{\s*window\.history\.back\(\);\s*return;\s*\}\s*navigate\("\/"\);\s*\};/s,
    );
    assert.match(publicProfileSrc, /onClick=\{handleBack\}/);
    assert.match(publicProfileSrc, /onBack=\{handleBack\}/);
  });

  it("does not add a Back control on own profile", () => {
    assert.doesNotMatch(userProfileSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.doesNotMatch(userProfileSrc, /public-profile-back/);
  });
});

describe("C5B profile tabs + sticky", () => {
  it("migrates generic underlines to interactive blue (primary nav; filters are glass)", () => {
    assert.match(PROFILE_PRIMARY_NAV_INDICATOR_CLASS, /bg-\[#0a83ff\]/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_GROUP_CLASS, /after:/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /#0a83ff/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_INDICATOR_CLASS|bg-\[#0a83ff\]/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_INDICATOR_CLASS, /bg-accent/);
  });

  it("profile primary shell is non-sticky after C5B.2 (Releases/Leaderboard sticky untouched)", () => {
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /sticky|backdrop-blur|releases-sticky/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /sticky top-0/);
    assert.match(LEADERBOARD_STICKY_FADE_CLASS, /h-0/);
  });
});

describe("C5B semantic colour freezes", () => {
  it("keeps verified gold on profiles and leaderboard", () => {
    assert.match(userProfileSrc, /#FFD700/);
    assert.match(publicProfileSrc, /#FFD700/);
    assert.match(leaderboardSrc, /#FFD700/);
  });

  it("keeps Release Alerts green on / neutral off behaviour", () => {
    assert.match(releaseAlertsBtnSrc, /green-500/);
    assert.match(releaseAlertsBtnSrc, /green-400/);
    assert.match(publicProfileSrc, /ArtistReleaseAlertsButton/);
    assert.doesNotMatch(releaseAlertsBtnSrc, /#0a83ff/);
  });

  it("keeps key-stat semantic tones", () => {
    assert.match(userProfileSrc, /text-green-300/);
    assert.match(userProfileSrc, /text-pink-300/);
    assert.match(userProfileSrc, /text-cyan-300/);
    assert.match(userProfileSrc, /text-violet-300/);
    assert.match(publicProfileSrc, /text-green-300/);
    assert.match(publicProfileSrc, /text-pink-300/);
  });
});

describe("C5B leaderboard", () => {
  it("applies premium canvas; Leaderboard sticky is transparent for reward hero", () => {
    assert.match(leaderboardSrc, /APP_MATERIAL_AUTH_CANVAS_CLASS/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /sticky top-0/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /bg-transparent/);
    assert.doesNotMatch(LEADERBOARD_STICKY_CHROME_CLASS, /dubhub-app-releases-sticky/);
    assert.doesNotMatch(LEADERBOARD_STICKY_FADE_CLASS, /dubhub-app-releases-sticky-fade/);
  });

  it("uses blue underlines for scope and timeframe", () => {
    assert.match(LEADERBOARD_PRIMARY_INDICATOR_CLASS, /bg-\[#0a83ff\]/);
    assert.match(LEADERBOARD_SECONDARY_ACTIVE_CLASS, /after:bg-\[#0a83ff\]/);
    assert.doesNotMatch(LEADERBOARD_PRIMARY_INDICATOR_CLASS, /bg-accent/);
    assert.doesNotMatch(LEADERBOARD_SECONDARY_ACTIVE_CLASS, /after:bg-accent/);
  });

  it("keeps flat rows, top-3 medallions, config-driven rewards, and quiet current-user wash", () => {
    assert.match(LEADERBOARD_LIST_CLASS, /divide-white\/\[0\.08\]/);
    assert.doesNotMatch(LEADERBOARD_LIST_CLASS, /backdrop-blur/);
    assert.match(leaderboardSrc, /LeaderboardTopRankMark/);
    assert.doesNotMatch(leaderboardSrc, /text-yellow-500|text-amber-600|text-gray-400/);
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig/);
    assert.doesNotMatch(leaderboardSrc, /border-amber-500\/30|border-purple-500\/30/);
    assert.equal(LEADERBOARD_ROW_CURRENT_CLASS, "");
    assert.match(LEADERBOARD_YOU_PILL_CLASS, /bg-\[#0a83ff\]/);
    assert.doesNotMatch(LEADERBOARD_ROW_CURRENT_CLASS, /shadow-\[0_0_/);
    assert.doesNotMatch(LEADERBOARD_ROW_CURRENT_CLASS, /ring-/);
  });

  it("freezes query key shapes and popup open path", () => {
    assert.deepEqual(leaderboardUsersQueryKey("month"), ["/api/leaderboard/users", "month"]);
    assert.match(leaderboardSrc, /openByUsername/);
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
  });
});

describe("C5B isolation", () => {
  it("does not place auth canvas on bottom navigation", () => {
    assert.doesNotMatch(bottomNavSrc, /APP_MATERIAL_AUTH_CANVAS|dubhub-app-releases-canvas/);
  });

  it("does not modify VideoCard / Home / Comments for this slice", () => {
    assert.doesNotMatch(videoCardSrc, /APP_MATERIAL_AUTH_CANVAS|C5B/);
    assert.doesNotMatch(homeSrc, /APP_MATERIAL_AUTH_CANVAS/);
    assert.doesNotMatch(commentsSrc, /APP_MATERIAL_AUTH_CANVAS/);
  });
});
