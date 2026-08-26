import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  bootstrapTrackerArtworkAtmosphere,
  collectTrackerAtmospherePrefetchUrls,
  collectTrackerAtmosphereSegmentUrls,
  collectTrackerAtmosphereWarmupQueue,
  isTrackerAtmospherePaintResult,
  RELEASE_TRACKER_ATMOSPHERE_ATTR,
  shouldApplyTrackerAtmosphereResult,
  TRACKER_ATMOSPHERE_DURATION_MS,
  TRACKER_ATMOSPHERE_EASING,
  TRACKER_ATMOSPHERE_OFF,
  TRACKER_ATMOSPHERE_ON,
  TRACKER_ATMOSPHERE_WARMUP_CONCURRENCY,
  trackerAtmosphereWashStyle,
} from "@/lib/release-tracker-atmosphere";
import {
  clearReleaseAtmosphereCacheForTests,
  seedReleaseAtmosphereCacheForTests,
  type AtmosphereResult,
} from "@/lib/release-artwork-atmosphere";

const here = dirname(fileURLToPath(import.meta.url));
const helperSrc = readFileSync(join(here, "./release-tracker-atmosphere.ts"), "utf8");
const washSrc = readFileSync(
  join(here, "../components/releases-artwork-atmosphere-wash.tsx"),
  "utf8",
);
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const browserSrc = readFileSync(
  join(here, "../components/artwork-release-browser.tsx"),
  "utf8",
);
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const nativeLayoutSrc = readFileSync(join(here, "./native-nav-layout.ts"), "utf8");
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");

const artworkPaint: AtmosphereResult = {
  rgb: { r: 48, g: 22, b: 64 },
  mode: "artwork",
};

function cssBlock(selector: string): string {
  const start = cssSrc.indexOf(selector);
  assert.ok(start >= 0, `missing selector ${selector}`);
  const end = cssSrc.indexOf("\n}", start);
  assert.ok(end > start, `unclosed selector ${selector}`);
  return cssSrc.slice(start, end + 2);
}

