/**
 * ARTIST-SUB-DISCOVERY-1 — paid-tool gate is for outbound delivery, not audience count.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY,
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

const here = dirname(fileURLToPath(import.meta.url));
const gateRowSrc = readFileSync(
  join(here, "../components/release-alerts-audience-gate.tsx"),
  "utf8",
);
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");

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
  "release_alerts_audience_count",
] as const;

const PAID_DELIVERY_SURFACE = "outbound_release_alert_delivery" as const;

describe("resolvePaidToolGateMode — outbound Release Alert delivery", () => {
  it("active paid access → available (delivery capability)", () => {
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

  it("never_subscribed → locked (delivery only; audience count is free)", () => {
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

  it("audience count is free; outbound delivery remains the paid surface", () => {
    assert.ok(FREE_ARTIST_IDENTITY_SURFACES.includes("release_alerts_audience_count"));
    assert.equal(PAID_DELIVERY_SURFACE, "outbound_release_alert_delivery");
    for (const surface of FREE_ARTIST_IDENTITY_SURFACES) {
      assert.notEqual(surface, PAID_DELIVERY_SURFACE);
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

  it("unavailable copy does not sell audience count as paid insight", () => {
    assert.match(RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY, /temporarily unavailable/i);
    assert.doesNotMatch(RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY, /insight|Verified Artist Tools/i);
  });
});

describe("ARTIST-SUB-DISCOVERY-1 audience count ungated", () => {
  it("owner row shows count without paid lock / subscription gate", () => {
    assert.match(gateRowSrc, /data-testid="artist-release-alerts-audience"/);
    assert.match(gateRowSrc, /Visible to all verified artists/);
    assert.doesNotMatch(gateRowSrc, /RELEASE_ALERTS_AUDIENCE_LOCKED_COPY/);
    assert.doesNotMatch(gateRowSrc, /artist-release-alerts-audience-locked/);
    assert.doesNotMatch(gateRowSrc, /resolvePaidToolGateMode/);
    assert.doesNotMatch(gateRowSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.doesNotMatch(gateRowSrc, /useAuthoritativeSubscriptionStatus/);
    assert.doesNotMatch(gateRowSrc, /insight is part of Verified Artist Tools/i);
    assert.match(gateRowSrc, /enabled=\{verifiedArtist\}|enabled,/);
    assert.match(gateRowSrc, /queryFn:/);
  });

  it("profile only mounts audience row when verifiedArtist", () => {
    const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
    assert.match(
      profileSrc,
      /ReleaseAlertsAudienceGateRow[\s\S]*?enabled=\{verifiedArtist\}/,
    );
  });

  it("server audience endpoint requires verified artist only — not paid tools", () => {
    const routeBlock = routesSrc.match(
      /app\.get\("\/api\/artists\/me\/release-alerts-audience"[\s\S]*?^\s*\}\);/m,
    );
    assert.ok(routeBlock, "audience route present");
    const body = routeBlock[0];
    assert.match(body, /Verified artist access only/);
    assert.doesNotMatch(body, /canArtistUsePaidTools/);
    assert.doesNotMatch(body, /PAID_ARTIST_TOOL_REQUIRED/);
    assert.match(body, /countArtistReleaseAlertsForArtist/);
  });
});
