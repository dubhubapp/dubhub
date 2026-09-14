import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOME_FEED_SCRUB_LOCK_ATTR,
  HOME_FEED_SELECTOR,
  HOME_SCRUB_FILL_CLASS,
  HOME_SCRUB_INACTIVE_CLASS,
  HOME_SCRUB_READOUT_CLASS,
  HOME_SCRUB_SOUND_BUTTON_CLASS,
  HOME_SCRUB_SOUND_SHELL_CLASS,
  HOME_SCRUB_TRACK_CLASS,
  HOME_SCRUB_VISUAL_INSET_CLASS,
  VIEWER_SCRUB_FILL_CLASS,
  VIEWER_SCRUB_INACTIVE_CLASS,
  VIEWER_SCRUB_TRACK_CLASS,
  VIEWER_SCRUB_VISUAL_INSET_CLASS,
  scrubRatioFromClientX,
} from "./video-feed-scrub";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const layoutSrc = readFileSync(join(here, "./native-nav-layout.ts"), "utf8");

const overlayAttr = videoCardSrc.indexOf("        data-video-card-overlay\n");
const overlayBlock =
  overlayAttr >= 0
    ? videoCardSrc.slice(overlayAttr, videoCardSrc.indexOf("data-video-card-overlay-content"))
    : "";
const fadeStart = videoCardSrc.indexOf("data-video-card-overlay-fade-extend");
const fadeBlock = fadeStart >= 0 ? videoCardSrc.slice(fadeStart, overlayAttr >= 0 ? overlayAttr : fadeStart + 400) : "";

