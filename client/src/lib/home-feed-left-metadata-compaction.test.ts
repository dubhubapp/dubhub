/**
 * Home Feed left metadata compaction — presentation-only source contracts.
 * Scoped to Home density (`homeFeedLeftMetaCompact`); viewer/gallery unchanged.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const skeletonSrc = readFileSync(
  join(here, "../components/home-feed-initial-skeleton.tsx"),
  "utf8",
);
const releasePreviewSrc = readFileSync(
  join(here, "../components/release-preview-card.tsx"),
  "utf8",
);
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

const contentIdx = videoCardSrc.indexOf("data-video-card-overlay-content");
const scrubIdx = videoCardSrc.indexOf("Feed scrub:");
assert.ok(contentIdx >= 0 && scrubIdx > contentIdx);
const overlayRegion = videoCardSrc.slice(contentIdx, scrubIdx);

const railIdx = videoCardSrc.indexOf('data-overlay-child-class="flex flex-col items-center gap-2"');
const railRegion =
  railIdx >= 0
    ? videoCardSrc.slice(Math.max(0, railIdx - 400), railIdx + 800)
    : "";

describe("HOME left metadata compaction — scoping", () => {
  it("gates compact left metadata on overlayDensityControl && !isFullScreenPostViewer", () => {
    assert.match(
      videoCardSrc,
      /const homeFeedLeftMetaCompact = overlayDensityControl && !isFullScreenPostViewer/,
    );
  });
});

describe("HOME left metadata compaction — avatar / username", () => {
  it("Home compact avatar row uses items-center gap-2; shared path keeps items-center gap-3", () => {
    assert.match(
      overlayRegion,
      /homeFeedLeftMetaCompact \? "items-center gap-2" : "items-center gap-3"/,
    );
  });

  it("username keeps min-h-11 hit target; Home uses items-center pl-0 pr-1.5", () => {
    assert.match(
      overlayRegion,
      /pointer-events-auto inline-flex min-h-11 min-w-0 max-w-full gap-1/,
    );
    assert.match(
      overlayRegion,
      /homeFeedLeftMetaCompact\s*\?\s*"items-center pl-0 pr-1\.5"\s*:\s*"items-center px-1\.5"/,
    );
  });

  it("avatar size classes unchanged", () => {
    assert.match(overlayRegion, /flex h-11 w-11 shrink-0/);
    assert.match(overlayRegion, /avatar-media h-10 w-10 rounded-full/);
  });
});

describe("HOME left metadata compaction — vertical rhythm", () => {
  it("density title block keeps space-y-2 and drops redundant mt-2 on Home compact", () => {
    const densityTitle = overlayRegion.match(
      /overlayDensityControl \?[\s\S]*?space-y-2[\s\S]*?!homeFeedLeftMetaCompact && "mt-2"/,
    );
    assert.ok(densityTitle, "density path should gate mt-2 behind !homeFeedLeftMetaCompact");
    assert.match(overlayRegion, /!homeFeedLeftMetaCompact && "mt-2"/);
    assert.match(overlayRegion, /"space-y-2"/);
  });

  it("non-density (viewer) title block still uses mt-2 space-y-2", () => {
    assert.match(
      overlayRegion,
      /!overlayDensityControl && \(post\.title \|\| post\.description\) \?[\s\S]*?<div className="mt-2 space-y-2">/,
    );
  });

  it("Home density pills use py-0; non-Home density and non-density keep py-3 / sm:py-3.5", () => {
    assert.match(
      overlayRegion,
      /homeFeedLeftMetaCompact \? "py-0" : "py-3 sm:py-3\.5"/,
    );
    assert.match(
      overlayRegion,
      /shrink-0 overflow-visible px-0\.5 py-3 pl-0\.5 pr-1 sm:py-3\.5/,
    );
  });
});

describe("HOME left metadata compaction — RPC / rail / scrub untouched", () => {
  it("ReleasePreviewCard mt-2 / sm:mt-3 unchanged", () => {
    assert.match(
      releasePreviewSrc,
      /pointer-events-auto mt-2 flex min-h-0 w-full min-w-0 items-start gap-2\.5/,
    );
    assert.match(releasePreviewSrc, /sm:mt-3 sm:gap-3 sm:p-3/);
  });

  it("Home release slot still uses pb-3; viewer still uses pt-0.5", () => {
    assert.match(overlayRegion, /isFullScreenPostViewer \? "pb-0" : "pb-3"/);
    assert.match(overlayRegion, /isFullScreenPostViewer \? "pt-0\.5" : undefined/);
    assert.match(overlayRegion, /isFullScreenPostViewer \? "pt-0\.5" : "pb-3"/);
  });

  it("right-rail overlay child class stack unchanged", () => {
    assert.match(videoCardSrc, /data-overlay-child-class="flex flex-col items-center gap-2"/);
    assert.match(railRegion.length > 0 ? railRegion : videoCardSrc, /flex flex-col items-center gap-2/);
  });

  it("overlay-bottom and metadata-shift tokens unchanged", () => {
    assert.match(cssSrc, /--video-card-overlay-bottom:\s*var\(--app-bottom-control-inset\)/);
    assert.match(cssSrc, /--video-card-metadata-shift:\s*11px/);
    assert.match(videoCardSrc, /bottom-\[var\(--video-card-overlay-bottom,0px\)\]/);
    assert.match(
      overlayRegion,
      /translate-y-\[var\(--video-card-metadata-shift,0px\)\]/,
    );
  });

  it("scrub bottom token wiring unchanged", () => {
    assert.match(videoCardSrc, /bottom-\[var\(--video-feed-scrub-bottom\)\]/);
    assert.match(cssSrc, /--video-feed-scrub-bottom:/);
  });
});

describe("HOME left metadata compaction — skeleton parity", () => {
  it("skeleton mirrors compact avatar row and py-0 pills", () => {
    assert.match(skeletonSrc, /flex min-w-0 items-center gap-2/);
    assert.match(skeletonSrc, /h-3\.5 w-28 max-w-\[42%\]/);
    assert.match(skeletonSrc, /shrink-0 overflow-visible px-0\.5 py-0 pl-0\.5 pr-1/);
    assert.doesNotMatch(skeletonSrc, /items-center gap-3/);
    assert.doesNotMatch(skeletonSrc, /py-3 sm:py-3\.5/);
  });

  it("skeleton title/desc use space-y-2 as sibling under gap-2 (no stacked mt-2)", () => {
    assert.match(skeletonSrc, /flex-col gap-2 overflow-visible/);
    assert.match(skeletonSrc, /<div className="space-y-2">/);
    assert.doesNotMatch(skeletonSrc, /mt-2 space-y-2/);
  });
});
