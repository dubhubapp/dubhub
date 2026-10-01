/**
 * Phase 3C.2 — Release Detail atmosphere + Create/Edit presentation.
 * Behaviour, routing, and media stay fixed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_FIELD_CLASS,
  APP_MATERIAL_FORM_PRIMARY_CLASS,
  APP_MATERIAL_RELEASE_PAGE_BACK_BUTTON_CLASS,
} from "./app-material";
import { RELEASE_COMING_SOON_PILL_CLASS } from "./release-status-pill";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const heroSrc = readFileSync(join(here, "../components/release-form-hero.tsx"), "utf8");
const attachSrc = readFileSync(
  join(here, "../components/release-attach-clips-management.tsx"),
  "utf8",
);
const clipsSrc = readFileSync(join(here, "../components/release-attached-clips.tsx"), "utf8");
const thumbSrc = readFileSync(join(here, "../components/release-artwork-thumb.tsx"), "utf8");
const lightboxSrc = readFileSync(
  join(here, "../components/release-artwork-lightbox.tsx"),
  "utf8",
);
const imageLightboxSrc = readFileSync(
  join(here, "../components/image-lightbox.tsx"),
  "utf8",
);
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

function slice(from: string, to: string): string {
  const start = cssSrc.indexOf(from);
  assert.ok(start >= 0, from);
  const end = cssSrc.indexOf(to, start + from.length);
  assert.ok(end > start, to);
  return cssSrc.slice(start, end);
}

describe("Phase 3C.2 Release Detail Light atmosphere", () => {
  it("keeps the Dark artwork wash and blends Light into the approved canvas", () => {
    const dark = slice(
      ".dark .dubhub-app-release-detail-canvas {",
      ".dark .dubhub-app-release-detail-canvas::before",
    );
    assert.match(dark, /background-color:\s*#0f1324/);
    assert.match(dark, /rgba\(10, 131, 255, 0\.38\)/);
    assert.match(dark, /--release-atmosphere-rgb:\s*12, 58, 120/);
    const darkWash = slice(
      ".dark .dubhub-app-release-detail-canvas::before {",
      ".dark .dubhub-app-release-detail-canvas[data-release-atmosphere=\"artwork\"]",
    );
    assert.match(darkWash, /ellipse 150% 55% at 50% -18%/);
    assert.match(darkWash, /rgba\(var\(--release-atmosphere-rgb\), 0\.94\) 0%/);
    assert.match(darkWash, /#0f1324 100%/);

    const light = slice(
      ":root:not(.dark) .dubhub-app-release-detail-canvas,",
      ":root:not(.dark) .dubhub-app-release-detail-canvas::before",
    );
    assert.match(light, /background-color:\s*#F6F8FC/);
    assert.match(light, /background-image:\s*var\(--page-canvas-atmosphere\)/);
    assert.doesNotMatch(light, /hsl\(var\(--background\)\)/);
    const lightWash = slice(
      ":root:not(.dark) .dubhub-app-release-detail-canvas::before,",
      ":root:not(.dark) .dubhub-app-release-detail-canvas[data-release-atmosphere=\"artwork\"]",
    );
    assert.match(lightWash, /ellipse 150% 55% at 50% -18%/);
    assert.match(lightWash, /rgba\(var\(--release-atmosphere-rgb\), 0\.22\) 0%/);
    assert.match(lightWash, /transparent 100%/);
    assert.doesNotMatch(lightWash, /#0f1324/);
    assert.match(detailSrc, /--release-atmosphere-rgb/);
    assert.match(detailSrc, /data-release-atmosphere=\{atmosphereMode\}/);
  });

  it("hides the artwork wash for brand and pending, and leaves the image fixed", () => {
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-release-detail-canvas\[data-release-atmosphere="brand"\]::before[\s\S]*?opacity:\s*0/,
    );
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-release-detail-canvas\[data-atmosphere-pending="true"\]::before[\s\S]*?opacity:\s*0/,
    );
    assert.match(thumbSrc, /object-cover/);
    assert.doesNotMatch(thumbSrc, /brightness-|sepia-|grayscale/);
    assert.match(lightboxSrc, /ImageLightbox/);
    assert.match(imageLightboxSrc, /bg-black\/85/);
    assert.match(imageLightboxSrc, /text-white/);
    assert.doesNotMatch(imageLightboxSrc, /#F6F8FC|page-canvas-atmosphere/);
    assert.doesNotMatch(lightboxSrc, /#F6F8FC|page-canvas-atmosphere/);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /#f59e0b/);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /#0f1324/);
  });
});

describe("Phase 3C.2 Create/Edit Light presentation", () => {
  it("uses the approved canvas, a readable empty picker, and the existing primary CTA", () => {
    assert.match(cssSrc, /--form-canvas-bg:\s*#F6F8FC/);
    assert.match(cssSrc, /--form-canvas-image:\s*var\(--page-canvas-atmosphere\)/);
    assert.match(cssSrc, /--form-canvas-bg:\s*#0f1324/);
    assert.match(cssSrc, /--artwork-bg:\s*#FFFFFF/);
    assert.match(cssSrc, /--artwork-border:\s*#DCE3EC/);
    assert.match(cssSrc, /--artwork-bg:\s*rgba\(22, 30, 56, 0\.72\)/);
    assert.match(createSrc, /dubhub-app-form-canvas/);
    assert.match(editSrc, /dubhub-app-form-canvas/);
    assert.match(heroSrc, /onArtworkPress/);
    assert.match(heroSrc, /object-cover/);
    assert.match(heroSrc, /text-muted-foreground dark:text-white\/80/);
    assert.match(heroSrc, /dark:border-white\/30 dark:bg-white\/\[0\.07\] dark:text-white\/80/);
    assert.match(heroSrc, /text-foreground\/70 dark:text-muted-foreground/);
    assert.match(heroSrc, /text-sm text-muted-foreground leading-snug/);
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /dubhub-app-primary-action/);
    assert.match(createSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.match(cssSrc, /--primary-action-bg:\s*#0A83FF/);
    assert.match(cssSrc, /--primary-action-disabled-fg:\s*#667085/);
    assert.match(APP_MATERIAL_RELEASE_PAGE_BACK_BUTTON_CLASS, /text-foreground/);
    assert.match(APP_MATERIAL_RELEASE_PAGE_BACK_BUTTON_CLASS, /dark:text-white/);
  });

  it("wires attached-post search and result chrome to semantic Light surfaces", () => {
    assert.match(attachSrc, /APP_MATERIAL_FIELD_CLASS/);
    assert.match(APP_MATERIAL_FIELD_CLASS, /dubhub-app-field/);
    assert.doesNotMatch(attachSrc, /bg-black\/40/);
    assert.match(attachSrc, /onSearchTermChange/);
    assert.match(clipsSrc, /border border-\[#DCE3EC\] bg-white/);
    assert.match(clipsSrc, /dark:border-white\/10 dark:bg-black\/30/);
    assert.match(clipsSrc, /bg-\[#EDF2F8\] dark:bg-black\/40/);
    assert.match(clipsSrc, /object-cover/);
    assert.match(clipsSrc, /nextSelectedPostIds|onToggleSelect/);
    assert.match(clipsSrc, /"Attach"/);
  });

  it("leaves release behaviour, Home, and video untouched", () => {
    assert.match(detailSrc, /navigate\(`\/releases\/\$\{id\}\/edit`\)/);
    assert.match(createSrc, /handleBack/);
    assert.match(editSrc, /handleBack/);
    assert.doesNotMatch(homeSrc, /dubhub-release-form|dubhub-app-release-detail-canvas/);
    assert.doesNotMatch(videoCardSrc, /dubhub-release-form|page-canvas-atmosphere/);
  });
});
