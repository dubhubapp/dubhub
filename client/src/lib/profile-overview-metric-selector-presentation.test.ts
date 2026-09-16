/**
 * Artist Overview metric selector — liquid-glass capsule contracts.
 * Presentation only; must not touch profile-tab-swipe / primary tab semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_METRIC_SELECTOR_ACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_INACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_SEGMENT_CLASS,
  PROFILE_METRIC_SELECTOR_TRACK_CLASS,
  PROFILE_OVERVIEW_AFTER_SELECTOR_CLASS,
  PROFILE_OVERVIEW_METRIC_HEADING_CLASS,
} from "./profile-overview-metric-selector-presentation";
import {
  PROFILE_POSTS_FILTER_ROW_CLASS,
  PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS,
  PROFILE_SECONDARY_ROW_CLASS,
} from "./profile-posts-filter-presentation";
import { PROFILE_SWIPE_TAB_IDS } from "./profile-tab-swipe";
import { PROFILE_PRIMARY_NAV_SHELL_CLASS } from "./profile-primary-nav-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const swipeSrc = readFileSync(join(here, "./profile-tab-swipe.ts"), "utf8");
const filterRowSrc = readFileSync(
  join(here, "../components/profile-status-filter-row.tsx"),
  "utf8",
);
const metricPresentationSrc = readFileSync(
  join(here, "./profile-overview-metric-selector-presentation.ts"),
  "utf8",
);

describe("profile-overview-metric-selector-presentation", () => {
  it("uses full-width rounded-full glass track with equal flex-1 segments", () => {
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /w-full/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /rounded-full/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /border-white\/10/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /bg-black\/30/);
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /backdrop-blur-md/);
    assert.match(PROFILE_METRIC_SELECTOR_SEGMENT_CLASS, /flex-1/);
    assert.match(PROFILE_METRIC_SELECTOR_SEGMENT_CLASS, /rounded-full/);
    assert.match(PROFILE_METRIC_SELECTOR_SEGMENT_CLASS, /transition/);
  });

  it("active platter is ice glass without solid blue CTA fill or underline", () => {
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /from-white\/\[0\.16\]/);
    assert.match(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /text-white/);
    assert.doesNotMatch(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /#0a83ff|bg-\[#0a83ff\]|dubhub-app-segment-active/);
    assert.doesNotMatch(PROFILE_METRIC_SELECTOR_ACTIVE_CLASS, /after:/);
    assert.doesNotMatch(metricPresentationSrc, /after:bg-\[#0a83ff\]/);
  });

  it("inactive segment uses muted white/55", () => {
    assert.match(PROFILE_METRIC_SELECTOR_INACTIVE_CLASS, /text-white\/55/);
  });

  it("shares post-selector heading geometry (min-h-11 + mb-3)", () => {
    assert.equal(PROFILE_OVERVIEW_AFTER_SELECTOR_CLASS, "mb-3");
    assert.match(PROFILE_OVERVIEW_METRIC_HEADING_CLASS, /min-h-11/);
    assert.match(PROFILE_OVERVIEW_METRIC_HEADING_CLASS, /mb-3/);
    assert.match(PROFILE_OVERVIEW_METRIC_HEADING_CLASS, /items-center/);
  });
});

describe("user-profile metric selector wiring", () => {
  it("Artist Overview wires full-width two-segment glass selector with role=tab buttons", () => {
    assert.match(userProfileSrc, /PROFILE_METRIC_SELECTOR_TRACK_CLASS/);
    assert.match(userProfileSrc, /PROFILE_METRIC_SELECTOR_SEGMENT_CLASS/);
    assert.match(userProfileSrc, /data-testid="profile-overview-secondary-row"/);
    assert.match(userProfileSrc, /data-testid="stats-mode-artist"/);
    assert.match(userProfileSrc, /data-testid="stats-mode-user"/);
    assert.match(
      userProfileSrc,
      /role="tablist"[\s\S]*?role="tab"[\s\S]*?stats-mode-artist[\s\S]*?role="tab"[\s\S]*?stats-mode-user/,
    );
    assert.match(userProfileSrc, /type="button"[\s\S]*?role="tab"[\s\S]*?setArtistStatsMode\("artist"\)/);
    assert.match(userProfileSrc, /flex-1/);
    assert.match(
      userProfileSrc,
      /cn\(\s*PROFILE_METRIC_SELECTOR_TRACK_CLASS,\s*PROFILE_OVERVIEW_AFTER_SELECTOR_CLASS,\s*\)/,
    );
  });

  it("both modes apply the same active / inactive glass classes", () => {
    assert.match(
      userProfileSrc,
      /artistStatsMode === "artist"\s*\?\s*PROFILE_METRIC_SELECTOR_ACTIVE_CLASS\s*:\s*PROFILE_METRIC_SELECTOR_INACTIVE_CLASS/,
    );
    assert.match(
      userProfileSrc,
      /artistStatsMode === "user"\s*\?\s*PROFILE_METRIC_SELECTOR_ACTIVE_CLASS\s*:\s*PROFILE_METRIC_SELECTOR_INACTIVE_CLASS/,
    );
  });

  it("removes old blue underline metric-tab treatment", () => {
    assert.doesNotMatch(userProfileSrc, /PROFILE_IMPACT_MODE_TAB_/);
    assert.doesNotMatch(userProfileSrc, /cn\(PROFILE_SECONDARY_ROW_CLASS, "gap-5"\)/);
    const selectorBlock = userProfileSrc.slice(
      userProfileSrc.indexOf('data-testid="profile-overview-secondary-row"'),
      userProfileSrc.indexOf('data-testid="stats-mode-user"') + 80,
    );
    assert.doesNotMatch(selectorBlock, /after:bg-\[#0a83ff\]/);
  });

  it("Artist Impact and Community Activity headings share PROFILE_OVERVIEW_METRIC_HEADING_CLASS", () => {
    assert.match(
      userProfileSrc,
      /className=\{PROFILE_OVERVIEW_METRIC_HEADING_CLASS\}[\s\S]*?Your Impact/,
    );
    assert.match(
      userProfileSrc,
      /cn\(PROFILE_OVERVIEW_METRIC_HEADING_CLASS, "justify-between gap-2"\)[\s\S]*?Your Activity/,
    );
    assert.doesNotMatch(userProfileSrc, /mb-2 \$\{PROFILE_SECTION_HEADING_ROW_CLASS\}/);
    assert.equal(
      (userProfileSrc.match(/data-testid="profile-overview-metric-heading"/g) ?? []).length,
      2,
    );
  });

  it("Community accounts skip the metric selector (artist-gated)", () => {
    assert.match(userProfileSrc, /userType === "artist" \?/);
    assert.match(userProfileSrc, /profile-overview-secondary-row/);
    // Selector lives only inside the artist branch before the community-only Overview section.
    const artistGateIdx = userProfileSrc.indexOf('userType === "artist" ?');
    const communityOnlyIdx = userProfileSrc.indexOf(
      ') : (\n                <section data-testid="your-activity-list">\n                  <ProfileCommunityActivitySection',
    );
    assert.ok(artistGateIdx >= 0);
    assert.ok(communityOnlyIdx > artistGateIdx);
    const artistBranch = userProfileSrc.slice(artistGateIdx, communityOnlyIdx);
    const communityOnlyBranch = userProfileSrc.slice(
      communityOnlyIdx,
      communityOnlyIdx + 500,
    );
    assert.match(artistBranch, /profile-overview-secondary-row/);
    assert.doesNotMatch(communityOnlyBranch, /profile-overview-secondary-row/);
  });

  it("metric mode state does not drive primary activeTab / swipe ids", () => {
    assert.match(userProfileSrc, /const \[artistStatsMode, setArtistStatsMode\]/);
    assert.match(userProfileSrc, /setArtistStatsMode\("artist"\)/);
    assert.match(userProfileSrc, /setArtistStatsMode\("user"\)/);
    assert.doesNotMatch(userProfileSrc, /setActiveTab\(artistStatsMode/);
    assert.doesNotMatch(userProfileSrc, /setArtistStatsMode\(.*activeTab/);
    assert.deepEqual([...PROFILE_SWIPE_TAB_IDS], ["profile", "posts", "liked", "notifications"]);
  });

  it("primary nav shell and swipe hook source stay on existing contracts", () => {
    assert.equal(
      PROFILE_PRIMARY_NAV_SHELL_CLASS,
      "relative z-10 -mx-6 mb-3 px-6 pb-1",
    );
    assert.match(userProfileSrc, /useProfileTabPager/);
    assert.match(userProfileSrc, /onCommitTab: handleProfileTabChange/);
    assert.match(swipeSrc, /export const PROFILE_SWIPE_TAB_IDS/);
    assert.match(swipeSrc, /export function useProfileTabPager/);
    // Gesture exclusion still covers role=tab.
    assert.match(swipeSrc, /\[role='tab'\]/);
  });

  it("Posts/Likes filters use compact glass (not metric selector 1:1; no underline)", () => {
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /rounded-full/);
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /backdrop-blur-md/);
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /min-h-9/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /#0a83ff/);
    assert.notEqual(PROFILE_POSTS_FILTER_ROW_CLASS, PROFILE_SECONDARY_ROW_CLASS);
    assert.match(filterRowSrc, /PROFILE_STATUS_FILTER_TRACK_CLASS/);
    assert.match(filterRowSrc, /PROFILE_STATUS_FILTER_ACTIVE_CLASS/);
    assert.doesNotMatch(filterRowSrc, /PROFILE_METRIC_SELECTOR_/);
  });
});
