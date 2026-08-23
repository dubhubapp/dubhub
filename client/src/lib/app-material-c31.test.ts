/**
 * Slice C3.1 — Release Create/Edit material-depth correction contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
  APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS,
  APP_MATERIAL_FIELD_CLASS,
  APP_MATERIAL_FORM_PRIMARY_CLASS,
  APP_MATERIAL_RELEASE_FORM_TOP_CLASS,
  APP_MATERIAL_SEGMENT_ACTIVE_CLASS,
  APP_MATERIAL_SHEET_BACKDROP_CLASS,
  APP_MATERIAL_SHEET_SURFACE_CLASS,
} from "@/lib/app-material";
import { PRE_LOGIN_BACK_ICON_CLASS } from "@/lib/pre-login-onboarding";
import { RELEASE_FEED_SKELETON_DELAY_MS } from "@/lib/release-tracker-delayed-skeleton";

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/release-form-drawer.tsx"), "utf8");
const tzSrc = readFileSync(join(here, "../components/release-timezone-picker-sheet.tsx"), "utf8");
const statusSrc = readFileSync(join(here, "../components/release-status-fields.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const paywallSrc = readFileSync(join(here, "../components/verified-artist-tools-paywall.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const onboardingSrc = readFileSync(join(here, "../components/pre-login-onboarding.tsx"), "utf8");

describe("C3.1 header atmosphere continuity", () => {
  it("bleeds release create/edit under status bar like Releases list", () => {
    assert.match(appSrc, /isReleaseFormBleedRoute/);
    assert.match(appSrc, /\/releases\/new/);
    assert.match(appSrc, /releases\\\/\[\^\/\]\+\\\/edit/);
    assert.match(createSrc, /dubhub-app-form-canvas/);
    assert.match(editSrc, /dubhub-app-form-canvas/);
    assert.match(createSrc, /APP_MATERIAL_RELEASE_FORM_TOP_CLASS/);
    assert.match(editSrc, /APP_MATERIAL_RELEASE_FORM_TOP_CLASS/);
    assert.equal(APP_MATERIAL_RELEASE_FORM_TOP_CLASS, "dubhub-app-release-form-top");
    assert.match(cssSrc, /\.dubhub-app-release-form-top/);
    assert.match(cssSrc, /safe-area-inset-top/);
    assert.doesNotMatch(homeSrc, /dubhub-app-release-form-top|isReleaseFormBleedRoute/);
  });
});

describe("C3.1 Back chevron", () => {
  it("matches onboarding icon language without changing handlers", () => {
    assert.equal(APP_MATERIAL_BACK_ICON_CLASS, PRE_LOGIN_BACK_ICON_CLASS);
    assert.match(onboardingSrc, /ChevronLeft/);
    assert.match(onboardingSrc, /PRE_LOGIN_BACK_ICON_CLASS/);
    assert.match(createSrc, /ChevronLeft/);
    assert.match(editSrc, /ChevronLeft/);
    assert.match(createSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(editSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /min-h-11/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /min-w-11/);
    assert.doesNotMatch(createSrc, /ArrowLeft|>\s*Back\s*</);
    assert.doesNotMatch(editSrc, /ArrowLeft/);
    assert.match(createSrc, /aria-label="Back"/);
    assert.match(editSrc, /aria-label="Back to Releases"/);
    assert.match(createSrc, /onClick=\{handleBack\}/);
    assert.match(editSrc, /onClick=\{handleBack\}/);
    // Visible label removed; aria-label retains destination wording for a11y.
    assert.doesNotMatch(
      editSrc.replace(/aria-label="Back to Releases"/g, ""),
      /Back to Releases/,
    );
  });
});

describe("C3.1 Delete Release surface", () => {
  it("keeps delete mechanics; neutral surface; red content", () => {
    assert.match(editSrc, /menu-delete-release/);
    assert.match(editSrc, /setShowDeleteModal\(true\)/);
    assert.match(editSrc, /APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS/);
    assert.match(editSrc, /text-red-400/);
    assert.match(editSrc, /Delete Release/);
    assert.doesNotMatch(
      editSrc.slice(editSrc.indexOf("menu-delete-release") - 200, editSrc.indexOf("menu-delete-release")),
      /text-destructive/,
    );
    assert.match(APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS, /dubhub-app-destructive-action-surface/);
    assert.doesNotMatch(APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS, /border-destructive|bg-destructive/);
    assert.match(editSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
  });
});

describe("C3.1 smoked Schedule / timezone sheets", () => {
  it("uses opt-in sheet backdrop + glass surface; Comments/paywall untouched", () => {
    assert.equal(APP_MATERIAL_SHEET_BACKDROP_CLASS, "dubhub-app-sheet-backdrop");
    assert.match(drawerSrc, /APP_MATERIAL_SHEET_BACKDROP_CLASS/);
    assert.match(drawerSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.match(tzSrc, /APP_MATERIAL_SHEET_BACKDROP_CLASS/);
    assert.match(tzSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.match(cssSrc, /\.dubhub-app-sheet-backdrop/);
    assert.match(cssSrc, /\.dark \.dubhub-app-sheet-surface[\s\S]*?backdrop-filter:\s*blur\(20px\)/);
    assert.doesNotMatch(commentsSrc, /APP_MATERIAL_SHEET_BACKDROP|dubhub-app-sheet-backdrop/);
    assert.doesNotMatch(paywallSrc, /APP_MATERIAL_SHEET_BACKDROP|dubhub-app-sheet-backdrop/);
    assert.match(drawerSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.match(statusSrc, /APP_MATERIAL_SEGMENT_ACTIVE_CLASS/);
    assert.match(APP_MATERIAL_SEGMENT_ACTIVE_CLASS, /dubhub-app-segment-active/);
    assert.match(cssSrc, /\.dark \.dubhub-app-segment-active/);
  });

  it("preserves schedule field wiring and C3 field helpers", () => {
    assert.match(statusSrc, /onComingSoonChange/);
    assert.match(statusSrc, /type="date"/);
    assert.match(statusSrc, /APP_MATERIAL_FIELD_CLASS/);
    assert.equal(APP_MATERIAL_FIELD_CLASS.includes("dubhub-app-field"), true);
    assert.match(drawerSrc, /STABLE_HEIGHT|stableHeight/);
  });
});

describe("C3.1 freezes C1.1 and C3 ceramics", () => {
  it("does not regress skeleton delay or form primary", () => {
    assert.equal(RELEASE_FEED_SKELETON_DELAY_MS, 200);
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /rounded-\[15px\]/);
    assert.match(createSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.match(editSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
  });
});
