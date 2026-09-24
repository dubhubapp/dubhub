/**
 * Slice C3 — authenticated form/control material contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_FIELD_CLASS,
  APP_MATERIAL_FIELD_SUCCESS_CLASS,
  APP_MATERIAL_FORM_CANVAS_CLASS,
  APP_MATERIAL_FORM_PRIMARY_CLASS,
  SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS,
  APP_MATERIAL_SEGMENT_ACTIVE_CLASS,
  APP_MATERIAL_SEGMENT_INACTIVE_CLASS,
  APP_MATERIAL_SELECT_CONTENT_CLASS,
  APP_MATERIAL_SELECT_ITEM_CLASS,
  APP_MATERIAL_TOOL_ROW_CLASS,
} from "@/lib/app-material";
import { RELEASE_FEED_SKELETON_DELAY_MS } from "@/lib/release-tracker-delayed-skeleton";
import { APP_MATERIAL_RELEASES_ADD_CTA_CLASS } from "@/lib/app-material";

const here = dirname(fileURLToPath(import.meta.url));
const statusSrc = readFileSync(join(here, "../components/release-status-fields.tsx"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/release-form-drawer.tsx"), "utf8");
const heroSrc = readFileSync(join(here, "../components/release-form-hero.tsx"), "utf8");
const toolsSrc = readFileSync(join(here, "../components/release-tools-management-row.tsx"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const submitSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const tzSrc = readFileSync(join(here, "../components/release-timezone-picker-sheet.tsx"), "utf8");
const sheetSrc = readFileSync(join(here, "../components/ui/sheet.tsx"), "utf8");
const inputSrc = readFileSync(join(here, "../components/ui/input.tsx"), "utf8");
const selectSrc = readFileSync(join(here, "../components/ui/select.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const paywallSrc = readFileSync(join(here, "../components/verified-artist-tools-paywall.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

describe("C3 form material opt-in (no global Input/Select rewrite)", () => {
  it("does not bake field material into shared Input/Select defaults", () => {
    assert.doesNotMatch(inputSrc, /dubhub-app-field|APP_MATERIAL_FIELD/);
    assert.doesNotMatch(selectSrc, /dubhub-app-field|APP_MATERIAL_SELECT/);
    assert.match(APP_MATERIAL_FIELD_CLASS, /dubhub-app-field/);
    assert.match(cssSrc, /\.dark \.dubhub-app-field/);
    assert.doesNotMatch(
      cssSrc.slice(cssSrc.indexOf(".dark .dubhub-app-field"), cssSrc.indexOf(".dark .dubhub-app-select-content")),
      /backdrop-filter/,
    );
  });

  it("Sheet overlayClassName is opt-in only", () => {
    assert.match(sheetSrc, /overlayClassName/);
    assert.match(tzSrc, /overlayClassName=\{APP_MATERIAL_SHEET_BACKDROP_CLASS\}/);
  });
});

describe("C3 segments + schedule + drawer", () => {
  it("uses dark material selected segments (no saturated blue fill)", () => {
    assert.match(APP_MATERIAL_SEGMENT_ACTIVE_CLASS, /dubhub-app-segment-active/);
    assert.doesNotMatch(APP_MATERIAL_SEGMENT_ACTIVE_CLASS, /#0a83ff|bg-accent|border-accent/);
    assert.match(statusSrc, /APP_MATERIAL_SEGMENT_ACTIVE_CLASS/);
    assert.doesNotMatch(statusSrc, /bg-accent|border-accent text-accent/);
    assert.match(APP_MATERIAL_SEGMENT_INACTIVE_CLASS, /bg-white\/\[0\.06\]/);
  });

  it("drawer uses premium surface/backdrop and ceramic Done", () => {
    assert.match(drawerSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.match(drawerSrc, /APP_MATERIAL_SHEET_BACKDROP_CLASS/);
    assert.match(drawerSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.doesNotMatch(drawerSrc, /bg-zinc-950|bg-black\/80/);
  });

  it("preserves schedule field wiring", () => {
    assert.match(statusSrc, /onComingSoonChange/);
    assert.match(statusSrc, /onReleaseDateChange/);
    assert.match(statusSrc, /onTimingDraftChange/);
    assert.match(statusSrc, /type="date"/);
    assert.match(statusSrc, /type="time"/);
    assert.match(statusSrc, /APP_MATERIAL_FIELD_CLASS/);
  });
});

describe("C3 release create/edit + tools + artwork", () => {
  it("applies form canvas and ceramic primary CTAs", () => {
    assert.equal(APP_MATERIAL_FORM_CANVAS_CLASS, "dubhub-app-form-canvas");
    assert.match(createSrc, /dubhub-app-form-canvas/);
    assert.match(editSrc, /dubhub-app-form-canvas/);
    assert.match(createSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.match(editSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /rounded-\[15px\]/);
  });

  it("artwork + tool rows stay non-card; delete remains destructive", () => {
    assert.match(heroSrc, /APP_MATERIAL_ARTWORK_PICKER_CLASS/);
    assert.match(toolsSrc, /APP_MATERIAL_TOOL_ROW_CLASS/);
    assert.doesNotMatch(APP_MATERIAL_TOOL_ROW_CLASS, /rounded-xl|shadow-lg|backdrop-blur/);
    assert.match(editSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(editSrc, /Delete release\?/);
  });
});

describe("C3 submit metadata", () => {
  it("applies premium fields/selects and green success (not cyan glow CTA)", () => {
    assert.match(appSrc, /SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS/);
    assert.match(SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS, /dubhub-app-form-canvas/);
    assert.match(submitSrc, /bg-transparent/);
    assert.match(submitSrc, /APP_MATERIAL_FIELD_CLASS/);
    assert.match(submitSrc, /APP_MATERIAL_SELECT_TRIGGER_CLASS/);
    assert.match(submitSrc, /APP_MATERIAL_SELECT_CONTENT_CLASS/);
    assert.match(submitSrc, /APP_MATERIAL_SELECT_ITEM_CLASS/);
    assert.match(APP_MATERIAL_SELECT_ITEM_CLASS, /rounded-\[11px\]/);
    assert.match(APP_MATERIAL_FIELD_SUCCESS_CLASS, /dubhub-app-field-success/);
    assert.match(submitSrc, /APP_MATERIAL_FORM_PRIMARY_TALL_CLASS/);
    assert.doesNotMatch(submitSrc, /animate-submit-edge-trace|34,211,238/);
    assert.match(submitSrc, /data-testid="button-submit"/);
    assert.match(submitSrc, /Submit Track ID/);
  });
});

describe("C3 global safety + C1.1 / C2 freeze", () => {
  it("does not touch Home, Comments, or paywall", () => {
    assert.doesNotMatch(homeSrc, /dubhub-app-form-canvas|APP_MATERIAL_FIELD_CLASS/);
    assert.doesNotMatch(commentsSrc, /APP_MATERIAL_FIELD_CLASS|dubhub-app-form-canvas/);
    assert.doesNotMatch(paywallSrc, /APP_MATERIAL_FIELD_CLASS|dubhub-app-form-canvas/);
  });

  it("preserves Add Release CTA radius and skeleton delay", () => {
    assert.match(APP_MATERIAL_RELEASES_ADD_CTA_CLASS, /rounded-\[18px\]/);
    assert.equal(RELEASE_FEED_SKELETON_DELAY_MS, 200);
  });
});
