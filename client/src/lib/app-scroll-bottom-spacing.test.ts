/**
 * Global content→nav bottom spacing: visual clearance + shared end-pad.
 * Home scrub/exclusion and sheets stay on separate tokens.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_PAGE_SCROLL_CLASS,
  APP_SCROLL_BOTTOM_INSET_CLASS,
  APP_SCROLL_WITH_CLAMP_END_PAD_CLASS,
} from "./app-shell-layout";
import { PROFILE_PAGE_SCROLL_CLASS } from "./profile-grid-window";
import { LEADERBOARD_PAGE_SCROLL_CLASS } from "./leaderboard-presentation";
import { SETTINGS_PAGE_PAD_CLASS, SETTINGS_PAGE_SCROLL_CLASS } from "./settings-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const shellSrc = readFileSync(join(here, "./app-shell-layout.ts"), "utf8");

function nativeOnBlock(): string {
  const start = cssSrc.indexOf('html[data-dubhub-native-nav="on"] {');
  const end = cssSrc.indexOf('html[data-dubhub-native-nav="on"][data-dubhub-native-nav-visible="off"]');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return cssSrc.slice(start, end);
}

function rootBlock(): string {
  const start = cssSrc.indexOf(":root {");
  const end = cssSrc.indexOf("html {");
  return cssSrc.slice(start, end);
}

describe("global scroll bottom content spacing", () => {
  it("shared end-pad is in the 24–32px breathing-room band", () => {
    const root = rootBlock();
    assert.match(root, /--app-scroll-end-pad:\s*1\.75rem/);
    assert.match(APP_SCROLL_BOTTOM_INSET_CLASS, /clamp\(1\.5rem,2\.5vw,2rem\)/);
  });

  it("native scroll clearance uses visual nav height, not full Home exclusion", () => {
    const nativeOn = nativeOnBlock();
    assert.match(
      nativeOn,
      /--releases-visual-nav-clearance:\s*max\(\s*0px,\s*calc\(\s*var\(--app-bottom-control-inset\)\s*-\s*var\(--app-safe-bottom\)/,
    );
    assert.match(nativeOn, /--app-scroll-nav-clearance:\s*var\(--releases-visual-nav-clearance\)/);
    assert.doesNotMatch(
      nativeOn,
      /--app-scroll-nav-clearance:\s*var\(--app-bottom-control-inset\)/,
    );
    // Exclusion / control inset for Home scrub still intact
    assert.match(nativeOn, /--app-bottom-control-inset:\s*var\(--app-native-nav-exclusion\)/);
    assert.match(
      nativeOn,
      /--video-feed-scrub-bottom:\s*calc\(var\(--app-bottom-control-inset\)\s*-\s*var\(--video-feed-scrub-offset\)\)/,
    );
  });

  it("scroll roots compose clearance + shared end-pad only", () => {
    assert.match(
      APP_PAGE_SCROLL_CLASS,
      /pb-\[calc\(var\(--app-scroll-nav-clearance\)\+var\(--app-scroll-end-pad\)\)\]/,
    );
    assert.match(
      APP_SCROLL_WITH_CLAMP_END_PAD_CLASS,
      /pb-\[calc\(var\(--app-scroll-nav-clearance\)\+var\(--app-scroll-end-pad\)\)\]/,
    );
    assert.doesNotMatch(shellSrc, /clamp\(0\.75rem,2\.5vw,1rem\)/);
    assert.doesNotMatch(shellSrc, /clamp\(0\.5rem,2\.5vw,0\.875rem\)/);
  });

  it("Profile inherits shared scroll spacing and does not stack pb-8", () => {
    assert.match(
      PROFILE_PAGE_SCROLL_CLASS,
      new RegExp(APP_PAGE_SCROLL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(profileSrc, /PROFILE_PAGE_SCROLL_CLASS/);
    assert.match(profileSrc, /PROFILE_TAB_PAGER_PAGE_INSET_CLASS/);
    assert.doesNotMatch(profileSrc, /className="px-6 pb-8"/);
    assert.doesNotMatch(profileSrc, /pb-8/);
  });

  it("Leaderboard / Settings / public profile use the shared scroll rhythm", () => {
    assert.match(
      LEADERBOARD_PAGE_SCROLL_CLASS,
      new RegExp(APP_PAGE_SCROLL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(leaderboardSrc, /LEADERBOARD_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /APP_SCROLL_BOTTOM_INSET_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /px-4 pb-6/);

    assert.match(
      SETTINGS_PAGE_SCROLL_CLASS,
      new RegExp(APP_PAGE_SCROLL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(SETTINGS_PAGE_PAD_CLASS, /pt-1/);
    assert.match(SETTINGS_PAGE_PAD_CLASS, /px-6/);
    assert.doesNotMatch(SETTINGS_PAGE_PAD_CLASS, /pb-/);

    assert.match(publicProfileSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(publicProfileSrc, /APP_SCROLL_BOTTOM_INSET_CLASS/);
  });

  it("Home playback / scrub exclusion tokens stay on control inset", () => {
    assert.doesNotMatch(homeSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(videoCardSrc, /bottom-\[var\(--video-feed-scrub-bottom\)\]/);
    assert.match(videoCardSrc, /bottom-\[var\(--video-card-overlay-bottom,0px\)\]/);
    const nativeOn = nativeOnBlock();
    assert.match(nativeOn, /--video-feed-scrub-offset:\s*11px/);
    assert.match(nativeOn, /--video-card-overlay-bottom:\s*var\(--app-bottom-control-inset\)/);
  });

  it("sheets keep their own bottom geometry (not app-scroll tokens)", () => {
    assert.doesNotMatch(commentsSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(commentsSrc, /--app-scroll-nav-clearance/);
    assert.match(
      commentsSrc,
      /pb-\[calc\(0\.5rem\+env\(safe-area-inset-bottom,0px\)\)\]/,
    );
  });

  it("safe-area handling for exclusion remains in native mode", () => {
    const nativeOn = nativeOnBlock();
    assert.match(
      nativeOn,
      /--app-native-nav-exclusion:\s*calc\(49px \+ 8px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    assert.match(rootBlock(), /--app-safe-bottom:\s*env\(safe-area-inset-bottom, 0px\)/);
  });
});
