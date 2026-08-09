import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectAuthoritativeSubscriptionEnvironment } from "./subscription-environment";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";
import {
  isLifetimeProductIdentifier,
  isLifetimeSettingsAccess,
  resolveSettingsSubscriptionRowView,
  SETTINGS_ACTIVE_PLAN_SUMMARY_LINES,
} from "./settings-subscription-row";

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

describe("isLifetimeProductIdentifier", () => {
  it("recognises promo and catalogue lifetime ids", () => {
    assert.equal(isLifetimeProductIdentifier("rc_promo_verified_artist_tools_lifetime"), true);
    assert.equal(isLifetimeProductIdentifier("dubhub_artist_lifetime"), true);
    assert.equal(isLifetimeProductIdentifier("vat_monthly"), false);
  });
});

describe("resolveSettingsSubscriptionRowView", () => {
  it("never subscribed retains Free marketing copy", () => {
    const view = viewFor({});
    assert.equal(view.mode, "free");
    assert.equal(view.statusLabel, "Free");
    assert.match(view.detail ?? "", /More tools for sharing/);
    assert.equal(view.showUpgrade, true);
    assert.equal(view.showRestore, true);
    assert.equal(view.showPlanSummary, false);
  });

  it("expired uses Subscription ended copy", () => {
    const view = viewFor({ state: "expired", freshness: "fresh" });
    assert.equal(view.mode, "free");
    assert.equal(view.statusLabel, "Subscription ended");
    assert.equal(view.detail, "Your Verified Artist Tools subscription has ended.");
    assert.equal(view.showUpgrade, true);
    assert.equal(view.showRestore, true);
    assert.equal(view.showPlanSummary, false);
    assert.equal((view.detail ?? "").includes("More tools for sharing"), false);
  });

  it("refunded/revoked use ended inactive copy", () => {
    for (const state of ["refunded", "revoked"] as const) {
      const view = viewFor({ state, freshness: "fresh" });
      assert.equal(view.statusLabel, "Subscription ended");
      assert.equal(view.detail, "Your Verified Artist Tools are no longer active.");
      assert.equal(view.showPlanSummary, false);
      assert.equal((view.detail ?? "").toLowerCase().includes("refund"), false);
      assert.equal((view.detail ?? "").toLowerCase().includes("revok"), false);
    }
  });

  it("lifetime displays Lifetime · Does not renew without Manage", () => {
    const view = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      irreversibleActionsAllowed: true,
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      willRenew: false,
      accessThrough: null,
      expiresAt: null,
    });
    assert.equal(view.mode, "active");
    assert.equal(view.statusLabel, "Active");
    assert.equal(view.detail, "Lifetime · Does not renew");
    assert.equal(view.isLifetime, true);
    assert.equal(view.showManage, false);
    assert.equal(view.showRestore, true);
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showPlanSummary, true);
    assert.equal((view.detail ?? "").toLowerCase().includes("renews"), false);
  });

  it("lifetime structural active with null expiry is recognised", () => {
    assert.equal(
      isLifetimeSettingsAccess({
        paid: true,
        freshness: "fresh",
        state: "active",
        productIdentifier: "some_nonsub_sku",
        expiresAt: null,
        accessThrough: null,
        willRenew: false,
      }),
      true,
    );
    assert.equal(
      isLifetimeSettingsAccess({
        paid: true,
        freshness: "fresh",
        state: "active",
        productIdentifier: "vat_monthly",
        expiresAt: null,
        accessThrough: null,
        willRenew: true,
      }),
      false,
    );
  });

  it("cancelled-active says Won’t renew and keeps access-through", () => {
    const view = viewFor({
      state: "cancelled_but_active_until_expiry",
      hasPaidToolAccess: true,
      accessThrough: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      willRenew: false,
      productIdentifier: "vat_monthly",
    });
    assert.equal(view.mode, "cancelled_active");
    assert.equal(view.statusLabel, "Active");
    assert.match(view.detail ?? "", /Won’t renew/);
    assert.match(view.detail ?? "", /Active through/);
    assert.equal((view.detail ?? "").toLowerCase().includes("expired"), false);
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showManage, true);
    assert.equal(view.showPlanSummary, true);
  });

  it("grace says tools remain active and differs from billing", () => {
    const grace = viewFor({
      state: "grace_period",
      hasPaidToolAccess: true,
      gracePeriod: true,
      accessThrough: "2026-08-20T00:00:00.000Z",
      expiresAt: "2026-08-20T00:00:00.000Z",
      productIdentifier: "vat_monthly",
    });
    const billing = viewFor({
      state: "billing_issue",
      hasPaidToolAccess: false,
      billingIssue: true,
      productIdentifier: "vat_monthly",
    });
    assert.equal(grace.mode, "needs_attention");
    assert.equal(grace.statusLabel, "Payment issue");
    assert.match(grace.detail ?? "", /remain active/);
    assert.equal(grace.attentionKind, "grace");
    assert.equal(grace.showPlanSummary, true);
    assert.equal(grace.showUpgrade, false);

    assert.equal(billing.statusLabel, "Subscription needs attention");
    assert.match(billing.detail ?? "", /Update your App Store payment/);
    assert.equal(billing.attentionKind, "billing");
    assert.equal(billing.showPlanSummary, false);
    assert.notEqual(grace.detail, billing.detail);
    assert.notEqual(grace.statusLabel, billing.statusLabel);
  });

  it("active monthly shows plan summary; free does not", () => {
    const active = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "vat_monthly",
      willRenew: true,
      accessThrough: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(active.showPlanSummary, true);
    assert.deepEqual([...active.planSummaryLines], [...SETTINGS_ACTIVE_PLAN_SUMMARY_LINES]);
    assert.equal(active.showManage, true);

    const free = viewFor({});
    assert.equal(free.showPlanSummary, false);

    const unavailable = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: true,
      selection: selectAuthoritativeSubscriptionEnvironment(status({}), null),
    });
    assert.equal(unavailable.mode, "unavailable");
    assert.equal(unavailable.showPlanSummary, false);
  });

  it("does not expose entitlement ids in the view", () => {
    const view = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "vat_annual",
      willRenew: true,
      accessThrough: "2027-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(JSON.stringify(view).includes("verified_artist_tools"), false);
    assert.match(view.detail ?? "", /Annual/);
  });
});
