/**
 * Release links — VAT premium-type Add gate + nested sheet canonical Back.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { isPaidOnlyReleaseLink } from "@/lib/release-link-limit";
import { buildLinkTypeOptions } from "@/lib/release-link-type-options";

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

function extractHandleAddDraftLink(src: string): string {
  const start = src.indexOf("const handleAddDraftLink");
  assert.ok(start > 0, "handleAddDraftLink missing");
  const end = src.indexOf("\n  const handle", start + 1);
  assert.ok(end > start, "handleAddDraftLink block end missing");
  return src.slice(start, end);
}

describe("VAT premium link Add gate", () => {
  it("classifier still marks presave paid-only; listen/download free", () => {
    assert.equal(isPaidOnlyReleaseLink("spotify", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("apple_music", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("spotify", "listen"), false);
    assert.equal(isPaidOnlyReleaseLink("spotify", null), false);
  });

  it("UI unlock for presave follows the same unlimited entitlement as link count", () => {
    const locked = buildLinkTypeOptions({
      platform: "spotify",
      supported: ["presave", "listen"],
      unlimited: false,
    });
    const unlocked = buildLinkTypeOptions({
      platform: "spotify",
      supported: ["presave", "listen"],
      unlimited: true,
    });
    assert.equal(locked.find((o) => o.purpose === "presave")?.locked, true);
    assert.equal(unlocked.find((o) => o.purpose === "presave")?.locked, false);
    assert.equal(unlocked.find((o) => o.purpose === "listen")?.locked, false);
  });

  it("create: unpaid+presave opens VAT; paid+presave does not (linkUnlimited gate)", () => {
    const block = extractHandleAddDraftLink(createSrc);
    assert.match(block, PAID_PRESAVE_GATE);
    assert.doesNotMatch(block, UNGATED_PRESAVE);
    assert.match(block, /openLinksPremiumUpgrade/);
    assert.match(block, /setDraftLinks/);
    assert.match(createSrc, /const linkUnlimited = linkAllowanceQuery\.data\?\.unlimited === true/);
  });

  it("edit: unpaid+presave opens VAT; paid+presave does not (linkUnlimited gate)", () => {
    const block = extractHandleAddDraftLink(editSrc);
    assert.match(block, PAID_PRESAVE_GATE);
    assert.doesNotMatch(block, UNGATED_PRESAVE);
    assert.match(block, /openLinksPremiumUpgrade/);
    assert.match(block, /setDraftLinks/);
    assert.match(editSrc, /const linkUnlimited = linkCapacityQuery\.data\?\.unlimited === true/);
  });

  it("paid path still adds via setDraftLinks after the gated upgrade branch", () => {
    for (const [label, src] of [
      ["create", createSrc],
      ["edit", editSrc],
    ] as const) {
      const block = extractHandleAddDraftLink(src);
      const gateIdx = block.search(PAID_PRESAVE_GATE);
      const addIdx = block.indexOf("setDraftLinks");
      assert.ok(gateIdx >= 0, `${label}: missing gated upgrade`);
      assert.ok(addIdx > gateIdx, `${label}: Add Link path after gate`);
    }
  });
});

describe("release links nested panel Back control", () => {
  it("Platform / Link type panels use canonical ChevronLeft back, not blue Back text", () => {
    assert.match(linksSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(linksSrc, /APP_MATERIAL_BACK_ICON_CLASS/);
    assert.match(linksSrc, /ChevronLeft/);
    assert.match(linksSrc, /aria-label="Back"/);
    assert.match(linksSrc, /data-testid="release-links-sheet-back"/);
    assert.match(linksSrc, /setPanel\("form"\)/);
    assert.equal(APP_MATERIAL_BACK_BUTTON_CLASS.includes("min-h-11"), true);
    assert.equal(APP_MATERIAL_BACK_ICON_CLASS.includes("h-7"), true);
    assert.match(linksSrc, /panel !== "form"/);
    assert.doesNotMatch(linksSrc, />\s*Back\s*</);
    assert.doesNotMatch(linksSrc, /APP_MATERIAL_LINK_CLASS/);
  });

  it("titles Platform and Link type remain; LIST title is Links", () => {
    assert.match(linksSrc, /"Platform"/);
    assert.match(linksSrc, /"Link type"/);
    assert.match(linksSrc, /: "Links"/);
  });
});
