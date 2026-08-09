import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectAuthoritativeSubscriptionEnvironment,
  subscriptionEnvironmentForBuildChannel,
  withAuthoritativeSubscriptionSelection,
} from "./subscription-environment";
import {
  parseSubscriptionStatusResponse,
  type SubscriptionEnvironmentStatusView,
  type UserSubscriptionStatusResponse,
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

describe("subscriptionEnvironmentForBuildChannel", () => {
  it("maps local → sandbox", () => {
    assert.deepEqual(subscriptionEnvironmentForBuildChannel("local"), {
      environment: "sandbox",
      reason: "local_sandbox",
    });
  });

  it("maps testflight and production → production", () => {
    assert.equal(
      subscriptionEnvironmentForBuildChannel("testflight").environment,
      "production",
    );
    assert.equal(
      subscriptionEnvironmentForBuildChannel("production").environment,
      "production",
    );
  });

  it("fails closed for missing channel", () => {
    assert.equal(subscriptionEnvironmentForBuildChannel(null).environment, null);
  });
});

describe("parseSubscriptionStatusResponse", () => {
  it("accepts valid raw GET response", () => {
    const raw = statusResponse({
      sandbox: { state: "active", hasPaidToolAccess: true, irreversibleActionsAllowed: true },
    });
    const parsed = parseSubscriptionStatusResponse(raw);
    assert.ok(parsed);
    assert.equal(parsed!.environments.sandbox.state, "active");
  });

  it("accepts valid POST refresh-shaped response with nullable fields", () => {
    const raw = statusResponse({
      production: {
        state: "never_subscribed",
        productIdentifier: null,
        willRenew: null,
        expiresAt: null,
        lastVerifiedAt: null,
      },
      sandbox: {
        state: "expired",
        hasPaidToolAccess: false,
        productIdentifier: "monthly",
        willRenew: false,
        expiresAt: "2026-07-01T00:00:00.000Z",
      },
    });
    assert.ok(parseSubscriptionStatusResponse(raw));
  });

  it("rejects wrapped { data: validStatus }", () => {
    const wrapped = { data: statusResponse({}) };
    assert.equal(parseSubscriptionStatusResponse(wrapped), null);
  });

  it("rejects missing environments", () => {
    assert.equal(
      parseSubscriptionStatusResponse({
        account: {
          userId: "u",
          accountType: "artist",
          verifiedArtist: true,
          subscriptionSubject: true,
        },
        provider: "revenuecat",
      }),
      null,
    );
  });
});

describe("selectAuthoritativeSubscriptionEnvironment", () => {
  it("valid raw GET response selects sandbox on local", () => {
    const raw = statusResponse({
      sandbox: { state: "active", hasPaidToolAccess: true, irreversibleActionsAllowed: true },
      production: { state: "never_subscribed", hasPaidToolAccess: false },
    });
    const parsed = parseSubscriptionStatusResponse(raw);
    const selected = selectAuthoritativeSubscriptionEnvironment(parsed, "local");
    assert.equal(selected.ok, true);
    assert.equal(selected.selectedEnvironment, "sandbox");
    assert.equal(selected.hasPaidToolAccess, true);
    assert.equal(selected.selectionReason, "local_sandbox");
  });

  it("valid POST refresh response selects sandbox on local", () => {
    const refreshBody = statusResponse({
      sandbox: { state: "active", hasPaidToolAccess: true, irreversibleActionsAllowed: true },
    });
    const parsed = parseSubscriptionStatusResponse(refreshBody);
    const selected = selectAuthoritativeSubscriptionEnvironment(parsed, "local");
    assert.equal(selected.selectedEnvironment, "sandbox");
    assert.equal(selected.hasPaidToolAccess, true);
  });

  it("wrapped { data: validStatus } is not accepted by selector path", () => {
    const wrapped = { data: statusResponse({ sandbox: { hasPaidToolAccess: true } }) } as never;
    assert.equal(parseSubscriptionStatusResponse(wrapped), null);
    const selected = selectAuthoritativeSubscriptionEnvironment(wrapped, "local");
    assert.equal(selected.ok, false);
    assert.equal(selected.selectionReason, "malformed_status_response");
  });

  it("null before query load → status_not_loaded, not malformed", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(null, "local");
    assert.equal(selected.ok, false);
    assert.equal(selected.selectedEnvironment, "sandbox");
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.selectionReason, "status_not_loaded");
  });

  it("local + sandbox active + production inactive → paid true", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        sandbox: { state: "active", hasPaidToolAccess: true, irreversibleActionsAllowed: true },
        production: { state: "never_subscribed", hasPaidToolAccess: false },
      }),
      "local",
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.selectedEnvironment, "sandbox");
    assert.equal(selected.hasPaidToolAccess, true);
    assert.equal(selected.state, "active");
    assert.equal(selected.selectionReason, "local_sandbox");
  });

  it("local + production active + sandbox inactive → paid false", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        production: { state: "active", hasPaidToolAccess: true, irreversibleActionsAllowed: true },
        sandbox: { state: "never_subscribed", hasPaidToolAccess: false },
      }),
      "local",
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.selectedEnvironment, "sandbox");
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.state, "never_subscribed");
  });

  it("production + production active + sandbox inactive → paid true", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        production: { state: "active", hasPaidToolAccess: true, irreversibleActionsAllowed: true },
        sandbox: { state: "never_subscribed", hasPaidToolAccess: false },
      }),
      "production",
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.selectedEnvironment, "production");
    assert.equal(selected.hasPaidToolAccess, true);
    assert.equal(selected.selectionReason, "production_production");
  });

  it("production + sandbox active + production inactive → paid false", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        sandbox: { state: "active", hasPaidToolAccess: true, irreversibleActionsAllowed: true },
        production: { state: "never_subscribed", hasPaidToolAccess: false },
      }),
      "production",
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.selectedEnvironment, "production");
    assert.equal(selected.hasPaidToolAccess, false);
  });

  it("testflight uses production even when sandbox is active", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        sandbox: { state: "active", hasPaidToolAccess: true },
        production: { state: "never_subscribed", hasPaidToolAccess: false },
      }),
      "testflight",
    );
    assert.equal(selected.selectedEnvironment, "production");
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.selectionReason, "testflight_production");
  });

  it("unknown build channel → fail closed", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        sandbox: { hasPaidToolAccess: true },
        production: { hasPaidToolAccess: true },
      }),
      "staging",
    );
    assert.equal(selected.ok, false);
    assert.equal(selected.selectedEnvironment, null);
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.selectionReason, "missing_or_invalid_build_channel");
  });

  it("missing build channel → fail closed", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        sandbox: { hasPaidToolAccess: true },
      }),
      null,
    );
    assert.equal(selected.ok, false);
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.selectionReason, "missing_or_invalid_build_channel");
  });

  it("missing selected environment → selected_environment_missing", () => {
    const malformed = {
      account: {
        userId: "u",
        accountType: "artist",
        verifiedArtist: true,
        subscriptionSubject: true,
      },
      provider: "revenuecat",
      environments: {
        production: envView({ hasPaidToolAccess: true }),
      },
    } as unknown as UserSubscriptionStatusResponse;

    const selected = selectAuthoritativeSubscriptionEnvironment(malformed, "local");
    assert.equal(selected.ok, false);
    assert.equal(selected.selectedEnvironment, "sandbox");
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.selectionReason, "selected_environment_missing");
  });

  it("both environments active → explicit channel still decides", () => {
    const status = statusResponse({
      sandbox: { state: "active", hasPaidToolAccess: true },
      production: { state: "active", hasPaidToolAccess: true },
    });
    const local = selectAuthoritativeSubscriptionEnvironment(status, "local");
    const prod = selectAuthoritativeSubscriptionEnvironment(status, "production");
    assert.equal(local.selectedEnvironment, "sandbox");
    assert.equal(prod.selectedEnvironment, "production");
    assert.equal(local.hasPaidToolAccess, true);
    assert.equal(prod.hasPaidToolAccess, true);
  });

  it("both environments inactive", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      statusResponse({
        sandbox: { state: "never_subscribed", hasPaidToolAccess: false },
        production: { state: "never_subscribed", hasPaidToolAccess: false },
      }),
      "local",
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.state, "never_subscribed");
  });

  it("malformed object without environments → malformed_status_response", () => {
    const selected = selectAuthoritativeSubscriptionEnvironment(
      { account: {}, provider: "revenuecat" } as never,
      "local",
    );
    assert.equal(selected.ok, false);
    assert.equal(selected.hasPaidToolAccess, false);
    assert.equal(selected.selectionReason, "malformed_status_response");
  });

  it("withAuthoritativeSubscriptionSelection exposes raw + selected", () => {
    const status = statusResponse({
      sandbox: { state: "active", hasPaidToolAccess: true },
      production: { state: "never_subscribed", hasPaidToolAccess: false },
    });
    const view = withAuthoritativeSubscriptionSelection(status, "local");
    assert.ok(view);
    assert.equal(view!.sandbox.hasPaidToolAccess, true);
    assert.equal(view!.production.hasPaidToolAccess, false);
    assert.equal(view!.selection.selectedEnvironment, "sandbox");
    assert.equal(view!.selection.hasPaidToolAccess, true);
  });
});
