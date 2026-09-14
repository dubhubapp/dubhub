/**
 * FEED-END-STATE-1 — Home end-of-feed presentation / idle dice contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOME_FEED_END_ATMOSPHERE_CLASS,
  HOME_FEED_END_BODY,
  HOME_FEED_END_DICE_ARIA_LABEL,
  HOME_FEED_END_DICE_BUTTON_CLASS,
  HOME_FEED_END_DICE_SPIN_MS,
  HOME_FEED_END_IDLE_SPIN_INITIAL_MS,
  HOME_FEED_END_IDLE_SPIN_INTERVAL_MS,
  HOME_FEED_END_SLIDE_CLASS,
  HOME_FEED_END_TITLE,
  shouldScheduleHomeFeedEndIdleSpin,
  shouldShowHomeFeedEndState,
} from "@/lib/home-feed-end-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const endStateSrc = readFileSync(join(here, "../components/home-feed-end-state.tsx"), "utf8");
const diceSrc = readFileSync(join(here, "../components/random-dice-button.tsx"), "utf8");
const tailwindSrc = readFileSync(join(here, "../../../tailwind.config.ts"), "utf8");
const presentationSrc = readFileSync(join(here, "./home-feed-end-presentation.ts"), "utf8");

const baseVisible = {
  sortMode: "newest",
  isInitialFeedLoad: false,
  isError: false,
  uiPostsLength: 3,
  hasNextPage: false as boolean | undefined,
  isFetchingNextPage: false,
  suppressPlaceholderFeedRows: false,
};

describe("Home feed end-state visibility", () => {
  it("appears only when sorted feed pagination is exhausted", () => {
    assert.equal(shouldShowHomeFeedEndState(baseVisible), true);
  });

  it("hides during Random mode", () => {
    assert.equal(shouldShowHomeFeedEndState({ ...baseVisible, sortMode: "random" }), false);
  });

  it("hides while more pages remain or a page is fetching", () => {
    assert.equal(shouldShowHomeFeedEndState({ ...baseVisible, hasNextPage: true }), false);
    assert.equal(shouldShowHomeFeedEndState({ ...baseVisible, hasNextPage: undefined }), false);
    assert.equal(shouldShowHomeFeedEndState({ ...baseVisible, isFetchingNextPage: true }), false);
  });

  it("hides for empty, error, initial, or placeholder-suppressed feeds", () => {
    assert.equal(shouldShowHomeFeedEndState({ ...baseVisible, uiPostsLength: 0 }), false);
    assert.equal(shouldShowHomeFeedEndState({ ...baseVisible, isError: true }), false);
    assert.equal(shouldShowHomeFeedEndState({ ...baseVisible, isInitialFeedLoad: true }), false);
    assert.equal(
      shouldShowHomeFeedEndState({ ...baseVisible, suppressPlaceholderFeedRows: true }),
      false,
    );
  });

  it("Home wires the helper and end-state component into the feed tree", () => {
    assert.match(homeSrc, /shouldShowHomeFeedEndState/);
    assert.match(homeSrc, /HomeFeedEndState/);
    assert.match(homeSrc, /handleFeedSortChange\("random"\)/);
    assert.doesNotMatch(homeSrc, /You've reached the end of the feed/);
    assert.doesNotMatch(homeSrc, /home-end-dice-ring-pulse/);
    assert.doesNotMatch(homeSrc, /turquoiseProminent/);
  });
});

describe("Home feed end-state presentation", () => {
  it("uses updated concise copy", () => {
    assert.equal(HOME_FEED_END_TITLE, "You're all caught up");
    assert.equal(
      HOME_FEED_END_BODY,
      "Spin the dice and jump into a random unidentified clip.",
    );
    assert.match(endStateSrc, /HOME_FEED_END_TITLE/);
    assert.match(endStateSrc, /HOME_FEED_END_BODY/);
    assert.doesNotMatch(endStateSrc, /older unidentified/);
    assert.doesNotMatch(endStateSrc, /Quick tip/);
  });

  it("drops the heavy bordered card for an integrated composition", () => {
    assert.match(HOME_FEED_END_SLIDE_CLASS, /snap-start/);
    assert.match(HOME_FEED_END_SLIDE_CLASS, /bg-black/);
    assert.doesNotMatch(endStateSrc, /rounded-2xl border border-white\/15/);
    assert.doesNotMatch(endStateSrc, /backdrop-blur-md/);
    assert.doesNotMatch(endStateSrc, /max-w-md rounded-2xl/);
    assert.match(endStateSrc, /HOME_FEED_END_ATMOSPHERE_CLASS/);
    assert.match(HOME_FEED_END_ATMOSPHERE_CLASS, /radial-gradient/);
  });

  it("uses one soft halo + circular material without duplicate teal rings", () => {
    assert.match(endStateSrc, /HOME_FEED_END_DICE_HALO/);
    assert.match(endStateSrc, /accentGlow="none"/);
    assert.match(HOME_FEED_END_DICE_BUTTON_CLASS, /rounded-full/);
    assert.match(HOME_FEED_END_DICE_BUTTON_CLASS, /min-h-11/);
    assert.doesNotMatch(endStateSrc, /border-\[#4ae9df\]/);
    assert.doesNotMatch(endStateSrc, /ring-2 ring-\[#4ae9df\]/);
    assert.doesNotMatch(endStateSrc, /home-end-dice-ring-pulse/);
    assert.doesNotMatch(tailwindSrc, /home-end-dice-ring-pulse/);
    assert.match(presentationSrc, /APP_MATERIAL_INTERACTIVE_BLUE/);
  });

  it("keeps dice as the sole CTA with aria-label and existing Random path", () => {
    assert.equal(HOME_FEED_END_DICE_ARIA_LABEL, "Switch to random discovery");
    assert.match(endStateSrc, /RandomDiceButton/);
    assert.match(endStateSrc, /onRandomPress/);
    assert.doesNotMatch(endStateSrc, />\s*Random\s*</);
    assert.match(homeSrc, /onRandomPress=\{\(\) => \{\s*handleFeedSortChange\("random"\);/);
  });
});

describe("Home feed end-state idle dice animation", () => {
  it("reuses RandomDiceButton idleSpinKey → dice-spin path", () => {
    assert.match(diceSrc, /idleSpinKey/);
    assert.match(diceSrc, /motion-safe:animate-dice-spin/);
    assert.match(diceSrc, /motion-reduce:animate-none/);
    assert.match(endStateSrc, /idleSpinKey=\{idleSpinKey\}/);
    assert.equal(HOME_FEED_END_DICE_SPIN_MS, 420);
    assert.ok(HOME_FEED_END_IDLE_SPIN_INITIAL_MS >= 3000);
    assert.ok(HOME_FEED_END_IDLE_SPIN_INITIAL_MS <= 5000);
    assert.ok(HOME_FEED_END_IDLE_SPIN_INTERVAL_MS >= 6000);
  });

  it("gates idle spin for reduced motion, background, offscreen, and user tap", () => {
    assert.equal(
      shouldScheduleHomeFeedEndIdleSpin({
        reducedMotion: false,
        documentVisible: true,
        endStateInView: true,
        userTriggeredRandom: false,
      }),
      true,
    );
    assert.equal(
      shouldScheduleHomeFeedEndIdleSpin({
        reducedMotion: true,
        documentVisible: true,
        endStateInView: true,
        userTriggeredRandom: false,
      }),
      false,
    );
    assert.equal(
      shouldScheduleHomeFeedEndIdleSpin({
        reducedMotion: false,
        documentVisible: false,
        endStateInView: true,
        userTriggeredRandom: false,
      }),
      false,
    );
    assert.equal(
      shouldScheduleHomeFeedEndIdleSpin({
        reducedMotion: false,
        documentVisible: true,
        endStateInView: false,
        userTriggeredRandom: false,
      }),
      false,
    );
    assert.equal(
      shouldScheduleHomeFeedEndIdleSpin({
        reducedMotion: false,
        documentVisible: true,
        endStateInView: true,
        userTriggeredRandom: true,
      }),
      false,
    );
  });

  it("cleans timers on unmount / gate change and never auto-haptics", () => {
    assert.match(endStateSrc, /clearTimeout/);
    assert.match(endStateSrc, /visibilitychange/);
    assert.match(endStateSrc, /IntersectionObserver/);
    assert.match(endStateSrc, /cancelled = true/);
    assert.doesNotMatch(endStateSrc, /playInteraction/);
    assert.doesNotMatch(endStateSrc, /@\/lib\/haptic/);
    // Tap haptic remains inside RandomDiceButton only (not idle path).
    const idleEffect = diceSrc.match(
      /idleSpinKey[\s\S]*?setDiceSpinNonce\(\(n\) => n \+ 1\);/,
    )?.[0];
    assert.ok(idleEffect);
    assert.doesNotMatch(idleEffect!, /playInteraction/);
  });
});

describe("Home feed end-state layout contracts unchanged", () => {
  it("does not alter native-nav / Home scrub geometry from end-state code", () => {
    assert.doesNotMatch(endStateSrc, /native-nav|Liquid Glass|--video-card-overlay-bottom/);
    assert.doesNotMatch(presentationSrc, /native-nav|scrub/);
    assert.match(HOME_FEED_END_SLIDE_CLASS, /min-h-full/);
    assert.match(HOME_FEED_END_SLIDE_CLASS, /\[scroll-snap-stop:always\]/);
  });
});
