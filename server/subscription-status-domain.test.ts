import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArtistSubscriptionSnapshot } from "./subscription-status-domain";
import {
  SUBSCRIPTION_CLOCK_SKEW_MS,
  buildSubscriptionStatusView,
  canPerformIrreversiblePaidAction,
  getEffectivePaidAccess,
  getSnapshotFreshness,
  mapProviderSnapshotToLifecycle,
} from "./subscription-status-domain";

function snapshotFixture(
  overrides: Partial<ArtistSubscriptionSnapshot> = {},
): ArtistSubscriptionSnapshot {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000111",
    provider: "revenuecat",
    providerEnvironment: "production",
    providerAppUserId: "00000000-0000-0000-0000-000000000111",
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

describe("subscription status domain", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");

  it("maps no row to never_subscribed", () => {
    assert.equal(mapProviderSnapshotToLifecycle(null, now), "never_subscribed");
    assert.equal(getSnapshotFreshness(null, now), "never_subscribed");
  });

  it("maps fresh verified-empty snapshot to never_subscribed without paid access", () => {
    const snapshot = snapshotFixture({
      productIdentifier: null,
      store: null,
      ownershipType: null,
      storeSubscriptionIdentifier: null,
      isEntitlementActive: false,
      willRenew: null,
      hasBillingIssue: false,
      isInGracePeriod: false,
      isRefunded: false,
      isRevoked: false,
      unsubscribeDetected: false,
      originalPurchasedAt: null,
      latestPurchasedAt: null,
      expiresAt: null,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "never_subscribed");
    assert.equal(getSnapshotFreshness(snapshot, now), "fresh");
    const view = buildSubscriptionStatusView(snapshot, now);
    assert.equal(view.state, "never_subscribed");
    assert.equal(view.freshness, "fresh");
    assert.equal(view.hasPaidToolAccess, false);
    assert.equal(view.irreversibleActionsAllowed, false);
    assert.equal(view.accessThrough, null);
    assert.equal(view.entitlementIdentifier, "verified_artist_tools");
    assert.equal(view.productIdentifier, null);
    assert.equal(view.willRenew, null);
    assert.equal(view.billingIssue, false);
    assert.equal(view.gracePeriod, false);
    assert.equal(view.expiresAt, null);
  });

  it("keeps inactive snapshot with product or purchase history as unknown", () => {
    const withProduct = snapshotFixture({
      isEntitlementActive: false,
      expiresAt: null,
      productIdentifier: "dubhub_artist_monthly",
    });
    assert.equal(mapProviderSnapshotToLifecycle(withProduct, now), "unknown");

    const withPurchaseHistory = snapshotFixture({
      isEntitlementActive: false,
      expiresAt: null,
      productIdentifier: null,
      store: null,
      storeSubscriptionIdentifier: null,
      originalPurchasedAt: new Date("2026-07-01T12:00:00.000Z"),
      latestPurchasedAt: new Date("2026-07-15T12:00:00.000Z"),
    });
    assert.equal(mapProviderSnapshotToLifecycle(withPurchaseHistory, now), "unknown");
  });

  it("maps fresh renewable active snapshot to active", () => {
    assert.equal(mapProviderSnapshotToLifecycle(snapshotFixture(), now), "active");
  });

  it("maps cancelled with future expiry to cancelled_but_active_until_expiry", () => {
    const snapshot = snapshotFixture({
      willRenew: false,
      unsubscribeDetected: true,
    });
    assert.equal(
      mapProviderSnapshotToLifecycle(snapshot, now),
      "cancelled_but_active_until_expiry",
    );
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, true);
  });

  it("maps cancelled after expiry to expired", () => {
    const snapshot = snapshotFixture({
      willRenew: false,
      unsubscribeDetected: true,
      isEntitlementActive: false,
      expiresAt: new Date("2026-07-20T11:54:59.999Z"),
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "expired");
  });

  it("maps confirmed grace period and allows access", () => {
    const snapshot = snapshotFixture({
      isInGracePeriod: true,
      willRenew: false,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "grace_period");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, true);
    assert.equal(canPerformIrreversiblePaidAction(snapshot, now), true);
  });

  it("maps billing issue without grace and denies paid mutation access", () => {
    const snapshot = snapshotFixture({
      isEntitlementActive: false,
      hasBillingIssue: true,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "billing_issue");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
  });

  it("maps refund with future expiry to refunded and denies access immediately", () => {
    const snapshot = snapshotFixture({
      isRefunded: true,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "refunded");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
    assert.equal(canPerformIrreversiblePaidAction(snapshot, now), false);
  });

  it("maps revocation with future expiry to revoked and denies access immediately", () => {
    const snapshot = snapshotFixture({
      isRevoked: true,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "revoked");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
    assert.equal(canPerformIrreversiblePaidAction(snapshot, now), false);
  });

  it("treats active null-expiry without store as unknown", () => {
    const snapshot = snapshotFixture({
      expiresAt: null,
      store: null,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "unknown");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
  });

  it("treats active null-expiry without product as unknown", () => {
    const snapshot = snapshotFixture({
      expiresAt: null,
      productIdentifier: null,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "unknown");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
  });

  it("maps fresh promotional lifetime snapshot to active paid access", () => {
    const snapshot = snapshotFixture({
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      store: "promotional",
      expiresAt: null,
      willRenew: false,
      isEntitlementActive: true,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "active");
    const access = getEffectivePaidAccess(snapshot, now);
    assert.equal(access.hasPaidToolAccess, true);
    assert.equal(access.accessThrough, null);
    const view = buildSubscriptionStatusView(snapshot, now);
    assert.equal(view.state, "active");
    assert.equal(view.hasPaidToolAccess, true);
    assert.equal(view.expiresAt, null);
    assert.equal(view.accessThrough, null);
    assert.equal(view.willRenew, false);
    assert.equal(view.irreversibleActionsAllowed, true);
  });

  it("maps sandbox Test Store lifetime snapshot to active paid access", () => {
    const snapshot = snapshotFixture({
      providerEnvironment: "sandbox",
      productIdentifier: "dubhub_artist_lifetime",
      store: "test_store",
      expiresAt: null,
      willRenew: false,
      isEntitlementActive: true,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "active");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, true);
  });

  it("denies lifetime access when refunded", () => {
    const snapshot = snapshotFixture({
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      store: "promotional",
      expiresAt: null,
      willRenew: false,
      isEntitlementActive: true,
      isRefunded: true,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "refunded");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
  });

  it("denies lifetime access when revoked", () => {
    const snapshot = snapshotFixture({
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      store: "promotional",
      expiresAt: null,
      willRenew: false,
      isEntitlementActive: true,
      isRevoked: true,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "revoked");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
  });

  it("denies lifetime access when stale", () => {
    const snapshot = snapshotFixture({
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      store: "promotional",
      expiresAt: null,
      willRenew: false,
      isEntitlementActive: true,
      staleAfterAt: new Date("2026-07-20T11:00:00.000Z"),
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "stale");
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
    assert.equal(canPerformIrreversiblePaidAction(snapshot, now), false);
  });

  it("treats existing row without verification metadata as unknown", () => {
    const snapshot = snapshotFixture({
      lastSuccessfulVerificationAt: null,
      staleAfterAt: null,
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "unknown");
    assert.equal(getSnapshotFreshness(snapshot, now), "unknown");
  });

  it("stays fresh immediately before stale_after_at", () => {
    const freshNow = new Date("2026-07-21T09:59:59.999Z");
    assert.equal(getSnapshotFreshness(snapshotFixture(), freshNow), "fresh");
  });

  it("becomes stale exactly at stale_after_at", () => {
    const staleNow = new Date("2026-07-21T10:00:00.000Z");
    assert.equal(getSnapshotFreshness(snapshotFixture(), staleNow), "stale");
    assert.equal(mapProviderSnapshotToLifecycle(snapshotFixture(), staleNow), "stale");
  });

  it("honors expiry boundary with skew tolerance", () => {
    const snapshot = snapshotFixture({
      expiresAt: new Date("2026-07-20T11:55:00.000Z"),
      staleAfterAt: new Date("2026-07-20T13:00:00.000Z"),
    });
    assert.equal(mapProviderSnapshotToLifecycle(snapshot, now), "expired");

    const withinSkewNow = new Date(
      snapshot.expiresAt!.getTime() + SUBSCRIPTION_CLOCK_SKEW_MS - 1,
    );
    const freshSnapshot = snapshotFixture({
      expiresAt: new Date("2026-07-20T12:00:00.000Z"),
      staleAfterAt: new Date("2026-07-20T13:00:00.000Z"),
    });
    assert.equal(
      getEffectivePaidAccess(freshSnapshot, withinSkewNow).hasPaidToolAccess,
      true,
    );
  });

  it("keeps cancelled access true through the paid-through date", () => {
    const snapshot = snapshotFixture({
      willRenew: false,
      unsubscribeDetected: true,
      staleAfterAt: new Date("2026-07-31T13:00:00.000Z"),
    });
    const beforeExpiry = new Date("2026-07-31T11:59:59.999Z");
    assert.equal(getEffectivePaidAccess(snapshot, beforeExpiry).hasPaidToolAccess, true);
  });

  it("turns expired access false after the paid-through date", () => {
    const snapshot = snapshotFixture({
      isEntitlementActive: false,
      expiresAt: new Date("2026-07-20T11:00:00.000Z"),
      staleAfterAt: new Date("2026-07-20T14:00:00.000Z"),
    });
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
  });

  it("fails closed for irreversible actions when stale", () => {
    const staleNow = new Date("2026-07-21T10:00:00.000Z");
    assert.equal(canPerformIrreversiblePaidAction(snapshotFixture(), staleNow), false);
  });

  it("fails closed for irreversible actions when unknown", () => {
    const snapshot = snapshotFixture({
      lastSuccessfulVerificationAt: null,
      staleAfterAt: null,
    });
    assert.equal(canPerformIrreversiblePaidAction(snapshot, now), false);
  });

  it("requires grace snapshots to be fresh for irreversible actions", () => {
    const snapshot = snapshotFixture({
      isInGracePeriod: true,
      staleAfterAt: new Date("2026-07-20T11:00:00.000Z"),
    });
    assert.equal(canPerformIrreversiblePaidAction(snapshot, now), false);
  });

  it("supports beta_active override only within window", () => {
    const beforeWindow = snapshotFixture({
      isEntitlementActive: false,
      expiresAt: null,
      overrideType: "beta_active",
      overrideStartsAt: new Date("2026-07-21T00:00:00.000Z"),
      overrideEndsAt: new Date("2026-07-22T00:00:00.000Z"),
    });
    assert.equal(getEffectivePaidAccess(beforeWindow, now).hasPaidToolAccess, false);

    const inWindow = snapshotFixture({
      isEntitlementActive: false,
      expiresAt: null,
      overrideType: "beta_active",
      overrideStartsAt: new Date("2026-07-20T00:00:00.000Z"),
      overrideEndsAt: new Date("2026-07-21T00:00:00.000Z"),
    });
    assert.equal(getEffectivePaidAccess(inWindow, now).hasPaidToolAccess, true);

    const afterWindow = snapshotFixture({
      isEntitlementActive: false,
      expiresAt: null,
      overrideType: "beta_active",
      overrideStartsAt: new Date("2026-07-19T00:00:00.000Z"),
      overrideEndsAt: new Date("2026-07-20T11:00:00.000Z"),
    });
    assert.equal(getEffectivePaidAccess(afterWindow, now).hasPaidToolAccess, false);
  });

  it("force_inactive suppresses valid provider access", () => {
    const snapshot = snapshotFixture({
      overrideType: "force_inactive",
      overrideStartsAt: new Date("2026-07-20T00:00:00.000Z"),
      overrideEndsAt: new Date("2026-07-21T00:00:00.000Z"),
    });
    assert.equal(getEffectivePaidAccess(snapshot, now).hasPaidToolAccess, false);
  });

  it("keeps sandbox and production evaluation isolated", () => {
    const production = buildSubscriptionStatusView(
      snapshotFixture({ providerEnvironment: "production", isEntitlementActive: false, expiresAt: null }),
      now,
    );
    const sandbox = buildSubscriptionStatusView(
      snapshotFixture({ providerEnvironment: "sandbox" }),
      now,
    );
    assert.equal(production.state, "unknown");
    assert.equal(sandbox.state, "active");
  });
});
