/**
 * App Icon picker contract: bundled names, native state, and VAT access.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeAppIconState } from "./app-icon-bridge";
import { APP_ICON_ALTERNATE_NAMES, APP_ICON_ALTERNATES } from "./app-icon-catalog";
import {
  APP_ICON_TILE_BUTTON_CLASS,
  APP_ICON_TILE_IMAGE_CLASS,
  APP_ICON_TILE_SELECTED_CLASS,
  appIconChoiceAfterNativeResult,
  isArtistAccount,
  resolveAppIconAlternateAccess,
  resolveAppIconSetRequest,
  resolveAppIconTileTap,
  selectedAppIconChoice,
  showAppIconEntry,
  showArtistToolsSection,
} from "./app-icon-settings";
import { resolvePaidToolGateMode } from "./paid-tool-gate";
import type { SubscriptionEnvironmentSelection } from "./subscription-environment";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const pageSrc = readFileSync(join(here, "../pages/settings-app-icon.tsx"), "utf8");
const pluginSrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubAppIconPlugin.swift"),
  "utf8",
);
const diagnosticsSrc = readFileSync(
  join(here, "../pages/settings-developer-diagnostics.tsx"),
  "utf8",
);
const transitionsSrc = readFileSync(join(here, "./interactive-page-transitions.ts"), "utf8");
const pbxSrc = readFileSync(
  join(here, "../../../ios/App/App.xcodeproj/project.pbxproj"),
  "utf8",
);

function selection(
  overrides: Partial<SubscriptionEnvironmentSelection> = {},
): SubscriptionEnvironmentSelection {
  return {
    selectedEnvironment: "production",
    selectedStatus: null,
    hasPaidToolAccess: false,
    irreversibleActionsAllowed: false,
    state: "never_subscribed",
    freshness: "fresh",
    selectionReason: "production_production",
    appBuildChannel: "production",
    ok: true,
    ...overrides,
  };
}

function alternateAccess(args: {
  verifiedArtist: boolean;
  selection?: Partial<SubscriptionEnvironmentSelection>;
  loading?: boolean;
  hasError?: boolean;
}) {
  const selected = selection(args.selection);
  const gate = resolvePaidToolGateMode({
    enabled: args.verifiedArtist,
    loading: args.loading ?? false,
    hasError: args.hasError ?? false,
    selection: selected,
  });
  return resolveAppIconAlternateAccess({
    verifiedArtist: args.verifiedArtist,
    gate,
    freshness: selected.freshness,
    state: selected.state,
  });
}

describe("app icon native contract", () => {
  it("keeps the client allowlist identical to the native plugin", () => {
    for (const name of APP_ICON_ALTERNATE_NAMES) {
      assert.match(pluginSrc, new RegExp(`"${name}"`));
      assert.equal(name.startsWith("AppIcon"), false);
    }
    assert.equal(APP_ICON_ALTERNATES.length, 7);
    assert.doesNotMatch(pluginSrc, /DubHubIconAlternateProof/);
    assert.doesNotMatch(pbxSrc, /DubHubIconAlternateProof/);
    const listed = pbxSrc.match(
      /ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "([^"]+)"/g,
    );
    assert.ok(listed && listed.length >= 2);
    for (const entry of listed) {
      const names = entry.slice(entry.indexOf('"') + 1, entry.lastIndexOf('"')).split(" ");
      assert.deepEqual([...names].sort(), [...APP_ICON_ALTERNATE_NAMES].sort());
    }
    assert.doesNotMatch(pluginSrc, /hasPaidToolAccess|verifiedArtist|RevenueCat/);
  });

  it("null restores Default and unknown names are rejected", () => {
    assert.deepEqual(resolveAppIconSetRequest(null), { ok: true, name: null });
    for (const name of APP_ICON_ALTERNATE_NAMES) {
      assert.deepEqual(resolveAppIconSetRequest(name), { ok: true, name });
    }
    const unknown = resolveAppIconSetRequest("DubHubIconAlternateProof");
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.match(unknown.message, /Unknown/);
  });

  it("maps native alternateIconName onto Default or the matching tile", () => {
    assert.equal(selectedAppIconChoice(null), "default");
    assert.equal(selectedAppIconChoice("DubHubIconClean"), "DubHubIconClean");
    assert.equal(selectedAppIconChoice("DubHubIconAlternateProof"), null);
    assert.deepEqual(normalizeAppIconState({ supportsAlternateIcons: true, alternateIconName: null }), {
      supportsAlternateIcons: true,
      alternateIconName: null,
    });
    assert.deepEqual(normalizeAppIconState({ supportsAlternateIcons: true, alternateIconName: "" }), {
      supportsAlternateIcons: true,
      alternateIconName: null,
    });
    assert.deepEqual(
      normalizeAppIconState({ supportsAlternateIcons: true, alternateIconName: "DubHubIconWordmark" }),
      { supportsAlternateIcons: true, alternateIconName: "DubHubIconWordmark" },
    );
  });

  it("does not move the selected tile when the native change fails or is cancelled", () => {
    assert.equal(
      appIconChoiceAfterNativeResult({
        previous: "DubHubIconOGDark",
        result: { ok: false },
      }),
      "DubHubIconOGDark",
    );
    assert.equal(
      appIconChoiceAfterNativeResult({
        previous: "default",
        result: { ok: true, alternateIconName: "DubHubIconBlue" },
      }),
      "DubHubIconBlue",
    );
    assert.equal(
      appIconChoiceAfterNativeResult({
        previous: "DubHubIconBlue",
        result: { ok: true, alternateIconName: null },
      }),
      "default",
    );
  });
});

describe("app icon VAT access", () => {
  const paid = { hasPaidToolAccess: true, freshness: "fresh", state: "active" };

  it("lets a paid verified artist select alternates, including paid-through, grace, and lifetime", () => {
    assert.equal(alternateAccess({ verifiedArtist: true, selection: paid }), "select");
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { ...paid, state: "cancelled_but_active_until_expiry" },
      }),
      "select",
    );
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { ...paid, state: "grace_period" },
      }),
      "select",
    );
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { ...paid, state: "active" },
      }),
      "select",
    );
  });

  it("opens the artist paywall for a verified artist without current access", () => {
    for (const state of ["never_subscribed", "expired", "refunded", "revoked", "billing_issue"]) {
      assert.equal(
        alternateAccess({
          verifiedArtist: true,
          selection: { state, hasPaidToolAccess: false, freshness: "fresh" },
        }),
        "paywall",
        state,
      );
    }
  });

  it("fails closed for stale or unknown status without a paywall", () => {
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { hasPaidToolAccess: true, freshness: "stale", state: "stale" },
      }),
      "locked",
    );
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { hasPaidToolAccess: false, freshness: "unknown", state: "unknown" },
      }),
      "locked",
    );
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        hasError: true,
        selection: paid,
      }),
      "locked",
    );
  });

  it("does not offer the artist paywall to a listener or unverified artist", () => {
    assert.equal(
      alternateAccess({
        verifiedArtist: false,
        selection: paid,
      }),
      "locked",
    );
    assert.equal(alternateAccess({ verifiedArtist: false }), "locked");
  });

  it("keeps Default selectable in the page and does not paywall it", () => {
    assert.match(pageSrc, /resolveAppIconTileTap/);
    assert.match(pageSrc, /action\.type === "paywall"/);
    assert.match(pageSrc, /source: "app_icon"/);
    assert.match(pageSrc, /resolvePaidToolGateMode/);
    assert.match(pageSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.doesNotMatch(pageSrc, /if \(selected === id\) return/);
    assert.doesNotMatch(pageSrc, /localStorage|supabase/);
    assert.doesNotMatch(pageSrc, /setIconState\(\{[^}]*alternateIconName: id/);
    assert.doesNotMatch(pageSrc, /DubHubIconAlternateProof|active:bg-black|active:bg-white/);
  });
});

describe("app icon tile tap", () => {
  const lockedAlternate = "DubHubIconLight" as const;

  it("asks for the VAT paywall when a free verified artist taps any locked alternate", () => {
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { state: "never_subscribed", hasPaidToolAccess: false, freshness: "fresh" },
      }),
      "paywall",
    );
    assert.deepEqual(
      resolveAppIconTileTap({
        id: lockedAlternate,
        selected: "default",
        access: "paywall",
        busy: false,
      }),
      { type: "paywall" },
    );
    assert.deepEqual(
      resolveAppIconTileTap({
        id: lockedAlternate,
        selected: lockedAlternate,
        access: "paywall",
        busy: false,
      }),
      { type: "paywall" },
    );
    assert.deepEqual(
      resolveAppIconTileTap({
        id: "default",
        selected: lockedAlternate,
        access: "paywall",
        busy: false,
      }),
      { type: "set", name: null },
    );
  });

  it("does not open the VAT paywall for a listener or unverified artist", () => {
    assert.equal(alternateAccess({ verifiedArtist: false }), "locked");
    assert.deepEqual(
      resolveAppIconTileTap({
        id: lockedAlternate,
        selected: "default",
        access: "locked",
        busy: false,
      }),
      { type: "ignore" },
    );
  });

  it("changes the icon for a paid verified artist and does not open the paywall", () => {
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { hasPaidToolAccess: true, freshness: "fresh", state: "active" },
      }),
      "select",
    );
    assert.deepEqual(
      resolveAppIconTileTap({
        id: lockedAlternate,
        selected: "default",
        access: "select",
        busy: false,
      }),
      { type: "set", name: lockedAlternate },
    );
  });

  it("does not change the icon or open a paywall when status is stale or unavailable", () => {
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        selection: { hasPaidToolAccess: false, freshness: "stale", state: "stale" },
      }),
      "locked",
    );
    assert.equal(
      alternateAccess({
        verifiedArtist: true,
        hasError: true,
      }),
      "locked",
    );
    assert.deepEqual(
      resolveAppIconTileTap({
        id: "DubHubIconOG",
        selected: "default",
        access: "locked",
        busy: false,
      }),
      { type: "ignore" },
    );
  });

  it("keeps the selected ring and does not paint a press container", () => {
    assert.match(pageSrc, /APP_ICON_TILE_BUTTON_CLASS/);
    assert.match(pageSrc, /APP_ICON_TILE_SELECTED_CLASS/);
    assert.doesNotMatch(APP_ICON_TILE_BUTTON_CLASS, /active:bg-(?!transparent)/);
    assert.doesNotMatch(APP_ICON_TILE_BUTTON_CLASS, /\bring-|rounded-|border-[1-9]/);
    assert.match(APP_ICON_TILE_BUTTON_CLASS, /bg-transparent/);
    assert.match(APP_ICON_TILE_BUTTON_CLASS, /-webkit-appearance:none/);
    assert.match(APP_ICON_TILE_IMAGE_CLASS, /group-active:opacity-90/);
    assert.doesNotMatch(APP_ICON_TILE_IMAGE_CLASS, /ring-|border|bg-/);
    assert.match(APP_ICON_TILE_SELECTED_CLASS, /ring-2/);
    assert.match(APP_ICON_TILE_SELECTED_CLASS, /ring-\[#0a83ff\]/);
  });
});

describe("app icon settings placement", () => {
  it("shows the App Icon row only for an artist on native iOS", () => {
    assert.equal(showAppIconEntry({ userType: "artist", nativeIos: true }), true);
    assert.equal(showAppIconEntry({ userType: "artist", nativeIos: false }), false);
    assert.equal(showAppIconEntry({ userType: "user", nativeIos: true }), false);
    assert.equal(showAppIconEntry({ userType: "moderator", nativeIos: true }), false);
    assert.equal(isArtistAccount("artist"), true);
    assert.equal(isArtistAccount("user"), false);
    assert.equal(isArtistAccount("moderator"), false);
    assert.match(settingsSrc, /showAppIconEntry\(\{ userType, nativeIos: isNativeIosAppIconPath\(\) \}\)/);
    assert.match(settingsSrc, /data-testid="button-settings-app-icon"/);
    assert.match(settingsSrc, /navigate\("\/settings\/app-icon", interactiveParentNavigation\("\/settings"\)\)/);
    assert.match(settingsSrc, /Choose your dub hub icon/);
    const light = settingsSrc.indexOf('data-testid="switch-light-mode"');
    const icon = settingsSrc.indexOf('data-testid="button-settings-app-icon"');
    assert.ok(light > 0 && icon > light);
    assert.match(transitionsSrc, /\/settings\/app-icon/);
    assert.doesNotMatch(diagnosticsSrc, /AppIconProofControl|app-icon-proof-control/);
  });

  it("keeps the picker off community and moderator routes", () => {
    assert.match(pageSrc, /isArtistAccount\(userType\)/);
    assert.match(pageSrc, /if \(accountLoading \|\| !artistAccount\) return null/);
    assert.match(pageSrc, /navigate\("\/settings", \{ replace: true \}\)/);
    assert.doesNotMatch(pageSrc, /userType === "moderator" \? .*picker|isModerator &&/);
  });
});

describe("app icon display order", () => {
  it("uses the exact gallery order and display names", () => {
    assert.deepEqual(
      APP_ICON_ALTERNATES.map((icon) => icon.label),
      ["Beta Blue", "Eyesore", "Clean", "Clean Granite", "OG", "OG Granite", "Government Name"],
    );
    assert.deepEqual(
      APP_ICON_ALTERNATES.map((icon) => icon.name),
      [
        "DubHubIconBlue",
        "DubHubIconLight",
        "DubHubIconClean",
        "DubHubIconCleanDark",
        "DubHubIconOG",
        "DubHubIconOGDark",
        "DubHubIconWordmark",
      ],
    );
    const tiles = pageSrc.indexOf('label: "Default (Stock)"');
    const mapped = pageSrc.indexOf("...APP_ICON_ALTERNATES.map");
    assert.ok(tiles > 0 && mapped > tiles);
  });
});

describe("settings artist section", () => {
  it("shows ARTIST / Tools for a verified artist and hides it otherwise", () => {
    assert.equal(showArtistToolsSection({ userType: "artist", verifiedArtist: true }), true);
    assert.equal(showArtistToolsSection({ userType: "artist", verifiedArtist: false }), false);
    assert.equal(showArtistToolsSection({ userType: "user", verifiedArtist: true }), false);
    assert.equal(showArtistToolsSection({ userType: "user", verifiedArtist: false }), false);
    assert.equal(showArtistToolsSection({ userType: "moderator", verifiedArtist: true }), false);
    assert.match(settingsSrc, /showArtistToolsSection\(\{ userType, verifiedArtist \}\)/);
    assert.match(settingsSrc, /SETTINGS_SECTION_LABEL_CLASS/);
    assert.match(settingsSrc, /id="settings-section-artist"/);
    assert.match(settingsSrc, />\s*Artist\s*</);
    assert.match(settingsSrc, />Tools</);
    assert.match(settingsSrc, /Manage artist tools and preferences/);
    assert.doesNotMatch(settingsSrc, />Artist<\/span>/);
  });
});
