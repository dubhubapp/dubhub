/**
 * Phase 3C.1 — Releases LIST Light presentation.
 * Detail, Create/Edit, and native iOS appearance stay out of scope.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_COMING_SOON_PILL_CLASS,
  RELEASE_RELEASED_PILL_CLASS,
  RELEASE_UPCOMING_PILL_CLASS,
} from "./release-status-pill";
import {
  RELEASE_FEED_ARTWORK_SIZE_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_BYLINE_CLASS,
  RELEASE_FEED_DATE_CLASS,
  RELEASE_FEED_DIVIDE_CLASS,
  RELEASE_FEED_MONTH_HEADING_CLASS,
  RELEASE_FEED_PRIMARY_CTA_CLASS,
  RELEASE_FEED_TITLE_CLASS,
  RELEASE_TRACKER_ADD_HREF,
  RELEASE_TRACKER_EMPTY_ICON_CLASS,
  RELEASE_TRACKER_EMPTY_TITLE_CLASS,
  RELEASE_TRACKER_PAGE_CLASS,
  RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
  RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS,
} from "./release-tracker-presentation";
import { releaseTrackerSecondaryTabEmphasisColor } from "./release-tracker-tab-swipe";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const thumbSrc = readFileSync(join(here, "../components/release-artwork-thumb.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

describe("Phase 3C.1 Releases list Light presentation", () => {
  it("uses the approved Light canvas atmosphere and leaves Dark atmosphere intact", () => {
    const darkCanvas = cssSrc.slice(
      cssSrc.indexOf(".dark .dubhub-app-releases-canvas"),
      cssSrc.indexOf(":root:not(.dark) .dubhub-app-releases-canvas"),
    );
    assert.match(darkCanvas, /#0f1324/);
    assert.match(darkCanvas, /rgba\(10, 131, 255, 0\.14\)/);
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /dubhub-app-releases-canvas/);
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /dubhub-releases-list/);
    const lightCanvas = cssSrc.slice(
      cssSrc.indexOf(":root:not(.dark) .dubhub-app-releases-canvas"),
      cssSrc.indexOf(":root:not(.dark) .dubhub-app-releases-canvas") + 280,
    );
    assert.match(lightCanvas, /background-color:\s*#F6F8FC/);
    assert.match(lightCanvas, /background-image:\s*var\(--page-canvas-atmosphere\)/);
    const listFades = cssSrc.slice(
      cssSrc.indexOf("html[data-dubhub-native-nav=\"on\"]:not(.dark) .dubhub-app-releases-fab-fade"),
      cssSrc.indexOf(".dark .dubhub-app-releases-fab-underlay") + 900,
    );
    assert.doesNotMatch(listFades, /hsl\(var\(--background\)\)/);
  });

  it("gives sticky chrome a pale frost and keeps Dark sticky navy", () => {
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-sticky \{[\s\S]*?rgba\(15, 22, 48, 0\.72\)/);
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-releases-sticky \{[\s\S]*?rgba\(246, 248, 252, 0\.88\)/,
    );
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-releases-sticky-fade \{[\s\S]*?rgba\(246, 248, 252, 0\.28\)/,
    );
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-sticky-fade \{[\s\S]*?rgba\(15, 22, 48, 0\.32\)/);
  });

  it("keeps tab class strings and paints Light inactive labels in semantic ink", () => {
    assert.equal(
      RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS,
      "font-semibold text-white/55 hover:text-white/80",
    );
    assert.equal(
      RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
      "font-medium text-white/55 hover:text-white/80",
    );
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-releases-sticky \.text-white\\\/55[\s\S]*?color:\s*#667085/,
    );
    assert.equal(releaseTrackerSecondaryTabEmphasisColor(0), "rgba(255, 255, 255, 0.55)");
    assert.equal(releaseTrackerSecondaryTabEmphasisColor(1), "rgba(255, 255, 255, 1)");
    assert.match(trackerSrc, /releaseTrackerSecondaryTabEmphasisColor\(emphasis\)/);
  });

  it("uses semantic page text for titles, metadata, headings, and dividers", () => {
    assert.match(RELEASE_FEED_TITLE_CLASS, /text-foreground/);
    assert.match(RELEASE_FEED_BYLINE_CLASS, /text-muted-foreground/);
    assert.match(RELEASE_FEED_DATE_CLASS, /text-muted-foreground/);
    assert.match(RELEASE_FEED_MONTH_HEADING_CLASS, /text-foreground/);
    assert.match(RELEASE_FEED_MONTH_HEADING_CLASS, /dark:text-white\/95/);
    assert.match(RELEASE_FEED_DIVIDE_CLASS, /divide-\[#DCE3EC\]/);
    assert.match(RELEASE_FEED_DIVIDE_CLASS, /dark:divide-white\/\[0\.08\]/);
    assert.match(RELEASE_TRACKER_EMPTY_TITLE_CLASS, /text-foreground/);
    assert.match(RELEASE_TRACKER_EMPTY_ICON_CLASS, /text-muted-foreground/);
    assert.match(RELEASE_TRACKER_EMPTY_ICON_CLASS, /dark:text-white\/40/);
    assert.match(RELEASE_FEED_PRIMARY_CTA_CLASS, /text-foreground/);
    assert.match(RELEASE_FEED_PRIMARY_CTA_CLASS, /dark:bg-white\/\[0\.12\]/);
    assert.match(RELEASE_FEED_PRIMARY_CTA_CLASS, /bg-\[#EEF3FF\]/);
  });

  it("keeps artwork presentation fixed and status hues canonical", () => {
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /shadow-\[0_2px_8px_rgba\(0,0,0,0\.22\)\]/);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /dark:ring-white\/10/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /overflow-hidden/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /gap-3\.5/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /py-4/);
    assert.match(thumbSrc, /rounded-\[inherit\]/);
    assert.doesNotMatch(
      thumbSrc,
      /flex items-center justify-center overflow-hidden bg-muted/,
    );
    assert.match(thumbSrc, /object-cover/);
    assert.doesNotMatch(thumbSrc, /brightness-|sepia-|grayscale|mix-blend/);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /#f59e0b/);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /#0f1324/);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /text-white/);
    assert.match(RELEASE_UPCOMING_PILL_CLASS, /#6366f1/);
    assert.match(RELEASE_RELEASED_PILL_CLASS, /#22c55e/);
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-releases-list \[class~="ring-amber-400\/35"\]/,
    );
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-releases-list \[class~="ring-green-400\/35"\]/,
    );
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-release-detail-canvas \[class~="ring-green-400\/35"\]/,
    );
  });

  it("keeps Add Release visible in Light and fades into the Light canvas", () => {
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-fab-underlay[\s\S]*?#0f1324/);
    const darkFade = cssSrc.slice(cssSrc.indexOf(".dark .dubhub-app-releases-fab-fade"));
    assert.match(darkFade.slice(0, darkFade.indexOf("}")), /#0f1324\s+0%/);
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-releases-fab-underlay[\s\S]*?background-color:\s*#F6F8FC/,
    );
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-releases-fab-fade[\s\S]*?#F6F8FC\s+0%/,
    );
    const nativeFade = cssSrc.slice(
      cssSrc.indexOf('html[data-dubhub-native-nav="on"] .dubhub-app-releases-fab-fade'),
    );
    assert.match(nativeFade.slice(0, nativeFade.indexOf("}")), /rgba\(15, 19, 36, 0\.65\)/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\]:not\(\.dark\) \.dubhub-app-releases-fab-fade[\s\S]*?rgba\(246, 248, 252, 0\.72\)/,
    );
    assert.match(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-releases-list \.dubhub-app-primary-action[\s\S]*?background-color:\s*var\(--primary\)/,
    );
    assert.doesNotMatch(
      cssSrc.slice(cssSrc.indexOf(".dubhub-app-releases-fab-fade"), cssSrc.indexOf(".dubhub-app-releases-fab-fade") + 500),
      /backdrop-filter/,
    );
  });

  it("leaves routing, Detail, Create/Edit, Home, and video untouched", () => {
    assert.equal(RELEASE_TRACKER_ADD_HREF, "/releases/new");
    assert.match(trackerSrc, /navigate\(`\/releases\/\$\{r\.id\}\?\$\{params\}`\)/);
    assert.doesNotMatch(detailSrc, /dubhub-releases-list/);
    assert.doesNotMatch(createSrc, /dubhub-releases-list/);
    assert.doesNotMatch(editSrc, /dubhub-releases-list/);
    assert.doesNotMatch(homeSrc, /dubhub-releases-list|dubhub-app-releases-fab-fade/);
    assert.doesNotMatch(videoCardSrc, /dubhub-releases-list|releaseTrackerSecondaryTabEmphasisColor/);
  });
});
