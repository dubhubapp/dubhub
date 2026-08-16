import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
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

const here = dirname(fileURLToPath(import.meta.url));
const vatRowSrc = readFileSync(
  join(here, "../components/verified-artist-tools-settings-row.tsx"),
  "utf8",
);
const legalSrc = readFileSync(join(here, "./legal-urls.ts"), "utf8");

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
  it("1 loading — no upgrade, no free flash", () => {
    const view = resolveSettingsSubscriptionRowView({
      loading: true,
      hasError: false,
      selection: selectAuthoritativeSubscriptionEnvironment(null, "local"),
    });
    assert.equal(view.mode, "loading");
    assert.equal(view.statusLabel, "Loading");
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showRestore, false);
    assert.equal(view.showManage, false);
    assert.notEqual(view.statusLabel, "Free");
  });

  it("2 never subscribed — Free + Upgrade + Restore", () => {
    const view = viewFor({});
    assert.equal(view.mode, "free");
    assert.equal(view.statusLabel, "Free");
    assert.match(view.detail ?? "", /More tools for sharing/);
    assert.equal(view.showUpgrade, true);
    assert.equal(view.showRestore, true);
    assert.equal(view.showManage, false);
    assert.equal(view.showLegalLinks, false);
    assert.equal(view.showPlanSummary, false);
  });

  it("3 active monthly — Manage + Restore, no Upgrade, no product ids", () => {
    const view = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "vat_monthly",
      willRenew: true,
      accessThrough: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(view.mode, "active");
    assert.equal(view.statusLabel, "Active");
    assert.match(view.detail ?? "", /Monthly/);
    assert.match(view.detail ?? "", /Renews/);
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showManage, true);
    assert.equal(view.showRestore, true);
    assert.equal(view.showLegalLinks, true);
    assert.equal(view.showPlanSummary, true);
    assert.equal(JSON.stringify(view).includes("verified_artist_tools"), false);
    assert.equal(JSON.stringify(view).includes("$rc_"), false);
  });

  it("4 active annual — plan label Annual", () => {
    const view = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "vat_annual",
      willRenew: true,
      accessThrough: "2027-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(view.mode, "active");
    assert.match(view.detail ?? "", /Annual/);
    assert.equal(view.showManage, true);
    assert.equal(view.showLegalLinks, true);
    assert.equal(JSON.stringify(view).includes("verified_artist_tools"), false);
  });

  it("5 lifetime — Active, no Manage, no legal management links", () => {
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
    assert.equal(view.showLegalLinks, false);
    assert.equal(view.showPlanSummary, true);
  });

  it("6 cancelled-active — Available through, Manage, no Upgrade", () => {
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
    assert.match(view.detail ?? "", /Available through/);
    assert.equal((view.detail ?? "").toLowerCase().includes("expired"), false);
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showManage, true);
    assert.equal(view.showLegalLinks, true);
    assert.equal(view.showPlanSummary, true);
  });

  it("7 grace with access — retained access copy, Manage, no Upgrade", () => {
    const grace = viewFor({
      state: "grace_period",
      hasPaidToolAccess: true,
      gracePeriod: true,
      accessThrough: "2026-08-20T00:00:00.000Z",
      expiresAt: "2026-08-20T00:00:00.000Z",
      productIdentifier: "vat_monthly",
    });
    assert.equal(grace.mode, "needs_attention");
    assert.equal(grace.statusLabel, "Payment issue");
    assert.match(grace.detail ?? "", /remain active/);
    assert.equal(grace.attentionKind, "grace");
    assert.equal(grace.showPlanSummary, true);
    assert.equal(grace.showUpgrade, false);
    assert.equal(grace.showManage, true);
    assert.equal(grace.showLegalLinks, true);
  });

  it("8 billing issue without access — needs attention, Manage, no Upgrade", () => {
    const billing = viewFor({
      state: "billing_issue",
      hasPaidToolAccess: false,
      billingIssue: true,
      productIdentifier: "vat_monthly",
    });
    assert.equal(billing.mode, "needs_attention");
    assert.equal(billing.statusLabel, "Subscription needs attention");
    assert.match(billing.detail ?? "", /Update your App Store payment/);
    assert.equal(billing.attentionKind, "billing");
    assert.equal(billing.showUpgrade, false);
    assert.equal(billing.showManage, true);
    assert.equal(billing.showRestore, true);
    assert.equal(billing.showLegalLinks, true);
  });

  it("9 expired differs from never subscribed", () => {
    const expired = viewFor({ state: "expired", freshness: "fresh" });
    const never = viewFor({});
    assert.equal(expired.statusLabel, "Subscription ended");
    assert.equal(expired.detail, "Your Verified Artist Tools subscription has ended.");
    assert.equal(expired.showUpgrade, true);
    assert.equal(expired.showRestore, true);
    assert.equal(expired.showManage, false);
    assert.notEqual(expired.statusLabel, never.statusLabel);
    assert.equal((expired.detail ?? "").includes("More tools for sharing"), false);
  });

  it("10 refunded/revoked — neutral ended copy, no refund/revoke words", () => {
    for (const state of ["refunded", "revoked"] as const) {
      const view = viewFor({ state, freshness: "fresh" });
      assert.equal(view.statusLabel, "Subscription ended");
      assert.equal(view.detail, "Your Verified Artist Tools are no longer active.");
      assert.equal(view.showUpgrade, true);
      assert.equal(view.showRestore, true);
      assert.equal(view.showManage, false);
      assert.equal((view.detail ?? "").toLowerCase().includes("refund"), false);
      assert.equal((view.detail ?? "").toLowerCase().includes("revok"), false);
    }
  });

  it("11 stale != Free — no Upgrade-first marketing", () => {
    const view = viewFor({
      state: "stale",
      freshness: "stale",
      hasPaidToolAccess: false,
      productIdentifier: "vat_monthly",
    });
    assert.equal(view.mode, "unresolved");
    assert.equal(view.unresolvedKind, "stale");
    assert.equal(view.statusLabel, "Subscription status unavailable");
    assert.match(view.detail ?? "", /couldn’t confirm/i);
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showRestore, true);
    assert.equal(view.showManage, false);
    assert.equal(view.showRetry, true);
    assert.equal(view.showLegalLinks, false);
    assert.notEqual(view.statusLabel, "Free");
    assert.equal((view.detail ?? "").includes("More tools for sharing"), false);
  });

  it("12 unknown != Free — no Upgrade-first marketing", () => {
    const view = viewFor({
      state: "unknown",
      freshness: "unknown",
      hasPaidToolAccess: false,
    });
    assert.equal(view.mode, "unresolved");
    assert.equal(view.unresolvedKind, "unknown");
    assert.equal(view.statusLabel, "Subscription status unavailable");
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showRestore, true);
    assert.equal(view.showRetry, true);
    assert.notEqual(view.statusLabel, "Free");
  });

  it("13 fetch/selection unavailable — Restore + Retry, no Upgrade", () => {
    const unavailable = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: true,
      selection: selectAuthoritativeSubscriptionEnvironment(status({}), null),
    });
    assert.equal(unavailable.mode, "unavailable");
    assert.equal(unavailable.statusLabel, "Unavailable");
    assert.equal(unavailable.showUpgrade, false);
    assert.equal(unavailable.showRestore, true);
    assert.equal(unavailable.showRetry, true);
    assert.equal(unavailable.showManage, false);
  });

  it("14–17 freshness stale/unknown without state still unresolved", () => {
    const staleFreshness = viewFor({
      state: "active",
      freshness: "stale",
      hasPaidToolAccess: false,
      productIdentifier: "vat_monthly",
    });
    assert.equal(staleFreshness.mode, "unresolved");
    assert.equal(staleFreshness.unresolvedKind, "stale");
    assert.equal(staleFreshness.showUpgrade, false);

    const unknownFreshness = viewFor({
      state: "never_subscribed",
      freshness: "unknown",
      hasPaidToolAccess: false,
    });
    assert.equal(unknownFreshness.mode, "unresolved");
    assert.equal(unknownFreshness.unresolvedKind, "unknown");
    assert.equal(unknownFreshness.showUpgrade, false);
  });

  it("18 active plan does not expose internal product IDs", () => {
    const view = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "$rc_monthly",
      willRenew: true,
      accessThrough: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
    // Heuristic may still label Monthly from "month"; never surface raw id.
    assert.equal(JSON.stringify(view).includes("$rc_monthly"), false);
    assert.equal(JSON.stringify(view).includes("verified_artist_tools"), false);
  });

  it("19 lifetime hides Manage", () => {
    const view = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      willRenew: false,
      accessThrough: null,
      expiresAt: null,
    });
    assert.equal(view.showManage, false);
  });

  it("20 cancelled active retains access-through copy", () => {
    const view = viewFor({
      state: "cancelled_but_active_until_expiry",
      hasPaidToolAccess: true,
      accessThrough: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      willRenew: false,
    });
    assert.match(view.detail ?? "", /Available through/);
  });

  it("21 grace explains retained access", () => {
    const grace = viewFor({
      state: "grace_period",
      hasPaidToolAccess: true,
      gracePeriod: true,
      accessThrough: "2026-08-20T00:00:00.000Z",
      expiresAt: "2026-08-20T00:00:00.000Z",
    });
    assert.match(grace.detail ?? "", /remain active/);
  });

  it("22 expired differs from never subscribed marketing", () => {
    const expired = viewFor({ state: "expired", freshness: "fresh" });
    const never = viewFor({});
    assert.notEqual(expired.detail, never.detail);
    assert.equal(expired.statusLabel, "Subscription ended");
    assert.equal(never.statusLabel, "Free");
  });

  it("23 Free statusLabel only for authoritative never_subscribed", () => {
    assert.equal(viewFor({}).statusLabel, "Free");
    assert.notEqual(viewFor({ state: "stale", freshness: "stale" }).statusLabel, "Free");
    assert.notEqual(viewFor({ state: "unknown", freshness: "unknown" }).statusLabel, "Free");
    assert.notEqual(viewFor({ state: "expired", freshness: "fresh" }).statusLabel, "Free");
    assert.notEqual(
      viewFor({
        state: "active",
        hasPaidToolAccess: true,
        productIdentifier: "vat_monthly",
        willRenew: true,
        accessThrough: "2026-09-01T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z",
      }).statusLabel,
      "Free",
    );
  });

  it("24–26 Upgrade / Restore / Manage matrices", () => {
    const cases: Array<{
      name: string;
      env: Partial<SubscriptionEnvironmentStatusView>;
      upgrade: boolean;
      restore: boolean;
      manage: boolean;
    }> = [
      { name: "never", env: {}, upgrade: true, restore: true, manage: false },
      {
        name: "monthly",
        env: {
          state: "active",
          hasPaidToolAccess: true,
          productIdentifier: "vat_monthly",
          willRenew: true,
          accessThrough: "2026-09-01T00:00:00.000Z",
          expiresAt: "2026-09-01T00:00:00.000Z",
        },
        upgrade: false,
        restore: true,
        manage: true,
      },
      {
        name: "lifetime",
        env: {
          state: "active",
          hasPaidToolAccess: true,
          productIdentifier: "rc_promo_verified_artist_tools_lifetime",
          willRenew: false,
          accessThrough: null,
          expiresAt: null,
        },
        upgrade: false,
        restore: true,
        manage: false,
      },
      {
        name: "cancelled",
        env: {
          state: "cancelled_but_active_until_expiry",
          hasPaidToolAccess: true,
          accessThrough: "2026-10-01T00:00:00.000Z",
          expiresAt: "2026-10-01T00:00:00.000Z",
          willRenew: false,
        },
        upgrade: false,
        restore: true,
        manage: true,
      },
      {
        name: "grace",
        env: {
          state: "grace_period",
          hasPaidToolAccess: true,
          gracePeriod: true,
          accessThrough: "2026-08-20T00:00:00.000Z",
          expiresAt: "2026-08-20T00:00:00.000Z",
        },
        upgrade: false,
        restore: true,
        manage: true,
      },
      {
        name: "billing",
        env: { state: "billing_issue", hasPaidToolAccess: false, billingIssue: true },
        upgrade: false,
        restore: true,
        manage: true,
      },
      {
        name: "expired",
        env: { state: "expired", freshness: "fresh" },
        upgrade: true,
        restore: true,
        manage: false,
      },
      {
        name: "stale",
        env: { state: "stale", freshness: "stale" },
        upgrade: false,
        restore: true,
        manage: false,
      },
      {
        name: "unknown",
        env: { state: "unknown", freshness: "unknown" },
        upgrade: false,
        restore: true,
        manage: false,
      },
    ];

    for (const c of cases) {
      const view = viewFor(c.env);
      assert.equal(view.showUpgrade, c.upgrade, `${c.name} upgrade`);
      assert.equal(view.showRestore, c.restore, `${c.name} restore`);
      assert.equal(view.showManage, c.manage, `${c.name} manage`);
    }
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
    assert.equal(viewFor({}).showPlanSummary, false);
  });
});

