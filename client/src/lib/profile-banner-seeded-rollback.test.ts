/**
 * DEFAULT-PROFILE-GRADIENT rollback — seeded experiment removed; modern canvas kept.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_MATERIAL_AUTH_CANVAS_CLASS } from "@/lib/app-material";
import {
  PROFILE_BANNER_NO_BANNER_GRADIENT,
  PROFILE_BANNER_PAGE_CANVAS_CLASS,
  profilePageCanvasClass,
} from "@/lib/profile-banner-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const bannerHelperSrc = readFileSync(join(here, "./profile-banner-presentation.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");

describe("DEFAULT-PROFILE-GRADIENT rollback", () => {
  it("removes seeded UUID/palette helpers and userId wiring", () => {
    assert.doesNotMatch(
      bannerHelperSrc,
      /PROFILE_DEFAULT_BANNER_PALETTE|hashProfileBannerSeed|getProfileDefaultBannerIndex|getProfileDefaultBannerStyle|profileBannerHeroSectionClass|PROFILE_BANNER_SEEDED_/,
    );
    assert.doesNotMatch(userProfileSrc, /ProfileBannerDefaultGradient\s+userId=/);
    assert.doesNotMatch(publicProfileSrc, /ProfileBannerDefaultGradient\s+userId=/);
    assert.match(userProfileSrc, /showBannerDefaultGradient \? <ProfileBannerDefaultGradient \/>/);
    assert.match(publicProfileSrc, /showBannerDefaultGradient \? <ProfileBannerDefaultGradient \/>/);
  });

  it("restores shared pre-experiment no-banner gradient", () => {
    assert.match(
      PROFILE_BANNER_NO_BANNER_GRADIENT,
      /rgba\(10,131,255,0\.20\) 0%/,
    );
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /#0f1324 58%/);
    assert.match(bannerHelperSrc, /background:\s*PROFILE_BANNER_NO_BANNER_GRADIENT/);
    assert.match(userProfileSrc, /showBannerDefaultGradient = !hasProfileBanner \|\| bannerImageFailed/);
    assert.match(publicProfileSrc, /showBannerDefaultGradient = !bannerUrl \|\| bannerImageFailed/);
    assert.match(userProfileSrc, /updateProfileBanner\(null\)/);
  });

  it("keeps modern layered page canvas; no full-page flat navy wrapper", () => {
    assert.equal(PROFILE_BANNER_PAGE_CANVAS_CLASS, APP_MATERIAL_AUTH_CANVAS_CLASS);
    assert.equal(profilePageCanvasClass(false), "dubhub-app-releases-canvas");
    assert.match(userProfileSrc, /profilePageCanvasClass\(hasReadyUploadedBanner\)/);
    assert.match(publicProfileSrc, /profilePageCanvasClass/);
    // Scroll roots use canvas helper — not a solid page-level navy class.
    assert.match(
      userProfileSrc,
      /className=\{cn\(\s*PROFILE_PAGE_SCROLL_CLASS,\s*"overflow-x-hidden",\s*profilePageCanvasClass\(hasReadyUploadedBanner\),\s*\)\}/,
    );
    assert.match(publicProfileSrc, /publicProfilePageScrollClass\(hasReadyUploadedBanner\)/);
    assert.doesNotMatch(publicProfileSrc, /function publicProfilePageScrollClass[\s\S]{0,200}bg-\[#0f1324\]/);
  });

  it("preserves custom banner upload path and uploaded dissolve", () => {
    assert.match(userProfileSrc, /showUploadedBannerImage = hasProfileBanner && !bannerImageFailed/);
    assert.match(publicProfileSrc, /showUploadedBannerImage = Boolean\(bannerUrl\) && !bannerImageFailed/);
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_STYLE/);
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
    assert.equal(profilePageCanvasClass(true), "dubhub-app-profile-canvas-with-banner");
  });
});
