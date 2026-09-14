import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOME_FEED_READY_EVENT,
  HOME_FEED_SKELETON_READY_EVENT,
} from "./onboarding";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const skeletonSrc = readFileSync(join(here, "../components/home-feed-initial-skeleton.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const splashSrc = readFileSync(join(here, "../components/brand/app-launch-splash.tsx"), "utf8");
const mainSrc = readFileSync(join(here, "../main.tsx"), "utf8");
const htmlSrc = readFileSync(join(here, "../../index.html"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const launchSrc = readFileSync(join(here, "../launch-surface.css"), "utf8");
const navBridgeSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");
const navCondSrc = readFileSync(join(here, "../components/conditional-bottom-navigation.tsx"), "utf8");
const capacitorSrc = readFileSync(join(repoRoot, "capacitor.config.ts"), "utf8");
const packageSrc = readFileSync(join(repoRoot, "package.json"), "utf8");
const packageLockSrc = readFileSync(join(repoRoot, "package-lock.json"), "utf8");
const generatedCapConfigSrc = readFileSync(join(repoRoot, "ios/App/App/capacitor.config.json"), "utf8");
const spmSrc = readFileSync(join(repoRoot, "ios/App/CapApp-SPM/Package.swift"), "utf8");
const plistSrc = readFileSync(join(repoRoot, "ios/App/App/Info.plist"), "utf8");

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("STARTUP-CONTINUITY event constants", () => {
  it("defines a distinct HOME_FEED_SKELETON_READY_EVENT", () => {
    assert.equal(HOME_FEED_SKELETON_READY_EVENT, "dubhub:home-feed-skeleton-ready");
    assert.notEqual(HOME_FEED_SKELETON_READY_EVENT, HOME_FEED_READY_EVENT);
  });
});

describe("STARTUP-CONTINUITY Home skeleton lifecycle", () => {
  it("HomeFeedInitialSkeleton dispatches skeleton-ready on mount", () => {
    assert.match(skeletonSrc, /useLayoutEffect/);
    assert.match(skeletonSrc, /HOME_FEED_SKELETON_READY_EVENT/);
    assert.match(skeletonSrc, /dispatchEvent.*CustomEvent.*HOME_FEED_SKELETON_READY_EVENT/s);
    assert.match(skeletonSrc, /skeletonReadySentRef/);
  });

  it("cached Home dispatches skeleton-ready without waiting for feed-ready", () => {
    assert.match(homeSrc, /startupCachedHomeSentRef/);
    assert.match(homeSrc, /if \(isInitialFeedLoad\) return/);
    assert.match(homeSrc, /dispatchEvent.*HOME_FEED_SKELETON_READY_EVENT/s);
    assert.match(homeSrc, /dispatchEvent.*HOME_FEED_READY_EVENT/s);
  });

  it("Home skeleton keeps the matched launch-gradient base", () => {
    assert.match(skeletonSrc, /dubhub-home-skeleton-launch-bg/);
    assert.match(skeletonSrc, /to-\[#0f1324\]/);
    assert.match(cssSrc, /dubhub-home-skeleton-launch-bg/);
    assert.match(cssSrc, /dubhub-premium-launch-background\.png/);
  });
});

describe("STARTUP-CONTINUITY-4 SplashScreen plugin config", () => {
  it("installs @capacitor/splash-screen in package manifests", () => {
    assert.match(packageSrc, /"@capacitor\/splash-screen"\s*:\s*"\^8\.0\.2"/);
    assert.match(packageLockSrc, /"@capacitor\/splash-screen"\s*:\s*"\^8\.0\.2"/);
  });

  it("configures SplashScreen with manual auto-hide disabled", () => {
    assert.match(capacitorSrc, /\/\/\/ <reference types="@capacitor\/splash-screen" \/>/);
    assert.match(capacitorSrc, /SplashScreen:\s*\{/);
    assert.match(capacitorSrc, /launchAutoHide:\s*false/);
    assert.match(capacitorSrc, /backgroundColor:\s*DUB_HUB_RUNTIME_BG/);
    assert.match(capacitorSrc, /showSpinner:\s*false/);
  });

  it("sync writes SplashScreen config and plugin registration into iOS output", () => {
    assert.match(generatedCapConfigSrc, /"SplashScreen"\s*:\s*\{/);
    assert.match(generatedCapConfigSrc, /"launchAutoHide"\s*:\s*false/);
    assert.match(generatedCapConfigSrc, /"SplashScreenPlugin"/);
  });

  it("sync includes CapacitorSplashScreen in Package.swift", () => {
    assert.match(spmSrc, /CapacitorSplashScreen/);
    assert.match(spmSrc, /@capacitor\/splash-screen/);
    assert.match(spmSrc, /\.product\(name:\s*"CapacitorSplashScreen"/);
  });

  it("native launch storyboard remains PremiumLaunchScreen", () => {
    assert.match(plistSrc, /<key>UILaunchStoryboardName<\/key>\s*<string>PremiumLaunchScreen<\/string>/);
  });
});

describe("SPLASH-HANDOFF-2 native hide on app-ready only", () => {
  it("does not hide SplashScreen on AppLaunchSplash mount", () => {
    assert.doesNotMatch(
      splashSrc,
      /export function AppLaunchSplash[\s\S]*?useLayoutEffect\(\(\)\s*=>\s*\{[\s\S]*?hideNativeLaunchSplash/,
    );
    assert.doesNotMatch(
      splashSrc,
      /AppLaunchSplash[\s\S]*?useLayoutEffect\(\(\)\s*=>\s*\{[\s\S]*?SplashScreen\.hide/,
    );
  });

  it("exports hideNativeLaunchSplash for the app-ready path", () => {
    assert.match(splashSrc, /export async function hideNativeLaunchSplash/);
    assert.match(appSrc, /hideNativeLaunchSplash/);
    assert.match(appSrc, /from "@\/components\/brand\/app-launch-splash"/);
  });

  it("App dismissStartupOverlay issues native hide then React fade", () => {
    assert.match(appSrc, /await hideNativeLaunchSplash\(\{\s*waitForArtwork:\s*true\s*\}\)/);
    assert.match(
      appSrc,
      /await hideNativeLaunchSplash\(\{\s*waitForArtwork:\s*true\s*\}\);\s*setStartupOverlayVisible\(false\)/s,
    );
  });

  it("native splash hide is one-shot with fadeOutDuration 0", () => {
    assert.match(splashSrc, /let nativeSplashHideIssued = false/);
    assert.match(splashSrc, /if \(nativeSplashHideIssued\) return/);
    assert.match(splashSrc, /SplashScreen\.hide\(\{\s*fadeOutDuration:\s*0\s*\}\)/);
  });

  it("tracks React launch artwork ready before waitForArtwork hide", () => {
    assert.match(splashSrc, /notifyLaunchArtworkReady/);
    assert.match(splashSrc, /whenLaunchArtworkReady/);
    assert.match(splashSrc, /waitForArtwork/);
    assert.match(splashSrc, /onLoad=\{noteBgSettled\}/);
    assert.match(splashSrc, /onLoad=\{noteMarkSettled\}/);
  });

  it("installs a short JS safety fallback for catastrophic startup failure", () => {
    assert.match(splashSrc, /NATIVE_SPLASH_HIDE_FALLBACK_MS = 2500/);
    assert.match(splashSrc, /installNativeSplashSafetyFallback/);
    assert.match(splashSrc, /setTimeout\(/);
    assert.match(splashSrc, /clearTimeout|clearNativeSplashSafetyTimer/);
  });

  it("safety fallback hide does not wait for artwork", () => {
    // Timer path: hideNativeLaunchSplash() with no waitForArtwork option.
    assert.match(
      splashSrc,
      /nativeSplashSafetyTimer = window\.setTimeout\(\(\) => \{\s*void hideNativeLaunchSplash\(\);\s*\}, NATIVE_SPLASH_HIDE_FALLBACK_MS\)/s,
    );
  });

  it("main.tsx starts the native splash safety fallback before React render", () => {
    assert.match(mainSrc, /installNativeSplashSafetyFallback/);
    assert.match(mainSrc, /applyTheme\(getStoredTheme\(\)\);\s*installNativeSplashSafetyFallback\(\);/s);
  });
});

describe("STARTUP-CONTINUITY-5 raw HTML bootstrap removed", () => {
  it("index.html has no #dubhub-native-handoff markup", () => {
    assert.doesNotMatch(htmlSrc, /dubhub-native-handoff/);
    assert.doesNotMatch(htmlSrc, /dubhub-native-handoff-logo/);
    assert.doesNotMatch(htmlSrc, /dubhub-premium-launch-mark-baseline@2x\.png/);
  });

  it("keeps only the #0f1324 underlay safety in index.html", () => {
    assert.match(htmlSrc, /html,\s*body\s*\{[\s\S]*?background-color:\s*#0f1324;/);
    assert.doesNotMatch(htmlSrc, /background-image:\s*url\(\/launch\/dubhub-premium-launch-background\.png\)/);
  });

  it("React overlay does not remove a raw HTML bootstrap node", () => {
    assert.doesNotMatch(splashSrc, /getElementById\("dubhub-native-handoff"\)/);
    assert.doesNotMatch(splashSrc, /removeBootstrapNode/);
    assert.match(splashSrc, /SplashScreen\.hide/);
  });

  it("launch-surface.css does not reintroduce a startup flat override rule", () => {
    const liveLaunchCss = stripBlockComments(launchSrc);
    assert.doesNotMatch(liveLaunchCss, /html\[data-dubhub-launch-bg\][\s\S]*?background-color:\s*#0f1324\s*!important/);
  });
});

describe("SPLASH-HANDOFF-2 stable React splash host", () => {
  it("overlay remains a fixed approved-artwork surface", () => {
    assert.match(splashSrc, /dubhub-premium-launch-background/);
    assert.match(splashSrc, /dubhub-premium-launch-mark-baseline/);
    assert.match(splashSrc, /position:\s*"fixed"/);
    assert.match(splashSrc, /pointerEvents:\s*"none"/);
    assert.match(splashSrc, /width:\s*"28%"/);
    assert.match(splashSrc, /transition:\s*"opacity 150ms ease"/);
  });

  it("hosts AppLaunchSplash once outside auth early-return branches", () => {
    assert.match(appSrc, /let appShell:\s*React\.ReactNode/);
    assert.match(
      appSrc,
      /return \(\s*<QueryClientProvider[\s\S]*?\{appShell\}[\s\S]*?\{startupOverlayEl\}[\s\S]*?<\/QueryClientProvider>/s,
    );
    // Must not render AppLaunchSplash inside each branch copy.
    const overlayJsxMatches = appSrc.match(/<AppLaunchSplash[\s\S]*?\/>/g) ?? [];
    assert.equal(overlayJsxMatches.length, 1);
  });

  it("App.tsx still waits for skeleton-ready before dismissing overlay on Home", () => {
    assert.match(appSrc, /HOME_FEED_SKELETON_READY_EVENT/);
    assert.match(appSrc, /dismissStartupOverlay/);
    assert.match(appSrc, /if \(!isAuthenticated \|\| !isHomeRoute\) \{/);
  });

  it("overlay dismissal for logged-out and non-Home remains unchanged", () => {
    assert.match(appSrc, /if \(isLoading\) return/);
    assert.match(appSrc, /!isAuthenticated \|\| !isHomeRoute/);
    assert.match(appSrc, /startupOverlayVisible !== null/);
  });
});

describe("STARTUP-CONTINUITY native nav gating", () => {
  it("ConditionalBottomNavigation still accepts startupOverlayActive", () => {
    assert.match(navCondSrc, /startupOverlayActive/);
  });

  it("NativeNavBridgeHost still suppresses native nav while overlay is active", () => {
    assert.match(navBridgeSrc, /startupOverlayActive/);
    assert.match(navBridgeSrc, /authenticatedShellActive:\s*!startupOverlayActive/);
  });

  it("App keeps native nav gated until overlay is fully removed", () => {
    assert.match(appSrc, /startupOverlayActive = startupOverlayVisible !== null/);
    assert.match(appSrc, /startupOverlayActive=\{startupOverlayActive\}/);
  });
});
