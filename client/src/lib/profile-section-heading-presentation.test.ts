import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_SECTION_HEADING_ICON_SLOT_CLASS,
  PROFILE_SECTION_HEADING_ROW_CLASS,
  PROFILE_SECTION_HEADING_TEXT_CLASS,
} from "./profile-section-heading-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const helperSrc = readFileSync(join(here, "./profile-section-heading-presentation.ts"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const repSrc = readFileSync(join(here, "../components/profile-rep-overview.tsx"), "utf8");

function headingBlock(source: string, copy: string): string {
  const idx = source.indexOf(copy);
  assert.ok(idx >= 0, `missing heading copy: ${copy}`);
  return source.slice(Math.max(0, idx - 420), idx + copy.length + 80);
}

describe("profile-section-heading-presentation", () => {
  it("icon slot is 16×16, flex-centered, with no optical nudges", () => {
    assert.match(PROFILE_SECTION_HEADING_ICON_SLOT_CLASS, /h-4 w-4/);
    assert.match(PROFILE_SECTION_HEADING_ICON_SLOT_CLASS, /items-center/);
    assert.match(PROFILE_SECTION_HEADING_ICON_SLOT_CLASS, /justify-center/);
    assert.match(PROFILE_SECTION_HEADING_ROW_CLASS, /flex items-center gap-1\.5/);
    assert.match(PROFILE_SECTION_HEADING_TEXT_CLASS, /leading-none/);
    assert.doesNotMatch(PROFILE_SECTION_HEADING_ICON_SLOT_CLASS, /translate-y/);
    assert.doesNotMatch(PROFILE_SECTION_HEADING_ICON_SLOT_CLASS, /-m[tblrxy]?-/);
    assert.doesNotMatch(helperSrc, /translate-y/);
    assert.doesNotMatch(helperSrc, /-mt-/);
  });

  it("does not encode role-specific presentation", () => {
    assert.doesNotMatch(helperSrc, /verifiedArtist|userType|isModerator|compact \?/);
  });
});

describe("user-profile section headings", () => {
  it("Your Activity uses the shared heading rule", () => {
    const block = headingBlock(userProfileSrc, ">Your Activity<");
    assert.match(block, /PROFILE_SECTION_HEADING_ROW_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_ICON_SLOT_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_TEXT_CLASS/);
    assert.match(block, /BarChart3/);
  });

  it("Your Impact uses the shared heading rule", () => {
    const block = headingBlock(userProfileSrc, ">Your Impact<");
    assert.match(block, /PROFILE_SECTION_HEADING_ROW_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_ICON_SLOT_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_TEXT_CLASS/);
    assert.match(block, /BarChart3/);
  });

  it("Top Genres ID'd uses the shared heading rule", () => {
    const block = headingBlock(userProfileSrc, "Top Genres ID&apos;d");
    assert.match(block, /PROFILE_SECTION_HEADING_ROW_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_ICON_SLOT_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_TEXT_CLASS/);
    assert.match(block, /<Check /);
  });

  it("Top Genres Posted uses the shared heading rule", () => {
    const block = headingBlock(userProfileSrc, ">Top Genres Posted<");
    assert.match(block, /PROFILE_SECTION_HEADING_ROW_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_ICON_SLOT_CLASS/);
    assert.match(block, /PROFILE_SECTION_HEADING_TEXT_CLASS/);
    assert.match(block, /<Upload /);
  });

  it("keeps heading copy and does not branch presentation class by role", () => {
    assert.match(userProfileSrc, />Your Activity</);
    assert.match(userProfileSrc, />Your Impact</);
    assert.match(userProfileSrc, /Top Genres ID&apos;d/);
    assert.match(userProfileSrc, />Top Genres Posted</);
    assert.equal(
      (userProfileSrc.match(/className=\{PROFILE_SECTION_HEADING_ICON_SLOT_CLASS\}/g) ?? []).length,
      4,
    );
    assert.doesNotMatch(userProfileSrc, /verifiedArtist\s*\?\s*[\s\S]{0,60}PROFILE_SECTION_HEADING_/);
    assert.doesNotMatch(userProfileSrc, /userType\s*\?\s*[\s\S]{0,60}PROFILE_SECTION_HEADING_/);
  });

  it("leaves username role badges and tab presentation untouched", () => {
    assert.match(userProfileSrc, /UserRoleInlineIcons/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_GROUP_CLASS/);
  });
});

describe("profile-rep-overview heading", () => {
  it("uses the same 16×16 slot in compact and non-compact modes", () => {
    assert.match(repSrc, /PROFILE_SECTION_HEADING_ICON_SLOT_CLASS/);
    assert.match(repSrc, /PROFILE_SECTION_HEADING_ROW_CLASS/);
    assert.match(repSrc, /PROFILE_SECTION_HEADING_TEXT_CLASS/);
    assert.equal((repSrc.match(/PROFILE_SECTION_HEADING_ICON_SLOT_CLASS/g) ?? []).length, 2);
    assert.doesNotMatch(repSrc, /iconSize/);
    assert.doesNotMatch(repSrc, /h-5 w-5/);
    assert.doesNotMatch(repSrc, /translate-y/);
    assert.doesNotMatch(repSrc, /-mt-/);
    assert.match(repSrc, /compact \?/);
    assert.match(repSrc, />Rep</);
    assert.match(repSrc, /TrendingUp className="h-4 w-4 text-white"/);
    assert.doesNotMatch(repSrc, /TrendingUp className="h-4 w-4 text-accent"/);
  });
});
