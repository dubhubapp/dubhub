import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveReleaseAttachedPostsSectionState } from "./release-detail-loading";
import {
  RELEASE_DETAIL_ARTWORK_SIZE_CLASS,
  RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS,
} from "./release-detail-secondary-action";

const here = dirname(fileURLToPath(import.meta.url));
const skeletonSrc = readFileSync(
  join(here, "../components/release-detail-skeleton.tsx"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const clipsSrc = readFileSync(
  join(here, "../components/release-attached-clips.tsx"),
  "utf8",
);
const cacheSrc = readFileSync(join(here, "./release-cache.ts"), "utf8");

describe("Release Detail attached-posts loading state", () => {
  it("omits fabricated post cards when post presence is unknown", () => {
    assert.equal(
      resolveReleaseAttachedPostsSectionState({
        hasFullDetail: false,
        attachedClips: undefined,
      }),
      "omit",
    );
    assert.equal(
      resolveReleaseAttachedPostsSectionState({
        hasFullDetail: true,
        attachedClips: undefined,
      }),
      "omit",
    );
    assert.doesNotMatch(skeletonSrc, /ReleaseAttachedClipsSkeleton/);
    assert.doesNotMatch(skeletonSrc, /release-attached-clips-skeleton/);
    assert.doesNotMatch(detailSrc, /ReleaseAttachedClipsSkeleton/);
  });

  it("renders the loaded section for known zero and known posts, never a loading gallery", () => {
    assert.equal(
      resolveReleaseAttachedPostsSectionState({
        hasFullDetail: true,
        attachedClips: [],
      }),
      "ready",
    );
    assert.equal(
      resolveReleaseAttachedPostsSectionState({
        hasFullDetail: true,
        attachedClips: [{ id: "post-1" }],
      }),
      "ready",
    );
    assert.match(clipsSrc, /No posts have been attached to this release yet/);
    assert.match(clipsSrc, /Posts featuring this release \(\{total\}\)/);
    assert.match(clipsSrc, /ReleaseAttachedPostsGallery|onOpenClip/);
  });

  it("does not add an extra posts-existence API for skeleton", () => {
    assert.doesNotMatch(skeletonSrc, /fetch\(/);
    assert.doesNotMatch(skeletonSrc, /useQuery/);
    assert.doesNotMatch(skeletonSrc, /\/api\/releases\/.*\/stats/);
    assert.match(cacheSrc, /queryKey: \["\/api\/releases", releaseId\]/);
    assert.match(detailSrc, /queryKey: \["\/api\/releases", id\]/);
    assert.match(detailSrc, /queryKey: \["\/api\/releases", id, "stats"\]/);
  });

  it("keeps the core hero skeleton and current artwork geometry", () => {
    assert.match(skeletonSrc, /data-testid="release-detail-skeleton"/);
    assert.match(skeletonSrc, /h-32 w-32/);
    assert.match(skeletonSrc, /h-\[1\.375rem\] w-16 rounded-full/);
    assert.equal(RELEASE_DETAIL_ARTWORK_SIZE_CLASS, "h-32 w-32");
    assert.equal(RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS, "min-h-32");
    assert.match(detailSrc, /RELEASE_DETAIL_ARTWORK_SIZE_CLASS/);
  });

  it("treats feed preview and placeholder data as incomplete detail", () => {
    assert.match(cacheSrc, /!release\.__previewFromFeed/);
    assert.match(cacheSrc, /!isPlaceholderData/);
    assert.equal(
      resolveReleaseAttachedPostsSectionState({
        hasFullDetail: false,
        attachedClips: [{ id: "stale" }],
      }),
      "omit",
    );
  });

  it("keeps Artwork/List/deep-link loading on the same detail query without caller-specific skeletons", () => {
    assert.match(detailSrc, /findReleaseInFeedCaches/);
    assert.match(detailSrc, /placeholderData/);
    assert.match(detailSrc, /ReleaseDetailSkeleton/);
    assert.match(detailSrc, /useRoute\("\/releases\/:id"\)/);
    assert.doesNotMatch(detailSrc, /location\.state/);
    assert.doesNotMatch(detailSrc, /fromArtwork|fromListView|callerSkeleton/);
  });

  it("does not invent a loading empty-state for posts", () => {
    assert.doesNotMatch(skeletonSrc, /No posts yet/);
    assert.doesNotMatch(skeletonSrc, /No posts have been attached/);
    assert.doesNotMatch(skeletonSrc, /Posts featuring this release/);
  });
});
