/**
 * Release detail Edit affordance + scoped release-surface teal removal.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const linksSrc = readFileSync(join(here, "../components/release-links-sheet.tsx"), "utf8");
const attachSrc = readFileSync(
  join(here, "../components/release-attach-clips-management.tsx"),
  "utf8",
);
const titleSheetSrc = readFileSync(join(here, "../components/release-title-sheet.tsx"), "utf8");
const collabSrc = readFileSync(
  join(here, "../components/release-collaborators-sheet.tsx"),
  "utf8",
);
const statusSrc = readFileSync(join(here, "../components/release-status-fields.tsx"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/release-form-drawer.tsx"), "utf8");
const skeletonSrc = readFileSync(
  join(here, "../components/release-detail-skeleton.tsx"),
  "utf8",
);
const linkTypeSrc = readFileSync(
  join(here, "../components/release-link-type-select.tsx"),
  "utf8",
);
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");

const TEAL_LEGACY = /text-accent|bg-accent|ring-accent|hover:bg-accent|tone="teal"|bg-teal-|#4ae9df/;

describe("release detail Edit affordance", () => {
  it("owner/collab Edit is a top-right header icon with unchanged route", () => {
    assert.match(detailSrc, /showEditReleaseAction\s*=\s*canManage\s*&&\s*isArtist/);
    assert.match(detailSrc, /data-testid="button-edit-release"/);
    assert.match(detailSrc, /aria-label=\{isOwner \? "Edit release" : "Manage attachments"\}/);
    assert.match(detailSrc, /navigate\(`\/releases\/\$\{id\}\/edit`\)/);
    assert.match(detailSrc, /<Pencil/);
    // Icon sits in the Back/header action cluster (before artwork/metadata).
    const editIdx = detailSrc.indexOf('data-testid="button-edit-release"');
    const artworkIdx = detailSrc.indexOf('testId="release-detail-artwork"');
    assert.ok(editIdx > 0 && artworkIdx > editIdx);
  });

  it("unauthorized viewers do not get the Edit action; lower Edit control is gone", () => {
    assert.match(detailSrc, /showEditReleaseAction \? \(/);
    assert.doesNotMatch(
      detailSrc,
      /w-full justify-start[\s\S]{0,160}Edit release/,
    );
    assert.doesNotMatch(detailSrc, /Edit2/);
    assert.match(detailSrc, /\/releases\/\$\{id\}\/edit/);
  });
});

describe("release surfaces — no legacy teal", () => {
  it("Links upgrade CTA uses same text-xs size as helper, not text-accent underline", () => {
    assert.match(linksSrc, /release-link-upgrade/);
    assert.match(linksSrc, /RELEASE_UPGRADE_HINT_CLASS/);
    assert.doesNotMatch(linksSrc, /text-accent|hover:underline/);
  });

  it("release sheet inputs use material blue focus, not teal accent wash", () => {
    assert.match(linksSrc, /ring-\[#0a83ff\]\/45/);
    assert.match(attachSrc, /ring-\[#0a83ff\]\/45/);
    assert.match(collabSrc, /ring-\[#0a83ff\]\/45/);
    assert.match(titleSheetSrc, /APP_MATERIAL_FIELD_CLASS/);
    assert.match(linkTypeSrc, /ring-\[#0a83ff\]\/45/);
    assert.doesNotMatch(linksSrc, /focus-visible:ring-ring/);
    assert.doesNotMatch(attachSrc, /focus-visible:ring-ring/);
    assert.doesNotMatch(collabSrc, /focus-visible:ring-ring/);
    assert.doesNotMatch(titleSheetSrc, /focus-visible:ring-ring/);
  });

  it("audited release create/edit sheet components have no scoped teal legacy classes", () => {
    for (const [name, src] of [
      ["release-links-sheet", linksSrc],
      ["release-attach-clips-management", attachSrc],
      ["release-collaborators-sheet", collabSrc],
      ["release-status-fields", statusSrc],
      ["release-form-drawer", drawerSrc],
      ["release-title-sheet", titleSheetSrc],
      ["release-detail", detailSrc],
      ["release-detail-skeleton", skeletonSrc],
      ["release-create", createSrc],
      ["release-edit", editSrc],
    ] as const) {
      assert.doesNotMatch(src, TEAL_LEGACY, `${name} still has legacy teal`);
    }
  });
});
