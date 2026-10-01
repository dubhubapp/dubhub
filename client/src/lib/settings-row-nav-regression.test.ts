/**
 * Profile Settings row contrast + Profile → Settings contextual push.
 * Appearance stays a consumer of the selected-tab signal and must not
 * reapply an unchanged WebView trait during that push.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isInteractiveStackPair,
  reduceSettingsTransitionStack,
} from "./interactive-page-transitions";
import { selectedTabFromAppState } from "./native-nav-contract";

const here = dirname(fileURLToPath(import.meta.url));
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const stackSrc = readFileSync(
  join(here, "../components/interactive-settings-stack.tsx"),
  "utf8",
);
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const bridgeSrc = readFileSync(join(here, "../../../ios/App/App/AppDelegate.swift"), "utf8");

function settingsRowSlice(): string {
  const marker = 'data-testid="button-settings"';
  const at = profileSrc.indexOf(marker);
  assert.ok(at !== -1);
  return profileSrc.slice(at - 500, at + 700);
}

describe("profile settings row resting colour", () => {
  it("uses semantic foreground in the resting label and keeps the Dark token", () => {
    const row = settingsRowSlice();
    assert.match(row, /<span className="text-sm text-foreground">Settings<\/span>/);
    assert.match(row, /text-foreground hover:text-foreground/);
    assert.match(row, /text-muted-foreground dark:text-gray-400/);
    assert.doesNotMatch(row, /hover:text-accent-foreground|text-white"|text-\[#fff/);
    assert.match(row, /navigate\("\/settings"\)/);
    assert.doesNotMatch(row, /navigate\("\/settings",\s*\{\s*replace:\s*true/);
    assert.doesNotMatch(row, /window\.location|location\.href/);
  });
});

describe("profile settings contextual push", () => {
  it("keeps Profile → Settings on the existing right-edge stack push", () => {
    assert.equal(isInteractiveStackPair("/profile", "/settings"), true);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], "/settings"), [
      "/profile",
      "/settings",
    ]);
    assert.equal(selectedTabFromAppState({
      location: "/settings",
      isSubmitClipOpen: false,
      isModerator: false,
    }), null);
    assert.equal(selectedTabFromAppState({
      location: "/profile",
      isSubmitClipOpen: false,
      isModerator: false,
    }), "profile");
    assert.match(stackSrc, /translate3d\(100%,0,0\)/);
    assert.match(stackSrc, /INTERACTIVE_PUSH_MS/);
    assert.match(settingsSrc, /window\.history\.back\(\)/);
    assert.match(settingsSrc, /interactiveParentNavigation\("\/settings"\)/);
    assert.equal(isInteractiveStackPair("/settings", "/settings/notifications"), true);
    assert.deepEqual(
      reduceSettingsTransitionStack(["/profile", "/settings"], "/settings/notifications"),
      ["/profile", "/settings", "/settings/notifications"],
    );
    assert.deepEqual(
      reduceSettingsTransitionStack(["/profile", "/settings", "/settings/notifications"], "/settings"),
      ["/profile", "/settings"],
    );
  });

  it("does not reapply an unchanged native appearance over the transition", () => {
    assert.match(overlaySrc, /if selectedTabId == "home" \{ return false \}/);
    assert.match(overlaySrc, /return pagePrefersLightInk/);
    const chrome = overlaySrc.slice(
      overlaySrc.indexOf("func applyEffectiveChrome()"),
      overlaySrc.indexOf("private func applyResolvedItemTints()"),
    );
    assert.match(chrome, /assertMain\("appearance"\)/);
    assert.match(chrome, /itemTintsFollowLightPage\(\)/);
    assert.match(chrome, /appliedChromeAppearance == appearance/);
    assert.match(chrome, /appliedChromeKeyboardLight == keyboardUsesLight/);
    assert.ok(chrome.indexOf("return") < chrome.indexOf("applyDubHubAppearance"));
    assert.match(chrome, /applyDubHubAppearance\(\s*appearance,/);
    const selectStart = overlaySrc.indexOf("func setSelectedTab(_ raw: String?");
    const select = overlaySrc.slice(selectStart, selectStart + 900);
    assert.match(select, /self\.selectedTabId = self\.normalizedTabId\(raw\)/);
    assert.ok(
      select.indexOf("self.selectedTabId = self.normalizedTabId(raw)") <
        select.indexOf("self.applyEffectiveChrome()"),
    );
    assert.doesNotMatch(bridgeSrc, /webView\?\.reload\(|load\(URLRequest/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
  });
});
