import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ArtistSubscriptionSnapshot } from "./subscription-status-domain";
import { getReleaseCreationCapacity } from "./release-creation-capacity";
import { FREE_RELEASE_LIMIT } from "./release-creation-limit";

const ARTIST = "00000000-0000-4000-8000-0000000000c1";
const NOW = new Date("2026-08-01T12:00:00.000Z");

function fakePool(used: number): Pool {
  return {
    query: async () => ({ rows: [{ c: used }] }),
  } as unknown as Pool;
}

function paidSnapshot(): ArtistSubscriptionSnapshot {
  return {
    id: randomUUID(),
    userId: ARTIST,
    provider: "revenuecat",
    providerEnvironment: "sandbox",
    providerAppUserId: ARTIST,
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: "dubhub_artist_monthly",
    store: "app_store",
    ownershipType: null,
    storeSubscriptionIdentifier: "txn",
    isEntitlementActive: true,
    willRenew: true,
    hasBillingIssue: false,
    isInGracePeriod: false,
    isRefunded: false,
    isRevoked: false,
    unsubscribeDetected: false,
    originalPurchasedAt: new Date("2026-07-01T12:00:00.000Z"),
    latestPurchasedAt: new Date("2026-07-15T12:00:00.000Z"),
    expiresAt: new Date("2026-08-31T12:00:00.000Z"),
    providerEventAt: NOW,
    lastWebhookAt: null,
    lastRestReconciledAt: null,
    lastSuccessfulVerificationAt: NOW,
    staleAfterAt: new Date("2026-08-02T12:00:00.000Z"),
    rawProviderPayload: null,
    overrideType: null,
    overrideStartsAt: null,
    overrideEndsAt: null,
    overrideReason: null,
    overrideActor: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("getReleaseCreationCapacity", () => {
  it("free with 0 used → can create, remaining 2", async () => {
    const view = await getReleaseCreationCapacity(ARTIST, {
      pool: fakePool(0),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.deepEqual(view, {
      unlimited: false,
      used: 0,
      limit: FREE_RELEASE_LIMIT,
      remaining: 2,
      canCreate: true,
    });
  });

  it("free with 1 used → can create, remaining 1", async () => {
    const view = await getReleaseCreationCapacity(ARTIST, {
      pool: fakePool(1),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.equal(view.canCreate, true);
    assert.equal(view.remaining, 1);
    assert.equal(view.unlimited, false);
  });

  it("free with 2 used → cannot create", async () => {
    const view = await getReleaseCreationCapacity(ARTIST, {
      pool: fakePool(2),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: true,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.deepEqual(view, {
      unlimited: false,
      used: 2,
      limit: FREE_RELEASE_LIMIT,
      remaining: 0,
      canCreate: false,
    });
  });

  it("paid → unlimited even with used >= limit", async () => {
    const view = await getReleaseCreationCapacity(ARTIST, {
      pool: fakePool(5),
      getSnapshotsForUser: async () => ({
        sandbox: paidSnapshot(),
        production: null,
      }),
      now: () => NOW,
      enforcementEnabled: true,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.equal(view.unlimited, true);
    assert.equal(view.canCreate, true);
    assert.equal(view.used, 5);
  });

  it("enforcement disabled → canCreate true even at limit", async () => {
    const view = await getReleaseCreationCapacity(ARTIST, {
      pool: fakePool(2),
      getSnapshotsForUser: async () => ({ sandbox: null, production: null }),
      now: () => NOW,
      enforcementEnabled: false,
      resolveEnvironment: () => ({ environment: "sandbox", reason: "test" }),
    });
    assert.equal(view.canCreate, true);
    assert.equal(view.used, 2);
    assert.equal(view.unlimited, false);
  });
});
