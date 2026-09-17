/**
 * FULLSCREEN-POST-VIEWER-2A / 2A-FIX — viewer-only metadata bottom stack + rail independence.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS,
  FULL_SCREEN_VIEWER_METADATA_SCRUB_GAP,
  FULL_SCREEN_VIEWER_METADATA_SHIFT_CLASS,
  FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_ATTACHED_CLASS,
  FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS,
  FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_ATTACHED_CLASS,
  FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_CLASS,
  FULL_SCREEN_VIEWER_SCRUB_CHROME_ABOVE_PAD,
  isFullScreenPostViewerCard,
} from "./full-screen-post-sequence-viewer";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const viewerSrc = readFileSync(
  join(here, "../components/full-screen-post-sequence-viewer.tsx"),
  "utf8",
);
const releaseGallerySrc = readFileSync(
  join(here, "../components/release-attached-posts-gallery.tsx"),
  "utf8",
);
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");

describe("FULLSCREEN-POST-VIEWER-2A — viewer metadata tokens", () => {
  it("defines ~12px gap and scrub chrome above pad from existing embedded scrub geometry", () => {
    assert.equal(FULL_SCREEN_VIEWER_METADATA_SCRUB_GAP, "0.75rem");
    assert.equal(FULL_SCREEN_VIEWER_SCRUB_CHROME_ABOVE_PAD, "0.5rem");
    assert.match(FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS, /safe-area-inset-bottom/);
    assert.match(FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS, /0\.5rem/);
    assert.match(FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS, /0\.75rem/);
    assert.doesNotMatch(FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS, /video-card-overlay-bottom/);
    assert.match(FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_ATTACHED_CLASS, /28px/);
    assert.match(FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_ATTACHED_CLASS, /0\.75rem/);
    assert.doesNotMatch(FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_ATTACHED_CLASS, /5\.25rem/);
    assert.equal(FULL_SCREEN_VIEWER_METADATA_SHIFT_CLASS, "translate-y-0");
  });

  it("gates full-screen viewer path on embeddedFeed && clipViewerOverlay", () => {
    assert.equal(isFullScreenPostViewerCard({ embeddedFeed: true, clipViewerOverlay: true }), true);
    assert.equal(isFullScreenPostViewerCard({ embeddedFeed: true, clipViewerOverlay: false }), false);
    assert.equal(isFullScreenPostViewerCard({ embeddedFeed: false, clipViewerOverlay: true }), false);
    assert.equal(isFullScreenPostViewerCard({}), false);
  });
});

describe("FULLSCREEN-POST-VIEWER-2A — VideoCard viewer overlay", () => {
  it("uses viewer-only bottom classes for Profile and Attached; not Home exclusion var", () => {
    assert.match(videoCardSrc, /isFullScreenPostViewerCard/);
    assert.match(videoCardSrc, /FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS/);
    assert.match(videoCardSrc, /FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_ATTACHED_CLASS/);
    assert.match(videoCardSrc, /data-fullscreen-viewer-overlay=\{isFullScreenPostViewer \? "1"/);
    assert.match(
      videoCardSrc,
      /isFullScreenPostViewer\s*\?\s*moderatorPreview\s*\?\s*FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_ATTACHED_CLASS\s*:\s*FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS/,
    );
    assert.match(
      videoCardSrc,
      /isFullScreenPostViewer[\s\S]*?\?\s*[\s\S]*FULL_SCREEN_VIEWER[\s\S]*:\s*"bottom-\[var\(--video-card-overlay-bottom,0px\)\]"/,
    );
  });

  it("forces viewer metadata shift to 0 and drops stacked viewer pb pads", () => {
    assert.match(videoCardSrc, /FULL_SCREEN_VIEWER_METADATA_SHIFT_CLASS/);
    assert.match(
      videoCardSrc,
      /isFullScreenPostViewer\s*\?\s*FULL_SCREEN_VIEWER_METADATA_SHIFT_CLASS\s*:\s*"translate-y-\[var\(--video-card-metadata-shift,0px\)\]"/,
    );
    assert.match(videoCardSrc, /isFullScreenPostViewer\s*\?\s*"pb-0 sm:pb-0"/);
    assert.match(
      videoCardSrc,
      /isFullScreenPostViewer[\s\S]*?\?[\s\S]*pb-0[\s\S]*:\s*cn\(embeddedFeed && "pb-3"/,
    );
    assert.match(
      videoCardSrc,
      /moderatorPreview && "pb-\[calc\(env\(safe-area-inset-bottom,0px\)\+5\.25rem\)\]"/,
    );
  });

  it("fade-extend height follows viewer bottom, not Home exclusion, on viewer path", () => {
    assert.match(videoCardSrc, /FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_CLASS/);
    assert.match(videoCardSrc, /FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_ATTACHED_CLASS/);
    assert.equal(
      FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_CLASS.includes("0.75rem"),
      true,
    );
    assert.equal(
      FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_ATTACHED_CLASS.includes("28px"),
      true,
    );
  });

  it("viewer release preview renders below core metadata; Home keeps after-chips pb-3", () => {
    const contentIdx = videoCardSrc.indexOf("data-video-card-overlay-content");
    const scrubIdx = videoCardSrc.indexOf("Feed scrub:");
    const overlayRegion = videoCardSrc.slice(contentIdx, scrubIdx);
    assert.doesNotMatch(
      overlayRegion,
      /isFullScreenPostViewer && releasePreview && overlayDensityControl/,
    );
    assert.doesNotMatch(
      overlayRegion,
      /isFullScreenPostViewer && releasePreview && !overlayDensityControl/,
    );
    const avatarIdx = overlayRegion.indexOf('data-testid="post-author-avatar"');
    const statusRowIdx = overlayRegion.indexOf("shrink-0 overflow-visible px-0.5");
    const releaseIdx = overlayRegion.indexOf("data-video-card-release-slot");
    assert.ok(avatarIdx >= 0);
    assert.ok(statusRowIdx > avatarIdx);
    assert.ok(releaseIdx > statusRowIdx);
    assert.match(overlayRegion, /isFullScreenPostViewer \? "pt-0\.5" : "pb-3"/);
    assert.match(overlayRegion, /isFullScreenPostViewer \? "pt-0\.5" : undefined/);
    /* Non-Home density + non-density pills still carry py-3 / sm:py-3.5 */
    assert.match(overlayRegion, /homeFeedLeftMetaCompact \? "py-0" : "py-3 sm:py-3\.5"/);
    assert.match(overlayRegion, /shrink-0 overflow-visible px-0\.5 py-3 pl-0\.5 pr-1 sm:py-3\.5/);
  });

  it("viewer action rail uses independent clamp; Home keeps overlay-bottom rail", () => {
    assert.match(FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS, /clamp/);
    assert.match(FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS, /4\.5rem/);
    assert.match(FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS, /14lvh/);
    assert.match(FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS, /7rem/);
    assert.doesNotMatch(FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS, /video-card-overlay-bottom/);
    assert.doesNotMatch(FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS, /release/);
    assert.match(videoCardSrc, /FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS/);
    assert.match(
      videoCardSrc,
      /isFullScreenPostViewer\s*\?\s*FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS\s*:\s*"bottom-\[calc\(var\(--video-card-overlay-bottom,0px\)\+clamp/,
    );
    assert.match(
      videoCardSrc,
      /bottom-\[calc\(var\(--video-card-overlay-bottom,0px\)\+clamp/,
    );
  });

  it("viewer scrub uses Home visual language with balanced inset; Y/hit unchanged", () => {
    assert.match(
      videoCardSrc,
      /embeddedFeed\s*\?\s*moderatorPreview\s*\?\s*"absolute inset-x-0 bottom-\[calc\(env\(safe-area-inset-bottom,0px\)\+28px\)\] pb-0"/,
    );
    assert.doesNotMatch(
      videoCardSrc,
      /bottom-\[calc\(env\(safe-area-inset-bottom,0px\)\+28px\)\] px-3 pb-0/,
    );
    assert.match(
      videoCardSrc,
      /"absolute inset-x-0 bottom-0 pb-\[max\(0\.25rem,env\(safe-area-inset-bottom,0px\)\)\]"/,
    );
    assert.match(videoCardSrc, /VIEWER_SCRUB_VISUAL_INSET_CLASS/);
    assert.match(videoCardSrc, /VIEWER_SCRUB_TRACK_CLASS/);
    assert.match(videoCardSrc, /VIEWER_SCRUB_INACTIVE_CLASS/);
    assert.match(videoCardSrc, /VIEWER_SCRUB_FILL_CLASS/);
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_VISUAL_INSET_CLASS : HOME_SCRUB_VISUAL_INSET_CLASS/,
    );
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_TRACK_CLASS : HOME_SCRUB_TRACK_CLASS/,
    );
    assert.match(videoCardSrc, /embeddedFeed \? "pt-1\.5 pb-1"/);
  });
});

