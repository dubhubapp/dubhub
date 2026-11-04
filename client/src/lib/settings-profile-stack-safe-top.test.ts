/**
 * Profile → Settings stack stays at y=0.
 * Settings utility pages own the status-bar inset; the shared shell does not.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MAIN_SHELL_BASE,
  APP_SHELL_SAFE_TOP_CLASS,
  authenticatedMainShellUsesSafeTop,
} from "./app-shell-layout";
import { isInteractiveStackPair } from "./interactive-page-transitions";
import {
  NATIVE_NAV_EXCLUSION_VAR,
  NATIVE_NAV_MINIMUM_BOTTOM_INSET_PT,
  nativeNavLayoutBottomInsetPt,
} from "./native-nav-layout";
import {
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_SHELL_ATMOSPHERE_CLASS,
  isSettingsUtilityRoute,
} from "./settings-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const diagnosticsSrc = readFileSync(
  join(here, "../pages/settings-developer-diagnostics.tsx"),
  "utf8",
);

const SETTINGS_PAD =
  "pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] px-6" as const;

describe("Profile → Settings shell top inset", () => {
  it("keeps /profile on the bleed shell with no safe-top class", () => {
    assert.equal(isSettingsUtilityRoute("/profile"), false);
    assert.equal(
      authenticatedMainShellUsesSafeTop({
        bleedRoute: true,
        settingsUtilityRoute: false,
      }),
      false,
    );
    assert.doesNotMatch(APP_MAIN_SHELL_BASE, /safe-area-inset-top/);
    assert.match(profileSrc, /pt-\[calc\(env\(safe-area-inset-top,0px\)\+0\.75rem\)\]/);
    assert.match(profileSrc, /-top-\[env\(safe-area-inset-top,0px\)\]/);
  });

  it("keeps Settings utility routes off shell safe-top", () => {
    for (const path of [
      "/settings",
      "/settings/notifications",
      "/settings/app-icon",
      "/settings/manage-account",
      "/settings/artist",
      "/settings/artist-questions",
      "/settings/country",
    ]) {
      assert.equal(isSettingsUtilityRoute(path), true);
      assert.equal(
        authenticatedMainShellUsesSafeTop({
          bleedRoute: false,
          settingsUtilityRoute: true,
        }),
        false,
      );
    }
    assert.match(appSrc, /authenticatedMainShellUsesSafeTop\(\{/);
    assert.match(appSrc, /settingsUtilityRoute: isSettingsUtilityRoute\(location\)/);
    assert.match(appSrc, /SETTINGS_SHELL_ATMOSPHERE_CLASS/);
    assert.match(SETTINGS_SHELL_ATMOSPHERE_CLASS, /bg-background/);
    assert.equal(APP_SHELL_SAFE_TOP_CLASS, "pt-[env(safe-area-inset-top,0px)]");
  });

  it("puts the former shell inset on the Settings page pad", () => {
    assert.equal(SETTINGS_PAGE_PAD_CLASS, SETTINGS_PAD);
    assert.match(SETTINGS_PAGE_PAD_CLASS, /safe-area-inset-top/);
    assert.match(SETTINGS_PAGE_PAD_CLASS, /0\.25rem/);
    assert.match(SETTINGS_PAGE_PAD_CLASS, /px-6/);
    assert.doesNotMatch(SETTINGS_PAGE_PAD_CLASS, /pb-/);
  });

  it("leaves Developer Diagnostics on shell safe-top", () => {
    assert.equal(isSettingsUtilityRoute("/settings/developer-diagnostics"), false);
    assert.equal(
      authenticatedMainShellUsesSafeTop({
        bleedRoute: false,
        settingsUtilityRoute: false,
      }),
      true,
    );
    assert.match(diagnosticsSrc, /app-page-top-pad/);
    assert.doesNotMatch(diagnosticsSrc, /SETTINGS_PAGE_PAD_CLASS/);
    assert.doesNotMatch(diagnosticsSrc, /safe-area-inset-top/);
  });

  it("keeps Profile → Settings as an interactive stack pair", () => {
    assert.equal(isInteractiveStackPair("/profile", "/settings"), true);
    assert.equal(isInteractiveStackPair("/settings", "/settings/notifications"), true);
    assert.equal(isInteractiveStackPair("/settings", "/settings/app-icon"), true);
  });

  it("does not change bottom nav exclusion", () => {
    assert.equal(NATIVE_NAV_EXCLUSION_VAR, "--app-native-nav-exclusion");
    assert.equal(NATIVE_NAV_MINIMUM_BOTTOM_INSET_PT, 8);
    assert.equal(nativeNavLayoutBottomInsetPt(34), 34);
    assert.equal(nativeNavLayoutBottomInsetPt(0), 8);
    assert.match(APP_MAIN_SHELL_BASE, /pb-\[var\(--app-bottom-nav-block\)\]/);
    assert.match(
      cssSrc,
      /--app-native-nav-exclusion:\s*calc\(49px \+ 8px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    assert.doesNotMatch(appSrc, /--app-native-nav-exclusion/);
    assert.doesNotMatch(appSrc, /setNativeNavGeometry/);
  });
});
