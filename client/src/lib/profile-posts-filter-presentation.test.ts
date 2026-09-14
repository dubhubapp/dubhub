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
} from "./profile-posts-filter-presentation";
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
const statusPillSrc = readFileSync(join(here, "profile-grid-status-pill.ts"), "utf8");

describe("profile-posts-filter-presentation", () => {
  it("uses equal flex secondary row without capsule chrome", () => {
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /flex/);
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /w-full/);
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /min-h-11/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_ROW_CLASS, /rounded-2xl|border-white\/10|bg-black/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /bg-primary|border-input|variant/);
  });

  it("keeps 44pt-equivalent targets and equal column distribution", () => {
    assert.match(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /min-h-11/);
    assert.match(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /flex-1/);
    assert.match(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /justify-center/);
    assert.match(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /text-center/);
  });

  it("uses bright active text + column-inset underline on the button", () => {
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /font-semibold/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /text-foreground/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:bg-\[#0a83ff\]/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:h-0\.5/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:inset-x-2/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /(?:^|\s)bg-accent(?:\s|$)|(?:^|\s)bg-primary(?:\s|$)/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /flex-1|min-w-|w-/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_LABEL_CLASS, /after:/);
    assert.match(PROFILE_POSTS_FILTER_LABEL_CLASS, /truncate/);
    assert.match(PROFILE_POSTS_FILTER_LABEL_CLASS, /text-center/);
  });

  it("mutes inactive labels without filled chrome", () => {
    assert.match(PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS, /text-white\/55/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS, /border|bg-/);
  });

  it("defines shared secondary-row top spacing (mt-2 / 8px)", () => {
    assert.equal(PROFILE_SECONDARY_ROW_TOP_CLASS, "mt-2");
  });

  it("shares min-h-11 items-center secondary row; underline stays absolute", () => {
    assert.equal(PROFILE_SECONDARY_ROW_CLASS, PROFILE_POSTS_FILTER_ROW_CLASS);
    assert.match(PROFILE_SECONDARY_ROW_CLASS, /min-h-11/);
    assert.match(PROFILE_SECONDARY_ROW_CLASS, /items-center/);
    assert.doesNotMatch(PROFILE_SECONDARY_ROW_CLASS, /items-end/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:absolute/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:bottom-0/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_LABEL_CLASS, /pb-|pt-/);
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
    assert.match(filterRowSrc, /All \(\{allCount\}\)/);
    assert.match(filterRowSrc, /Identified \(\{identifiedCount\}\)/);
    assert.match(filterRowSrc, /Unidentified \(\{unidentifiedCount\}\)/);
  });

  it("Likes filter state drives filteredLikedPosts for grid + viewer and clears viewer on change", () => {
    assert.match(userProfileSrc, /const \[likesFilter, setLikesFilter\]/);
    assert.match(userProfileSrc, /filteredLikedPosts/);
    assert.match(userProfileSrc, /filterPostsByIdentificationStatus\(likedPosts, likesFilter\)/);
    assert.match(userProfileSrc, /filteredLikedPosts\.map\(\(post, index\) => \{/);
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

  it("Overview secondary row shares filter row height/alignment (no pb label lift)", () => {
    assert.match(userProfileSrc, /data-testid="profile-overview-secondary-row"/);
    assert.match(userProfileSrc, /cn\(PROFILE_SECONDARY_ROW_CLASS, "gap-5"\)/);
    assert.doesNotMatch(userProfileSrc, /pb-\[5px\]/);
    assert.match(userProfileSrc, /PROFILE_IMPACT_MODE_TAB_ACTIVE\s*=\s*"[\s\S]*?after:absolute/);
    assert.match(filterRowSrc, /PROFILE_POSTS_FILTER_ROW_CLASS/);
    assert.equal(PROFILE_POSTS_FILTER_ROW_CLASS, PROFILE_SECONDARY_ROW_CLASS);
  });
});
