/**
 * Slice C5C — Profile banner blend restore + with-banner canvas + tab groups + public Back lane.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_AUTH_CANVAS_CLASS,
  APP_MATERIAL_PROFILE_WITH_BANNER_CANVAS_CLASS,
} from "@/lib/app-material";
import {
  PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS,
  PROFILE_BANNER_BOTTOM_FADE_STYLE,
  PROFILE_BANNER_NO_BANNER_GRADIENT,
  PROFILE_BANNER_PAGE_CANVAS_CLASS,
  PROFILE_BANNER_SURFACE,
  PROFILE_BANNER_UPLOADED_SCRIM_STYLE,
  PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS,
  profilePageCanvasClass,
} from "@/lib/profile-banner-presentation";
import {
  PROFILE_PRIMARY_NAV_GROUP_CLASS,
  PROFILE_PRIMARY_NAV_LABEL_CLASS,
  PROFILE_PRIMARY_NAV_SHELL_CLASS,
  PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS,
} from "@/lib/profile-primary-nav-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const indexCss = readFileSync(join(here, "../index.css"), "utf8");
const bannerHelperSrc = readFileSync(join(here, "./profile-banner-presentation.tsx"), "utf8");
const releaseAlertsBtnSrc = readFileSync(
  join(here, "../components/artist-release-alerts-button.tsx"),
  "utf8",
);

describe("C5C banner architecture — contained restore", () => {
  it("keeps fade contained (no outer bleed / -bottom bridge)", () => {
    assert.doesNotMatch(bannerHelperSrc, /-bottom-\[|hero.?bleed|dissolve.?bleed/i);
    assert.doesNotMatch(userProfileSrc, /-bottom-8|-bottom-10|-bottom-12|pointer-events-none absolute.*tabs/i);
    assert.doesNotMatch(publicProfileSrc, /-bottom-8|-bottom-10|-bottom-12/);
    assert.equal(PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS, "h-48");
    assert.match(userProfileSrc, /overflow-hidden/);
    assert.match(publicProfileSrc, /overflow-hidden/);
  });

  it("restores historical multi-stop fade into navy base", () => {
    const fade = String(PROFILE_BANNER_BOTTOM_FADE_STYLE.background);
    assert.match(fade, /rgba\(15,19,36,0\) 0%/);
    assert.match(fade, /0\.65\) 45%/);
    assert.match(fade, /0\.92\) 72%/);
    assert.match(fade, /#0f1324 86%/);
    assert.match(fade, /#0f1324 100%/);
    assert.equal(PROFILE_BANNER_SURFACE, "#0f1324");
  });

  it("uses top-weighted black scrim without blue tint over uploaded banner", () => {
    const scrim = String(PROFILE_BANNER_UPLOADED_SCRIM_STYLE.background);
    assert.match(scrim, /linear-gradient\(to bottom/);
    assert.match(scrim, /rgba\(0,0,0,0\.42\)/);
    assert.doesNotMatch(scrim, /10,131,255|0,29,249/);
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
  });

  it("preserves object-cover and section geometry markers", () => {
    assert.match(userProfileSrc, /object-cover/);
    assert.match(publicProfileSrc, /object-cover/);
    assert.match(userProfileSrc, /data-testid="profile-banner"/);
    assert.match(publicProfileSrc, /data-testid="public-profile-banner"/);
  });
});

describe("C5C with-banner canvas mode", () => {
  it("starts navy under banner rather than top-heavy auth wash", () => {
    assert.equal(
      PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS,
      APP_MATERIAL_PROFILE_WITH_BANNER_CANVAS_CLASS,
    );
    assert.equal(APP_MATERIAL_PROFILE_WITH_BANNER_CANVAS_CLASS, "dubhub-app-profile-canvas-with-banner");
    assert.match(indexCss, /\.dark \.dubhub-app-profile-canvas-with-banner/);
    assert.match(indexCss, /#0f1324 0%/);
    assert.match(indexCss, /#0f1324 52%/);
    assert.equal(profilePageCanvasClass(true), PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS);
    assert.equal(profilePageCanvasClass(false), PROFILE_BANNER_PAGE_CANVAS_CLASS);
    assert.equal(PROFILE_BANNER_PAGE_CANVAS_CLASS, APP_MATERIAL_AUTH_CANVAS_CLASS);
  });

  it("wires with-banner canvas on own and public uploaded-ready paths", () => {
    assert.match(userProfileSrc, /profilePageCanvasClass\(hasReadyUploadedBanner\)/);
    assert.match(publicProfileSrc, /publicProfilePageScrollClass\(hasReadyUploadedBanner\)/);
  });
});

describe("C5C no-banner atmosphere", () => {
  it("keeps blue→indigo→navy premium gradient", () => {
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /10,131,255/);
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /0,29,249/);
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /#0f1324/);
    assert.doesNotMatch(PROFILE_BANNER_NO_BANNER_GRADIENT, /74,233,223/);
    assert.doesNotMatch(bannerHelperSrc, /PROFILE_DEFAULT_BANNER_PALETTE|getProfileDefaultBannerIndex/);
  });
});

describe("C5C primary tabs — icon+label group", () => {
  it("groups icon+label with underline on the group; full trigger retained; non-sticky", () => {
    assert.match(PROFILE_PRIMARY_NAV_GROUP_CLASS, /inline-flex/);
    assert.match(PROFILE_PRIMARY_NAV_GROUP_CLASS, /after:bg-\[#0a83ff\]/);
    assert.match(PROFILE_PRIMARY_NAV_GROUP_CLASS, /after:h-\[3px\]/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_LABEL_CLASS, /after:/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /flex-1/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /min-h-11/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /justify-center/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /sticky/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_GROUP_CLASS/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_GROUP_CLASS[\s\S]*Overview/);
  });
});

describe("C5C public premium root + Back lane", () => {
  it("uses premium canvas helper and dedicated Back lane above identity", () => {
    assert.match(publicProfileSrc, /profilePageCanvasClass/);
    assert.match(publicProfileSrc, /PUBLIC_PROFILE_BACK_LANE_CLASS/);
    assert.match(publicProfileSrc, /data-testid="public-profile-back-lane"/);
    assert.match(publicProfileSrc, /PUBLIC_PROFILE_HERO_BELOW_BACK_CLASS/);
    assert.match(publicProfileSrc, /min-h-11/);
    assert.match(publicProfileSrc, /pt-1\.5/);
    assert.doesNotMatch(
      publicProfileSrc,
      /absolute left-3 top-\[calc\(env\(safe-area-inset-top/,
    );
  });

  it("keeps ChevronLeft, aria-label Back, and handleBack", () => {
    assert.match(publicProfileSrc, /ChevronLeft/);
    assert.match(publicProfileSrc, /aria-label="Back"/);
    assert.match(publicProfileSrc, /const handleBack = \(\) =>/);
    assert.match(publicProfileSrc, /onClick=\{handleBack\}/);
    assert.match(publicProfileSrc, /window\.history\.back/);
  });

  it("applies Back-lane geometry on skeleton", () => {
    assert.match(publicProfileSrc, /function PublicProfilePageSkeleton[\s\S]*public-profile-back-lane/);
    assert.match(publicProfileSrc, /function PublicProfilePageSkeleton[\s\S]*PUBLIC_PROFILE_HERO_BELOW_BACK_CLASS/);
  });
});

describe("C5C semantic safety", () => {
  it("preserves gold, Release Alerts, Rep markers", () => {
    assert.match(userProfileSrc, /#FFD700/);
    assert.match(publicProfileSrc, /#FFD700/);
    assert.match(releaseAlertsBtnSrc, /green-500/);
    assert.match(publicProfileSrc, /ArtistReleaseAlertsButton/);
    assert.match(publicProfileSrc, /ProfileRepOverview/);
    assert.match(publicProfileSrc, /deriveTrustLevel/);
  });
});