describe("HOME-SCRUB-4 glyph inset + scrub-state + Home sound", () => {
  it("maps seek % against the visual track rect and clamps 0–1", () => {
    const left = 14;
    const width = 405;
    assert.equal(scrubRatioFromClientX(left, left, width), 0);
    assert.equal(scrubRatioFromClientX(left + width, left, width), 1);
    assert.equal(scrubRatioFromClientX(left + width / 2, left, width), 0.5);
    assert.equal(scrubRatioFromClientX(0, left, width), 0);
    assert.equal(scrubRatioFromClientX(440, left, width), 1);
    assert.equal(scrubRatioFromClientX(left - 20, left, width), 0);
    assert.equal(scrubRatioFromClientX(left + width + 40, left, width), 1);
  });

  it("does not let extra hit slop outside the track change 0% or 100%", () => {
    const trackLeft = 14;
    const trackWidth = 405;
    const hitLeft = 0;
    const hitWidth = 440;
    assert.equal(scrubRatioFromClientX(hitLeft, trackLeft, trackWidth), 0);
    assert.equal(scrubRatioFromClientX(hitLeft + hitWidth, trackLeft, trackWidth), 1);
    assert.notEqual(trackWidth, hitWidth);
  });

  it("Home visual track uses glyph-based 14/21 inset, 3px pill, and approved colours", () => {
    assert.equal(
      HOME_SCRUB_VISUAL_INSET_CLASS,
      "pl-3.5 pr-[calc(0.5rem+(var(--video-feed-rail-width)-1.75rem)/2)] sm:pl-4",
    );
    assert.match(HOME_SCRUB_VISUAL_INSET_CLASS, /pl-3\.5/);
    assert.match(HOME_SCRUB_VISUAL_INSET_CLASS, /0\.5rem/);
    assert.match(HOME_SCRUB_VISUAL_INSET_CLASS, /1\.75rem/);
    assert.doesNotMatch(HOME_SCRUB_VISUAL_INSET_CLASS, /^pl-3 /);
    assert.doesNotMatch(HOME_SCRUB_VISUAL_INSET_CLASS, /pr-3/);
    assert.doesNotMatch(HOME_SCRUB_VISUAL_INSET_CLASS, /0\.65rem/);
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_VISUAL_INSET_CLASS : HOME_SCRUB_VISUAL_INSET_CLASS/,
    );
    assert.match(HOME_SCRUB_TRACK_CLASS, /h-\[3px\]/);
    assert.match(HOME_SCRUB_TRACK_CLASS, /overflow-hidden/);
    assert.match(HOME_SCRUB_TRACK_CLASS, /rounded-full/);
    assert.match(HOME_SCRUB_INACTIVE_CLASS, /bg-white\/20/);
    assert.match(HOME_SCRUB_FILL_CLASS, /bg-white\/80/);
    assert.doesNotMatch(HOME_SCRUB_FILL_CLASS, /rounded-full/);
  });

  it("keeps the Home hit target full-width and at least as tall as before", () => {
    assert.match(videoCardSrc, /data-video-feed-scrub-hit=""/);
    const hitBlock = videoCardSrc.slice(videoCardSrc.indexOf("data-video-feed-scrub-hit"));
    const hitClass = hitBlock.slice(0, hitBlock.indexOf("onPointerDown"));
    assert.match(hitClass, /w-full/);
    assert.match(hitClass, /min-h-\[10px\]/);
    assert.match(hitClass, /pt-2/);
    assert.match(HOME_SCRUB_TRACK_CLASS, /pointer-events-none/);
  });

  it("maps applyScrubFromClientX to the visual track rect, not the hit rect", () => {
    assert.match(videoCardSrc, /const track = scrubTrackRef\.current/);
    assert.match(videoCardSrc, /scrubRatioFromClientX\(clientX, rect\.left, rect\.width\)/);
    const applyStart = videoCardSrc.indexOf("const applyScrubFromClientX");
    const applyEnd = videoCardSrc.indexOf("const endScrubGesture");
    assert.notEqual(applyStart, -1);
    assert.notEqual(applyEnd, -1);
    const apply = videoCardSrc.slice(applyStart, applyEnd);
    assert.match(apply, /track\.getBoundingClientRect\(\)/);
    assert.doesNotMatch(apply, /hit\.getBoundingClientRect\(\)/);
    assert.doesNotMatch(apply, /scrubHitRef\.current/);
  });

  it("viewer scrub chrome matches Home visual language with balanced inset", () => {
    assert.equal(VIEWER_SCRUB_VISUAL_INSET_CLASS, "px-3.5 sm:px-4");
    assert.equal(VIEWER_SCRUB_TRACK_CLASS, HOME_SCRUB_TRACK_CLASS);
    assert.equal(VIEWER_SCRUB_INACTIVE_CLASS, HOME_SCRUB_INACTIVE_CLASS);
    assert.equal(VIEWER_SCRUB_FILL_CLASS, HOME_SCRUB_FILL_CLASS);
    assert.match(VIEWER_SCRUB_TRACK_CLASS, /h-\[3px\]/);
    assert.match(VIEWER_SCRUB_TRACK_CLASS, /rounded-full/);
    assert.match(VIEWER_SCRUB_TRACK_CLASS, /overflow-hidden/);
    assert.match(VIEWER_SCRUB_INACTIVE_CLASS, /bg-white\/20/);
    assert.match(VIEWER_SCRUB_FILL_CLASS, /bg-white\/80/);
    assert.doesNotMatch(VIEWER_SCRUB_VISUAL_INSET_CLASS, /video-feed-rail-width/);
    assert.match(videoCardSrc, /VIEWER_SCRUB_VISUAL_INSET_CLASS/);
    assert.match(videoCardSrc, /VIEWER_SCRUB_TRACK_CLASS/);
    assert.match(videoCardSrc, /VIEWER_SCRUB_INACTIVE_CLASS/);
    assert.match(videoCardSrc, /VIEWER_SCRUB_FILL_CLASS/);
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_VISUAL_INSET_CLASS : HOME_SCRUB_VISUAL_INSET_CLASS/,
    );
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_TRACK_CLASS : HOME_SCRUB_TRACK_CLASS/,
    );
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_INACTIVE_CLASS : HOME_SCRUB_INACTIVE_CLASS/,
    );
    assert.match(
      videoCardSrc,
      /embeddedFeed \? VIEWER_SCRUB_FILL_CLASS : HOME_SCRUB_FILL_CLASS/,
    );
    /* Attached Clips: no duplicate outer px-3 — inset owned by VIEWER_SCRUB_VISUAL_INSET_CLASS. */
    assert.match(
      videoCardSrc,
      /bottom-\[calc\(env\(safe-area-inset-bottom,0px\)\+28px\)\] pb-0/,
    );
    assert.doesNotMatch(
      videoCardSrc,
      /bottom-\[calc\(env\(safe-area-inset-bottom,0px\)\+28px\)\] px-3 pb-0/,
    );
    /* Y / hit padding unchanged. */
    assert.match(
      videoCardSrc,
      /"absolute inset-x-0 bottom-0 pb-\[max\(0\.25rem,env\(safe-area-inset-bottom,0px\)\)\]"/,
    );
    assert.match(videoCardSrc, /embeddedFeed \? "pt-1\.5 pb-1"/);
  });

  it("restores pre-workaround overlay/release opacity (parent 0.18 while scrubbing)", () => {
    assert.notEqual(overlayBlock.length, 0);
    assert.match(overlayBlock, /isScrubbingUi \? "opacity-\[0\.18\]"/);
    assert.match(fadeBlock, /isScrubbingUi \? "opacity-\[0\.18\]"/);
    assert.doesNotMatch(videoCardSrc, /HOME_SCRUB_METADATA_DIM_CLASS/);
    assert.match(
      videoCardSrc,
      /\{releasePreview \? \([\s\S]*?data-video-card-release-slot[\s\S]*?className=\{\s*cn\(\s*"grid"/,
    );
    assert.match(videoCardSrc, /isFullScreenPostViewer \? "pt-0\.5" : "pb-3"/);
    assert.match(
      videoCardSrc,
      /translate-y-\[var\(--video-card-metadata-shift,0px\)\]/,
    );
    assert.match(
      videoCardSrc,
      /bottom-\[var\(--video-card-overlay-bottom,0px\)\]/,
    );
  });

  it("gives Home scrub exclusive pointer ownership while dragging", () => {
    const hitBlock = videoCardSrc.slice(videoCardSrc.indexOf("data-video-feed-scrub-hit"));
    const hitClass = hitBlock.slice(0, hitBlock.indexOf("onPointerDown"));
    assert.match(hitClass, /touch-none/);
    assert.match(videoCardSrc, /e\.preventDefault\(\)/);
    assert.match(videoCardSrc, /e\.stopPropagation\(\)/);
    assert.match(videoCardSrc, /setPointerCapture\(e\.pointerId\)/);
    assert.match(videoCardSrc, /if \(!embeddedFeed\) lockHomeFeedScrollForScrub\(\)/);
    assert.match(videoCardSrc, /if \(!embeddedFeed\) unlockHomeFeedScrollForScrub\(\)/);
    assert.match(videoCardSrc, /forceUnlockHomeFeedScrollForScrub\(\)/);
    assert.match(videoCardSrc, /addEventListener\("touchstart", blockNativePan, \{ passive: false \}\)/);
    assert.match(videoCardSrc, /addEventListener\("touchmove", blockNativePan, \{ passive: false \}\)/);
    assert.match(videoCardSrc, /onPointerCancel/);
    assert.match(videoCardSrc, /onLostPointerCapture/);
    assert.equal(HOME_FEED_SELECTOR, "[data-home-video-feed]");
    assert.equal(HOME_FEED_SCRUB_LOCK_ATTR, "data-home-feed-scrub-lock");
    assert.match(
      cssSrc,
      /\[data-home-video-feed\]\[data-home-feed-scrub-lock="on"\][\s\S]*overflow-y:\s*hidden/,
    );
    assert.match(
      cssSrc,
      /\[data-home-video-feed\]\[data-home-feed-scrub-lock="on"\][\s\S]*touch-action:\s*none/,
    );
    assert.match(homeSrc, /touch-pan-y/);
    assert.match(homeSrc, /data-home-video-feed/);
  });

  it("keeps the scrub readout absolute to the scrub and raised above the release-card overlap", () => {
    assert.match(HOME_SCRUB_READOUT_CLASS, /absolute/);
    assert.match(HOME_SCRUB_READOUT_CLASS, /bottom-\[calc\(100%\+2rem\)\]/);
    assert.doesNotMatch(HOME_SCRUB_READOUT_CLASS, /100%\+8px/);
    assert.match(videoCardSrc, /data-video-feed-scrub-readout=""/);
    assert.match(videoCardSrc, /className=\{HOME_SCRUB_READOUT_CLASS\}/);
    assert.match(videoCardSrc, /data-video-feed-scrub-readout=""/);
    assert.match(videoCardSrc, /className=\{HOME_SCRUB_READOUT_CLASS\}/);
  });

  it("centres Home sound in the 54px rail column without shrinking the 44px hit or moving Y", () => {
    assert.match(HOME_SCRUB_SOUND_SHELL_CLASS, /w-\[var\(--video-feed-rail-width\)\]/);
    assert.match(HOME_SCRUB_SOUND_SHELL_CLASS, /justify-center/);
    assert.match(
      HOME_SCRUB_SOUND_SHELL_CLASS,
      /bottom-\[calc\(var\(--video-feed-scrub-bottom\)\+1\.25rem\)\]/,
    );
    assert.match(
      HOME_SCRUB_SOUND_SHELL_CLASS,
      /right-\[max\(0\.5rem,env\(safe-area-inset-right,0px\)\)\]/,
    );
    assert.match(HOME_SCRUB_SOUND_BUTTON_CLASS, /h-11 w-11/);
    assert.match(videoCardSrc, /data-video-feed-home-sound=""/);
    assert.match(videoCardSrc, /HOME_SCRUB_SOUND_SHELL_CLASS/);
    assert.match(videoCardSrc, /HOME_SCRUB_SOUND_BUTTON_CLASS/);
    const soundBlock = videoCardSrc.slice(videoCardSrc.indexOf("data-video-feed-home-sound"));
    const soundEnd = soundBlock.indexOf("document.body");
    const sound = soundBlock.slice(0, soundEnd > 0 ? soundEnd : 900);
    assert.match(sound, /h-11 w-11/);
    assert.doesNotMatch(sound, /translate-x-/);
  });

  it("does not change vertical scrub / overlay exclusion tokens", () => {
    assert.match(cssSrc, /--video-feed-scrub-offset:\s*0px/);
    assert.match(
      cssSrc,
      /--video-feed-scrub-bottom:\s*calc\(var\(--app-bottom-control-inset\) - var\(--video-feed-scrub-offset\)\)/,
    );
    assert.match(cssSrc, /--video-card-overlay-bottom:\s*0px/);
    assert.match(cssSrc, /--app-bottom-control-inset:\s*var\(--app-bottom-nav-block\)/);
    assert.match(videoCardSrc, /bottom-\[var\(--video-feed-scrub-bottom\)\]/);
    assert.match(layoutSrc, /NATIVE_NAV_SCRUB_OFFSET_PX = 11/);
  });

  it("preserves pause-while-drag, pointer capture, rAF scaleX, thumb-on-scrub, and resume", () => {
    assert.match(videoCardSrc, /setPointerCapture\(e\.pointerId\)/);
    assert.match(videoCardSrc, /wasPlayingBeforeScrubRef\.current = !video\.paused/);
    assert.match(videoCardSrc, /if \(wasPlayingBeforeScrubRef\.current\) video\.pause\(\)/);
    assert.match(videoCardSrc, /video\.play\(\)\.catch/);
    assert.match(videoCardSrc, /fill\.style\.transform = `scaleX\(\$\{displayP\}\)`;/);
    assert.match(videoCardSrc, /style=\{\{ transform: "scaleX\(0\)" \}\}/);
    assert.match(videoCardSrc, /setShowScrubThumb\(true\)/);
    assert.match(videoCardSrc, /h-2\.5 w-2\.5/);
  });

  it("does not edit native UITabBar frame, height, or radius", () => {
    assert.match(overlaySrc, /let sideInset: CGFloat = 16/);
    assert.match(overlaySrc, /sizeThatFits/);
    assert.doesNotMatch(overlaySrc, /cornerRadius/);
    assert.doesNotMatch(overlaySrc, /masksToBounds\s*=\s*true/);
    assert.doesNotMatch(overlaySrc, /min\(fittedHeight,\s*62\)/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(videoCardSrc, /DubHubNativeTabBarOverlay/);
  });
});
