/**
 * Slice C2 — opt-in Dialog/Sheet overlay material + Releases Add CTA radius.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SURFACE_CLASS,
  APP_MATERIAL_RELEASES_ADD_CTA_CLASS,
  APP_MATERIAL_SHEET_SURFACE_CLASS,
} from "@/lib/app-material";
import { RELEASE_FEED_SKELETON_DELAY_MS } from "@/lib/release-tracker-delayed-skeleton";
import { RELEASE_TRACKER_ADD_CTA_CLASS, RELEASE_TRACKER_ADD_HREF } from "@/lib/release-tracker-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(join(here, "../components/ui/dialog.tsx"), "utf8");
const alertSrc = readFileSync(join(here, "../components/ui/alert-dialog.tsx"), "utf8");
const sheetSrc = readFileSync(join(here, "../components/ui/sheet.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const bottomNavSrc = readFileSync(join(here, "../components/bottom-navigation.tsx"), "utf8");
const timezoneSrc = readFileSync(
  join(here, "../components/release-timezone-picker-sheet.tsx"),
  "utf8",
);
const pushSrc = readFileSync(join(here, "../components/push-permission-prompt.tsx"), "utf8");
const delayedSrc = readFileSync(join(here, "./release-tracker-delayed-skeleton.ts"), "utf8");

describe("C2 opt-in overlay material (not global primitive rewrite)", () => {
  it("does not bake overlay material into shared Dialog/AlertDialog/Sheet defaults", () => {
    assert.doesNotMatch(dialogSrc, /dubhub-app-overlay/);
    assert.doesNotMatch(alertSrc, /dubhub-app-overlay/);
    assert.doesNotMatch(sheetSrc, /dubhub-app-sheet-surface|dubhub-app-overlay/);
    assert.equal(APP_MATERIAL_OVERLAY_SURFACE_CLASS, "dubhub-app-overlay-surface");
    assert.equal(APP_MATERIAL_OVERLAY_BACKDROP_CLASS, "dubhub-app-overlay-backdrop");
    assert.equal(APP_MATERIAL_SHEET_SURFACE_CLASS, "dubhub-app-sheet-surface");
    assert.match(cssSrc, /\.dubhub-app-overlay-surface/);
    assert.match(cssSrc, /\.dubhub-app-overlay-backdrop/);
    assert.match(cssSrc, /\.dubhub-app-sheet-surface/);
  });

  it("migrates only low-risk confirmation overlays", () => {
    assert.match(createSrc, /APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS/);
    assert.match(createSrc, /APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS/);
    assert.match(createSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(editSrc, /APP_MATERIAL_DIALOG_CONTENT_CLASS/);
    assert.match(editSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(detailSrc, /APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS/);
    assert.match(bottomNavSrc, /APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS/);
    assert.match(timezoneSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.match(APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS, /max-w-sm/);
    assert.match(APP_MATERIAL_DIALOG_CONTENT_CLASS, /max-w-md/);
  });

  it("leaves Comments and push-prompt material / mechanics alone", () => {
    assert.doesNotMatch(commentsSrc, /APP_MATERIAL_OVERLAY|dubhub-app-overlay|dubhub-app-sheet/);
    assert.doesNotMatch(pushSrc, /APP_MATERIAL_OVERLAY|dubhub-app-overlay/);
    assert.match(commentsSrc, /DrawerContent/);
    assert.match(pushSrc, /#4ae9df/);
  });

  it("does not touch Home / playback files", () => {
    assert.doesNotMatch(homeSrc, /dubhub-app-overlay|APP_MATERIAL_OVERLAY|APP_MATERIAL_SHEET/);
  });

  it("keeps destructive semantics on delete/discard/cancel-post actions", () => {
    assert.match(APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS, /bg-destructive/);
    assert.match(createSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(editSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(bottomNavSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, /bg-white/);
    assert.match(APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS, /bg-white\/\[0\.06\]/);
  });

  it("backdrop blur is restrained (≤2px) and surface has no backdrop-filter", () => {
    assert.match(cssSrc, /\.dubhub-app-overlay-backdrop[\s\S]*?backdrop-filter:\s*blur\(2px\)/);
    const surfaceBlock = cssSrc.slice(
      cssSrc.indexOf(".dark .dubhub-app-overlay-surface"),
      cssSrc.indexOf(".dark .dubhub-app-sheet-surface"),
    );
    assert.doesNotMatch(surfaceBlock, /backdrop-filter/);
  });
});

describe("C2 Releases Add Release CTA geometry", () => {
  it("softens radius only; route/height/ceramic fill unchanged", () => {
    assert.equal(RELEASE_TRACKER_ADD_HREF, "/releases/new");
    assert.equal(RELEASE_TRACKER_ADD_CTA_CLASS, APP_MATERIAL_RELEASES_ADD_CTA_CLASS);
    assert.match(APP_MATERIAL_RELEASES_ADD_CTA_CLASS, /h-12/);
    assert.match(APP_MATERIAL_RELEASES_ADD_CTA_CLASS, /w-full/);
    assert.match(APP_MATERIAL_RELEASES_ADD_CTA_CLASS, /rounded-\[18px\]/);
    assert.doesNotMatch(APP_MATERIAL_RELEASES_ADD_CTA_CLASS, /rounded-xl\b|rounded-full/);
    assert.match(APP_MATERIAL_RELEASES_ADD_CTA_CLASS, /bg-white/);
    assert.match(APP_MATERIAL_RELEASES_ADD_CTA_CLASS, /text-slate-900/);
    assert.match(trackerSrc, /RELEASE_TRACKER_ADD_CTA_CLASS/);
    assert.match(trackerSrc, /Add Release/);
    assert.match(trackerSrc, /navigate\(RELEASE_TRACKER_ADD_HREF\)/);
  });
});

describe("C2 freezes C1.1 skeleton delay", () => {
  it("leaves delay threshold and query wiring untouched", () => {
    assert.equal(RELEASE_FEED_SKELETON_DELAY_MS, 200);
    assert.match(delayedSrc, /RELEASE_FEED_SKELETON_DELAY_MS = 200/);
    assert.match(trackerSrc, /useDelayedReleaseFeedSkeleton/);
    assert.match(trackerSrc, /staleTime: 0/);
    assert.match(trackerSrc, /queryKey: \["\/api\/releases\/feed", effectiveScope, effectiveView\]/);
  });
});
