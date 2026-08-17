import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
      /sticky bottom-0 border-t border-white\/20 bg-white\/10 px-3 py-2\.5 backdrop-blur-xl/,
    );
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

  it("aligns Feed and Status to the shared Discover content inset", () => {
    assert.match(collapsedSrc, /data-discover-shared-content="feed"/);
    assert.match(collapsedSrc, /data-discover-shared-content="status"/);
    assert.match(collapsedSrc, /DISCOVER_MENU_CONTENT_INSET_CLASS/);
    assert.match(collapsedSrc, /DISCOVER_MENU_HEADING_TEXT_CLASS/);
  });
});
