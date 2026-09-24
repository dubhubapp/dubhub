/**
 * Release Create/Edit required-metadata UX + sheet footer / schedule / attach info.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_FORM_PRIMARY_CLASS,
  APP_MATERIAL_SEGMENT_ACTIVE_CLASS,
  APP_MATERIAL_SEGMENT_INACTIVE_CLASS,
} from "@/lib/app-material";
import {
  RELEASE_REQUIRED_DATE_MESSAGE,
  RELEASE_REQUIRED_TITLE_MESSAGE,
  RELEASE_REQUIRED_TIME_MESSAGE,
  RELEASE_REQUIRED_TIMEZONE_MESSAGE,
  validateReleaseRequiredMetadata,
} from "@/lib/release-form-required-metadata";
import { defaultMidnightDraft, enableExactDraft } from "@/lib/release-timing-draft";
import { nativeNavIsCoveredBySheet } from "@/lib/native-nav-contract";
import {
  acquireReleaseFormDrawerNativeNavCover,
  isReleaseFormDrawerCoveringNativeNav,
  resetReleaseFormDrawerNativeNavCoverForTests,
} from "@/lib/release-form-drawer-native-cover";
import {
  ATTACH_POSTS_INFO_COPY,
  ATTACH_POSTS_POLICY_DISCLOSURE_LABEL,
} from "@/lib/release-attach-clips-overview";
import { INPUT_LIMITS } from "@shared/input-limits";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/release-form-drawer.tsx"), "utf8");
const titleSheetSrc = readFileSync(join(here, "../components/release-title-sheet.tsx"), "utf8");
const statusSrc = readFileSync(join(here, "../components/release-status-fields.tsx"), "utf8");
const attachMgmtSrc = readFileSync(
  join(here, "../components/release-attach-clips-management.tsx"),
  "utf8",
);
const hostSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const contractSrc = readFileSync(join(here, "./native-nav-contract.ts"), "utf8");

describe("release required-metadata validation UX", () => {
  it("missing title / scheduled date use friendly copy", () => {
    assert.equal(
      validateReleaseRequiredMetadata({
        title: "",
        comingSoon: false,
        releaseDateYmd: "",
        timingDraft: defaultMidnightDraft(),
        titleMaxLength: INPUT_LIMITS.releaseTitle,
      })?.message,
      RELEASE_REQUIRED_TITLE_MESSAGE,
    );
    assert.equal(
      validateReleaseRequiredMetadata({
        title: "Track",
        comingSoon: false,
        releaseDateYmd: "",
        timingDraft: defaultMidnightDraft(),
        titleMaxLength: INPUT_LIMITS.releaseTitle,
      })?.message,
      RELEASE_REQUIRED_DATE_MESSAGE,
    );
    assert.equal(RELEASE_REQUIRED_TITLE_MESSAGE, "Add a release title to continue.");
    assert.equal(RELEASE_REQUIRED_DATE_MESSAGE, "Add a release date to continue.");
  });

  it("exact timing missing time/timezone stay action-oriented", () => {
    const noTime = enableExactDraft(defaultMidnightDraft());
    noTime.timeLocal = "";
    assert.equal(
      validateReleaseRequiredMetadata({
        title: "Track",
        comingSoon: false,
        releaseDateYmd: "2026-10-01",
        timingDraft: noTime,
        titleMaxLength: INPUT_LIMITS.releaseTitle,
      })?.message,
      RELEASE_REQUIRED_TIME_MESSAGE,
    );
    const noTz = enableExactDraft(defaultMidnightDraft());
    noTz.timezone = null;
    assert.equal(
      validateReleaseRequiredMetadata({
        title: "Track",
        comingSoon: false,
        releaseDateYmd: "2026-10-01",
        timingDraft: noTz,
        titleMaxLength: INPUT_LIMITS.releaseTitle,
      })?.message,
      RELEASE_REQUIRED_TIMEZONE_MESSAGE,
    );
  });

  it("create/edit toast incomplete metadata calmly and open the sheet", () => {
    assert.match(createSrc, /validateReleaseRequiredMetadata/);
    assert.match(editSrc, /validateReleaseRequiredMetadata/);
    assert.match(createSrc, /toast\(\{\s*title:\s*requiredIssue\.message\s*\}\)/);
    assert.match(editSrc, /toast\(\{\s*title:\s*requiredIssue\.message\s*\}\)/);
    assert.doesNotMatch(
      createSrc,
      /Title is required[\s\S]{0,40}variant:\s*"destructive"/,
    );
    assert.doesNotMatch(
      editSrc,
      /Title is required[\s\S]{0,40}variant:\s*"destructive"/,
    );
    assert.doesNotMatch(
      createSrc,
      /Release date is required for scheduled releases/,
    );
    assert.doesNotMatch(
      editSrc,
      /Release date is required for scheduled releases/,
    );
    assert.match(createSrc, /requiredIssue\.focus === "title"[\s\S]*setTitleSheetOpen\(true\)/);
    assert.match(createSrc, /setScheduleSheetOpen\(true\)/);
    assert.match(editSrc, /requiredIssue\.focus === "title"[\s\S]*setTitleSheetOpen\(true\)/);
    assert.match(editSrc, /setScheduleSheetOpen\(true\)/);
  });

  it("real backend / network failures remain destructive-styled", () => {
    assert.match(createSrc, /Artwork upload failed[\s\S]*variant:\s*"destructive"/);
    assert.match(editSrc, /Artwork upload failed[\s\S]*variant:\s*"destructive"/);
    assert.match(createSrc, /variant:\s*"destructive"/);
    assert.match(editSrc, /Update failed[\s\S]*variant:\s*"destructive"/);
  });
});

describe("release form drawer native-nav footer contract", () => {
  beforeEach(() => {
    resetReleaseFormDrawerNativeNavCoverForTests();
  });

  it("covers native nav while open and ref-counts multiple drawers", () => {
    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: false,
        submitOpen: false,
        releaseFormDrawerOpen: true,
      }),
      true,
    );
    assert.match(contractSrc, /releaseFormDrawerOpen/);
    assert.match(hostSrc, /releaseFormDrawerOpen:\s*releaseFormDrawerCovering/);
    assert.match(hostSrc, /subscribeReleaseFormDrawerNativeNavCover/);
    assert.match(drawerSrc, /acquireReleaseFormDrawerNativeNavCover/);
    assert.match(drawerSrc, /nativeNavSheetPhaseOnOpenChange/);
    assert.match(drawerSrc, /onAnimationEnd/);
    assert.match(drawerSrc, /env\(safe-area-inset-bottom/);
    assert.match(drawerSrc, /release-form-drawer-footer|APP_MATERIAL_FORM_PRIMARY_CLASS/);

    const releaseA = acquireReleaseFormDrawerNativeNavCover();
    const releaseB = acquireReleaseFormDrawerNativeNavCover();
    assert.equal(isReleaseFormDrawerCoveringNativeNav(), true);
    releaseA();
    assert.equal(isReleaseFormDrawerCoveringNativeNav(), true);
    releaseB();
    assert.equal(isReleaseFormDrawerCoveringNativeNav(), false);
  });

  it("create and edit both use ReleaseFormDrawer sheets", () => {
    assert.match(createSrc, /ReleaseTitleSheet|ReleaseScheduleSheet|ReleaseLinksSheet/);
    assert.match(editSrc, /ReleaseTitleSheet|ReleaseScheduleSheet|ReleaseLinksSheet/);
    assert.match(createSrc, /ReleaseCollaboratorsSheet/);
    assert.match(editSrc, /ReleaseCollaboratorsSheet/);
  });
});

describe("release schedule segment material", () => {
  it("selected/unselected use dark material classes without saturated blue fill", () => {
    assert.match(statusSrc, /APP_MATERIAL_SEGMENT_ACTIVE_CLASS/);
    assert.match(statusSrc, /APP_MATERIAL_SEGMENT_INACTIVE_CLASS/);
    assert.match(APP_MATERIAL_SEGMENT_ACTIVE_CLASS, /dubhub-app-segment-active/);
    assert.doesNotMatch(APP_MATERIAL_SEGMENT_ACTIVE_CLASS, /#0a83ff|bg-primary|bg-\[#0a83ff\]/);
    assert.match(APP_MATERIAL_SEGMENT_INACTIVE_CLASS, /bg-white\/\[0\.06\]/);
    const darkSeg = cssSrc.slice(
      cssSrc.indexOf(".dark .dubhub-app-segment-active"),
      cssSrc.indexOf(".dark .dubhub-app-segment-active") + 350,
    );
    assert.doesNotMatch(darkSeg, /#0a83ff/);
    assert.match(darkSeg, /rgba\(255,\s*255,\s*255/);
  });

  it("sheet Done CTAs use ceramic primary (not bg-primary blue)", () => {
    assert.match(drawerSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.match(titleSheetSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.doesNotMatch(titleSheetSrc, /bg-primary/);
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /dubhub-app-form-primary/);
  });
});

describe("about attaching posts Info popover", () => {
  it("opens neutral Info popover instead of amber accordion", () => {
    assert.match(attachMgmtSrc, /StatInfoPopover/);
    assert.match(attachMgmtSrc, /ATTACH_POSTS_INFO_COPY/);
    assert.match(attachMgmtSrc, /release-attach-policy-disclosure/);
    assert.match(attachMgmtSrc, /release-attach-policy-copy/);
    assert.doesNotMatch(attachMgmtSrc, /Collapsible|ChevronDown|text-amber/);
    assert.equal(ATTACH_POSTS_POLICY_DISCLOSURE_LABEL, "About attaching posts");
    assert.match(ATTACH_POSTS_INFO_COPY, /genuinely feature this release/i);
  });
});
