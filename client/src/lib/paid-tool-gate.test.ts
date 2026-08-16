import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_ALERTS_AUDIENCE_LOCKED_COPY,
  resolvePaidToolGateMode,
  type PaidToolGateMode,
} from "./paid-tool-gate";
import {
  selectAuthoritativeSubscriptionEnvironment,
  type SubscriptionEnvironmentSelection,
} from "./subscription-environment";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";

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

function statusResponse(args: {
  production?: Partial<SubscriptionEnvironmentStatusView>;
  sandbox?: Partial<SubscriptionEnvironmentStatusView>;
}): UserSubscriptionStatusResponse {
  return {
    account: {
      userId: "00000000-0000-0000-0000-000000000111",
      accountType: "artist",
      verifiedArtist: true,
      subscriptionSubject: true,
    },
    provider: "revenuecat",
    environments: {
      production: envView(args.production),
      sandbox: envView(args.sandbox),
    },
  };
}

function modeFor(
  status: UserSubscriptionStatusResponse | null,
  channel: string | null,
  extras: { loading?: boolean; hasError?: boolean; enabled?: boolean } = {},
): PaidToolGateMode {
  const selection = selectAuthoritativeSubscriptionEnvironment(status, channel);
  return resolvePaidToolGateMode({
    enabled: extras.enabled ?? true,
    loading: extras.loading ?? false,
    hasError: extras.hasError ?? false,
    selection,
  });
}

/** Surfaces that must remain visible without paid access (regression guard). */
const FREE_ARTIST_IDENTITY_SURFACES = [
  "verification_badge",
  "confirm_deny_ids",
  "profile_editing_identity",
  "listener_release_alerts_toggle",
  "artist_impact_confirmed_count",
  "community_activity",
] as const;

const GATED_SURFACE = "release_alerts_audience_count" as const;

describe("resolvePaidToolGateMode — Release Alerts audience", () => {
  it("active paid access → available (tool visible)", () => {
    const mode = modeFor(
      statusResponse({
        sandbox: {
          state: "active",
          freshness: "fresh",
          hasPaidToolAccess: true,
          irreversibleActionsAllowed: true,
        },
      }),
      "local",
    );
    assert.equal(mode, "available");
  });

  it("expired → locked", () => {
    const mode = modeFor(
      statusResponse({
        sandbox: {
          state: "expired",
          freshness: "fresh",
          hasPaidToolAccess: false,
        },
      }),
      "local",
    );
    assert.equal(mode, "locked");
  });

  it("never_subscribed → locked", () => {
    const mode = modeFor(
      statusResponse({
        sandbox: { state: "never_subscribed", hasPaidToolAccess: false },
      }),
      "local",
    );
    assert.equal(mode, "locked");
  });

  it("unknown freshness → locked even if hasPaidToolAccess true", () => {
    const mode = modeFor(
      statusResponse({
        sandbox: {
          state: "active",
          freshness: "unknown",
          hasPaidToolAccess: true,
        },
      }),
      "local",
    );
    assert.equal(mode, "locked");
  });

  it("stale freshness → locked even if hasPaidToolAccess true", () => {
    const mode = modeFor(
      statusResponse({
        sandbox: {
          state: "active",
          freshness: "stale",
          hasPaidToolAccess: true,
        },
      }),
      "local",
    );
    assert.equal(mode, "locked");
  });

  it("loading → loading (no content flash)", () => {
    const mode = modeFor(null, "local", { loading: true });
    assert.equal(mode, "loading");
  });

  it("null status without loading → loading via status_not_loaded", () => {
    const mode = modeFor(null, "local", { loading: false });
    assert.equal(mode, "loading");
  });

  it("query error → unavailable", () => {
    const mode = modeFor(
      statusResponse({
        sandbox: { hasPaidToolAccess: true, state: "active" },
      }),
      "local",
      { hasError: true },
    );
    assert.equal(mode, "unavailable");
  });

  it("local uses sandbox for access", () => {
    const mode = modeFor(
      statusResponse({
        sandbox: {
          state: "active",
          freshness: "fresh",
          hasPaidToolAccess: true,
        },
        production: {
          state: "never_subscribed",
          hasPaidToolAccess: false,
        },
      }),
      "local",
    );
    assert.equal(mode, "available");
    const selection = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        sandbox: { hasPaidToolAccess: true, state: "active", freshness: "fresh" },
        production: { hasPaidToolAccess: false },
      }),
      "local",
    );
    assert.equal(selection.selectedEnvironment, "sandbox");
  });

  it("production uses production for access", () => {
    const mode = modeFor(
      statusResponse({
        production: {
          state: "active",
          freshness: "fresh",
          hasPaidToolAccess: true,
        },
        sandbox: {
          state: "never_subscribed",
          hasPaidToolAccess: false,
        },
      }),
      "production",
    );
    assert.equal(mode, "available");
    const selection = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        production: { hasPaidToolAccess: true, state: "active", freshness: "fresh" },
        sandbox: { hasPaidToolAccess: false },
      }),
      "production",
    );
    assert.equal(selection.selectedEnvironment, "production");
  });

  it("local ignores production-only paid access", () => {
    const mode = modeFor(
      statusResponse({
        production: {
          state: "active",
          freshness: "fresh",
          hasPaidToolAccess: true,
        },
        sandbox: {
          state: "never_subscribed",
          hasPaidToolAccess: false,
        },
      }),
      "local",
    );
    assert.equal(mode, "locked");
  });

  it("locked copy keeps Upgrade CTA and does not sell credibility", () => {
    assert.equal(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.title, "Release Alerts Audience");
    assert.match(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.ctaLabel, /Verified Artist Tools/i);
    assert.doesNotMatch(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.body, /credibility|verified badge for sale/i);
    assert.doesNotMatch(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.body, /Listeners can still/i);
    assert.doesNotMatch(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.ctaLabel, /credibility/i);
  });

  it("unrelated artist identity tools remain ungated by this surface", () => {
    assert.ok(!FREE_ARTIST_IDENTITY_SURFACES.includes(GATED_SURFACE as never));
    assert.equal(GATED_SURFACE, "release_alerts_audience_count");
    for (const surface of FREE_ARTIST_IDENTITY_SURFACES) {
      assert.notEqual(surface, GATED_SURFACE);
    }
  });

  it("disabled gate stays locked without flashing available", () => {
    const selection: SubscriptionEnvironmentSelection =
      selectAuthoritativeSubscriptionEnvironment(
        statusResponse({
          sandbox: {
            state: "active",
            freshness: "fresh",
            hasPaidToolAccess: true,
          },
        }),
        "local",
      );
    assert.equal(
      resolvePaidToolGateMode({
        enabled: false,
        loading: false,
        hasError: false,
        selection,
      }),
      "locked",
    );
  });
});
