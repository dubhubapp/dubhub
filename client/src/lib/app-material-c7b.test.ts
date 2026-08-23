/**
 * Slice C7B / C7B.1 — Submit entry + metadata presentation contracts.
 * C7B.1 restores pre-C7B Add-your-clip / Trim chrome and paints Track Details
 * atmosphere on the authenticated shell (status-bar continuity).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_FORM_CANVAS_CLASS,
  APP_MATERIAL_FORM_PRIMARY_TALL_CLASS,
  APP_MATERIAL_SELECT_ITEM_CLASS,
  APP_MATERIAL_SHEET_SURFACE_CLASS,
  SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS,
} from "@/lib/app-material";

const here = dirname(fileURLToPath(import.meta.url));
const drawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");
const metadataSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const trimSrc = readFileSync(join(here, "../pages/trim-video.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");

describe("C7B.1 SubmitClipDrawer restored pre-C7B presentation", () => {
  it("restores the pre-C7B sheet surface, rows, and icon wells", () => {
    assert.match(drawerSrc, /bg-surface\/98/);
    assert.match(drawerSrc, /backdrop-blur-md/);
    assert.match(drawerSrc, /border-gray-800/);
    assert.match(drawerSrc, /bg-gray-900\/60/);
    assert.match(drawerSrc, /rounded-xl/);
    assert.match(drawerSrc, /rounded-lg bg-primary\/15 text-primary/);
    assert.match(drawerSrc, /Add your clip/);
    assert.match(drawerSrc, /Choose Video/);
    assert.match(drawerSrc, /Take Video/);
    assert.doesNotMatch(drawerSrc, /dark:bg-\[rgba\(20,26,48,0\.97\)\]/);
    assert.doesNotMatch(drawerSrc, /APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS/);
  });

  it("does not apply high-blur shared sheet surface over Home", () => {
    assert.doesNotMatch(drawerSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.doesNotMatch(drawerSrc, /dubhub-app-sheet-surface/);
    assert.equal(APP_MATERIAL_SHEET_SURFACE_CLASS, "dubhub-app-sheet-surface");
  });

  it("keeps native picker timing and file-selection mechanics", () => {
    assert.match(
      drawerSrc,
      /const NATIVE_PICKER_OPEN_DELAY_MS = Capacitor\.isNativePlatform\(\) \? 280 : 0;/,
    );
    assert.match(drawerSrc, /const handleFileSelect = useCallback/);
    assert.match(drawerSrc, /input\?\.click\(\)/);
    assert.match(drawerSrc, /accept="video\/\*"/);
    assert.match(drawerSrc, /capture="environment"/);
    assert.match(drawerSrc, /window\.setTimeout\(\(\) => openNativePicker/);
    assert.match(drawerSrc, /setLocation\("\/trim-video"\)/);
  });
});

describe("C7B submit metadata leftover chrome", () => {
  it("uses ChevronLeft Back, premium None item, ceramic tall Submit Track ID", () => {
    assert.match(metadataSrc, /ChevronLeft/);
    assert.doesNotMatch(metadataSrc, /ArrowLeft/);
    assert.match(metadataSrc, /onClick=\{handleBack\}/);
    assert.match(metadataSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(
      metadataSrc,
      /SelectItem value=\{SUBMIT_SUBGENRE_NONE_VALUE\} className=\{APP_MATERIAL_SELECT_ITEM_CLASS\}/,
    );
    assert.match(APP_MATERIAL_SELECT_ITEM_CLASS, /rounded-\[11px\]/);
    assert.match(metadataSrc, /APP_MATERIAL_FORM_PRIMARY_TALL_CLASS/);
    assert.match(APP_MATERIAL_FORM_PRIMARY_TALL_CLASS, /rounded-\[18px\]/);
    assert.match(metadataSrc, /Submit Track ID/);
  });

  it("paints form canvas on the shell padding box without a second safe-area inset", () => {
    assert.equal(
      SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS,
      `${APP_MATERIAL_FORM_CANVAS_CLASS} bg-background`,
    );
    assert.match(appSrc, /SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS/);
    assert.match(appSrc, /location\.split\("\?"\)\[0\] === "\/submit-metadata"/);
    assert.match(metadataSrc, /bg-transparent/);
    assert.doesNotMatch(metadataSrc, /safe-area-inset-top/);
    assert.doesNotMatch(metadataSrc, /APP_MATERIAL_FORM_CANVAS_CLASS/);
    assert.match(metadataSrc, /app-page-top-pad/);
  });

  it("does not rewrite schema, field order, XHR, or cancel", () => {
    const titleIdx = metadataSrc.indexOf('name="title"');
    const genreIdx = metadataSrc.indexOf('name="genre"');
    const subIdx = metadataSrc.indexOf('name="subgenre"');
    const descIdx = metadataSrc.indexOf('name="description"');
    assert.ok(titleIdx > 0 && genreIdx > titleIdx && subIdx > genreIdx && descIdx > subIdx);
    assert.match(metadataSrc, /playedDate:/);
    assert.match(metadataSrc, /new XMLHttpRequest\(\)/);
    assert.match(metadataSrc, /Cancel posting\?/);
    assert.match(metadataSrc, /KeyboardResize/);
  });
});

describe("C7B.1 isolation", () => {
  it("does not modify Home and restores Trim cancel chrome", () => {
    assert.match(trimSrc, /ArrowLeft/);
    assert.doesNotMatch(trimSrc, /APP_MATERIAL_OVERLAY_BACKDROP_CLASS/);
    assert.doesNotMatch(trimSrc, /APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS/);
    assert.doesNotMatch(homeSrc, /SUBMIT_CLIP_ACTION_ROW_CLASS/);
    assert.doesNotMatch(homeSrc, /APP_MATERIAL_FORM_CANVAS_CLASS/);
    assert.doesNotMatch(homeSrc, /SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS/);
  });
});
