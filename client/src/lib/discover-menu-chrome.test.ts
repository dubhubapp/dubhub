import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS,
  DISCOVER_PAGE_ARROW_Y_CLASS,
} from "./discover-subgenre-chips";
import { DISCOVER_FEED_MODE_ICON_COLOR_CLASS } from "./discover-feed-mode-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const genreFilterSrc = readFileSync(join(here, "../components/genre-filter.tsx"), "utf8");

const collapsedStart = genreFilterSrc.indexOf("if (isCollapsed)");
const uncollapsedStart = genreFilterSrc.indexOf('return (\n    <div className="space-y-4 p-4">');
const collapsedSrc = genreFilterSrc.slice(collapsedStart, uncollapsedStart);

describe("discover menu chrome", () => {
  it("keeps Feed as a 2×2 labelled group without decorative tray chrome", () => {
    assert.match(collapsedSrc, /role="group"/);
    assert.match(collapsedSrc, /aria-labelledby="discover-feed-mode-heading"/);
    assert.match(collapsedSrc, /className="grid grid-cols-2 gap-1\.5"/);
    assert.match(collapsedSrc, /FeedModeMenuButton/);
    assert.match(collapsedSrc, /FeedModeRandomCell/);
    assert.match(genreFilterSrc, /min-h-\[3\.5rem\]/);
    assert.doesNotMatch(collapsedSrc, /bg-black\/35/);
    assert.doesNotMatch(collapsedSrc, /shadow-\[inset_0_0_0_1px_rgba\(255,255,255,0\.03\)\]/);
    assert.doesNotMatch(
      collapsedSrc,
      /role="group"[\s\S]*rounded-xl border border-white\/10 bg-black\/35 p-1/,
    );
  });

  it("removes inter-section border-bottom and keeps Done footer border-top", () => {
    assert.doesNotMatch(collapsedSrc, /border-b border-white\/20/);
    assert.match(
      collapsedSrc,
      /data-discover-footer[\s\S]*border-t border-white\/10 bg-white\/10 px-3 py-1\.5/,
    );
    assert.doesNotMatch(collapsedSrc, /sticky bottom-0/);
    const footerBlock = collapsedSrc.slice(
      collapsedSrc.indexOf("data-discover-footer"),
      collapsedSrc.indexOf("data-discover-footer") + 420,
    );
    assert.doesNotMatch(footerBlock, /backdrop-blur-xl/);
  });

  it("shows quiet Clear only when genres are selected and calls onGenresChange([])", () => {
    assert.doesNotMatch(collapsedSrc, />\s*All\s*</);
    assert.doesNotMatch(collapsedSrc, /bg-gray-100 text-gray-800/);
    assert.match(collapsedSrc, /!isAllSelected \? \(/);
    assert.match(collapsedSrc, /aria-label="Clear genre filters"/);
    assert.match(collapsedSrc, /onGenresChange\(\[\]\)/);
    assert.match(collapsedSrc, />\s*Clear\s*</);
  });

  it("marks parent genre chips pressed and the trigger chevron decorative", () => {
    assert.match(collapsedSrc, /aria-pressed=\{isSelected\}/);
    assert.match(collapsedSrc, /<svg\s+aria-hidden="true"/);
  });

  it("leaves Status pills unchanged", () => {
    assert.match(collapsedSrc, /aria-pressed=\{identificationFilter === "identified"\}/);
    assert.match(collapsedSrc, /aria-pressed=\{identificationFilter === "unidentified"\}/);
    assert.match(collapsedSrc, /min-h-9 flex-1 rounded-full px-3 py-1\.5 text-xs/);
    assert.match(collapsedSrc, /bg-green-500 text-white/);
    assert.match(collapsedSrc, /bg-red-500 text-white/);
  });

  it("refines collapsed trigger glass without changing blur, fill, or status rings", () => {
    const triggerStart = collapsedSrc.indexOf("ios-press flex max-w-full min-h-9");
    const triggerSrc = collapsedSrc.slice(triggerStart, triggerStart + 900);
    assert.match(triggerSrc, /bg-white\/10/);
    assert.match(triggerSrc, /backdrop-blur-lg/);
    assert.doesNotMatch(triggerSrc, /backdrop-blur-(?:xl|2xl|3xl)/);
    assert.match(triggerSrc, /DISCOVER_COLLAPSED_TRIGGER_GLASS_SHADOW/);
    assert.match(
      genreFilterSrc,
      /DISCOVER_COLLAPSED_TRIGGER_GLASS_SHADOW =\s*"shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.40\),0_2px_6px_rgba\(0,0,0,0\.25\)\]"/,
    );
    assert.match(
      genreFilterSrc,
      /border-green-400\/80 ring-2 ring-green-400\/45 shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.40\),0_0_8px_2px_rgba\(34,197,94,0\.55\)/,
    );
    assert.match(
      genreFilterSrc,
      /border-red-400\/80 ring-2 ring-red-400\/45 shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.40\),0_0_8px_2px_rgba\(239,68,68,0\.55\)/,
    );
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS/);
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.trending, "text-amber-300");
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.newest, "text-green-400");
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.hottest, "text-red-200");
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.random, "text-red-500");
    assert.doesNotMatch(genreFilterSrc, /text-\[#8ffdf4\]/);
    assert.doesNotMatch(genreFilterSrc, /text-cyan-200/);
  });

  it("aligns Feed and Status to the shared Discover content inset", () => {
    assert.match(collapsedSrc, /data-discover-shared-content="feed"/);
    assert.match(collapsedSrc, /data-discover-shared-content="status"/);
    assert.match(collapsedSrc, /DISCOVER_MENU_CONTENT_INSET_CLASS/);
    assert.match(collapsedSrc, /DISCOVER_MENU_HEADING_TEXT_CLASS/);
  });

  it("refines open Discover menu material, Feed blue, density, and quiet Done", () => {
    assert.match(
      genreFilterSrc,
      /discoverMenuSectionClass = "px-3"/,
    );
    assert.match(
      genreFilterSrc,
      /discoverMenuFeedSectionClass = "px-3 pt-3"/,
    );
    assert.doesNotMatch(genreFilterSrc, /discoverMenuSectionClass = "px-3 py-/);
    assert.match(collapsedSrc, /discoverMenuFeedSectionClass/);
    assert.match(collapsedSrc, /className=\{discoverMenuSectionClass\}/);
    assert.match(collapsedSrc, /discoverMenuCompactHeadingRowClass/);
    const feedBlock = collapsedSrc.slice(
      collapsedSrc.indexOf('data-discover-shared-content="feed"'),
      collapsedSrc.indexOf('data-discover-shared-content="status"'),
    );
    const statusBlock = collapsedSrc.slice(
      collapsedSrc.indexOf('data-discover-shared-content="status"'),
      collapsedSrc.indexOf("data-discover-genre-page="),
    );
    assert.match(feedBlock, /discoverMenuCompactHeadingRowClass/);
    assert.doesNotMatch(feedBlock, /DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS/);
    assert.match(statusBlock, /discoverMenuCompactHeadingRowClass/);
    assert.doesNotMatch(statusBlock, /DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS/);
    assert.match(collapsedSrc, /data-discover-genre-heading="genres"/);
    assert.match(collapsedSrc, /DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS/);
    assert.match(collapsedSrc, /DISCOVER_PAGE_ARROW_Y_CLASS/);
    assert.match(genreFilterSrc, /min-h-\[3\.5rem\]/);
    assert.match(genreFilterSrc, /border-\[#0a83ff\]\/55/);
    assert.match(genreFilterSrc, /bg-\[#0a83ff\]\/40/);
    assert.doesNotMatch(genreFilterSrc, /bg-accent\b/);
    assert.doesNotMatch(genreFilterSrc, /rgba\(34,211,238/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.trending/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.newest/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.hottest/);
    assert.doesNotMatch(genreFilterSrc, /text-cyan-100/);
    assert.match(genreFilterSrc, /border-white\/10 bg-black\/20/);
    assert.match(collapsedSrc, /discoverMenuInactiveChipClass/);
    assert.match(genreFilterSrc, /border-white\/10 bg-white\/\[0\.06\]/);
    assert.match(collapsedSrc, /bg-green-500 text-white/);
    assert.match(collapsedSrc, /bg-red-500 text-white/);
    assert.match(collapsedSrc, /DISCOVER_OPEN_MENU_GLASS_SHADOW/);
    assert.match(
      genreFilterSrc,
      /DISCOVER_OPEN_MENU_GLASS_SHADOW =\s*"shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.40\),0_8px_24px_rgba\(0,0,0,0\.32\)\]"/,
    );
    assert.doesNotMatch(collapsedSrc, /shadow-2xl/);
    assert.match(collapsedSrc, /backdrop-blur-xl/);
    assert.doesNotMatch(genreFilterSrc, /pb-14/);
    assert.doesNotMatch(collapsedSrc, /sticky bottom-0/);
    assert.match(collapsedSrc, /data-discover-panel/);
    assert.match(
      collapsedSrc,
      /flex flex-col overflow-hidden rounded-2xl border border-white\/20 bg-white\/10 backdrop-blur-xl/,
    );
    assert.match(collapsedSrc, /data-discover-scroll-body/);
    assert.match(collapsedSrc, /min-h-0 overflow-y-auto/);
    assert.match(collapsedSrc, /discoverScrollBodyBottomClass/);
    assert.match(genreFilterSrc, /discoverScrollBodyBottomClass = "pb-3"/);
    assert.match(collapsedSrc, /discoverScrollBodySectionGapClass/);
    assert.match(genreFilterSrc, /discoverScrollBodySectionGapClass = "flex flex-col gap-5"/);
    assert.match(collapsedSrc, /discoverMenuGenresSectionOffsetClass/);
    assert.match(genreFilterSrc, /discoverMenuGenresSectionOffsetClass = "-mt-5"/);
    assert.match(collapsedSrc, /discoverMenuPagerHeadingTextClass/);
    assert.match(genreFilterSrc, /discoverMenuPagerHeadingTextClass = `\$\{DISCOVER_MENU_HEADING_TEXT_CLASS\} self-end`/);
    assert.match(collapsedSrc, /discoverMenuClearButtonClass/);
    assert.match(genreFilterSrc, /discoverMenuClearButtonClass =\s*"ios-press inline-flex min-h-9 shrink-0 items-end/);
    assert.match(genreFilterSrc, /discoverMenuClearLabelClass = "translate-y-\[2px\]"/);
    assert.match(collapsedSrc, /discoverMenuClearLabelClass/);
    assert.doesNotMatch(
      collapsedSrc.slice(
        collapsedSrc.indexOf('data-discover-shared-content="feed"'),
        collapsedSrc.indexOf('data-discover-shared-content="status"'),
      ),
      /discoverMenuPagerHeadingTextClass/,
    );
    assert.match(collapsedSrc, /data-discover-genre-page=\{resolvedGenreFilterPage\}/);
    assert.match(collapsedSrc, /DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS/);
    assert.match(DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS, /min-h-9/);
    assert.match(DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS, /mb-2/);
    assert.match(DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS, /items-center/);
    assert.equal(DISCOVER_PAGE_ARROW_Y_CLASS, "top-[6.5rem] -translate-y-1/2");
    // 20px gap-5 − 20px -mt-5 = 0px Status-pill / Genres-row overlap. Do not
    // revert to gap-4 while keeping -mt-5 (that recreates a 4px hit overlap).
    assert.match(
      genreFilterSrc,
      /discoverMenuCompactHeadingRowClass =\s*"mb-2 grid/,
    );
    assert.doesNotMatch(genreFilterSrc, /discoverMenuCompactHeadingRowClass =\s*"mb-1\.5/);
    assert.match(collapsedSrc, /data-discover-footer/);
    assert.match(
      collapsedSrc,
      /min-h-9 w-full rounded-full border border-white\/15 bg-white\/\[0\.06\]/,
    );
    assert.doesNotMatch(collapsedSrc, /min-h-9 w-full rounded-full bg-white\/20/);
  });
});
