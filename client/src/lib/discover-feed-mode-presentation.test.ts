/**
 * DISCOVER-MODE-COLOR-1 — Discover feed-mode icon colour contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DISCOVER_FEED_MODE_ICON_COLOR_CLASS,
  DISCOVER_RANDOM_ACCENT,
} from "@/lib/discover-feed-mode-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const genreFilterSrc = readFileSync(join(here, "../components/genre-filter.tsx"), "utf8");
const presentationSrc = readFileSync(join(here, "./discover-feed-mode-presentation.ts"), "utf8");

describe("Discover feed-mode icon colours", () => {
  it("maps each mode to the intended selected icon colour", () => {
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.trending, "text-amber-300");
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.newest, "text-green-400");
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.hottest, "text-red-200");
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.random, "text-red-500");
    assert.equal(DISCOVER_RANDOM_ACCENT, "#ef4444");
  });

  it("uses one shared map for open tiles and collapsed pill", () => {
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.trending/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.newest/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.hottest/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.random/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\[mode\]/);
    assert.doesNotMatch(genreFilterSrc, /FEED_MODE_TRIGGER_ICON_CLASS/);
  });

  it("removes turquoise Random from Discover mode icon presentation", () => {
    assert.doesNotMatch(presentationSrc, /#8ffdf4/);
    assert.doesNotMatch(presentationSrc, /text-cyan-/);
    assert.doesNotMatch(genreFilterSrc, /text-\[#8ffdf4\]/);
    assert.doesNotMatch(genreFilterSrc, /text-cyan-100/);
    assert.doesNotMatch(genreFilterSrc, /text-cyan-200/);
  });
});
