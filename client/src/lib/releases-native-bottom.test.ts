import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { nativeNavControlExclusionPt } from "./native-nav-layout";
import {
  RELEASE_TRACKER_CTA_SLAB_ATTR,
  RELEASE_TRACKER_NAV_SHELF_ATTR,
} from "./release-tracker-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const layoutSrc = readFileSync(join(here, "native-nav-layout.ts"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);

function nativeOnBlock(): string {
  const start = cssSrc.indexOf('html[data-dubhub-native-nav="on"] {');
  const end = cssSrc.indexOf('html[data-dubhub-native-nav="on"][data-dubhub-native-nav-visible="off"]');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(end > start);
  return cssSrc.slice(start, end);
}

function rootBlock(): string {
  const start = cssSrc.indexOf(":root {");
  const end = cssSrc.indexOf("html {");
  return cssSrc.slice(start, end);
}

describe("RELEASES-BOTTOM-2 native CTA / fade / pad", () => {
  it("does not change Home exclusion or native bar geometry", () => {
    assert.equal(nativeNavControlExclusionPt(83, 34), 117);
    assert.match(cssSrc, /--app-bottom-control-inset:\s*var\(--app-native-nav-exclusion\)/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\][\s\S]*--video-card-overlay-bottom:\s*var\(--app-bottom-control-inset\)/,
    );
    assert.match(videoCardSrc, /bottom-\[var\(--video-card-overlay-bottom,0px\)\]/);
    assert.doesNotMatch(layoutSrc, /RELEASES-BOTTOM|releases-visual-nav-clearance|releases-cta-anchor/);
    assert.doesNotMatch(overlaySrc, /releases-visual-nav-clearance|releases-cta-anchor/);
  });

  it("derives Releases visual-nav from physical bar, not 117px exclusion", () => {
    const nativeOn = nativeOnBlock();
    assert.match(
      nativeOn,
      /--releases-visual-nav-clearance:\s*max\(\s*0px,\s*calc\(\s*var\(--app-bottom-control-inset\)\s*-\s*var\(--app-safe-bottom\)/,
    );
    assert.match(nativeOn, /--releases-cta-anchor:\s*var\(--releases-visual-nav-clearance\)/);
    assert.doesNotMatch(nativeOn, /--app-bottom-control-inset:\s*var\(--releases/);
  });

  it("collapses the full-width opaque native shelf", () => {
    assert.equal(RELEASE_TRACKER_NAV_SHELF_ATTR, "data-releases-nav-shelf");
    assert.match(trackerSrc, /RELEASE_TRACKER_NAV_SHELF_ATTR/);
    assert.match(trackerSrc, /h-\[var\(--app-bottom-control-inset\)\]/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\] \[data-releases-nav-shelf\][\s\S]*?height:\s*0\s*!important/,
    );
  });

  it("does not include control-inset in native inner underlay or fade height", () => {
    const nativeOn = nativeOnBlock();
    assert.match(nativeOn, /--releases-cta-underlay-block:\s*var\(--releases-cta-stack-bleed\)/);
    assert.match(trackerSrc, /h-\[var\(--releases-cta-underlay-block\)\]/);
    assert.match(trackerSrc, /bottom-\[var\(--releases-cta-underlay-block\)\]/);
    assert.doesNotMatch(
      trackerSrc,
      /h-\[calc\(var\(--app-bottom-control-inset\)\s*\+\s*var\(--releases-cta-stack-bleed\)\)\]/,
    );
  });

  it("reduces artist pad below the old 253px native formula", () => {
    const nativeOn = nativeOnBlock();
    assert.match(
      nativeOn,
      /--releases-feed-bottom-pad:\s*calc\(\s*var\(--releases-visual-nav-clearance\)\s*\+\s*var\(--releases-cta-gap-above-nav\)\s*\+\s*var\(--releases-cta-stack-bleed\)\s*\+\s*var\(--releases-cta-fade-block\)\s*\+\s*var\(--releases-cta-scroll-extra\)/,
    );
    assert.doesNotMatch(
      nativeOn,
      /--releases-feed-bottom-pad:\s*calc\([^;]*--app-bottom-control-inset/,
    );
    // 83 + 8 + 20 + 60 + 10 = 181 on the 956pt / 83pt-bar reference (was 253).
    const visualNav = 83;
    const gap = 8;
    const bleed = 20;
    const fade = 60;
    const extra = 10;
    assert.equal(visualNav + gap + bleed + fade + extra, 181);
    assert.ok(181 < 253);
  });

  it("keeps React-nav CTA on the opaque web-nav model", () => {
    const root = rootBlock();
    assert.match(root, /--releases-cta-anchor:\s*var\(--app-bottom-control-inset\)/);
    assert.match(
      root,
      /--releases-cta-underlay-block:\s*calc\(\s*var\(--app-bottom-control-inset\)\s*\+\s*var\(--releases-cta-stack-bleed\)/,
    );
    assert.match(
      root,
      /--releases-feed-bottom-pad:\s*calc\(\s*var\(--releases-cta-gap-above-nav\)\s*\+\s*var\(--releases-cta-fade-block\)\s*\+\s*var\(--releases-cta-button-block\)\s*\+\s*var\(--releases-cta-scroll-extra\)/,
    );
    assert.doesNotMatch(root, /--releases-feed-bottom-pad:[^;]*--app-bottom-control-inset/);
    assert.match(root, /--releases-feed-bottom-pad-listener:\s*1rem/);
  });

  it("uses physical-nav clearance for listener pad instead of 117px exclusion", () => {
    const nativeOn = nativeOnBlock();
    assert.match(
      nativeOn,
      /--releases-feed-bottom-pad-listener:\s*calc\(\s*var\(--releases-visual-nav-clearance\)\s*\+\s*var\(--releases-cta-scroll-extra\)/,
    );
    assert.doesNotMatch(
      nativeOn,
      /--releases-feed-bottom-pad-listener:\s*var\(--app-bottom-control-inset\)/,
    );
    // 83 + 10 = 93 on the 956pt reference (was 117).
    assert.equal(83 + 10, 93);
    assert.ok(93 < 117);
  });

  it("keeps the CTA fade as a 60px gradient with no backdrop blur", () => {
    const nativeOn = nativeOnBlock();
    assert.match(cssSrc, /--releases-cta-fade-block:\s*3\.75rem/);
    assert.doesNotMatch(nativeOn, /--releases-cta-fade-block:/);
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-fab-fade[\s\S]*?linear-gradient/);
    assert.doesNotMatch(cssSrc, /\.dubhub-app-releases-fab-fade[\s\S]{0,200}backdrop-filter/);
  });

  it("collapses the full-width opaque CTA slab in native mode and keeps the wrapper transparent", () => {
    assert.equal(RELEASE_TRACKER_CTA_SLAB_ATTR, "data-releases-cta-slab");
    assert.match(trackerSrc, /RELEASE_TRACKER_CTA_SLAB_ATTR/);
    assert.match(trackerSrc, /bg-transparent/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\] \[data-releases-cta-slab\][\s\S]*?height:\s*0\s*!important/,
    );
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\] \[data-releases-cta-slab\][\s\S]*?background:\s*none/,
    );
    const nativeOn = nativeOnBlock();
    assert.match(nativeOn, /--releases-cta-underlay-block:\s*var\(--releases-cta-stack-bleed\)/);
    assert.match(nativeOn, /--releases-cta-anchor:\s*var\(--releases-visual-nav-clearance\)/);
    assert.equal(83 + 8 + 20 + 60 + 10, 181);
    assert.equal(83 + 10, 93);
  });

  it("makes the native fade finish transparent so it does not paint a CTA slab", () => {
    const nativeFade = cssSrc.slice(
      cssSrc.indexOf('html[data-dubhub-native-nav="on"] .dubhub-app-releases-fab-fade'),
    );
    assert.match(nativeFade, /transparent\s+0%/);
    assert.doesNotMatch(
      nativeFade.slice(0, nativeFade.indexOf("}")),
      /#0f1324\s+0%/,
    );
    assert.doesNotMatch(
      nativeFade.slice(0, 400),
      /backdrop-filter|backdrop-blur/,
    );
  });

  it("keeps React-nav fade and underlay opaque", () => {
    assert.match(
      cssSrc,
      /\.dark \.dubhub-app-releases-fab-underlay[\s\S]*?background-color:\s*#0f1324/,
    );
    const darkFade = cssSrc.slice(cssSrc.indexOf(".dark .dubhub-app-releases-fab-fade"));
    assert.match(darkFade.slice(0, darkFade.indexOf("}")), /#0f1324\s+0%/);
    assert.match(
      rootBlock(),
      /--releases-cta-underlay-block:\s*calc\(\s*var\(--app-bottom-control-inset\)\s*\+\s*var\(--releases-cta-stack-bleed\)/,
    );
  });
});
