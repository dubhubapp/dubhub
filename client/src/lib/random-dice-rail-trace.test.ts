/**
 * DISCOVER-MODE-COLOR-2 — Random rail dice trace shares Discover Random red.
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
const diceSrc = readFileSync(join(here, "../components/random-dice-button.tsx"), "utf8");
const genreFilterSrc = readFileSync(join(here, "../components/genre-filter.tsx"), "utf8");
const presentationSrc = readFileSync(join(here, "./discover-feed-mode-presentation.ts"), "utf8");
const tailwindSrc = readFileSync(join(here, "../../../tailwind.config.ts"), "utf8");

describe("Random accent consistency (Discover + rail)", () => {
  it("uses one red family for Discover icons and rail trace", () => {
    assert.equal(DISCOVER_RANDOM_ACCENT, "#ef4444");
    assert.equal(DISCOVER_FEED_MODE_ICON_COLOR_CLASS.random, "text-red-500");
    assert.match(presentationSrc, /DISCOVER_RANDOM_ACCENT/);
    assert.match(diceSrc, /stroke=\{DISCOVER_RANDOM_ACCENT\}/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\.random/);
    assert.match(genreFilterSrc, /DISCOVER_FEED_MODE_ICON_COLOR_CLASS\[mode\]/);
  });

  it("keeps no turquoise or interactive blue in Random accent treatment", () => {
    const iconFn = diceSrc.slice(
      diceSrc.indexOf("export function DiceDiscoverIcon"),
      diceSrc.indexOf("const wrapBase"),
    );
    assert.doesNotMatch(iconFn, /APP_MATERIAL_INTERACTIVE_BLUE|#0a83ff|#8ffdf4|#4ae9df/);
    assert.doesNotMatch(presentationSrc, /#8ffdf4|#0a83ff/);
    assert.doesNotMatch(genreFilterSrc, /text-\[#8ffdf4\]/);
    assert.match(iconFn, /stroke=\{DISCOVER_RANDOM_ACCENT\}/);
  });

  it("keeps white outline/pips via currentColor and single soft glow arc", () => {
    assert.match(diceSrc, /stroke="currentColor"/);
    assert.match(diceSrc, /fill="currentColor"/);
    assert.match(diceSrc, /stroke-dasharray:38_62/);
    assert.equal((diceSrc.match(/animate-dice-rail-edge-trace/g) ?? []).length, 1);
    assert.match(diceSrc, /stdDeviation="3\.6"/);
    assert.match(diceSrc, /stdDeviation="1\.35"/);
    assert.doesNotMatch(diceSrc, /--dice-trace-base/);
    assert.match(tailwindSrc, /dice-rail-edge-trace 3\.3s linear infinite/);
    assert.match(diceSrc, /motion-reduce:hidden/);
  });
});
