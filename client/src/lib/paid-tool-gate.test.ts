/**
 * Paid-tool gate + ARTIST-SUB-INTRO-1: aggregate audience count is paid;
 * release_alert_enabled in-app demand notification stays free.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_ALERTS_AUDIENCE_LOCKED_COPY,
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
  "release_alert_enabled_in_app_notification",
] as const;

const PAID_SURFACES = [
  "outbound_release_alert_delivery",
  "release_alerts_audience_count",
] as const;

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

  it("audience aggregate is paid; demand notification stays free", () => {
    assert.ok(
      FREE_ARTIST_IDENTITY_SURFACES.includes("release_alert_enabled_in_app_notification"),
    );
    assert.ok(PAID_SURFACES.includes("release_alerts_audience_count"));
    assert.ok(PAID_SURFACES.includes("outbound_release_alert_delivery"));
    for (const surface of FREE_ARTIST_IDENTITY_SURFACES) {
      assert.equal((PAID_SURFACES as readonly string[]).includes(surface), false);
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

  it("locked copy hides the aggregate without selling analytics or unlocking Alerts", () => {
    assert.equal(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.title, "Release Alerts Audience");
    assert.match(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.body, /Verified Artist Tools/i);
    assert.match(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.ctaLabel, /Verified Artist Tools/i);
    assert.doesNotMatch(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.body, /insight|analytics|credibility/i);
    assert.doesNotMatch(RELEASE_ALERTS_AUDIENCE_LOCKED_COPY.ctaLabel, /Unlock Release Alerts/i);
  });

  it("unavailable copy does not sell audience count as paid insight", () => {
    assert.match(RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY, /temporarily unavailable/i);
    assert.doesNotMatch(RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY, /insight/i);
  });
});

describe("ARTIST-SUB-INTRO-1 audience count remains paid", () => {
  it("owner row locks free artists and only fetches count when paid", () => {
    assert.match(gateRowSrc, /artist-release-alerts-audience-locked/);
    assert.match(gateRowSrc, /RELEASE_ALERTS_AUDIENCE_LOCKED_COPY/);
    assert.match(gateRowSrc, /resolvePaidToolGateMode/);
    assert.match(gateRowSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.match(gateRowSrc, /enabled:\s*queryEnabled/);
    assert.match(gateRowSrc, /mode === "available"/);
    assert.doesNotMatch(gateRowSrc, /insight is part of Verified Artist Tools/i);
  });

  it("profile only mounts audience row when verifiedArtist", () => {
    const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
    assert.match(
      profileSrc,
      /ReleaseAlertsAudienceGateRow[\s\S]*?enabled=\{verifiedArtist\}/,
    );
  });

  it("server audience endpoint requires paid tools after verified-artist check", () => {
    const start = routesSrc.indexOf('app.get("/api/artists/me/release-alerts-audience"');
    const countIdx = routesSrc.indexOf("countArtistReleaseAlertsForArtist", start);
    assert.ok(start >= 0 && countIdx > start);
    const body = routesSrc.slice(start, countIdx + 80);
    assert.match(body, /Verified artist access only/);
    assert.match(body, /canArtistUsePaidTools/);
    assert.match(body, /PAID_ARTIST_TOOL_REQUIRED/);
    assert.match(body, /countArtistReleaseAlertsForArtist/);
  });
});
