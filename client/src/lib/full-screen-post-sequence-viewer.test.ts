/**
 * PROFILE-GRID-VIEWER-2B — shared full-screen post sequence viewer contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FULL_SCREEN_POST_SEQUENCE_SCROLL_CLASS,
  FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS,
  FULL_SCREEN_POST_SEQUENCE_SLIDE_CLASS,
  clampPostSequenceInitialIndex,
  postSequenceShouldLoadVideo,
  postSequenceVideoPreload,
} from "./full-screen-post-sequence-viewer";
import {
  isFullScreenPostSequenceCoveringNativeNav,
  setFullScreenPostSequenceCoveringNativeNav,
  subscribeFullScreenPostSequenceNativeNavCover,
} from "./full-screen-post-sequence-native-cover";
import { nativeNavIsCoveredBySheet } from "./native-nav-contract";

const here = dirname(fileURLToPath(import.meta.url));
const viewerSrc = readFileSync(
  join(here, "../components/full-screen-post-sequence-viewer.tsx"),
  "utf8",
);
const releaseGallerySrc = readFileSync(
  join(here, "../components/release-attached-posts-gallery.tsx"),
  "utf8",
);
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const hostSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");
const contractSrc = readFileSync(join(here, "./native-nav-contract.ts"), "utf8");

describe("full-screen post sequence — index + preload", () => {
  it("clamps initial index into sequence bounds", () => {
    assert.equal(clampPostSequenceInitialIndex(4, 10), 4);
    assert.equal(clampPostSequenceInitialIndex(0, 10), 0);
    assert.equal(clampPostSequenceInitialIndex(9, 10), 9);
    assert.equal(clampPostSequenceInitialIndex(-1, 10), 0);
    assert.equal(clampPostSequenceInitialIndex(99, 10), 9);
    assert.equal(clampPostSequenceInitialIndex(0, 0), 0);
  });

  it("active loads auto; neighbours metadata; far none", () => {
    assert.equal(postSequenceShouldLoadVideo(0), true);
    assert.equal(postSequenceShouldLoadVideo(1), true);
    assert.equal(postSequenceShouldLoadVideo(2), false);
    assert.equal(postSequenceVideoPreload(0), "auto");
    assert.equal(postSequenceVideoPreload(1), "metadata");
    assert.equal(postSequenceVideoPreload(2), "none");
  });

  it("shell is fixed full-screen with 100dvh snap slides", () => {
    assert.match(FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS, /fixed/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS, /inset-0/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS, /h-\[100dvh\]/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS, /z-\[100\]/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SCROLL_CLASS, /snap-y/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SCROLL_CLASS, /snap-mandatory/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SLIDE_CLASS, /h-\[100dvh\]/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SLIDE_CLASS, /snap-start/);
    assert.match(FULL_SCREEN_POST_SEQUENCE_SLIDE_CLASS, /snap-always/);
  });
});

describe("full-screen post sequence — viewer component", () => {
  it("uses clipViewerOverlay and single isActive VideoCard", () => {
    assert.match(viewerSrc, /clipViewerOverlay/);
    assert.match(viewerSrc, /isActive=\{isActive\}/);
    assert.match(viewerSrc, /shouldLoadVideo=\{/);
    assert.match(viewerSrc, /postSequenceVideoPreload/);
    assert.match(viewerSrc, /data-sequence-index/);
    assert.match(viewerSrc, /scrollIntoView/);
    assert.match(viewerSrc, /setFullScreenPostSequenceCoveringNativeNav\(true\)/);
    assert.match(viewerSrc, /setFullScreenPostSequenceCoveringNativeNav\(false\)/);
  });

  it("does not add blank spacer slides before/after sequence", () => {
    assert.doesNotMatch(viewerSrc, /spacer|blank.?slide|sentinel/i);
    assert.match(viewerSrc, /items\.map\(\(item, index\)/);
  });
});

describe("full-screen post sequence — Profile wiring", () => {
  it("Posts opens filteredPosts snapshot at grid index N", () => {
    assert.match(userProfileSrc, /setPostsViewerSequence\(filteredPosts\)/);
    assert.match(userProfileSrc, /clampPostSequenceInitialIndex\(startIndex, filteredPosts\.length\)/);
    assert.match(userProfileSrc, /testId="profile-posts-viewer"/);
    assert.match(userProfileSrc, /items=\{postsViewerSequence\.map/);
    assert.doesNotMatch(userProfileSrc, /setPostsViewerSequence\(userPosts\)/);
  });

  it("Likes opens filteredLikedPosts snapshot at grid index N", () => {
    assert.match(userProfileSrc, /setLikesViewerSequence\(filteredLikedPosts\)/);
    assert.match(
      userProfileSrc,
      /clampPostSequenceInitialIndex\(startIndex, filteredLikedPosts\.length\)/,
    );
    assert.match(userProfileSrc, /testId="profile-likes-viewer"/);
    assert.match(userProfileSrc, /items=\{likesViewerSequence\.map/);
  });

  it("removes embedded inset viewer; keeps pager disable + scroll restore", () => {
    assert.doesNotMatch(
      userProfileSrc,
      /h-\[min\(88dvh,calc\(100dvh-var\(--app-bottom-nav-block\)-10rem\)\)\]/,
    );
    assert.doesNotMatch(userProfileSrc, /data-posts-viewer-index|data-liked-viewer-index/);
    assert.match(
      userProfileSrc,
      /enabled:\s*postsViewerStartIndex === null && likesViewerStartIndex === null/,
    );
    assert.match(userProfileSrc, /profileScrollTopBeforeViewerRef/);
    assert.match(userProfileSrc, /restoreProfileScrollAfterViewer/);
    assert.match(userProfileSrc, /FullScreenPostSequenceViewer/);
  });

  it("close preserves tab intent and clears sequences", () => {
    assert.match(userProfileSrc, /setActiveTab\("posts"\)/);
    assert.match(userProfileSrc, /setActiveTab\("liked"\)/);
    assert.match(userProfileSrc, /setPostsViewerSequence\(null\)/);
    assert.match(userProfileSrc, /setLikesViewerSequence\(null\)/);
  });
});

describe("full-screen post sequence — release gallery reuse", () => {
  it("ReleaseAttachedPostsGallery consumes shared viewer shell", () => {
    assert.match(releaseGallerySrc, /FullScreenPostSequenceViewer/);
    assert.match(releaseGallerySrc, /moderatorPreview/);
    assert.match(releaseGallerySrc, /galleryMetadataExpand/);
    assert.match(releaseGallerySrc, /renderSlideOverlay/);
    assert.doesNotMatch(releaseGallerySrc, /fixed inset-0 z-\[100\]/);
    assert.doesNotMatch(releaseGallerySrc, /data-gallery-index/);
  });
});

describe("full-screen post sequence — native nav cover", () => {
  it("cover signal toggles and is wired into sheet cover contract", () => {
    setFullScreenPostSequenceCoveringNativeNav(false);
    assert.equal(isFullScreenPostSequenceCoveringNativeNav(), false);
    let notified = 0;
    const unsub = subscribeFullScreenPostSequenceNativeNavCover(() => {
      notified += 1;
    });
    setFullScreenPostSequenceCoveringNativeNav(true);
    assert.equal(isFullScreenPostSequenceCoveringNativeNav(), true);
    assert.equal(notified, 1);
    setFullScreenPostSequenceCoveringNativeNav(false);
    assert.equal(isFullScreenPostSequenceCoveringNativeNav(), false);
    unsub();

    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: false,
        submitOpen: false,
        postSequenceViewerOpen: true,
      }),
      true,
    );
    assert.match(contractSrc, /postSequenceViewerOpen/);
    assert.match(hostSrc, /postSequenceViewerOpen:\s*postSequenceViewerCovering/);
    assert.match(hostSrc, /subscribeFullScreenPostSequenceNativeNavCover/);
  });
});