describe("settings VAT row presentation contracts", () => {
  it("27 no-free-flash: loading skeleton and unresolved never render Upgrade as Free path", () => {
    assert.match(vatRowSrc, /settings-verified-artist-tools-loading/);
    assert.match(vatRowSrc, /No Free flash/);
    assert.match(vatRowSrc, /view\.showUpgrade/);
    assert.match(vatRowSrc, /settings-vat-retry/);
  });

  it("28–29 legal links use existing helpers on management surfaces", () => {
    assert.match(vatRowSrc, /showLegalLinks/);
    assert.match(vatRowSrc, /DUBHUB_TERMS_OF_USE_URL/);
    assert.match(vatRowSrc, /DUBHUB_PRIVACY_POLICY_URL/);
    assert.match(vatRowSrc, /settings-vat-terms/);
    assert.match(vatRowSrc, /settings-vat-privacy/);
    assert.match(vatRowSrc, /Billing is managed through Apple/);
    assert.match(legalSrc, /DUBHUB_TERMS_OF_USE_URL/);
    assert.match(legalSrc, /DUBHUB_PRIVACY_POLICY_URL/);
    assert.match(vatRowSrc, /openIosManageSubscriptions/);
  });

  it("Retry invokes server refresh helper — not GET-only refetch", () => {
    assert.match(vatRowSrc, /retryAuthoritativeSubscriptionStatus/);
    assert.match(vatRowSrc, /POST \/api\/user\/subscription-refresh/);
    assert.doesNotMatch(
      vatRowSrc,
      /onRetry[\s\S]{0,400}refetchQueries\(\{\s*queryKey:\s*\[\.\.\.SUBSCRIPTION_STATUS_QUERY_KEY\]/,
    );
    assert.match(vatRowSrc, /disabled=\{retrying\}/);
    assert.match(vatRowSrc, /Refreshing…/);
    assert.match(vatRowSrc, /if \(retrying\) return/);
  });
});
