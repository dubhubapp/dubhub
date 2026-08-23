/**
 * Slice C6B.5 — Verified Artist Tools compact action polish.
 * Presentation only. Does not change VAT / RevenueCat / entitlement behaviour.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_COMPACT_ACTION_GEOMETRY_CLASS,
  APP_MATERIAL_COMPACT_ACTION_PRESS_CLASS,
  APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS,
  APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS,
} from "./app-material";
import {
  SETTINGS_VAT_ACTION_PRIMARY_CLASS,
  SETTINGS_VAT_ACTION_SECONDARY_CLASS,
  SETTINGS_VAT_ACTIONS_CLASS,
} from "./settings-presentation";
import { resolveSettingsSubscriptionRowView } from "./settings-subscription-row";
import { selectAuthoritativeSubscriptionEnvironment } from "./subscription-environment";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";

const here = dirname(fileURLToPath(import.meta.url));
const vatRowSrc = readFileSync(
  join(here, "../components/verified-artist-tools-settings-row.tsx"),
  "utf8",
);
const mappingSrc = readFileSync(join(here, "./settings-subscription-row.ts"), "utf8");
const syncSrc = readFileSync(join(here, "./subscription-sync.ts"), "utf8");
const restoreSrc = readFileSync(join(here, "./verified-artist-tools-restore.ts"), "utf8");
const paywallSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall.tsx"),
  "utf8",
);
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

function envView(
  overrides: Partial<SubscriptionEnvironmentStatusView> = {},
): SubscriptionEnvironmentStatusView {
  return {
    state: "never_subscribed",
    freshness: "fresh",
    hasPaidToolAccess: false,
    irreversibleActionsAllowed: false,
    accessThrough: null,
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: null,
    willRenew: null,
    billingIssue: false,
    gracePeriod: false,
    expiresAt: null,
    lastVerifiedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function status(sandbox: Partial<SubscriptionEnvironmentStatusView>): UserSubscriptionStatusResponse {
  return {
    account: {
      userId: "u1",
      accountType: "artist",
      verifiedArtist: true,
      subscriptionSubject: true,
    },
    provider: "revenuecat",
    environments: {
      production: envView(),
      sandbox: envView(sandbox),
    },
  };
}

function viewFor(sandbox: Partial<SubscriptionEnvironmentStatusView>) {
  const selection = selectAuthoritativeSubscriptionEnvironment(status(sandbox), "local");
  return resolveSettingsSubscriptionRowView({
    loading: false,
    hasError: false,
    selection,
  });
}

function buttonSlice(testId: string) {
  const idx = vatRowSrc.indexOf(`data-testid="${testId}"`);
  assert.ok(idx > 0, testId);
  return vatRowSrc.slice(Math.max(0, idx - 320), idx + 90);
}

describe("C6B.5 VAT action family", () => {
  it("Retry and Restore share height, radius, type, and press language", () => {
    assert.equal(SETTINGS_VAT_ACTION_PRIMARY_CLASS, APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS);
    assert.equal(SETTINGS_VAT_ACTION_SECONDARY_CLASS, APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS);
    for (const cls of [SETTINGS_VAT_ACTION_PRIMARY_CLASS, SETTINGS_VAT_ACTION_SECONDARY_CLASS]) {
      assert.match(cls, /h-10 min-h-10/);
      assert.match(cls, /rounded-\[14px\]/);
      assert.match(cls, /px-4/);
      assert.match(cls, /text-sm font-medium/);
      assert.match(cls, /w-auto/);
      assert.match(cls, /active:opacity-90/);
      assert.match(cls, /focus-visible:ring-2/);
      assert.match(cls, /\[@media\(hover:hover\)\]/);
      assert.doesNotMatch(cls, /ios-press/);
      assert.doesNotMatch(cls, /w-full/);
      assert.doesNotMatch(cls, /active:scale/);
    }
    assert.match(APP_MATERIAL_COMPACT_ACTION_GEOMETRY_CLASS, /h-10 min-h-10/);
    assert.match(APP_MATERIAL_COMPACT_ACTION_PRESS_CLASS, /hover:bg-transparent/);
  });

  it("Retry uses stronger premium blue glass, not ceramic or a solid slab", () => {
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /bg-\[#0a83ff\]\/10/);
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /border-\[#0a83ff\]\/30/);
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /dark:bg-\[#0a83ff\]\/15/);
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /dark:border-\[#0a83ff\]\/35/);
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /inset_0_1px_0/);
    assert.doesNotMatch(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /dubhub-app-form-primary/);
    assert.doesNotMatch(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /bg-white font-semibold/);
    assert.doesNotMatch(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /#4ae9df|teal/);
  });

  it("Restore uses quiet neutral glass, not outline-only chrome", () => {
    assert.match(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /bg-black\/\[0\.04\]/);
    assert.match(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /dark:bg-white\/\[0\.055\]/);
    assert.match(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /dark:border-white\/\[0\.14\]/);
    assert.match(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /text-foreground\/80/);
    assert.doesNotMatch(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /bg-\[#0a83ff\]/);
  });

  it("keeps the wrap row compact and does not introduce full-width CTAs", () => {
    assert.match(SETTINGS_VAT_ACTIONS_CLASS, /flex flex-wrap items-center gap-2/);
    assert.match(vatRowSrc, /SETTINGS_VAT_ACTIONS_CLASS/);
    assert.match(buttonSlice("settings-vat-retry"), /SETTINGS_VAT_ACTION_PRIMARY_CLASS/);
    assert.match(buttonSlice("settings-vat-restore"), /SETTINGS_VAT_ACTION_SECONDARY_CLASS/);
    assert.doesNotMatch(buttonSlice("settings-vat-retry"), /w-full/);
    assert.doesNotMatch(buttonSlice("settings-vat-restore"), /w-full/);
    assert.doesNotMatch(SETTINGS_VAT_ACTIONS_CLASS, /flex-col|w-full/);
  });
});

describe("C6B.5 VAT actions — Upgrade / Manage reuse family", () => {
  it("Upgrade stays the stronger compact action; Manage stays secondary", () => {
    assert.match(buttonSlice("settings-vat-upgrade"), /SETTINGS_VAT_ACTION_PRIMARY_CLASS/);
    assert.match(buttonSlice("settings-vat-manage"), /SETTINGS_VAT_ACTION_SECONDARY_CLASS/);
  });

  it("does not change which action is semantically primary", () => {
    const upgradeIdx = vatRowSrc.indexOf("view.showUpgrade");
    const manageIdx = vatRowSrc.indexOf("view.showManage");
    const retryIdx = vatRowSrc.indexOf("view.showRetry");
    const restoreIdx = vatRowSrc.indexOf("view.showRestore");
    assert.ok(upgradeIdx > 0 && manageIdx > upgradeIdx && retryIdx > manageIdx && restoreIdx > retryIdx);
  });
});

describe("C6B.5 VAT logic freeze", () => {
  it("leaves handlers, RevenueCat restore, and retry refresh untouched", () => {
    assert.match(vatRowSrc, /retryAuthoritativeSubscriptionStatus/);
    assert.match(vatRowSrc, /restoreVerifiedArtistToolsPurchases/);
    assert.match(vatRowSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.match(vatRowSrc, /openIosManageSubscriptions/);
    assert.match(vatRowSrc, /disabled=\{retrying\}/);
    assert.match(vatRowSrc, /disabled=\{restoring\}/);
    assert.match(vatRowSrc, /Refreshing…/);
    assert.match(vatRowSrc, /Restoring…/);
    assert.match(syncSrc, /\/api\/user\/subscription-refresh/);
    assert.match(restoreSrc, /restorePurchases/);
    assert.doesNotMatch(mappingSrc, /SETTINGS_VAT_ACTION/);
    assert.doesNotMatch(settingsSrc, /SETTINGS_VAT_ACTION_PRIMARY_CLASS/);
  });

  it("does not restyle the VAT paywall or add one-off CSS", () => {
    assert.doesNotMatch(paywallSrc, /APP_MATERIAL_COMPACT_ACTION/);
    assert.doesNotMatch(paywallSrc, /SETTINGS_VAT_ACTION/);
    assert.doesNotMatch(cssSrc, /settings-vat-action|compact-action-primary|compact-action-secondary/);
  });
});

describe("C6B.5 VAT state coverage — mapping output unchanged", () => {
  it("covers unavailable, free, active, cancelled-active, billing, grace, lifetime", () => {
    const free = viewFor({});
    assert.equal(free.mode, "free");
    assert.equal(free.showUpgrade, true);
    assert.equal(free.showRestore, true);
    assert.equal(free.showRetry, false);

    const active = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "vat_monthly",
      willRenew: true,
      accessThrough: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(active.mode, "active");
    assert.equal(active.showManage, true);
    assert.equal(active.showRetry, false);

    const cancelled = viewFor({
      state: "cancelled_but_active_until_expiry",
      hasPaidToolAccess: true,
      accessThrough: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      willRenew: false,
      productIdentifier: "vat_monthly",
    });
    assert.equal(cancelled.mode, "cancelled_active");
    assert.equal(cancelled.showUpgrade, false);

    const grace = viewFor({
      state: "grace_period",
      hasPaidToolAccess: true,
      gracePeriod: true,
      accessThrough: "2026-08-20T00:00:00.000Z",
      expiresAt: "2026-08-20T00:00:00.000Z",
      productIdentifier: "vat_monthly",
    });
    assert.equal(grace.mode, "needs_attention");
    assert.equal(grace.attentionKind, "grace");

    const billing = viewFor({
      state: "billing_issue",
      hasPaidToolAccess: false,
      billingIssue: true,
      productIdentifier: "vat_monthly",
    });
    assert.equal(billing.mode, "needs_attention");
    assert.equal(billing.attentionKind, "billing");
    assert.equal(billing.showRestore, true);

    const unresolved = viewFor({
      state: "stale",
      freshness: "stale",
      hasPaidToolAccess: false,
      productIdentifier: "vat_monthly",
    });
    assert.equal(unresolved.mode, "unresolved");
    assert.equal(unresolved.statusLabel, "Subscription status unavailable");
    assert.equal(unresolved.showRetry, true);
    assert.equal(unresolved.showRestore, true);
    assert.equal(unresolved.showUpgrade, false);

    const lifetime = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      irreversibleActionsAllowed: true,
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      willRenew: false,
      accessThrough: null,
      expiresAt: null,
    });
    assert.equal(lifetime.mode, "active");
    assert.equal(lifetime.isLifetime, true);
    assert.equal(lifetime.showManage, false);
  });
});
