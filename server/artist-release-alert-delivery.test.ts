import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArtistSubscriptionSnapshot } from "./subscription-status-domain";
import {
  canArtistDeliverReleaseAlerts,
  isReleaseAlertDeliveryEnabledForSnapshot,
  parseServerAppBuildChannel,
  resolveServerSubscriptionEnvironment,
  subscriptionEnvironmentForServerBuildChannel,
} from "./artist-release-alert-delivery";

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

describe("server subscription environment selection", () => {
  it("maps local → sandbox and testflight/production → production", () => {
    assert.equal(subscriptionEnvironmentForServerBuildChannel("local").environment, "sandbox");
    assert.equal(subscriptionEnvironmentForServerBuildChannel("testflight").environment, "production");
    assert.equal(subscriptionEnvironmentForServerBuildChannel("production").environment, "production");
    assert.equal(subscriptionEnvironmentForServerBuildChannel(null).environment, null);
  });

  it("prefers APP_BUILD_CHANNEL over VITE_APP_BUILD_CHANNEL", () => {
    assert.equal(
      resolveServerSubscriptionEnvironment({
        APP_BUILD_CHANNEL: "production",
        VITE_APP_BUILD_CHANNEL: "local",
      } as NodeJS.ProcessEnv).environment,
      "production",
    );
    assert.equal(
      resolveServerSubscriptionEnvironment({
        VITE_APP_BUILD_CHANNEL: "local",
      } as NodeJS.ProcessEnv).environment,
      "sandbox",
    );
    assert.equal(
      resolveServerSubscriptionEnvironment({
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv).environment,
      "production",
    );
    assert.equal(
      resolveServerSubscriptionEnvironment({
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv).environment,
      "sandbox",
    );
    assert.equal(
      resolveServerSubscriptionEnvironment({} as NodeJS.ProcessEnv).environment,
      null,
    );
    assert.equal(parseServerAppBuildChannel("LOCAL"), "local");
  });
});

describe("isReleaseAlertDeliveryEnabledForSnapshot", () => {
  it("active fresh entitlement → true", () => {
    assert.equal(isReleaseAlertDeliveryEnabledForSnapshot(snapshotFixture(), now), true);
  });

  it("cancelled but paid-through → true", () => {
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(
        snapshotFixture({ willRenew: false, unsubscribeDetected: true }),
        now,
      ),
      true,
    );
  });

  it("valid grace period → true", () => {
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(
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

  it("never subscribed / missing → false", () => {
    assert.equal(isReleaseAlertDeliveryEnabledForSnapshot(null, now), false);
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(
        snapshotFixture({
          productIdentifier: null,
          store: null,
          ownershipType: null,
          storeSubscriptionIdentifier: null,
          isEntitlementActive: false,
          willRenew: null,
          originalPurchasedAt: null,
          latestPurchasedAt: null,
          expiresAt: null,
        }),
        now,
      ),
      false,
    );
  });

  it("expired → false", () => {
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(
        snapshotFixture({
          isEntitlementActive: false,
          expiresAt: new Date("2026-07-10T12:00:00.000Z"),
        }),
        now,
      ),
      false,
    );
  });

  it("refunded → false", () => {
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(snapshotFixture({ isRefunded: true }), now),
      false,
    );
  });

  it("revoked → false", () => {
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(snapshotFixture({ isRevoked: true }), now),
      false,
    );
  });

  it("billing issue outside grace → false", () => {
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(
        snapshotFixture({
          hasBillingIssue: true,
          isInGracePeriod: false,
          isEntitlementActive: false,
        }),
        now,
      ),
      false,
    );
  });

  it("stale → false", () => {
    assert.equal(
      isReleaseAlertDeliveryEnabledForSnapshot(
        snapshotFixture(),
        new Date("2026-07-22T12:00:00.000Z"),
      ),
      false,
    );
  });
});

describe("canArtistDeliverReleaseAlerts", () => {
  it("uses selected environment only (sandbox cannot enable production delivery)", async () => {
    const sandboxActive = snapshotFixture({ providerEnvironment: "sandbox" });
    const result = await canArtistDeliverReleaseAlerts(ARTIST_ID, {
      getSnapshotsForUser: async () => ({
        sandbox: sandboxActive,
        production: null,
      }),
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(result, false);
  });

  it("production active enables delivery when production is selected", async () => {
    const result = await canArtistDeliverReleaseAlerts(ARTIST_ID, {
      getSnapshotsForUser: async () => ({
        sandbox: null,
        production: snapshotFixture(),
      }),
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(result, true);
  });

  it("lookup throw fails closed", async () => {
    const result = await canArtistDeliverReleaseAlerts(ARTIST_ID, {
      getSnapshotsForUser: async () => {
        throw new Error("DB_DOWN");
      },
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(result, false);
  });

  it("missing environment fails closed", async () => {
    const result = await canArtistDeliverReleaseAlerts(ARTIST_ID, {
      getSnapshotsForUser: async () => ({
        sandbox: snapshotFixture({ providerEnvironment: "sandbox" }),
        production: snapshotFixture(),
      }),
      resolveEnvironment: () => ({ environment: null, reason: "missing" }),
      now: () => now,
    });
    assert.equal(result, false);
  });
});
