import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArtistSubscriptionSnapshot } from "./subscription-status-domain";
import {
  canArtistUsePaidTools,
  isPaidToolAccessEnabledForSnapshot,
  parseServerAppBuildChannel,
  resolveServerSubscriptionEnvironment,
  subscriptionEnvironmentForServerBuildChannel,
} from "./artist-paid-tool-access";

const ARTIST_ID = "00000000-0000-0000-0000-0000000000aa";
const now = new Date("2026-07-20T12:00:00.000Z");

function snapshotFixture(
  overrides: Partial<ArtistSubscriptionSnapshot> = {},
): ArtistSubscriptionSnapshot {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: ARTIST_ID,
    provider: "revenuecat",
    providerEnvironment: "production",
    providerAppUserId: ARTIST_ID,
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: "dubhub_artist_monthly",
    store: "app_store",
    ownershipType: null,
    storeSubscriptionIdentifier: "orig_txn_1",
    isEntitlementActive: true,
    willRenew: true,
    hasBillingIssue: false,
    isInGracePeriod: false,
    isRefunded: false,
    isRevoked: false,
    unsubscribeDetected: false,
    originalPurchasedAt: new Date("2026-07-01T12:00:00.000Z"),
    latestPurchasedAt: new Date("2026-07-15T12:00:00.000Z"),
    expiresAt: new Date("2026-07-31T12:00:00.000Z"),
    providerEventAt: new Date("2026-07-20T09:00:00.000Z"),
    lastWebhookAt: null,
    lastRestReconciledAt: null,
    lastSuccessfulVerificationAt: new Date("2026-07-20T10:00:00.000Z"),
    staleAfterAt: new Date("2026-07-21T10:00:00.000Z"),
    rawProviderPayload: null,
    overrideType: null,
    overrideStartsAt: null,
    overrideEndsAt: null,
    overrideReason: null,
    overrideActor: null,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:05:00.000Z"),
    ...overrides,
  };
}

describe("artist-paid-tool-access environment selection", () => {
  it("maps local → sandbox and testflight/production → production", () => {
    assert.equal(subscriptionEnvironmentForServerBuildChannel("local").environment, "sandbox");
    assert.equal(subscriptionEnvironmentForServerBuildChannel("testflight").environment, "production");
    assert.equal(subscriptionEnvironmentForServerBuildChannel("production").environment, "production");
    assert.equal(parseServerAppBuildChannel("LOCAL"), "local");
  });

  it("prefers APP_BUILD_CHANNEL over VITE_APP_BUILD_CHANNEL", () => {
    assert.equal(
      resolveServerSubscriptionEnvironment({
        APP_BUILD_CHANNEL: "production",
        VITE_APP_BUILD_CHANNEL: "local",
      } as NodeJS.ProcessEnv).environment,
      "production",
    );
  });
});

describe("isPaidToolAccessEnabledForSnapshot", () => {
  it("active fresh → true", () => {
    assert.equal(isPaidToolAccessEnabledForSnapshot(snapshotFixture(), now), true);
  });

  it("cancelled but paid-through → true", () => {
    assert.equal(
      isPaidToolAccessEnabledForSnapshot(
        snapshotFixture({ willRenew: false, unsubscribeDetected: true }),
        now,
      ),
      true,
    );
  });

  it("valid grace → true", () => {
    assert.equal(
      isPaidToolAccessEnabledForSnapshot(
        snapshotFixture({
          isInGracePeriod: true,
          hasBillingIssue: true,
          isEntitlementActive: false,
        }),
        now,
      ),
      true,
    );
  });

  it("lifetime candidate → true", () => {
    assert.equal(
      isPaidToolAccessEnabledForSnapshot(
        snapshotFixture({
          productIdentifier: "rc_promo_verified_artist_tools_lifetime",
          expiresAt: null,
          store: "promotional",
        }),
        now,
      ),
      true,
    );
  });

  it("force_active override on unpaid base → true", () => {
    assert.equal(
      isPaidToolAccessEnabledForSnapshot(
        snapshotFixture({
          isEntitlementActive: false,
          expiresAt: new Date("2026-07-01T12:00:00.000Z"),
          productIdentifier: null,
          store: null,
          storeSubscriptionIdentifier: null,
          originalPurchasedAt: null,
          latestPurchasedAt: null,
          overrideType: "force_active",
          overrideStartsAt: new Date("2026-07-01T00:00:00.000Z"),
          overrideEndsAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
        now,
      ),
      true,
    );
  });

  it("expired / refunded / revoked / billing outside grace / stale / missing → false", () => {
    assert.equal(
      isPaidToolAccessEnabledForSnapshot(
        snapshotFixture({
          isEntitlementActive: false,
          expiresAt: new Date("2026-07-10T12:00:00.000Z"),
        }),
        now,
      ),
      false,
    );
    assert.equal(isPaidToolAccessEnabledForSnapshot(snapshotFixture({ isRefunded: true }), now), false);
    assert.equal(isPaidToolAccessEnabledForSnapshot(snapshotFixture({ isRevoked: true }), now), false);
    assert.equal(
      isPaidToolAccessEnabledForSnapshot(
        snapshotFixture({
          hasBillingIssue: true,
          isInGracePeriod: false,
          isEntitlementActive: false,
        }),
        now,
      ),
      false,
    );
    assert.equal(
      isPaidToolAccessEnabledForSnapshot(snapshotFixture(), new Date("2026-07-22T12:00:00.000Z")),
      false,
    );
    assert.equal(isPaidToolAccessEnabledForSnapshot(null, now), false);
  });
});

describe("canArtistUsePaidTools", () => {
  it("uses selected environment only", async () => {
    const result = await canArtistUsePaidTools(ARTIST_ID, {
      getSnapshotsForUser: async () => ({
        sandbox: snapshotFixture({ providerEnvironment: "sandbox" }),
        production: null,
      }),
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(result, false);
  });

  it("repository failure fails closed", async () => {
    const result = await canArtistUsePaidTools(ARTIST_ID, {
      getSnapshotsForUser: async () => {
        throw new Error("DB_DOWN");
      },
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(result, false);
  });
});
