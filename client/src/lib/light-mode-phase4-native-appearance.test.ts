/**
 * Phase 4 — one native appearance from the user theme plus the existing surface signal.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  encodeNativeThemeMessage,
  nativeKeyboardUsesLight,
  resolveNativeAppearance,
} from "./native-appearance";

const here = dirname(fileURLToPath(import.meta.url));
const themeSrc = readFileSync(join(here, "./theme.ts"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const bridgeSrc = readFileSync(join(here, "../../../ios/App/App/AppDelegate.swift"), "utf8");
const sceneSrc = readFileSync(join(here, "../../../ios/App/App/SceneDelegate.swift"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const navBridgeSrc = readFileSync(join(here, "./native-nav-bridge.ts"), "utf8");

describe("phase 4 native appearance", () => {
  it("resolves Home, auth, and normal pages from one model", () => {
    assert.equal(
      resolveNativeAppearance({
        userTheme: "light",
        selectedTabId: "home",
        selectedTabKnown: true,
        authOrOnboarding: false,
      }),
      "dark",
    );
    assert.equal(
      resolveNativeAppearance({
        userTheme: "light",
        selectedTabId: "releases",
        selectedTabKnown: true,
        authOrOnboarding: false,
      }),
      "light",
    );
    assert.equal(
      resolveNativeAppearance({
        userTheme: "light",
        selectedTabId: null,
        selectedTabKnown: true,
        authOrOnboarding: false,
      }),
      "light",
    );
    assert.equal(
      resolveNativeAppearance({
        userTheme: "dark",
        selectedTabId: "profile",
        selectedTabKnown: true,
        authOrOnboarding: false,
      }),
      "dark",
    );
    assert.equal(
      resolveNativeAppearance({
        userTheme: "light",
        selectedTabId: "releases",
        selectedTabKnown: true,
        authOrOnboarding: true,
      }),
      "dark",
    );
    assert.equal(
      resolveNativeAppearance({
        userTheme: "light",
        selectedTabId: null,
        selectedTabKnown: false,
        authOrOnboarding: false,
      }),
      "dark",
    );
    assert.equal(
      nativeKeyboardUsesLight({
        userTheme: "light",
        selectedTabId: "home",
        selectedTabKnown: true,
        authOrOnboarding: false,
        overlayCoveringHome: true,
      }),
      true,
    );
    assert.equal(
      nativeKeyboardUsesLight({
        userTheme: "light",
        selectedTabId: "home",
        selectedTabKnown: true,
        authOrOnboarding: false,
        overlayCoveringHome: false,
      }),
      false,
    );
    assert.equal(encodeNativeThemeMessage("light", false), "light");
    assert.equal(encodeNativeThemeMessage("light", true), "light|auth");
  });

  it("publishes the existing theme message from applyTheme and locks auth without a second store", () => {
    assert.match(themeSrc, /export function applyTheme/);
    assert.match(themeSrc, /publishNativeUserTheme\("light"\)/);
    assert.match(themeSrc, /publishNativeUserTheme\("dark"\)/);
    assert.match(themeSrc, /THEME_STORAGE_KEY/);
    assert.match(themeSrc, /dubhubTabItemTint/);
    assert.doesNotMatch(themeSrc, /dubhub-theme-native|nativeTheme/);
    assert.match(appSrc, /retainNativeAuthSurface/);
    assert.match(appSrc, /data-dubhub-auth-surface|retainNativeAuthSurface/);
  });

  it("applies one main-thread appearance to status bar, shell, and tab ink", () => {
    assert.match(overlaySrc, /if authSurface \{ return false \}/);
    assert.match(overlaySrc, /if !hasReceivedSelectedTab \{ return false \}/);
    assert.match(overlaySrc, /if selectedTabId == "home" \{ return false \}/);
    assert.match(overlaySrc, /return pagePrefersLightInk/);
    assert.match(overlaySrc, /func applyEffectiveChrome\(\)/);
    assert.match(overlaySrc, /assertMain\("appearance"\)/);
    assert.match(overlaySrc, /runOnMain/);
    assert.match(overlaySrc, /keyboardUsesLight/);
    assert.match(overlaySrc, /reactCovered && selectedTabId == "home"/);
    assert.match(bridgeSrc, /preferredStatusBarStyle/);
    assert.match(bridgeSrc, /dubHubStatusBarStyle = light \? \.darkContent : \.lightContent/);
    assert.match(bridgeSrc, /DubHubAppShellBackground\.light/);
    assert.match(bridgeSrc, /overrideUserInterfaceStyle = \.dark/);
    assert.match(bridgeSrc, /webView\.scrollView\.backgroundColor = background/);
    assert.match(bridgeSrc, /red:\s*246\.0\s*\/\s*255\.0/);
    assert.match(sceneSrc, /overrideUserInterfaceStyle = \.dark/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(homeSrc, /applyDubHubAppearance|resolveNativeAppearance/);
    assert.doesNotMatch(videoCardSrc, /applyDubHubAppearance|resolveNativeAppearance/);
    assert.doesNotMatch(navBridgeSrc, /setNativeAppearance|applyDubHubAppearance/);
  });
});
