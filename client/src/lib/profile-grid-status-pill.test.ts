import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { STATUS_GLOW_PILL_BG } from "./genre-styles";
import {
  PROFILE_GRID_STATUS_PILL_CLASS,
  getCompactStatusGlowPillStyle,
  profileGridStatusPillGlowBg,
  profileGridStatusPillLabel,
  resolveProfileGridStatusPillKind,
} from "./profile-grid-status-pill";

const root = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(root, "../pages/user-profile.tsx"), "utf8");
const pillLibSrc = readFileSync(join(root, "profile-grid-status-pill.ts"), "utf8");
const pillComponentSrc = readFileSync(
  join(root, "../components/profile-grid-status-pill.tsx"),
  "utf8",
);
const pagerSrc = readFileSync(join(root, "profile-tab-swipe.ts"), "utf8");
const filterPresentationSrc = readFileSync(
  join(root, "profile-posts-filter-presentation.ts"),
  "utf8",
);

function extractPostsGridBlock(src: string): string {
  const start = src.indexOf('data-testid={`posts-thumbnail-${post.id}`}');
  assert.ok(start > 0, "Posts grid thumbnail missing");
  const end = src.indexOf("</TabsContent>", start);
  assert.ok(end > start, "Posts TabsContent close missing");
  return src.slice(start, end);
}

function extractLikesGridBlock(src: string): string {
  const start = src.indexOf('data-testid={`liked-thumbnail-${post.id}`}');
  assert.ok(start > 0, "Likes grid thumbnail missing");
  const end = src.indexOf("</TabsContent>", start);
  assert.ok(end > start, "Likes TabsContent close missing");
  return src.slice(start, end);
}

describe("profile-grid-status-pill presentation", () => {
  it("uses compact rectangular chrome without backdrop sampling classes", () => {
    assert.match(PROFILE_GRID_STATUS_PILL_CLASS, /\brounded\b/);
    assert.doesNotMatch(PROFILE_GRID_STATUS_PILL_CLASS, /rounded-full/);
    assert.match(PROFILE_GRID_STATUS_PILL_CLASS, /text-\[9px\]/);
    assert.match(PROFILE_GRID_STATUS_PILL_CLASS, /ring-1/);
    assert.doesNotMatch(PROFILE_GRID_STATUS_PILL_CLASS, /backdrop-/);
    assert.doesNotMatch(pillComponentSrc, /className=\{`[^`]*backdrop-/);
    assert.doesNotMatch(pillComponentSrc, /backdrop-blur/);
    assert.match(pillLibSrc, /getGenreGlowPillStyle/);
    assert.match(pillLibSrc, /boxShadow/);
  });

  it("stacks the status pill above thumbnail media z-[2]", () => {
    assert.match(PROFILE_GRID_STATUS_PILL_CLASS, /\bz-10\b/);
    assert.match(userProfileSrc, /mediaReady \? "z-\[2\] opacity-100"/);
  });

  it("shares Home semantic colour anchors", () => {
    assert.equal(STATUS_GLOW_PILL_BG.identified, "#22c55e");
    assert.equal(STATUS_GLOW_PILL_BG.unidentified, "#ef4444");
    assert.match(pillLibSrc, /STATUS_GLOW_PILL_BG/);
    assert.match(pillLibSrc, /getGenreGlowPillStyle/);
    assert.equal(profileGridStatusPillGlowBg("identified"), STATUS_GLOW_PILL_BG.identified);
    assert.equal(profileGridStatusPillGlowBg("unidentified"), STATUS_GLOW_PILL_BG.unidentified);
  });

  it("compact glow style uses box-shadow only (no backdrop sampling)", () => {
    const style = getCompactStatusGlowPillStyle(STATUS_GLOW_PILL_BG.identified);
    assert.ok(typeof style.boxShadow === "string" && style.boxShadow.length > 0);
    assert.ok(typeof style.background === "string" && String(style.background).includes("gradient"));
    assert.equal((style as { backdropFilter?: string }).backdropFilter, undefined);
    assert.equal((style as { WebkitBackdropFilter?: string }).WebkitBackdropFilter, undefined);
  });

  it("maps identified / unidentified kinds correctly", () => {
    assert.equal(
      resolveProfileGridStatusPillKind({
        verificationStatus: "unverified",
      }),
      "unidentified",
    );
    assert.equal(profileGridStatusPillLabel("unidentified"), "Unidentified");

    assert.equal(
      resolveProfileGridStatusPillKind({
        verificationStatus: "identified",
      }),
      "identified",
    );
    assert.equal(
      resolveProfileGridStatusPillKind({
        verificationStatus: "community",
      }),
      "community",
    );
    assert.equal(
      resolveProfileGridStatusPillKind({
        verificationStatus: "community_approved",
      }),
      "community_approved",
    );
    assert.equal(
      resolveProfileGridStatusPillKind({
        verificationStatus: "unverified",
        isVerifiedArtist: true,
        artistVerifiedBy: "artist-1",
      }),
      "artist_identified",
    );
    assert.equal(profileGridStatusPillLabel("artist_identified"), "Identified");

    assert.equal(
      resolveProfileGridStatusPillKind({
        verificationStatus: "identified",
        isArtistVerifiedAnonymous: true,
        isVerifiedArtist: false,
        artistVerifiedBy: null,
      }),
      "artist_verified_anonymous",
    );
    assert.equal(profileGridStatusPillLabel("artist_verified_anonymous"), "Identified");
  });

  it("keeps under_review → Unidentified fallback (open debt vs Home)", () => {
    assert.equal(
      resolveProfileGridStatusPillKind({
        verificationStatus: "under_review",
      }),
      "unidentified",
    );
  });
});

