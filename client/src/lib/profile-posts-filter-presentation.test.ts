import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_POSTS_FILTER_LABEL_CLASS,
  PROFILE_POSTS_FILTER_ROW_CLASS,
  PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS,
  PROFILE_POSTS_FILTER_TAB_BASE_CLASS,
  PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS,
  PROFILE_SECONDARY_ROW_CLASS,
  PROFILE_SECONDARY_ROW_TOP_CLASS,
  PROFILE_STATUS_FILTER_ACTIVE_CLASS,
  PROFILE_STATUS_FILTER_INACTIVE_CLASS,
  PROFILE_STATUS_FILTER_LABEL_CLASS,
  PROFILE_STATUS_FILTER_SEGMENT_CLASS,
  PROFILE_STATUS_FILTER_TRACK_CLASS,
} from "./profile-posts-filter-presentation";
import {
  PROFILE_METRIC_SELECTOR_ACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_TRACK_CLASS,
} from "./profile-overview-metric-selector-presentation";
import {
  countIdentifiedPosts,
  countUnidentifiedPosts,
  filterPostsByIdentificationStatus,
} from "./profile-identification-filter";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const filterRowSrc = readFileSync(
  join(here, "../components/profile-status-filter-row.tsx"),
  "utf8",
);
const pagerSrc = readFileSync(join(here, "profile-tab-swipe.ts"), "utf8");
const presentationSrc = readFileSync(join(here, "profile-posts-filter-presentation.ts"), "utf8");
const statusPillSrc = readFileSync(join(here, "profile-grid-status-pill.ts"), "utf8");
const primaryNavSrc = readFileSync(join(here, "profile-primary-nav-presentation.ts"), "utf8");

