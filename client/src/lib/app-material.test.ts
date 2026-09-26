/**
 * Slice C1 — Releases Tracker premium material contracts.
 * Presentation only; proves Home isolation and frozen geometry.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_INTERACTIVE_BLUE,
  APP_MATERIAL_RELEASES_CANVAS_CLASS,
  APP_MATERIAL_RELEASES_STICKY_CLASS,
} from "@/lib/app-material";
import {
  RELEASE_FEED_ARTWORK_PX,
  RELEASE_FEED_ARTWORK_SIZE_CLASS,
  RELEASE_FEED_DIVIDE_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_SKELETON_VARIANT,
  RELEASE_TRACKER_ADD_HREF,
  RELEASE_TRACKER_EMPTY_CLASS,
  RELEASE_TRACKER_EMPTY_REGION_CLASS,
  RELEASE_TRACKER_FAB_UNDERLAY_CLASS,
  RELEASE_TRACKER_PAGE_CLASS,
  RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS,
  RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS,
  RELEASE_TRACKER_STICKY_CHROME_CLASS,
  RELEASE_TRACKER_STICKY_FADE_CLASS,
  getReleaseTrackerEmptyCopy,
  getMyUpcomingEmptyReleaseCtaLabel,
  resolveMyUpcomingEmptyReleaseCtaLabel,
  MY_UPCOMING_EMPTY_CTA_FIRST,
  MY_UPCOMING_EMPTY_CTA_NEXT,
  MY_UPCOMING_EMPTY_CTA_UNRESOLVED,
} from "@/lib/release-tracker-presentation";
import {
  RELEASE_COMING_SOON_PILL_CLASS,
  RELEASE_RELEASED_PILL_CLASS,
  RELEASE_UPCOMING_PILL_CLASS,
} from "@/lib/release-status-pill";
import { STICKY_TAB_CHROME_CLASS } from "@/lib/sticky-tab-chrome";

const here = dirname(fileURLToPath(import.meta.url));
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const bottomNavSrc = readFileSync(join(here, "../components/bottom-navigation.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const feedCardSrc = readFileSync(join(here, "../components/release-feed-card.tsx"), "utf8");

describe("C1 Releases atmosphere scope", () => {
  it("applies Releases canvas only on the tracker scroll shell", () => {
    assert.equal(APP_MATERIAL_RELEASES_CANVAS_CLASS, "dubhub-app-releases-canvas");
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /dubhub-app-releases-canvas/);
    assert.match(trackerSrc, /RELEASE_TRACKER_PAGE_CLASS/);
    assert.match(trackerSrc, /data-releases-tracker=/);
    assert.doesNotMatch(homeSrc, /dubhub-app-releases-canvas|RELEASE_TRACKER_PAGE_CLASS|app-material/);
    assert.doesNotMatch(bottomNavSrc, /dubhub-app-releases/);
  });

  it("atmosphere CSS is dark-scoped and not a global body/auth replacement", () => {
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-canvas/);
    assert.doesNotMatch(cssSrc, /body\.dubhub-app-releases|html\.dubhub-app-releases/);
    assert.doesNotMatch(cssSrc, /\.dubhub-app-releases-canvas\s*\{[^}]*animation/);
  });

  it("uses the approved interactive blue (#0a83ff) for generic tab indicators only", () => {
    assert.equal(APP_MATERIAL_INTERACTIVE_BLUE, "#0a83ff");
    assert.match(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /after:bg-\[#0a83ff\]/);
    assert.match(RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS, /bg-\[#0a83ff\]/);
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /bg-accent|4ae9df|teal/);
  });
});

describe("C1 frozen geometry + anti-card rows", () => {
  it("keeps sticky chrome height/safe-area/blur contract", () => {
    assert.match(RELEASE_TRACKER_STICKY_CHROME_CLASS, new RegExp(STICKY_TAB_CHROME_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(RELEASE_TRACKER_STICKY_CHROME_CLASS, /sticky top-0/);
    assert.match(RELEASE_TRACKER_STICKY_CHROME_CLASS, /backdrop-blur-md/);
    assert.match(RELEASE_TRACKER_STICKY_CHROME_CLASS, /pt-\[calc\(env\(safe-area-inset-top/);
    assert.match(RELEASE_TRACKER_STICKY_CHROME_CLASS, /pb-1/);
    assert.match(RELEASE_TRACKER_STICKY_CHROME_CLASS, new RegExp(APP_MATERIAL_RELEASES_STICKY_CLASS));
    assert.match(RELEASE_TRACKER_STICKY_FADE_CLASS, /h-12/);
    assert.match(RELEASE_TRACKER_STICKY_FADE_CLASS, /backdrop-blur-md/);
  });

  it("does not card-wrap release rows or add per-row blur", () => {
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /items-start/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /(?:^|\s)py-4(?:\s|$)/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /backdrop-blur|rounded-xl|bg-black\/30|shadow-lg/);
    assert.doesNotMatch(feedCardSrc, /backdrop-blur/);
    assert.equal(RELEASE_FEED_ARTWORK_PX, 120);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /h-\[7.5rem\] w-\[7.5rem\]/);
    assert.match(RELEASE_FEED_DIVIDE_CLASS, /divide-y/);
  });

  it("FAB route/size/ceramic contract stays frozen", () => {
    assert.equal(RELEASE_TRACKER_ADD_HREF, "/releases/new");
    assert.match(trackerSrc, /RELEASE_TRACKER_ADD_CTA_CLASS/);
    assert.match(trackerSrc, /Add Release/);
    assert.match(trackerSrc, /RELEASE_TRACKER_FAB_UNDERLAY_CLASS/);
    assert.equal(RELEASE_TRACKER_FAB_UNDERLAY_CLASS, "dubhub-app-releases-fab-underlay");
  });

  it("empty copy + actions unchanged; structure uses empty presentation tokens", () => {
    assert.equal(
      getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "my" }).title,
      "No upcoming releases",
    );
    assert.equal(
      getReleaseTrackerEmptyCopy({
        view: "upcoming",
        scope: "my",
        hasOwnedReleaseHistory: false,
      }).title,
      "No releases yet",
    );
    assert.equal(resolveMyUpcomingEmptyReleaseCtaLabel(), MY_UPCOMING_EMPTY_CTA_UNRESOLVED);
    assert.equal(getMyUpcomingEmptyReleaseCtaLabel(false), MY_UPCOMING_EMPTY_CTA_FIRST);
    assert.equal(getMyUpcomingEmptyReleaseCtaLabel(true), MY_UPCOMING_EMPTY_CTA_NEXT);
    assert.match(trackerSrc, /resolveMyUpcomingEmptyReleaseCtaLabel/);
    assert.match(trackerSrc, /showMyUpcomingEmptyCta/);
    assert.match(trackerSrc, /RELEASE_TRACKER_EMPTY_CLASS/);
    assert.match(trackerSrc, /RELEASE_TRACKER_EMPTY_REGION_CLASS/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /flex-1/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /justify-center/);
    assert.doesNotMatch(RELEASE_TRACKER_EMPTY_CLASS, /py-14/);
    assert.doesNotMatch(trackerSrc, /backdrop-blur.*empty|empty.*backdrop-blur/);
  });

  it("skeleton count/geometry unchanged (3 flat rows, 120px art)", () => {
    assert.equal(RELEASE_FEED_SKELETON_VARIANT, "flat-row");
    assert.match(trackerSrc, /\[0, 1, 2\]\.map/);
    assert.match(trackerSrc, /RELEASE_FEED_ARTWORK_SIZE_CLASS|h-\[7.5rem\] w-\[7.5rem\]/);
    assert.match(trackerSrc, /data-testid="release-feed-row-skeleton"/);
    assert.doesNotMatch(trackerSrc, /tone="teal"/);
  });

  it("semantic status pill colours are retained", () => {
    assert.match(RELEASE_UPCOMING_PILL_CLASS, /./);
    assert.match(RELEASE_RELEASED_PILL_CLASS, /./);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /./);
    assert.doesNotMatch(RELEASE_UPCOMING_PILL_CLASS, /#0a83ff/);
    assert.doesNotMatch(RELEASE_RELEASED_PILL_CLASS, /#0a83ff/);
  });

  it("no new backdrop-filter inside release rows; sticky blur count stays bounded", () => {
    const rowBlur = (RELEASE_FEED_ROW_BASE_CLASS.match(/backdrop-blur/g) || []).length;
    assert.equal(rowBlur, 0);
    const chromeBlur = (RELEASE_TRACKER_STICKY_CHROME_CLASS.match(/backdrop-blur/g) || []).length;
    const fadeBlur = (RELEASE_TRACKER_STICKY_FADE_CLASS.match(/backdrop-blur/g) || []).length;
    assert.equal(chromeBlur, 1);
    assert.equal(fadeBlur, 1);
    assert.doesNotMatch(trackerSrc, /backdrop-blur-(?:xl|2xl|3xl)/);
  });
});
