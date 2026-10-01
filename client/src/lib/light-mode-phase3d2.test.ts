/**
 * Phase 3D.2 — ID modal depth, First Tag, tick alignment, Identified contrast, comments atmosphere.
 * Presentation only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ID_MARKING_DIALOG_CONTENT_CLASS,
  ID_MARKING_PICKER_FIRST_PILL_CLASS,
  ID_MARKING_PICKER_ROW_CLASS,
} from "../components/id-marking-dialog-styles";
import {
  IDENTIFIED_PILL_PAGE_FILL,
  IDENTIFIED_PILL_PAGE_LABEL_COLOR,
  STATUS_GLOW_PILL_BG,
  getGenreGlowPillStyle,
} from "./genre-styles";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const tickSrc = readFileSync(join(here, "../components/verified-artist.tsx"), "utf8");
const shieldSrc = readFileSync(join(here, "../components/moderator-shield.tsx"), "utf8");
const nameSrc = readFileSync(join(here, "../components/verified-artist-name.tsx"), "utf8");
const bylineSrc = readFileSync(join(here, "../components/release-detail-artist-byline.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

function lightRule(selector: string): string {
  const start = cssSrc.indexOf(selector);
  assert.ok(start >= 0, selector);
  return cssSrc.slice(start, cssSrc.indexOf("}", start));
}

describe("phase 3D.2 final consistency", () => {
  it("gives the Light ID modal an atmospheric shell and keeps white rows", () => {
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /dubhub-id-marking-atmosphere/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /max-w-\[30rem\]/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /max-h-\[80vh\]/);
    assert.match(ID_MARKING_PICKER_ROW_CLASS, /bg-white/);
    assert.match(ID_MARKING_PICKER_ROW_CLASS, /border-\[#DCE3EC\]/);
    assert.match(ID_MARKING_PICKER_ROW_CLASS, /dark:bg-white\/\[0\.03\]/);
    const shell = lightRule(":root:not(.dark) .dubhub-id-marking-atmosphere");
    assert.match(shell, /var\(--page-canvas-atmosphere\)/);
    assert.match(shell, /#F4F7FC/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-id-marking-atmosphere/);
  });

  it("keeps First Tag gold and uses deep-gold Light text", () => {
    assert.match(ID_MARKING_PICKER_FIRST_PILL_CLASS, /border-\[#FFD700\]\/80/);
    assert.match(ID_MARKING_PICKER_FIRST_PILL_CLASS, /bg-\[#FFD700\]\/25/);
    assert.match(ID_MARKING_PICKER_FIRST_PILL_CLASS, /shadow-\[0_0_14px_rgba\(255,215,0,0\.35\)\]/);
    assert.match(ID_MARKING_PICKER_FIRST_PILL_CLASS, /text-\[#8A6200\]/);
    assert.match(ID_MARKING_PICKER_FIRST_PILL_CLASS, /dark:text-white/);
    assert.doesNotMatch(ID_MARKING_PICKER_FIRST_PILL_CLASS, /text-white shadow/);
  });

  it("aligns every verification tick with one baseline", () => {
    assert.match(tickSrc, /dubhub-verified-tick-align/);
    assert.match(tickSrc, /CheckCircle/);
    assert.match(tickSrc, /text-\[#FFD700\]/);
    const align = cssSrc.slice(
      cssSrc.indexOf(".dubhub-verified-tick-align"),
      cssSrc.indexOf("}", cssSrc.indexOf(".dubhub-verified-tick-align")),
    );
    assert.match(align, /translateY\(-0\.14em\)/);
    assert.doesNotMatch(align, /\.dark|not\(\.dark\)/);
    const tickWrapper = shieldSrc.slice(
      shieldSrc.indexOf("const INLINE_ROLE_TICK_WRAPPER"),
      shieldSrc.indexOf("const INLINE_ROLE_SHIELD_ALIGN"),
    );
    assert.doesNotMatch(tickWrapper, /-mt-0\.5/);
    assert.doesNotMatch(nameSrc, /align-\[-0\.1em\]/);
    assert.doesNotMatch(bylineSrc, /align-\[-0\.1em\]/);
    assert.match(videoCardSrc, /UserRoleInlineIcons/);
    assert.doesNotMatch(videoCardSrc, /align-\[-0\.1em\]|-mt-0\.5/);
  });

  it("deepens the Light Identified pill and leaves the Home media pill", () => {
    assert.equal(IDENTIFIED_PILL_PAGE_LABEL_COLOR, "#166534");
    assert.match(IDENTIFIED_PILL_PAGE_FILL, /rgba\(34,197,94,0\.78\)/);
    assert.match(commentsSrc, /dubhub-identified-pill-page/);
    assert.match(commentsSrc, /STATUS_GLOW_PILL_CLASS/);
    assert.match(commentsSrc, /getGenreGlowPillStyle\(\s*STATUS_GLOW_PILL_BG\.identified/);
    const page = lightRule(":root:not(.dark) .dubhub-identified-pill-page");
    assert.match(page, /#166534/);
    assert.match(page, /rgba\(34, 197, 94, 0\.78\)/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-identified-pill-page/);
    assert.doesNotMatch(videoCardSrc, /dubhub-identified-pill-page/);
    const media = getGenreGlowPillStyle(STATUS_GLOW_PILL_BG.identified, "text-white");
    assert.match(String(media.background), /rgba\(/);
    assert.match(String(media.border), /1px solid/);
    assert.match(String(media.boxShadow), /0 0 14px/);
  });

  it("washes the Light comments sheet and leaves the Dark sheet and composer", () => {
    assert.match(commentsSrc, /dubhub-comments-sheet-atmosphere/);
    assert.match(commentsSrc, /h-\[min\(66vh,33rem\)\]/);
    assert.match(commentsSrc, /dark:bg-\[#141a2e\]/);
    assert.match(
      commentsSrc,
      /dark:\[background-image:linear-gradient\(180deg,rgba\(46,62,118,0\.32\)_0%,rgba\(20,26,46,0\)_38%\)\]/,
    );
    assert.match(commentsSrc, /bg-white px-3 py-\[11px\]/);
    const sheet = lightRule(":root:not(.dark) .dubhub-comments-sheet-atmosphere");
    assert.match(sheet, /var\(--page-canvas-atmosphere\)/);
    assert.match(sheet, /#F6F8FC/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-comments-sheet-atmosphere/);
    assert.match(commentsSrc, /from-\[#F6F8FC\] to-transparent dark:from-\[#141a2e\]/);
  });
});
