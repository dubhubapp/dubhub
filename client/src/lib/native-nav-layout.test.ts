import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NATIVE_NAV_HOME_INDICATOR_PHYSICAL_INSET_PT,
  NATIVE_NAV_METADATA_SHIFT_PX,
  NATIVE_NAV_MINIMUM_BOTTOM_INSET_PT,
  NATIVE_NAV_SCRUB_OFFSET_PX,
  nativeNavScrubBottomPx,
  nativeNavControlExclusionPt,
  nativeNavControlInsetPx,
  nativeNavLayoutBottomInsetPt,
  nativeNavPlacementBottomInsetPt,
  sanitizeNativeNavExclusionPx,
} from "./native-nav-layout";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const shellSrc = readFileSync(join(here, "./app-shell-layout.ts"), "utf8");
const hostSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");
const skeletonSrc = readFileSync(
  join(here, "../components/home-feed-initial-skeleton.tsx"),
  "utf8",
);
const bottomNavSrc = readFileSync(
  join(here, "../components/bottom-navigation.tsx"),
  "utf8",
);
const layoutSrc = readFileSync(join(here, "./native-nav-layout.ts"), "utf8");
const feedScrubSrc = readFileSync(join(here, "./video-feed-scrub.ts"), "utf8");

describe("LG-NAV-4 native layout contract", () => {
  it("uses measured exclusion only while the native bar is visible", () => {
    assert.equal(sanitizeNativeNavExclusionPx(-4), 0);
    assert.equal(sanitizeNativeNavExclusionPx(91.4), 91);
    assert.equal(
      nativeNavControlInsetPx({ height: 49, bottomInset: 42, exclusion: 91, visible: true }),
      91,
    );
    assert.equal(
      nativeNavControlInsetPx({ height: 49, bottomInset: 42, exclusion: 91, visible: false }),
      0,
    );
    assert.equal(
      nativeNavControlInsetPx({
        height: 49,
        bottomInset: 42,
        exclusion: 91,
        visible: true,
        covered: true,
      }),
      91,
    );
    assert.equal(nativeNavControlInsetPx(null), 0);
  });

  it("keeps exclusion CSS while covered and zeros it only when layout is absent", () => {
    assert.match(cssSrc, /--app-sheet-screen-bottom:\s*var\(--app-bottom-control-inset\)/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\][\s\S]*--app-sheet-screen-bottom:\s*0px/,
    );
    assert.match(
      overlaySrc,
      /setNavigationCovered/,
    );
    assert.match(overlaySrc, /reactCovered/);
    assert.match(overlaySrc, /isVisuallyShown/);
    assert.match(overlaySrc, /isLayoutPresent/);
    assert.match(overlaySrc, /isUserInteractionEnabled = false/);
    assert.match(overlaySrc, /isUserInteractionEnabled = true/);
    assert.match(overlaySrc, /applyVisualCover/);
    assert.match(overlaySrc, /stopOpacityAnimator/);
    assert.match(overlaySrc, /animateTabBarOpacity/);
    assert.match(overlaySrc, /presentedAlpha/);
    assert.match(overlaySrc, /UIViewPropertyAnimator/);
    assert.match(overlaySrc, /coverRevealDuration: TimeInterval = 0\.2/);
    assert.match(overlaySrc, /stopAnimation\(true\)/);
    assert.match(overlaySrc, /animateTabBarOpacity\(tabBar, to: 0\)/);
    assert.match(overlaySrc, /animateTabBarOpacity\(tabBar, to: 1\)/);
    assert.match(overlaySrc, /isHidden = !layoutPresent/);
    assert.doesNotMatch(overlaySrc, /commentsOpen|submitOpen|\/comments/);
    assert.match(hostSrc, /nativeNavIsAvailable/);
    assert.match(hostSrc, /nativeNavIsCoveredBySheet/);
    assert.match(hostSrc, /setNativeNavigationCovered/);
    assert.match(hostSrc, /submitOpen: isSubmitClipCovering/);
    assert.match(drawerSrc, /--app-sheet-screen-bottom/);
  });

  it("zeros the opaque reservation in native mode and routes controls to exclusion", () => {
    assert.match(cssSrc, /html\[data-dubhub-native-nav="on"\]/);
    assert.match(cssSrc, /--app-bottom-nav-block:\s*0px/);
    assert.match(cssSrc, /--app-bottom-control-inset:\s*var\(--app-native-nav-exclusion\)/);
    assert.match(cssSrc, /--app-scroll-nav-clearance:\s*var\(--releases-visual-nav-clearance\)/);
    assert.match(cssSrc, /--app-bottom-control-inset:\s*var\(--app-bottom-nav-block\)/);
  });

  it("collapses the hidden React nav in native mode so it cannot reserve an opaque band", () => {
    const hideBlock = cssSrc.slice(cssSrc.indexOf('html[data-dubhub-native-nav="on"] [data-app-bottom-nav]'));
    const rule = hideBlock.slice(0, hideBlock.indexOf("}") + 1);
    assert.match(rule, /visibility:\s*hidden/);
    assert.match(rule, /height:\s*0/);
    assert.match(rule, /pointer-events:\s*none/);
  });

  it("lifts VideoCard metadata/action cluster with one native overlay-bottom inset", () => {
    assert.match(cssSrc, /--video-card-overlay-bottom:\s*0px/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\][\s\S]*--video-card-overlay-bottom:\s*var\(--app-bottom-control-inset\)/,
    );
    assert.match(videoCardSrc, /data-video-card-overlay/);
    assert.match(videoCardSrc, /data-video-action-rail/);
    assert.match(videoCardSrc, /bottom-\[var\(--video-card-overlay-bottom,0px\)\]/);
    assert.match(
      videoCardSrc,
      /bottom-\[calc\(var\(--video-card-overlay-bottom,0px\)\+clamp\(calc\(4\.5rem\+env\(safe-area-inset-bottom,0px\)\),14lvh,7rem\)\)\]/,
    );
    assert.match(videoCardSrc, /bottom-\[var\(--video-feed-scrub-bottom\)\]/);
    assert.match(
      feedScrubSrc,
      /bottom-\[calc\(var\(--video-feed-scrub-bottom\)\+1\.25rem\)\]/,
    );
  });

  it("keeps React-mode shell reservation and does not resize WKWebView from CSS", () => {
    assert.match(shellSrc, /pb-\[var\(--app-bottom-nav-block\)\]/);
    assert.match(shellSrc, /--app-scroll-nav-clearance/);
    assert.doesNotMatch(cssSrc, /additionalSafeAreaInsets/);
    assert.doesNotMatch(overlaySrc, /additionalSafeAreaInsets\s*=\s*[^=]/);
    assert.match(overlaySrc, /sideInset/);
    assert.doesNotMatch(homeSrc, /--app-native-nav-exclusion|setNativeNavGeometry/);
    assert.doesNotMatch(videoCardSrc, /--app-native-nav-exclusion|setNativeNavGeometry/);
  });

  it("lets UIKit size the native tab bar vertically without a compact height cap", () => {
    assert.match(overlaySrc, /sizeThatFits/);
    assert.match(overlaySrc, /layoutFittingExpandedSize/);
    assert.doesNotMatch(overlaySrc, /min\(fittedHeight,\s*62\)/);
    assert.doesNotMatch(overlaySrc, /fittedHeight > 70/);
    assert.doesNotMatch(overlaySrc, /imageInsets|titlePositionAdjustment/);
    assert.doesNotMatch(overlaySrc, /itemWidth|itemSpacing/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(overlaySrc, /UIImage\.SymbolConfiguration/);
    assert.doesNotMatch(overlaySrc, /scale:\s*\.large/);
  });
});