describe("profile grid status pill wiring", () => {
  it("Posts and Likes grids use the shared ProfileGridStatusPill without legacy flat blur pills", () => {
    assert.match(userProfileSrc, /import \{ ProfileGridStatusPill \}/);
    const postsGrid = extractPostsGridBlock(userProfileSrc);
    const likesGrid = extractLikesGridBlock(userProfileSrc);
    assert.match(postsGrid, /<ProfileGridStatusPill post=\{post\} \/>/);
    assert.match(likesGrid, /<ProfileGridStatusPill post=\{post\} \/>/);
    assert.doesNotMatch(postsGrid, /backdrop-blur/);
    assert.doesNotMatch(likesGrid, /backdrop-blur/);
    assert.doesNotMatch(postsGrid, /bg-green-500\/85|bg-red-500\/85|rounded-full/);
    assert.doesNotMatch(likesGrid, /bg-green-500\/85|bg-red-500\/85|rounded-full/);
    assert.doesNotMatch(userProfileSrc, /getPostStatusMeta/);
  });

  it("Posts and Likes overlay layers sit above media (scrim z-[3], chrome z-10)", () => {
    const postsGrid = extractPostsGridBlock(userProfileSrc);
    const likesGrid = extractLikesGridBlock(userProfileSrc);
    for (const grid of [postsGrid, likesGrid]) {
      assert.match(grid, /absolute inset-0 z-\[3\] bg-gradient-to-t/);
      assert.match(grid, /absolute bottom-2 left-2 right-2 z-10/);
      assert.match(grid, /<ProfileGridStatusPill post=\{post\} \/>/);
    }
    assert.match(PROFILE_GRID_STATUS_PILL_CLASS, /\bz-10\b/);
    assert.match(userProfileSrc, /mediaReady \? "z-\[2\] opacity-100"/);
  });

  it("keeps pills in grid markup without tab or hover gates on the shared component", () => {
    assert.doesNotMatch(pillComponentSrc, /group-hover/);
    assert.doesNotMatch(pillComponentSrc, /opacity-0/);
    assert.match(pillComponentSrc, /export function ProfileGridStatusPill/);
    assert.match(userProfileSrc, /posts-thumbnail-\$\{post\.id\}/);
    assert.match(userProfileSrc, /liked-thumbnail-\$\{post\.id\}/);
  });

  it("marks Posts/Likes thumbnails as pager-swipe cards with click suppress (4B)", () => {
    const postsGrid = extractPostsGridBlock(userProfileSrc);
    const likesGrid = extractLikesGridBlock(userProfileSrc);
    for (const grid of [postsGrid, likesGrid]) {
      assert.match(grid, /data-profile-pager-card="true"/);
    }
    assert.match(userProfileSrc, /consumeProfilePagerCardClickSuppression/);
    assert.match(userProfileSrc, /openPostsPostViewer\(index\)/);
    assert.match(userProfileSrc, /openLikedPostViewer\(index\)/);
    assert.match(pagerSrc, /PROFILE_TAB_PAGER_CARD_ATTR/);
    assert.match(pagerSrc, /claimCardGesture/);
  });

  it("does not alter pager or Posts filter presentation contracts", () => {
    assert.match(pagerSrc, /PROFILE_TAB_PAGER_COMMIT_PROGRESS/);
    assert.match(pagerSrc, /useProfileTabPager/);
    assert.match(userProfileSrc, /forceMount/);
    assert.match(userProfileSrc, /ProfileStatusFilterRow/);
    assert.match(userProfileSrc, /PROFILE_SECONDARY_ROW_TOP_CLASS|profile-posts-filter-presentation/);
    assert.match(filterPresentationSrc, /PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS/);
    assert.match(userProfileSrc, /const \[postFilter, setPostFilter\]/);
  });
});