describe("Releases Artwork View tracker atmosphere", () => {
  it("reuses the Detail sampler and does not add a second canvas sampler", () => {
    assert.match(helperSrc, /resolveReleaseArtworkAtmosphere/);
    assert.match(helperSrc, /peekReleaseAtmosphereCache/);
    assert.doesNotMatch(helperSrc, /getContext\("2d"/);
    assert.doesNotMatch(trackerSrc, /getContext\("2d"/);
    assert.match(trackerSrc, /bootstrapTrackerArtworkAtmosphere/);
    assert.match(trackerSrc, /resolveTrackerArtworkAtmosphere/);
    assert.match(trackerSrc, /onSettledReleaseChange=\{rememberArtworkFocus\}/);
    assert.match(browserSrc, /shouldCommitArtworkSessionSelection/);
    assert.doesNotMatch(detailSrc, /release-tracker-atmosphere/);
  });

  it("paints only artwork-mode results — never brand or neutral", () => {
    assert.equal(
      isTrackerAtmospherePaintResult({ rgb: { r: 12, g: 58, b: 120 }, mode: "brand" }),
      false,
    );
    assert.equal(
      isTrackerAtmospherePaintResult({ rgb: { r: 40, g: 42, b: 50 }, mode: "neutral" }),
      false,
    );
    assert.equal(isTrackerAtmospherePaintResult(artworkPaint), true);
  });

  it("bootstraps from cache for artwork; no-url and brand cache stay default canvas", () => {
    clearReleaseAtmosphereCacheForTests();
    assert.deepEqual(bootstrapTrackerArtworkAtmosphere(null), {
      rgb: null,
      ready: true,
      instant: true,
    });
    assert.equal(
      bootstrapTrackerArtworkAtmosphere("https://cdn.example/cold.jpg").ready,
      false,
    );
    seedReleaseAtmosphereCacheForTests("https://cdn.example/art.jpg", artworkPaint);
    const hit = bootstrapTrackerArtworkAtmosphere("https://cdn.example/art.jpg");
    assert.equal(hit.ready, true);
    assert.deepEqual(hit.rgb, artworkPaint.rgb);
    seedReleaseAtmosphereCacheForTests("https://cdn.example/brand.jpg", {
      rgb: { r: 12, g: 58, b: 120 },
      mode: "brand",
    });
    assert.deepEqual(bootstrapTrackerArtworkAtmosphere("https://cdn.example/brand.jpg"), {
      rgb: null,
      ready: true,
      instant: true,
    });
    clearReleaseAtmosphereCacheForTests();
  });

  it("stale async results cannot overwrite a newer settled release", () => {
    assert.equal(
      shouldApplyTrackerAtmosphereResult({
        requestId: 1,
        currentRequestId: 2,
        layoutIsArtwork: true,
        requestUrl: "https://cdn.example/a.jpg",
        settledUrl: "https://cdn.example/b.jpg",
        resultMode: "artwork",
      }),
      false,
    );
    assert.equal(
      shouldApplyTrackerAtmosphereResult({
        requestId: 3,
        currentRequestId: 3,
        layoutIsArtwork: false,
        requestUrl: "https://cdn.example/a.jpg",
        settledUrl: "https://cdn.example/a.jpg",
        resultMode: "artwork",
      }),
      false,
    );
    assert.equal(
      shouldApplyTrackerAtmosphereResult({
        requestId: 5,
        currentRequestId: 5,
        layoutIsArtwork: true,
        requestUrl: "https://cdn.example/a.jpg",
        settledUrl: "https://cdn.example/a.jpg",
        resultMode: "artwork",
      }),
      true,
    );
  });

  it("starts active-segment warmup immediately with current, intended, neighbours, rest", () => {
    assert.deepEqual(
      collectTrackerAtmospherePrefetchUrls({
        artworkUrls: ["https://a.jpg", "https://b.jpg", "https://c.jpg", "https://d.jpg"],
        settledIndex: 1,
      }),
      ["https://b.jpg", "https://a.jpg", "https://c.jpg"],
    );
    assert.deepEqual(
      collectTrackerAtmosphereWarmupQueue({
        artworkUrls: ["https://a.jpg", "https://b.jpg", "https://c.jpg", "https://d.jpg"],
        settledIndex: 1,
        intendedUrl: "https://c.jpg",
      }),
      ["https://b.jpg", "https://c.jpg", "https://a.jpg", "https://d.jpg"],
    );
    assert.deepEqual(
      collectTrackerAtmosphereSegmentUrls([
        "https://a.jpg",
        "https://b.jpg",
        "https://a.jpg",
        null,
        "  ",
      ]),
      ["https://a.jpg", "https://b.jpg"],
    );
    assert.equal(TRACKER_ATMOSPHERE_WARMUP_CONCURRENCY, 3);
    assert.match(helperSrc, /while \(active < concurrency/);
    assert.match(trackerSrc, /startTrackerAtmosphereWarmup/);
    assert.match(trackerSrc, /collectTrackerAtmosphereWarmupQueue/);
    assert.doesNotMatch(helperSrc, /requestIdleCallback/);
    assert.doesNotMatch(trackerSrc, /requestIdleCallback/);
    assert.doesNotMatch(helperSrc, /timeout:\s*1400/);
    assert.doesNotMatch(trackerSrc, /idlePrewarmTrackerArtworkAtmospheres/);
    assert.match(helperSrc, /void resolveReleaseArtworkAtmosphere\(url\)/);
    assert.doesNotMatch(helperSrc, /setTrackerAtmosphereRgb/);
    assert.doesNotMatch(trackerSrc, /emblaApi\.on\("scroll"/);
    assert.doesNotMatch(helperSrc, /on\("scroll"/);
  });

  it("lets Embla select prewarm without applying visible atmosphere", () => {
    assert.match(browserSrc, /emblaApi\.on\("select", onSelect\)/);
    assert.match(browserSrc, /onIntendedReleaseChange\?\.\(nextId\)/);
    assert.match(trackerSrc, /onIntendedReleaseChange=\{prewarmIntendedArtwork\}/);
    assert.match(trackerSrc, /prefetchTrackerArtworkAtmosphere\(release\?\.artworkUrl\)/);
    assert.doesNotMatch(trackerSrc, /setTrackerAtmosphereRgb\(release/);
    assert.match(browserSrc, /emblaApi\.on\("settle", onSettle\)/);
    assert.match(browserSrc, /onSettledReleaseChange\?\.\(nextId\)/);
  });

  it("keeps a persistent hybrid double-buffer that fades incoming over opaque outgoing", () => {
    assert.match(washSrc, /data-atmosphere-crossfade="double-buffer"/);
    assert.match(washSrc, /data-atmosphere-layer=\{layer\}/);
    assert.match(washSrc, /layer="back"/);
    assert.match(washSrc, /layer="front"/);
    assert.match(washSrc, /RELEASE_TRACKER_ATMOSPHERE_BACKDROP_CLASS/);
    assert.match(washSrc, /loadBackdrop/);
    assert.match(washSrc, /requestAnimationFrame/);
    assert.doesNotMatch(washSrc, /return null/);
    assert.match(trackerSrc, /ReleasesArtworkAtmosphereWash/);
    assert.match(trackerSrc, /artworkUrl=/);
    assert.match(cssSrc, /transition: opacity 480ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    assert.equal(TRACKER_ATMOSPHERE_DURATION_MS, 480);
    assert.equal(TRACKER_ATMOSPHERE_EASING, "cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("builds a hybrid wash that keeps hue through the bottom", () => {
    const style = trackerAtmosphereWashStyle(artworkPaint.rgb);
    assert.equal(style["--release-atmosphere-rgb"], "48, 22, 64");
    const washCss = cssBlock(".releases-artwork-atmosphere-wash {");
    assert.match(cssSrc, /ellipse 90% 48% at 50% 34%/);
    assert.match(washCss, /color-mix\(in srgb, rgb\(var\(--release-atmosphere-rgb\)\) 58%, #0f1324 42%\) 100%/);
    assert.doesNotMatch(washCss, /transparent 100%/);
    assert.match(cssSrc, /\.releases-artwork-atmosphere-backdrop/);
    assert.match(cssSrc, /filter: blur\(64px\) saturate\(1\.18\)/);
    assert.match(cssSrc, /\.releases-artwork-atmosphere-readability/);
  });

  it("extends atmosphere to the page bottom with no native-nav clip or mask", () => {
    const hostCss = cssBlock(".releases-artwork-atmosphere-host {");
    assert.match(hostCss, /inset:\s*0/);
    assert.doesNotMatch(hostCss, /releases-visual-nav-clearance/);
    assert.doesNotMatch(hostCss, /mask-image|-webkit-mask-image/);
    assert.match(washSrc, /RELEASE_TRACKER_ATMOSPHERE_HOST_CLASS/);
    assert.match(cssSrc, /\.releases-artwork-atmosphere-readability/);
  });

  it("page canvas owns atmosphere; local browser blur stays removed", () => {
    assert.match(trackerSrc, /RELEASE_TRACKER_PAGE_CLASS/);
    assert.match(trackerSrc, /RELEASE_TRACKER_ATMOSPHERE_ATTR/);
    assert.doesNotMatch(browserSrc, /ArtworkAmbienceBackground/);
    assert.doesNotMatch(browserSrc, /artwork-ambience-background/);
    assert.doesNotMatch(browserSrc, /releases-artwork-atmosphere-backdrop/);
    assert.match(cssSrc, /data-releases-atmosphere="artwork"/);
    assert.equal(RELEASE_TRACKER_ATMOSPHERE_ATTR, "data-releases-atmosphere");
    assert.equal(TRACKER_ATMOSPHERE_ON, "artwork");
    assert.equal(TRACKER_ATMOSPHERE_OFF, "off");
  });

  it("crossfades List/Artwork top-level wrappers without per-row animation", () => {
    assert.match(trackerSrc, /RELEASE_TRACKER_VIEW_STACK_CLASS/);
    assert.match(trackerSrc, /RELEASE_TRACKER_VIEW_LAYER_CLASS/);
    assert.match(trackerSrc, /data-testid="releases-view-stack"/);
    assert.match(trackerSrc, /aria-hidden=\{effectiveLayout !== "artwork"\}/);
    assert.match(trackerSrc, /aria-hidden=\{effectiveLayout !== "list"\}/);
    assert.match(trackerSrc, /pointer-events-none opacity-0/);
    assert.doesNotMatch(trackerSrc, /animate-in|stagger|per-row/);
    assert.match(cssSrc, /\.releases-view-layer \{[\s\S]*?transition: opacity 480ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  });

  it("Artwork sticky is a translucent scrim and CTA fade does not expose fixed navy", () => {
    const artworkSticky = cssBlock(
      '.dark .dubhub-app-releases-canvas[data-releases-atmosphere="artwork"] .dubhub-app-releases-sticky {',
    );
    assert.match(artworkSticky, /rgba\(15, 19, 36, 0\.28\)/);
    assert.doesNotMatch(artworkSticky, /--release-atmosphere-rgb/);
    const artworkCta = cssSrc.slice(
      cssSrc.indexOf(
        '.dark .dubhub-app-releases-canvas[data-releases-atmosphere="artwork"] .dubhub-app-releases-fab-fade',
      ),
    );
    assert.match(artworkCta.slice(0, 400), /rgba\(0, 0, 0, 0\.42\) 0%/);
    assert.doesNotMatch(artworkCta.slice(0, 400), /#0f1324 0%/);
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-fab-fade[\s\S]*?#0f1324 0%/);
    assert.match(
      cssSrc,
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.releases-artwork-atmosphere-buffer[\s\S]*transition: none/,
    );
    assert.match(
      cssSrc,
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.releases-view-layer \{[\s\S]*transition: none/,
    );
  });

  it("does not change carousel geometry, CTA Y, or native nav", () => {
    assert.match(browserSrc, /w-\[75%\]/);
    assert.match(browserSrc, /flex-\[0_0_75%\]/);
    assert.match(
      trackerSrc,
      /bottom-\[calc\(var\(--releases-cta-anchor\)\+var\(--releases-cta-gap-above-nav\)\)\]/,
    );
    assert.doesNotMatch(nativeLayoutSrc, /release-atmosphere|releases-atmosphere/);
    assert.doesNotMatch(overlaySrc, /release-atmosphere|releases-atmosphere/);
    assert.match(browserSrc, /onSettledReleaseChange/);
    assert.match(browserSrc, /onIntendedReleaseChange/);
  });
});