describe("LG-NAV-5C placement vs control exclusion", () => {
  it("pins physical placement to 0pt on home-indicator devices without changing layout inset", () => {
    assert.equal(NATIVE_NAV_MINIMUM_BOTTOM_INSET_PT, 8);
    assert.equal(NATIVE_NAV_HOME_INDICATOR_PHYSICAL_INSET_PT, 0);
    assert.equal(nativeNavLayoutBottomInsetPt(34), 34);
    assert.equal(nativeNavPlacementBottomInsetPt(34), 0);
    assert.equal(nativeNavControlExclusionPt(83, 34), 117);
    assert.notEqual(
      nativeNavControlExclusionPt(83, 34),
      83 + nativeNavPlacementBottomInsetPt(34),
    );
    assert.equal(nativeNavControlExclusionPt(83, 34) - (83 + nativeNavPlacementBottomInsetPt(34)), 34);
  });

  it("floors both insets at 8pt when safe area is 0", () => {
    assert.equal(nativeNavLayoutBottomInsetPt(0), 8);
    assert.equal(nativeNavPlacementBottomInsetPt(0), 8);
    assert.equal(nativeNavControlExclusionPt(61, 0), 69);
  });

  it("does not derive Swift exclusion from physical minY after the placement drop", () => {
    assert.match(overlaySrc, /minimumBottomInset: CGFloat = 8/);
    assert.match(overlaySrc, /homeIndicatorPhysicalInset: CGFloat = 0/);
    assert.match(overlaySrc, /layoutBottomInset/);
    assert.match(overlaySrc, /placementBottomInset/);
    assert.match(overlaySrc, /hostSafeBottom > 0 \? Self\.homeIndicatorPhysicalInset/);
    assert.match(overlaySrc, /tabBar\.frame\.height \+ layoutBottomInset/);
    assert.match(
      overlaySrc,
      /host\.bounds\.height - placementBottomInset - fittedHeight/,
    );
    assert.doesNotMatch(overlaySrc, /host\.bounds\.height - tabBar\.frame\.minY/);
    assert.match(overlaySrc, /intentionally different/);
  });

  it("extends Home overlay fade to the screen bottom without moving metadata or scrub", () => {
    assert.match(videoCardSrc, /data-video-card-overlay-fade-extend/);
    assert.match(
      videoCardSrc,
      /h-\[var\(--video-card-overlay-bottom,0px\)\]/,
    );
    assert.match(
      videoCardSrc,
      /data-video-card-overlay-fade-extend[\s\S]*?bg-black\/80/,
    );
    assert.match(
      videoCardSrc,
      /data-video-card-overlay-fade-extend[\s\S]*?bottom-0/,
    );
    assert.match(
      videoCardSrc,
      /data-video-card-overlay[\s\S]*?bottom-\[var\(--video-card-overlay-bottom,0px\)\]/,
    );
    assert.match(videoCardSrc, /bottom-\[var\(--video-feed-scrub-bottom\)\]/);
    const extendBlock = videoCardSrc.slice(
      videoCardSrc.indexOf("data-video-card-overlay-fade-extend"),
    );
    const extendClass = extendBlock.slice(0, extendBlock.indexOf("/>"));
    assert.doesNotMatch(extendClass, /backdrop-blur|backdrop-filter/);
  });

  it("matches the initial Home skeleton lower fade to the loaded card geometry", () => {
    assert.match(skeletonSrc, /data-home-feed-skeleton-fade-extend/);
    assert.match(
      skeletonSrc,
      /h-\[var\(--video-card-overlay-bottom,0px\)\] bg-background/,
    );
    assert.match(
      skeletonSrc,
      /bottom-\[var\(--video-card-overlay-bottom,0px\)\]/,
    );
  });

  it("shifts native metadata content without moving scrub, rail, or fade", () => {
    assert.equal(NATIVE_NAV_METADATA_SHIFT_PX, 11);
    assert.match(cssSrc, /--video-card-metadata-shift:\s*11px/);
    assert.match(videoCardSrc, /data-video-card-overlay-content/);
    assert.match(
      videoCardSrc,
      /translate-y-\[var\(--video-card-metadata-shift,0px\)\]/,
    );
    assert.match(
      videoCardSrc,
      /bottom-\[calc\(var\(--video-card-overlay-bottom,0px\)\+clamp/,
    );
    assert.match(videoCardSrc, /bottom-\[var\(--video-feed-scrub-bottom\)\]/);
    assert.match(
      videoCardSrc,
      /h-\[var\(--video-card-overlay-bottom,0px\)\]/,
    );
    assert.match(
      videoCardSrc,
      /data-video-card-overlay-fade-extend[\s\S]*?bg-black\/80/,
    );
    assert.match(
      skeletonSrc,
      /translate-y-\[var\(--video-card-metadata-shift,0px\)\]/,
    );
  });

  it("places the Home scrub 11px below native exclusion without changing overlay or metadata shift", () => {
    assert.equal(NATIVE_NAV_SCRUB_OFFSET_PX, 11);
    assert.equal(nativeNavScrubBottomPx(117), 106);
    assert.match(cssSrc, /--video-feed-scrub-offset:\s*0px/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\][\s\S]*--video-feed-scrub-offset:\s*11px/,
    );
    assert.match(
      cssSrc,
      /--video-feed-scrub-bottom:\s*calc\(\s*var\(--app-bottom-control-inset\)\s*-\s*var\(--video-feed-scrub-offset\)\s*\)/,
    );
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\]\[data-dubhub-native-nav-visible="off"\][\s\S]*--video-feed-scrub-offset:\s*0px/,
    );
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\][\s\S]*--video-card-overlay-bottom:\s*var\(--app-bottom-control-inset\)/,
    );
    assert.match(cssSrc, /--video-card-metadata-shift:\s*11px/);
    assert.doesNotMatch(overlaySrc, /video-feed-scrub-offset/);
    assert.doesNotMatch(cssSrc, /--video-feed-scrub-lift/);
  });

  it("clears the React-nav inline scrub-bottom when native presentation owns the var", () => {
    assert.match(layoutSrc, /export const VIDEO_FEED_SCRUB_BOTTOM_VAR = "--video-feed-scrub-bottom"/);
    assert.match(layoutSrc, /clearInlineScrubBottomForNativeNav/);
    assert.match(
      layoutSrc,
      /document\.documentElement\.style\.removeProperty\(VIDEO_FEED_SCRUB_BOTTOM_VAR\)/,
    );
    assert.match(layoutSrc, /clearInlineScrubBottomForNativeNav\(\)/);
    assert.match(bottomNavSrc, /clearInlineScrubBottomForNativeNav\(\)/);
    assert.match(bottomNavSrc, /attributeFilter:\s*\[NATIVE_NAV_DOCUMENT_ATTR\]/);
    assert.match(bottomNavSrc, /style\.setProperty\(VIDEO_FEED_SCRUB_BOTTOM_VAR/);
    assert.doesNotMatch(
      bottomNavSrc,
      /data-dubhub-native-nav"\) === "on"\) return;/,
    );
  });

  it("omits an empty release slot and reserves 12px under a painted release card", () => {
    assert.match(videoCardSrc, /data-video-card-release-slot/);
    assert.match(videoCardSrc, /\{releasePreview \? \([\s\S]*data-video-card-release-slot/);
    assert.doesNotMatch(
      videoCardSrc,
      /\{releasePreview \? \(\s*<ReleasePreviewCard/,
    );
    assert.match(videoCardSrc, /isFullScreenPostViewer \? "pt-0\.5" : "pb-3"/);
    assert.match(cssSrc, /--video-card-metadata-shift:\s*11px/);
  });
});

describe("LG-NAV-6B destination scroll clearance", () => {
  const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
  const releaseDetailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
  const releaseCreateSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
  const releaseEditSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");

  it("uses the shared mode-aware clearance token on Profile and release pages", () => {
    assert.match(shellSrc, /--app-scroll-nav-clearance/);
    assert.match(
      shellSrc,
      /pb-\[calc\(var\(--app-scroll-nav-clearance\)\+var\(--app-scroll-end-pad\)\)\]/,
    );
    assert.match(profileSrc, /PROFILE_PAGE_SCROLL_CLASS/);
    assert.match(profileSrc, /data-testid="button-settings"/);
    assert.match(releaseDetailSrc, /APP_SCROLL_WITH_CLAMP_END_PAD_CLASS/);
    assert.match(releaseCreateSrc, /APP_SCROLL_WITH_CLAMP_END_PAD_CLASS/);
    assert.match(releaseEditSrc, /APP_SCROLL_WITH_CLAMP_END_PAD_CLASS/);
  });

  it("does not double-pad React-nav: clearance is 0 outside native mode", () => {
    assert.match(cssSrc, /--app-scroll-nav-clearance:\s*0px/);
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\][\s\S]*--app-scroll-nav-clearance:\s*var\(--releases-visual-nav-clearance\)/,
    );
  });
});
