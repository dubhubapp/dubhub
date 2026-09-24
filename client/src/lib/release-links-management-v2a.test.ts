/**
 * Release Links Management V2A behaviors retained under V2B
 * (edit URL/type, platform lock, VAT gate). Info popover superseded by V2B copy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RELEASE_LINKS_VISIBILITY_COPY } from "@/lib/release-links-visibility-copy";
import { isPaidOnlyReleaseLink } from "@/lib/release-link-limit";
import { purposeOptionLabel } from "@shared/release-link-platforms";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const linksSrc = readFileSync(
  join(here, "../components/release-links-sheet.tsx"),
  "utf8",
);

const PAID_PRESAVE_GATE =
  /if\s*\(\s*!linkUnlimited\s*&&\s*isPaidOnlyReleaseLink\(\s*linkPlatform\s*,\s*purpose\s*\)\s*\)/;
const UNGATED_PRESAVE =
  /if\s*\(\s*isPaidOnlyReleaseLink\(\s*linkPlatform\s*,\s*purpose\s*\)\s*\)/;

function extractHandleUpdateDraftLink(src: string): string {
  const start = src.indexOf("const handleUpdateDraftLink");
  assert.ok(start > 0, "handleUpdateDraftLink missing");
  const nextHandle = src.indexOf("\n  const handle", start + 1);
  const nextData = src.indexOf("\n  const { data:", start + 1);
  const candidates = [nextHandle, nextData].filter((i) => i > start);
  assert.ok(candidates.length > 0, "handleUpdateDraftLink block end missing");
  return src.slice(start, Math.min(...candidates));
}

function extractStartEditDraftLink(src: string): string {
  const start = src.indexOf("const startEditDraftLink");
  assert.ok(start > 0, "startEditDraftLink missing");
  const end = src.indexOf("\n  const handleUpdateDraftLink", start);
  assert.ok(end > start, "startEditDraftLink block end missing");
  return src.slice(start, end);
}

describe("Links visibility (V2B supersedes Info popover)", () => {
  it("permanent visibility copy is present; no StatInfoPopover", () => {
    assert.ok(RELEASE_LINKS_VISIBILITY_COPY.includes("Listening links become visible"));
    assert.match(linksSrc, /RELEASE_LINKS_VISIBILITY_COPY/);
    assert.doesNotMatch(linksSrc, /StatInfoPopover/);
  });
});

describe("Edit entry interaction", () => {
  it("row body opens edit; URL is not an external anchor; delete lives in EDIT", () => {
    assert.match(linksSrc, /release-link-row-edit-/);
    assert.match(linksSrc, /onEdit/);
    assert.match(linksSrc, /data-testid="release-link-delete"/);
    assert.doesNotMatch(linksSrc, /Trash2/);
    assert.doesNotMatch(linksSrc, /target="_blank"/);
  });

  it("row shows platform title with purpose · truncated URL preview", () => {
    assert.match(linksSrc, /getPlatformLabel\(link\.platform\)/);
    assert.match(linksSrc, /purposeLabel \? `\$\{purposeLabel\} · `/);
    assert.ok(linksSrc.includes('link.url.replace(/^https?:\\/\\//i, "")'));
    assert.match(linksSrc, /truncate/);
  });

  it("platform-specific purpose labels remain canonical", () => {
    assert.equal(purposeOptionLabel("spotify", "presave"), "Pre-save");
    assert.equal(purposeOptionLabel("amazon_music", "presave"), "Pre-save");
    assert.equal(purposeOptionLabel("apple_music", "presave"), "Pre-add");
    assert.equal(purposeOptionLabel("beatport", "presave"), "Pre-order");
    assert.equal(purposeOptionLabel("bandcamp", "presave"), "Pre-order");
  });
});

describe("Edit mode UX", () => {
  it("reuses form with Save Changes; prefill via onStartEditLink", () => {
    assert.match(linksSrc, /"Edit link"/);
    assert.match(linksSrc, /"Save Changes"/);
    assert.match(linksSrc, /release-link-save-changes/);
    assert.match(createSrc, /onStartEditLink=\{startEditDraftLink\}/);
    assert.match(editSrc, /onStartEditLink=\{startEditDraftLink\}/);
    assert.match(createSrc, /onUpdateLink=\{handleUpdateDraftLink\}/);
    assert.match(editSrc, /onUpdateLink=\{handleUpdateDraftLink\}/);
  });

  it("create and edit startEditDraftLink prefills platform, url, and purpose", () => {
    for (const [label, src] of [
      ["create", createSrc],
      ["edit", editSrc],
    ] as const) {
      const block = extractStartEditDraftLink(src);
      assert.match(block, /setLinkPlatform\(link\.platform\)/, label);
      assert.match(block, /setLinkUrl\(link\.url\)/, label);
      assert.match(block, /setLinkPurpose\(purpose\)/, label);
      assert.match(block, /presave/, label);
    }
  });

  it("platform is locked in edit — no editable picker", () => {
    assert.match(linksSrc, /data-testid="release-link-platform-locked"/);
    assert.match(linksSrc, /aria-disabled="true"/);
  });

  it("cancel clears form without mutating draft; Save updates by platform map", () => {
    assert.match(linksSrc, /release-links-sheet-cancel-edit/);
    assert.match(linksSrc, /resetToList/);
    assert.match(createSrc, /onClearLinkForm=\{clearLinkForm\}/);
    assert.match(editSrc, /onClearLinkForm=\{clearLinkForm\}/);

    for (const [label, src] of [
      ["create", createSrc],
      ["edit", editSrc],
    ] as const) {
      const update = extractHandleUpdateDraftLink(src);
      assert.match(update, /links\.map/, label);
      assert.match(update, /url: linkUrl\.trim\(\)/, label);
      assert.match(update, /linkType: purpose === "listen" \? null : purpose/, label);
      assert.match(update, /clearLinkForm\(\)/, label);
      assert.doesNotMatch(update, /links\.filter/, `${label}: no delete/reinsert`);
    }
  });
});

describe("VAT gate on edit Save Changes", () => {
  it("classifier still marks presave paid-only", () => {
    assert.equal(isPaidOnlyReleaseLink("spotify", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("spotify", "listen"), false);
  });

  it("create+edit update use !linkUnlimited && isPaidOnlyReleaseLink; never ungated", () => {
    for (const [label, src] of [
      ["create", createSrc],
      ["edit", editSrc],
    ] as const) {
      const block = extractHandleUpdateDraftLink(src);
      assert.match(block, PAID_PRESAVE_GATE, label);
      assert.doesNotMatch(block, UNGATED_PRESAVE, label);
      assert.match(block, /openLinksPremiumUpgrade/, label);
      const gateIdx = block.search(PAID_PRESAVE_GATE);
      const mapIdx = block.indexOf("setDraftLinks");
      assert.ok(gateIdx >= 0, `${label}: missing gate`);
      assert.ok(mapIdx > gateIdx, `${label}: draft map after gate`);
      assert.match(block, /return false/, `${label}: VAT returns before mutate`);
    }
  });
});
