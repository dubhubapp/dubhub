import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_LIFETIME,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";
import {
  parsePaywallOfferings,
  subscriptionPeriodLabel,
} from "./verified-artist-tools-offerings";
import {
  resolveVerifiedArtistToolsPaywallCopy,
  VERIFIED_ARTIST_TOOLS_BENEFITS,
  type VerifiedArtistToolsPaywallSource,
} from "./verified-artist-tools-paywall-copy";
import { isVerifiedArtistToolsPaywallEnabled } from "./verified-artist-tools-paywall-flag";
import { resolveSettingsSubscriptionRowView } from "./settings-subscription-row";
import { selectAuthoritativeSubscriptionEnvironment } from "./subscription-environment";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";
import { RELEASE_ALERTS_AUDIENCE_LOCKED_COPY } from "./paid-tool-gate";

describe("verified-artist-tools-paywall-flag", () => {
  it("requires exact true", () => {
    assert.equal(
      isVerifiedArtistToolsPaywallEnabled({
        VITE_VERIFIED_ARTIST_TOOLS_PAYWALL_ENABLED: "true",
      }),
      true,
    );
    assert.equal(
      isVerifiedArtistToolsPaywallEnabled({
        VITE_VERIFIED_ARTIST_TOOLS_PAYWALL_ENABLED: "1",
      }),
      false,
    );
    assert.equal(isVerifiedArtistToolsPaywallEnabled({}), false);
  });
});

describe("verified-artist-tools-paywall-copy", () => {
  const sources: VerifiedArtistToolsPaywallSource[] = [
    "release_limit",
    "attachment_limit",
    "link_limit",
    "release_link_presave",
    "future_release_paused",
    "release_alerts",
    "settings",
  ];

  it("returns contextual title/body for every source", () => {
    for (const source of sources) {
      const copy = resolveVerifiedArtistToolsPaywallCopy(source);
      assert.ok(copy.title.length > 0, source);
      assert.ok(copy.body.length > 0, source);
    }
  });

  it("keeps shared benefits identical and avoids followers/reach claims", () => {
    assert.equal(VERIFIED_ARTIST_TOOLS_BENEFITS.length, 4);
    const joined = VERIFIED_ARTIST_TOOLS_BENEFITS.join(" ");
    assert.equal(joined.includes("follower"), false);
    assert.equal(joined.toLowerCase().includes("boost"), false);
    assert.equal(joined.toLowerCase().includes("credibility"), false);
    assert.match(joined, /waiting listeners/i);
  });

  it("capitalises Tools in product naming surfaces", () => {
    assert.match(
      resolveVerifiedArtistToolsPaywallCopy("settings").title,
      /Verified Artist Tools/,
    );
    assert.match(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.body, /Verified Artist Tools/);
    assert.equal(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.ctaLabel, "Upgrade");
  });
});

describe("parsePaywallOfferings", () => {
  it("shows monthly and annual with store price strings", () => {
    const result = parsePaywallOfferings({
      current: {
        identifier: "default",
        availablePackages: [
          {
            identifier: RC_PACKAGE_MONTHLY,
            product: {
              identifier: "vat_monthly",
              priceString: "£4.99",
              subscriptionPeriod: "P1M",
            },
          },
          {
            identifier: RC_PACKAGE_ANNUAL,
            product: {
              identifier: "vat_annual",
              priceString: "£49.99",
              subscriptionPeriod: "P1Y",
            },
          },
          {
            identifier: RC_PACKAGE_LIFETIME,
            product: {
              identifier: "vat_lifetime",
              priceString: "£199.99",
              subscriptionPeriod: null,
            },
          },
        ],
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.packages.length, 2);
    assert.equal(result.monthly?.priceString, "£4.99");
    assert.equal(result.annual?.priceString, "£49.99");
    assert.equal(
      result.packages.some((p) => p.packageIdentifier === RC_PACKAGE_LIFETIME),
      false,
    );
  });

  it("allows monthly alone when annual is missing", () => {
    const result = parsePaywallOfferings({
      current: {
        identifier: "default",
        availablePackages: [
          {
            identifier: RC_PACKAGE_MONTHLY,
            product: {
              identifier: "vat_monthly",
              priceString: "$5.99",
              subscriptionPeriod: "P1M",
            },
          },
          {
            identifier: RC_PACKAGE_LIFETIME,
            product: { identifier: "vat_lifetime", priceString: "$99" },
          },
        ],
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.packages.length, 1);
    assert.equal(result.monthly?.kind, "monthly");
    assert.equal(result.annual, null);
  });

  it("fails closed when only lifetime is present", () => {
    const result = parsePaywallOfferings({
      current: {
        identifier: "default",
        availablePackages: [
          {
            identifier: RC_PACKAGE_LIFETIME,
            product: { identifier: "vat_lifetime", priceString: "$99" },
          },
        ],
      },
    });
    assert.equal(result.ok, false);
  });

  it("maps subscription periods", () => {
    assert.equal(subscriptionPeriodLabel("P1M"), "per month");
    assert.equal(subscriptionPeriodLabel("P1Y"), "per year");
  });
});

describe("resolveSettingsSubscriptionRowView", () => {
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

  it("shows free upgrade state", () => {
    const selection = selectAuthoritativeSubscriptionEnvironment(status({}), "local");
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.mode, "free");
    assert.equal(view.statusLabel, "Free");
    assert.equal(view.showUpgrade, true);
    assert.equal(view.showRestore, true);
  });

  it("shows active paid state without exposing entitlement ids", () => {
    const selection = selectAuthoritativeSubscriptionEnvironment(
      status({
        state: "active",
        hasPaidToolAccess: true,
        irreversibleActionsAllowed: true,
        productIdentifier: "vat_monthly",
        willRenew: true,
        accessThrough: "2026-09-01T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z",
      }),
      "local",
    );
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.mode, "active");
    assert.equal(view.statusLabel, "Active");
    assert.equal(view.showUpgrade, false);
    assert.equal(view.showManage, true);
    assert.equal(JSON.stringify(view).includes("verified_artist_tools"), false);
  });

  it("shows cancelled-but-active through date", () => {
    const selection = selectAuthoritativeSubscriptionEnvironment(
      status({
        state: "cancelled_but_active_until_expiry",
        hasPaidToolAccess: true,
        accessThrough: "2026-10-01T00:00:00.000Z",
        expiresAt: "2026-10-01T00:00:00.000Z",
        willRenew: false,
      }),
      "local",
    );
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.mode, "cancelled_active");
    assert.match(view.detail ?? "", /Won’t renew/);
    assert.match(view.detail ?? "", /Active through/);
    assert.equal((view.detail ?? "").toLowerCase().includes("expired"), false);
  });

  it("maps billing issue to needs attention", () => {
    const selection = selectAuthoritativeSubscriptionEnvironment(
      status({
        state: "billing_issue",
        hasPaidToolAccess: false,
        billingIssue: true,
      }),
      "local",
    );
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.mode, "needs_attention");
    assert.equal(view.statusLabel, "Subscription needs attention");
    assert.equal(view.showManage, true);
  });
});