describe("FULLSCREEN-POST-VIEWER-2A — consumers + Home isolation", () => {
  it("Profile and Attached Clips still share FullScreenPostSequenceViewer + clipViewerOverlay", () => {
    assert.match(viewerSrc, /clipViewerOverlay/);
    assert.match(viewerSrc, /embeddedFeed/);
    assert.match(userProfileSrc, /FullScreenPostSequenceViewer/);
    assert.match(userProfileSrc, /testId="profile-posts-viewer"/);
    assert.match(userProfileSrc, /testId="profile-likes-viewer"/);
    assert.match(releaseGallerySrc, /FullScreenPostSequenceViewer/);
    assert.match(releaseGallerySrc, /moderatorPreview/);
    assert.match(releaseGallerySrc, /galleryMetadataExpand/);
  });

  it("Home still uses overlay-bottom and does not import viewer overlay tokens", () => {
    assert.match(homeSrc, /homeFeedPosterFallback/);
    assert.doesNotMatch(homeSrc, /FULL_SCREEN_VIEWER_OVERLAY_BOTTOM/);
    assert.doesNotMatch(homeSrc, /FULL_SCREEN_VIEWER_ACTION_RAIL/);
    assert.doesNotMatch(homeSrc, /isFullScreenPostViewerCard/);
    assert.doesNotMatch(homeSrc, /VIEWER_SCRUB_/);
    assert.match(videoCardSrc, /bottom-\[var\(--video-card-overlay-bottom,0px\)\]/);
    assert.match(videoCardSrc, /translate-y-\[var\(--video-card-metadata-shift,0px\)\]/);
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_VISUAL_INSET_CLASS : HOME_SCRUB_VISUAL_INSET_CLASS/,
    );
    assert.match(videoCardSrc, /bottom-\[var\(--video-feed-scrub-bottom\)\]/);
  });
});
