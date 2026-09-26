/**
 * VAT-ANON-5.2 — anonymous ID info interaction + compact Comments presentation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_ID_INFO_BODY,
  ANONYMOUS_ID_INFO_TITLE,
} from "./artist-id-comments-actions";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const popoverUiSrc = readFileSync(join(here, "../components/ui/popover.tsx"), "utf8");
const statInfoSrc = readFileSync(join(here, "../components/stat-info-popover.tsx"), "utf8");

describe("VAT-ANON-5.2 Info popover stacking vs Comments drawer", () => {
  it("default PopoverContent is z-50 (below Comments drawer z-60+)", () => {
    assert.match(popoverUiSrc, /z-50/);
    assert.match(commentsSrc, /drawerStackZ = elevatedStack \? "z-\[110\]" : "z-\[60\]"/);
  });

  it("StatInfoPopover accepts contentClassName + modal for nested sheets", () => {
    assert.match(statInfoSrc, /contentClassName\?:/);
    assert.match(statInfoSrc, /modal\?:/);
    assert.match(statInfoSrc, /modal=\{modal\}/);
    assert.match(statInfoSrc, /contentClassName/);
    assert.match(statInfoSrc, /stat-info-popover-trigger/);
    assert.match(statInfoSrc, /stopPropagation/);
    assert.match(
      statInfoSrc,
      /must pass contentClassName with a higher z-index|z-50/,
    );
  });

  it("StatInfoPopover uses toast material surface, not flat bg-popover", () => {
    assert.match(statInfoSrc, /APP_MATERIAL_TOAST_SURFACE_CLASS/);
    assert.match(statInfoSrc, /border-transparent bg-transparent/);
    assert.match(statInfoSrc, /shadow-none/);
    assert.doesNotMatch(statInfoSrc, /bg-popover|border-border\/80|shadow-lg/);
  });

  it("StatInfoPopover centers compact info copy by default", () => {
    assert.match(statInfoSrc, /text-center text-foreground\/90/);
  });

  it("Comments anonymous Info uses modal + alertDialogStackZ above the drawer", () => {
    const gridIdx = commentsSrc.indexOf("grid-cols-[2rem_minmax(0,1fr)_2rem]");
    assert.ok(gridIdx > 0);
    const row = commentsSrc.slice(
      gridIdx,
      commentsSrc.indexOf('data-testid="artist-identification-status-divider"'),
    );
    assert.match(row, /StatInfoPopover/);
    assert.match(row, /\bmodal\b/);
    assert.match(row, /contentClassName=\{alertDialogStackZ\}/);
    assert.doesNotMatch(row, /bg-popover|border-border/);
    assert.match(row, /h-8 w-8/);
    assert.match(row, /anonymous-identification-info-content/);
  });
});

describe("VAT-ANON-5.2 compact anonymous presentation", () => {
  it("keeps pill + title + info on one compact containerless centred row", () => {
    const gridIdx = commentsSrc.indexOf("grid-cols-[2rem_minmax(0,1fr)_2rem]");
    const row = commentsSrc.slice(
      gridIdx,
      commentsSrc.indexOf('data-testid="artist-identification-status-divider"'),
    );
    assert.doesNotMatch(row, /rounded-lg border border-white\/10 bg-white\/\[0\.04\]/);
    assert.doesNotMatch(row, /px-2\.5 py-1\.5/);
    assert.match(row, /artist-identification-status-grid/);
    assert.match(row, /grid-cols-\[2rem_minmax\(0,1fr\)_2rem\]/);
    assert.match(row, /justify-center/);
    assert.match(row, /anonymous-identification-title-label/);
    assert.match(row, /CommentsPostIdentificationPill/);
    const pillIdx = row.indexOf("CommentsPostIdentificationPill");
    const titleIdx = row.indexOf("anonymous-identification-title-label");
    const infoIdx = row.indexOf("StatInfoPopover");
    assert.ok(pillIdx >= 0 && titleIdx > pillIdx && infoIdx > titleIdx);
  });

  it("anonymous pill reuses the same Identified glow chrome as other Comments pills", () => {
    assert.match(commentsSrc, /const COMMENTS_IDENTIFIED_PILL_CLASS = STATUS_GLOW_PILL_CLASS/);
    const pillFn = commentsSrc.slice(
      commentsSrc.indexOf("function CommentsPostIdentificationPill"),
      commentsSrc.indexOf("function CommentsPostIdentificationPill") + 2200,
    );
    assert.match(pillFn, /COMMENTS_IDENTIFIED_PILL_CLASS/);
    assert.match(pillFn, /artist_verified_anonymous/);
    assert.match(pillFn, /COMMENTS_IDENTIFIED_PILL_STYLE/);
  });

  it("info copy updated; no identity leak; gated to anonymous only", () => {
    assert.equal(ANONYMOUS_ID_INFO_TITLE, "Why is the artist hidden?");
    assert.equal(
      ANONYMOUS_ID_INFO_BODY,
      "An artist has confirmed this track but is keeping their identity private for now. Like this post and we’ll let you know when they reveal the full ID or link it to a release.",
    );
    assert.doesNotMatch(ANONYMOUS_ID_INFO_BODY, /@|artistId|uuid|claim/i);
    assert.match(commentsSrc, /if \(!showArtistIdentificationHeader\) return null;/);
    const publicPill = commentsSrc.slice(
      commentsSrc.indexOf("function CommentsPostIdentificationPill"),
      commentsSrc.indexOf("function CommentsPostIdentificationPill") + 1600,
    );
    assert.doesNotMatch(publicPill, /StatInfoPopover|ANONYMOUS_ID_INFO/);
  });
});
