/**
 * C1.1 — delayed Releases skeleton presentation (no query/cache changes).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RELEASE_FEED_SKELETON_DELAY_MS,
  getReleaseFeedLoadingPresentation,
  shouldShowReleaseFeedSkeleton,
} from "@/lib/release-tracker-delayed-skeleton";
import {
  RELEASE_FEED_ARTWORK_PX,
  RELEASE_FEED_ARTWORK_SIZE_CLASS,
  RELEASE_FEED_META_COLUMN_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_SKELETON_VARIANT,
  RELEASE_TRACKER_EMPTY_REGION_CLASS,
  RELEASE_TRACKER_LOADING_REGION_CLASS,
  RELEASE_TRACKER_PAGE_CLASS,
  RELEASE_TRACKER_STICKY_CHROME_CLASS,
} from "@/lib/release-tracker-presentation";
import { APP_MATERIAL_RELEASES_CANVAS_CLASS } from "@/lib/app-material";

const here = dirname(fileURLToPath(import.meta.url));
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const delayedSrc = readFileSync(join(here, "./release-tracker-delayed-skeleton.ts"), "utf8");
const hookSrc = readFileSync(join(here, "./use-delayed-release-feed-skeleton.ts"), "utf8");

describe("C1.1 delayed skeleton phase", () => {
  it("uses ~200ms threshold", () => {
    assert.equal(RELEASE_FEED_SKELETON_DELAY_MS, 200);
    assert.ok(RELEASE_FEED_SKELETON_DELAY_MS >= 180 && RELEASE_FEED_SKELETON_DELAY_MS <= 220);
  });

  it("loading < threshold: skeleton never renders (quiet)", () => {
    assert.equal(
      getReleaseFeedLoadingPresentation({ isLoading: true, skeletonDelayElapsed: false }),
      "quiet",
    );
    assert.equal(
      shouldShowReleaseFeedSkeleton({ isLoading: true, skeletonDelayElapsed: false }),
      false,
    );
  });

  it("loading > threshold: skeleton renders after delay", () => {
    assert.equal(
      getReleaseFeedLoadingPresentation({ isLoading: true, skeletonDelayElapsed: true }),
      "skeleton",
    );
    assert.equal(
      shouldShowReleaseFeedSkeleton({ isLoading: true, skeletonDelayElapsed: true }),
      true,
    );
  });

  it("resolution before threshold: ready immediately (no skeleton)", () => {
    assert.equal(
      getReleaseFeedLoadingPresentation({ isLoading: false, skeletonDelayElapsed: false }),
      "ready",
    );
    assert.equal(
      shouldShowReleaseFeedSkeleton({ isLoading: false, skeletonDelayElapsed: false }),
      false,
    );
  });

  it("resolution after skeleton appears: ready (skeleton off)", () => {
    assert.equal(
      getReleaseFeedLoadingPresentation({ isLoading: false, skeletonDelayElapsed: true }),
      "ready",
    );
    assert.equal(
      shouldShowReleaseFeedSkeleton({ isLoading: false, skeletonDelayElapsed: true }),
      false,
    );
  });
});

describe("C1.1 timer gate with fake timers", () => {
  it("shows skeleton only after delay; cleans up on cancel", () => {
    const timers = new Map<number, { fn: () => void; ms: number }>();
    let nextId = 1;
    let now = 0;
    let show = false;

    const schedule = (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { fn, ms: now + ms });
      return id;
    };
    const clear = (id: number) => {
      timers.delete(id);
    };
    const flush = (to: number) => {
      now = to;
      for (const [id, t] of [...timers.entries()]) {
        if (t.ms <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    };

    let timerId: number | null = null;
    const startLoading = () => {
      show = false;
      if (timerId != null) clear(timerId);
      timerId = schedule(() => {
        show = true;
      }, RELEASE_FEED_SKELETON_DELAY_MS);
    };
    const endLoading = () => {
      if (timerId != null) clear(timerId);
      timerId = null;
      show = false;
    };

    startLoading();
    flush(199);
    assert.equal(show, false);

    flush(200);
    assert.equal(show, true);

    endLoading();
    assert.equal(show, false);
    assert.equal(timers.size, 0);

    startLoading();
    flush(100);
    endLoading();
    flush(500);
    assert.equal(show, false);
    assert.equal(timers.size, 0);
  });
});

describe("C1.1 wiring + freeze contracts", () => {
  it("wires delayed loader with scope/view remount key and quiet aria-busy", () => {
    assert.match(trackerSrc, /useDelayedReleaseFeedSkeleton/);
    assert.match(trackerSrc, /ReleaseFeedDelayedLoader/);
    assert.match(trackerSrc, /key=\{`\$\{effectiveScope\}-\$\{effectiveView\}`\}/);
    assert.match(trackerSrc, /data-testid="release-feed-loading-quiet"/);
    assert.match(trackerSrc, /data-testid="release-feed-row-skeleton"/);
    assert.match(hookSrc, /clearTimeout/);
    assert.match(hookSrc, /setTimeout/);
  });

  it("does not change query/cache configuration", () => {
    assert.match(trackerSrc, /queryKey: \["\/api\/releases\/feed", effectiveScope, effectiveView\]/);
    assert.match(trackerSrc, /staleTime: 0/);
    assert.match(trackerSrc, /refetchOnMount: "always"/);
    assert.match(trackerSrc, /refetchOnReconnect: true/);
    assert.match(trackerSrc, /refetchOnWindowFocus: true/);
    assert.doesNotMatch(delayedSrc, /staleTime|gcTime|queryKey|invalidateQueries/);
    assert.doesNotMatch(hookSrc, /staleTime|gcTime|queryKey|invalidateQueries/);
  });

  it("keeps skeleton geometry and C1 material shell", () => {
    assert.equal(RELEASE_FEED_SKELETON_VARIANT, "flat-row");
    assert.equal(RELEASE_FEED_ARTWORK_PX, 120);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /h-\[7.5rem\] w-\[7.5rem\]/);
    assert.match(trackerSrc, /\[0, 1, 2\]\.map/);
    assert.match(trackerSrc, /RELEASE_FEED_ARTWORK_SIZE_CLASS/);
    assert.match(trackerSrc, /RELEASE_FEED_ROW_BASE_CLASS/);
    assert.match(RELEASE_TRACKER_PAGE_CLASS, new RegExp(APP_MATERIAL_RELEASES_CANVAS_CLASS));
    assert.match(RELEASE_TRACKER_STICKY_CHROME_CLASS, /dubhub-app-releases-sticky/);
    assert.match(trackerSrc, /RELEASE_TRACKER_PAGE_CLASS/);
    assert.match(trackerSrc, /RELEASE_TRACKER_STICKY_CHROME_CLASS/);
  });

  it("skeleton is full-width list-aligned with status + CTA bones", () => {
    assert.match(RELEASE_TRACKER_LOADING_REGION_CLASS, /w-full/);
    assert.doesNotMatch(RELEASE_TRACKER_LOADING_REGION_CLASS, /justify-center|items-center/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /justify-center/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /items-center/);
    assert.match(trackerSrc, /RELEASE_TRACKER_LOADING_REGION_CLASS/);
    assert.match(trackerSrc, /data-testid="release-feed-loading"/);
    assert.match(trackerSrc, /data-testid="release-feed-empty"/);
    assert.match(trackerSrc, /className=\{cn\(RELEASE_FEED_DIVIDE_CLASS, "w-full py-1"\)\}/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /gap-3\.5/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /py-4/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /min-h-\[7.5rem\]/);
    assert.match(trackerSrc, /RELEASE_FEED_META_COLUMN_CLASS/);
    assert.match(trackerSrc, /RELEASE_FEED_STATUS_ROW_CLASS/);
    assert.match(trackerSrc, /RELEASE_FEED_ACTIONS_ROW_CLASS/);
    assert.match(trackerSrc, /data-testid="release-feed-row-skeleton-status"/);
    assert.match(trackerSrc, /data-testid="release-feed-row-skeleton-cta"/);
    assert.match(trackerSrc, /rounded-full/);
    // Loading wrappers use LOADING_REGION; empty still uses EMPTY_REGION centering.
    assert.match(
      trackerSrc,
      /RELEASE_TRACKER_LOADING_REGION_CLASS[\s\S]{0,80}data-testid="release-feed-loading"/,
    );
    assert.match(
      trackerSrc,
      /RELEASE_TRACKER_EMPTY_REGION_CLASS[\s\S]{0,80}data-testid="release-feed-empty"/,
    );
  });
});
