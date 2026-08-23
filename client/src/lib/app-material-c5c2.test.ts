/**
 * Slice C5C.2 — uploaded-banner hero dissolves into with-banner canvas
 * without an external bleed overlay.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_BANNER_NO_BANNER_GRADIENT,
  PROFILE_BANNER_SURFACE,
  PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS,
  PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE,
  PROFILE_BANNER_UPLOADED_SCRIM_STYLE,
  PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS,
  profilePageCanvasClass,
} from "@/lib/profile-banner-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const bannerHelperSrc = readFileSync(join(here, "./profile-banner-presentation.tsx"), "utf8");
const indexCss = readFileSync(join(here, "../index.css"), "utf8");

describe("C5C.2 uploaded dissolve meets with-banner canvas", () => {
  it("ends the contained dissolve on the with-banner canvas base", () => {
    const fade = String(PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE.background);
    assert.match(fade, /linear-gradient\(to bottom/);
    assert.match(fade, /rgba\(15,19,36,0\) 0%/);
    assert.match(fade, /#0f1324 100%/);
    assert.doesNotMatch(fade, /#0f1324 86%/);
    assert.equal(PROFILE_BANNER_SURFACE, "#0f1324");
    assert.equal(profilePageCanvasClass(true), PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS);
    assert.match(indexCss, /\.dark \.dubhub-app-profile-canvas-with-banner \{[\s\S]*background-color: #0f1324/);
    assert.match(indexCss, /#0f1324 52%/);
  });

  it("covers the lower hero inside overflow-hidden (no -bottom bleed)", () => {
    assert.match(PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, /absolute inset-x-0 bottom-0 top-\[36%\]/);
    assert.doesNotMatch(PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, /-bottom-/);
    assert.doesNotMatch(bannerHelperSrc, /-bottom-\[|hero.?bleed|dissolve.?bleed/i);
    assert.doesNotMatch(userProfileSrc, /-bottom-8|-bottom-10|-bottom-12|-bottom-16/);
    assert.doesNotMatch(publicProfileSrc, /-bottom-8|-bottom-10|-bottom-12|-bottom-16/);
    assert.doesNotMatch(PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS, /h-80|h-96/);
  });

  it("shares the uploaded dissolve on own and public banner paths", () => {
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS/);
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE/);
    assert.match(publicProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE/);
  });
});

describe("C5C.2 no-banner + geometry safety", () => {
  it("leaves no-banner atmosphere unchanged", () => {
    assert.match(
      PROFILE_BANNER_NO_BANNER_GRADIENT,
      /rgba\(10,131,255,0\.20\) 0%/,
    );
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /0,29,249/);
    assert.match(PROFILE_BANNER_NO_BANNER_GRADIENT, /#0f1324 58%/);
    assert.doesNotMatch(PROFILE_BANNER_NO_BANNER_GRADIENT, /74,233,223/);
    assert.equal(profilePageCanvasClass(false), "dubhub-app-releases-canvas");
  });

  it("preserves banner image geometry, crop, and overflow clip", () => {
    assert.match(userProfileSrc, /object-cover/);
    assert.match(publicProfileSrc, /object-cover/);
    assert.match(userProfileSrc, /-top-\[env\(safe-area-inset-top,0px\)\]/);
    assert.match(publicProfileSrc, /-top-\[env\(safe-area-inset-top,0px\)\]/);
    assert.match(userProfileSrc, /overflow-hidden/);
    assert.match(publicProfileSrc, /overflow-hidden/);
    assert.match(userProfileSrc, /w-20 h-20/);
    assert.match(publicProfileSrc, /h-20 w-20/);
  });

  it("does not darken the whole banner with a uniform slab", () => {
    const scrim = String(PROFILE_BANNER_UPLOADED_SCRIM_STYLE.background);
    assert.match(scrim, /rgba\(0,0,0,0\) 100%/);
    assert.doesNotMatch(userProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_CLASS/);
    assert.doesNotMatch(publicProfileSrc, /PROFILE_BANNER_UPLOADED_SCRIM_CLASS/);
  });
});
