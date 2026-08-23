/**
 * Slice C5C.1 — public Profile no-banner canvas must actually paint.
 * The C5C canvas class was on the scroll root, but an opaque hero stack hid it.
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
  PROFILE_BANNER_PAGE_CANVAS_CLASS,
  PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS,
  profilePageCanvasClass,
} from "@/lib/profile-banner-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");

describe("C5C.1 public no-banner canvas visibility", () => {
  it("puts the premium auth canvas on the public scroll root", () => {
    assert.equal(profilePageCanvasClass(false), APP_MATERIAL_AUTH_CANVAS_CLASS);
    assert.equal(PROFILE_BANNER_PAGE_CANVAS_CLASS, APP_MATERIAL_AUTH_CANVAS_CLASS);
    assert.equal(APP_MATERIAL_AUTH_CANVAS_CLASS, "dubhub-app-releases-canvas");
    assert.match(publicProfileSrc, /profilePageCanvasClass/);
    assert.match(publicProfileSrc, /publicProfilePageScrollClass\(hasReadyUploadedBanner\)/);
    assert.match(publicProfileSrc, /publicProfilePageScrollClass\(false\)/);
  });

  it("does not cover no-banner public hero with a legacy opaque navy plate", () => {
    assert.match(publicProfileSrc, /bg-transparent/);
    assert.doesNotMatch(
      publicProfileSrc,
      /from-slate-950\/35 via-slate-900\/22 to-slate-950\/28/,
    );
    assert.doesNotMatch(publicProfileSrc, /bg-\[var\(--dark\)\]/);
    assert.doesNotMatch(publicProfileSrc, /bg-background/);
  });

  it("keeps contained navy fade only for uploaded-banner public profiles", () => {
    assert.match(
      publicProfileSrc,
      /showUploadedBannerImage && bannerImageReady \? \([\s\S]*PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/,
    );
    assert.equal(profilePageCanvasClass(true), PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS);
    assert.equal(
      PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS,
      APP_MATERIAL_PROFILE_WITH_BANNER_CANVAS_CLASS,
    );
  });
});

describe("C5C.1 public Back lane + own Profile isolation", () => {
  it("keeps approved C5C Back-lane geometry", () => {
    assert.match(publicProfileSrc, /PUBLIC_PROFILE_BACK_LANE_CLASS/);
    assert.match(publicProfileSrc, /data-testid="public-profile-back-lane"/);
    assert.match(publicProfileSrc, /PUBLIC_PROFILE_HERO_BELOW_BACK_CLASS/);
    assert.match(publicProfileSrc, /min-h-11/);
    assert.match(publicProfileSrc, /pt-1\.5/);
    assert.match(publicProfileSrc, /ChevronLeft/);
    assert.match(publicProfileSrc, /aria-label="Back"/);
    assert.match(publicProfileSrc, /const handleBack = \(\) =>/);
  });

  it("leaves own Profile canvas/hero contracts unchanged", () => {
    assert.match(userProfileSrc, /profilePageCanvasClass\(hasReadyUploadedBanner\)/);
    assert.match(
      userProfileSrc,
      /relative -mx-6 mb-3 overflow-hidden bg-\[#0f1324\]/,
    );
    assert.match(
      userProfileSrc,
      /from-slate-950\/35 via-slate-900\/22 to-slate-950\/28/,
    );
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_GROUP_CLASS/);
  });
});