describe("profile-posts-filter-presentation — compact glass", () => {
  it("1: Posts filter track is compact segmented glass", () => {
    assert.match(PROFILE_STATUS_FILTER_TRACK_CLASS, /rounded-full/);
    assert.match(PROFILE_STATUS_FILTER_TRACK_CLASS, /backdrop-blur-md/);
    assert.match(PROFILE_STATUS_FILTER_TRACK_CLASS, /bg-black\/20/);
    assert.match(PROFILE_STATUS_FILTER_TRACK_CLASS, /border-white\/\[0\.08\]/);
    assert.match(PROFILE_STATUS_FILTER_TRACK_CLASS, /min-h-9/);
    assert.match(filterRowSrc, /PROFILE_STATUS_FILTER_TRACK_CLASS/);
  });

  it("2: Likes uses the same presentation component/tokens", () => {
    assert.equal((userProfileSrc.match(/<ProfileStatusFilterRow/g) ?? []).length, 2);
    assert.match(userProfileSrc, /testId="profile-posts-filter"/);
    assert.match(userProfileSrc, /testId="profile-liked-filter"/);
    assert.match(filterRowSrc, /PROFILE_STATUS_FILTER_TRACK_CLASS/);
    assert.match(filterRowSrc, /PROFILE_STATUS_FILTER_SEGMENT_CLASS/);
  });

  it("3: three equal-width flex-1 segments", () => {
    assert.match(PROFILE_STATUS_FILTER_SEGMENT_CLASS, /flex-1/);
    assert.match(PROFILE_STATUS_FILTER_SEGMENT_CLASS, /min-w-0/);
    assert.match(PROFILE_STATUS_FILTER_SEGMENT_CLASS, /justify-center/);
    assert.equal((filterRowSrc.match(/role="tab"/g) ?? []).length, 3);
  });

  it("4: active segment uses compact glass platter (no blue fill)", () => {
    assert.match(PROFILE_STATUS_FILTER_ACTIVE_CLASS, /from-white\/\[0\.11\]/);
    assert.match(PROFILE_STATUS_FILTER_ACTIVE_CLASS, /to-white\/\[0\.04\]/);
    assert.match(PROFILE_STATUS_FILTER_ACTIVE_CLASS, /text-white/);
    assert.match(PROFILE_STATUS_FILTER_ACTIVE_CLASS, /font-semibold/);
    assert.doesNotMatch(PROFILE_STATUS_FILTER_ACTIVE_CLASS, /#0a83ff|bg-\[#0a83ff\]|bg-primary|dubhub-app-segment-active/);
  });

  it("5: inactive labels are muted", () => {
    assert.match(PROFILE_STATUS_FILTER_INACTIVE_CLASS, /text-white\/55/);
    assert.match(PROFILE_STATUS_FILTER_INACTIVE_CLASS, /bg-transparent/);
  });

  it("6: underline indicator removed", () => {
    assert.doesNotMatch(PROFILE_STATUS_FILTER_ACTIVE_CLASS, /after:/);
    assert.doesNotMatch(PROFILE_STATUS_FILTER_SEGMENT_CLASS, /after:/);
    assert.doesNotMatch(PROFILE_STATUS_FILTER_TRACK_CLASS, /after:/);
    assert.doesNotMatch(filterRowSrc, /after:bg-\[#0a83ff\]/);
  });

  it("7: counts still render in labels", () => {
    assert.match(filterRowSrc, /All \(\{allCount\}\)/);
    assert.match(filterRowSrc, /Identified \(\{identifiedCount\}\)/);
    assert.match(filterRowSrc, /Unidentified \(\{unidentifiedCount\}\)/);
    assert.match(PROFILE_STATUS_FILTER_LABEL_CLASS, /truncate/);
  });

  it("8: role=tablist / role=tab preserved", () => {
    assert.match(filterRowSrc, /role="tablist"/);
    assert.match(filterRowSrc, /role="tab"/);
    assert.match(filterRowSrc, /aria-selected=\{/);
  });

  it("9: filter behaviour / predicates unchanged", () => {
    assert.match(userProfileSrc, /filterPostsByIdentificationStatus\(userPosts, postFilter\)/);
    assert.match(userProfileSrc, /filterPostsByIdentificationStatus\(likedPosts, likesFilter\)/);
    assert.match(userProfileSrc, /const \[postFilter, setPostFilter\]/);
    assert.match(userProfileSrc, /const \[likesFilter, setLikesFilter\]/);
  });

  it("10: Artist Impact selector classes are NOT reused directly", () => {
    assert.doesNotMatch(filterRowSrc, /PROFILE_METRIC_SELECTOR_/);
    assert.doesNotMatch(presentationSrc, /PROFILE_METRIC_SELECTOR_/);
    assert.notEqual(PROFILE_STATUS_FILTER_TRACK_CLASS, PROFILE_METRIC_SELECTOR_TRACK_CLASS);
    assert.notEqual(PROFILE_STATUS_FILTER_ACTIVE_CLASS, PROFILE_METRIC_SELECTOR_ACTIVE_CLASS);
    // Compact: shorter track than Overview metric selector.
    assert.match(PROFILE_METRIC_SELECTOR_TRACK_CLASS, /min-h-11/);
    assert.match(PROFILE_STATUS_FILTER_TRACK_CLASS, /min-h-9/);
    assert.match(PROFILE_STATUS_FILTER_SEGMENT_CLASS, /min-h-7/);
  });

  it("11: primary Profile tabs unchanged", () => {
    assert.match(primaryNavSrc, /PROFILE_PRIMARY_NAV_INDICATOR_CLASS/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_SHELL_CLASS/);
    assert.match(userProfileSrc, /data-testid="profile-tabs"/);
    assert.doesNotMatch(primaryNavSrc, /PROFILE_STATUS_FILTER_/);
  });

  it("12: swipe source file not imported / filter stays interactive-excluded", () => {
    assert.doesNotMatch(presentationSrc, /profile-tab-swipe/);
    assert.doesNotMatch(filterRowSrc, /profile-tab-swipe|useProfileTabPager/);
    assert.match(pagerSrc, /\[role='tab'\]/);
    assert.match(pagerSrc, /export function useProfileTabPager/);
  });

  it("aliases keep PROFILE_POSTS_FILTER_* pointing at compact glass tokens", () => {
    assert.equal(PROFILE_POSTS_FILTER_ROW_CLASS, PROFILE_STATUS_FILTER_TRACK_CLASS);
    assert.equal(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, PROFILE_STATUS_FILTER_SEGMENT_CLASS);
    assert.equal(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, PROFILE_STATUS_FILTER_ACTIVE_CLASS);
    assert.equal(PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS, PROFILE_STATUS_FILTER_INACTIVE_CLASS);
    assert.equal(PROFILE_POSTS_FILTER_LABEL_CLASS, PROFILE_STATUS_FILTER_LABEL_CLASS);
  });

  it("keeps secondary-row top spacing (mt-2); filter track no longer equals legacy row", () => {
    assert.equal(PROFILE_SECONDARY_ROW_TOP_CLASS, "mt-2");
    assert.match(PROFILE_SECONDARY_ROW_CLASS, /min-h-11/);
    assert.notEqual(PROFILE_STATUS_FILTER_TRACK_CLASS, PROFILE_SECONDARY_ROW_CLASS);
  });
});

describe("profile-identification-filter", () => {
  const sample = [
    { id: "1", verificationStatus: "identified" },
    { id: "2", verificationStatus: "community" },
    { id: "3", verificationStatus: "community_approved" },
    { id: "4", verificationStatus: "unverified" },
    { id: "5", verificationStatus: "under_review" },
  ];

  it("filters all / identified / unidentified with Posts semantics", () => {
    assert.equal(filterPostsByIdentificationStatus(sample, "all").length, 5);
    assert.deepEqual(
      filterPostsByIdentificationStatus(sample, "identified").map((p) => p.id),
      ["1", "2", "3"],
    );
    assert.deepEqual(
      filterPostsByIdentificationStatus(sample, "unidentified").map((p) => p.id),
      ["4"],
    );
  });

  it("counts identified and unidentified without extra fetches", () => {
    assert.equal(countIdentifiedPosts(sample), 3);
    assert.equal(countUnidentifiedPosts(sample), 1);
  });
});

describe("user-profile secondary nav + Likes filter wiring", () => {
  it("Overview / Posts / Likes panels share PROFILE_SECONDARY_ROW_TOP_CLASS", () => {
    assert.match(
      userProfileSrc,
      /value="profile"[\s\S]*?PROFILE_SECONDARY_ROW_TOP_CLASS[\s\S]*?PROFILE_OVERVIEW_SECTIONS_CLASS/,
    );
    assert.match(
      userProfileSrc,
      /value="posts"[\s\S]*?PROFILE_SECONDARY_ROW_TOP_CLASS/,
    );
    assert.match(
      userProfileSrc,
      /value="liked"[\s\S]*?PROFILE_SECONDARY_ROW_TOP_CLASS/,
    );
    assert.doesNotMatch(userProfileSrc, /PROFILE_OVERVIEW_SECTIONS_CLASS\s*=\s*"[^"]*mt-5/);
    assert.doesNotMatch(userProfileSrc, /value="posts"[\s\S]{0,120}"mt-2\.5"/);
    assert.doesNotMatch(userProfileSrc, /value="liked"[\s\S]{0,120}"mt-6"/);
  });

  it("Posts and Likes share ProfileStatusFilterRow with counts", () => {
    assert.match(userProfileSrc, /import \{ ProfileStatusFilterRow \}/);
    assert.equal((userProfileSrc.match(/<ProfileStatusFilterRow/g) ?? []).length, 2);
    assert.match(userProfileSrc, /testId="profile-posts-filter"/);
    assert.match(userProfileSrc, /testId="profile-liked-filter"/);
    assert.match(userProfileSrc, /testIdSuffix="posts"/);
    assert.match(userProfileSrc, /testIdSuffix="liked"/);
    assert.match(userProfileSrc, /allCount=\{userPosts\.length\}/);
    assert.match(userProfileSrc, /allCount=\{likedPosts\.length\}/);
    assert.match(userProfileSrc, /identifiedCount=\{identifiedPostCount\}/);
    assert.match(userProfileSrc, /identifiedCount=\{identifiedLikedCount\}/);
    assert.match(userProfileSrc, /unidentifiedCount=\{unidentifiedPostCount\}/);
    assert.match(userProfileSrc, /unidentifiedCount=\{unidentifiedLikedCount\}/);
  });

  it("Likes filter state drives filteredLikedPosts for grid + viewer and clears viewer on change", () => {
    assert.match(userProfileSrc, /const \[likesFilter, setLikesFilter\]/);
    assert.match(userProfileSrc, /filteredLikedPosts/);
    assert.match(userProfileSrc, /filterPostsByIdentificationStatus\(likedPosts, likesFilter\)/);
    assert.match(
      userProfileSrc,
      /filteredLikedPosts\s*\n\s*\.slice\([\s\S]*?\)\s*\n\s*\.map\(\(post, localIndex\) => \{/,
    );
    assert.match(userProfileSrc, /openLikedPostViewer[\s\S]*?filteredLikedPosts\.length/);
    assert.match(
      userProfileSrc,
      /setLikesFilter\(next\);\s*setLikesViewerStartIndex\(null\);\s*setLikesViewerSequence\(null\)/,
    );
    assert.match(userProfileSrc, /setLikesViewerSequence\(filteredLikedPosts\)/);
    assert.match(userProfileSrc, /FullScreenPostSequenceViewer/);
  });

  it("keeps Posts filter + pager + status-pill contracts", () => {
    assert.match(userProfileSrc, /filterPostsByIdentificationStatus\(userPosts, postFilter\)/);
    assert.match(userProfileSrc, /const \[postFilter, setPostFilter\]/);
    assert.match(pagerSrc, /useProfileTabPager/);
    assert.match(userProfileSrc, /forceMount/);
    assert.match(statusPillSrc, /\bz-10\b/);
    assert.doesNotMatch(statusPillSrc, /backdrop-blur/);
  });

  it("Overview keeps Community Activity mode label in secondary lane", () => {
    assert.match(userProfileSrc, /Community Activity/);
    assert.match(userProfileSrc, /data-testid="your-activity-list"/);
  });

  it("Overview metric selector stays stronger glass; Posts/Likes use compact filter tokens", () => {
    assert.match(userProfileSrc, /data-testid="profile-overview-secondary-row"/);
    assert.match(userProfileSrc, /PROFILE_METRIC_SELECTOR_TRACK_CLASS/);
    assert.doesNotMatch(userProfileSrc, /cn\(PROFILE_SECONDARY_ROW_CLASS, "gap-5"\)/);
    assert.doesNotMatch(userProfileSrc, /PROFILE_IMPACT_MODE_TAB_/);
    assert.match(filterRowSrc, /PROFILE_STATUS_FILTER_TRACK_CLASS/);
    assert.doesNotMatch(PROFILE_STATUS_FILTER_ACTIVE_CLASS, /after:/);
  });
});
