import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseRevenueCatV1SubscriberResponse,
  RevenueCatRestError,
  fetchRevenueCatSubscriber,
} from "./revenuecat-rest-client";
import {
  mapRevenueCatSubscriberToSnapshots,
  RevenueCatSubscriberMapError,
} from "./revenuecat-subscriber-map";
import {
  buildSubscriptionStatusView,
  mapProviderSnapshotToLifecycle,
} from "./subscription-status-domain";
import type { ArtistSubscriptionSnapshot } from "@shared/schema";

const USER_ID = "00000000-0000-0000-0000-000000000111";
const NOW = new Date("2026-07-20T12:00:00.000Z");
const PRODUCT_MONTHLY = "dubhub_artist_monthly";

function baseSubscription(overrides: Record<string, unknown> = {}) {
  return {
    auto_resume_date: null,
    billing_issues_detected_at: null,
    expires_date: "2026-07-31T12:00:00Z",
    grace_period_expires_date: null,
    is_sandbox: true,
    original_purchase_date: "2026-07-01T12:00:00Z",
    ownership_type: "PURCHASED",
    period_type: "normal",
    purchase_date: "2026-07-15T12:00:00Z",
    refunded_at: null,
    store: "test_store",
    store_transaction_id: "txn_sandbox_1",
    unsubscribe_detected_at: null,
    ...overrides,
  };
}

function subscriberResponse(args: {
  entitlements?: Record<string, unknown>;
  subscriptions?: Record<string, unknown>;
  non_subscriptions?: Record<string, unknown>;
}) {
  return parseRevenueCatV1SubscriberResponse({
    request_date: "2026-07-20T12:00:00Z",
    request_date_ms: NOW.getTime(),
    subscriber: {
      entitlements: args.entitlements ?? {},
      subscriptions: args.subscriptions ?? {},
      non_subscriptions: args.non_subscriptions ?? {},
      original_app_user_id: USER_ID,
    },
  });
}

function asDomainSnapshot(
  write: ReturnType<typeof mapRevenueCatSubscriberToSnapshots>["sandbox"],
  overrides: Partial<ArtistSubscriptionSnapshot> = {},
): ArtistSubscriptionSnapshot {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: write.userId,
    provider: write.provider,
    providerEnvironment: write.providerEnvironment,
    providerAppUserId: write.providerAppUserId,
    entitlementIdentifier: write.entitlementIdentifier,
    productIdentifier: write.productIdentifier,
    store: write.store,
    ownershipType: write.ownershipType,
    storeSubscriptionIdentifier: write.storeSubscriptionIdentifier,
    isEntitlementActive: write.isEntitlementActive,
    willRenew: write.willRenew,
    hasBillingIssue: write.hasBillingIssue,
    isInGracePeriod: write.isInGracePeriod,
    isRefunded: write.isRefunded,
    isRevoked: write.isRevoked,
    unsubscribeDetected: write.unsubscribeDetected,
    originalPurchasedAt: write.originalPurchasedAt,
    latestPurchasedAt: write.latestPurchasedAt,
    expiresAt: write.expiresAt,
    providerEventAt: write.providerEventAt,
    lastWebhookAt: write.lastWebhookAt,
    lastRestReconciledAt: write.lastRestReconciledAt,
    lastSuccessfulVerificationAt: write.lastSuccessfulVerificationAt,
    staleAfterAt: write.staleAfterAt,
    rawProviderPayload: write.rawProviderPayload,
    overrideType: null,
    overrideStartsAt: null,
    overrideEndsAt: null,
    overrideReason: null,
    overrideActor: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("parseRevenueCatV1SubscriberResponse", () => {
  it("accepts empty customer facts", () => {
    const parsed = subscriberResponse({});
    assert.deepEqual(parsed.subscriber.entitlements, {});
    assert.deepEqual(parsed.subscriber.subscriptions, {});
  });

  it("rejects malformed entitlements", () => {
    assert.throws(
      () =>
        parseRevenueCatV1SubscriberResponse({
          request_date: "2026-07-20T12:00:00Z",
          subscriber: {
            entitlements: { verified_artist_tools: { expires_date: null } },
            subscriptions: {},
            non_subscriptions: {},
          },
        }),
      (error: unknown) =>
        error instanceof RevenueCatRestError && error.code === "invalid_shape",
    );
  });
  it("preserves omitted vs explicit null expires_date", () => {
    const omitted = parseRevenueCatV1SubscriberResponse({
      request_date: "2026-07-20T12:00:00Z",
      subscriber: {
        entitlements: {
          verified_artist_tools: {
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {},
        non_subscriptions: {},
      },
    });
    assert.deepEqual(
      omitted.subscriber.entitlements.verified_artist_tools?.expires_date,
      { kind: "omitted" },
    );

    const explicitNull = parseRevenueCatV1SubscriberResponse({
      request_date: "2026-07-20T12:00:00Z",
      subscriber: {
        entitlements: {
          verified_artist_tools: {
            expires_date: null,
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {},
        non_subscriptions: {},
      },
    });
    assert.deepEqual(
      explicitNull.subscriber.entitlements.verified_artist_tools?.expires_date,
      { kind: "null" },
    );
  });

  it("rejects malformed entitlement expires_date", () => {
    assert.throws(
      () =>
        parseRevenueCatV1SubscriberResponse({
          request_date: "2026-07-20T12:00:00Z",
          subscriber: {
            entitlements: {
              verified_artist_tools: {
                expires_date: "not-a-date",
                product_identifier: PRODUCT_MONTHLY,
                purchase_date: "2026-07-15T12:00:00Z",
              },
            },
            subscriptions: {},
            non_subscriptions: {},
          },
        }),
      (error: unknown) =>
        error instanceof RevenueCatRestError && error.code === "invalid_shape",
    );
  });
});

describe("fetchRevenueCatSubscriber", () => {
  it("treats HTTP 201 empty customer as success", async () => {
    const response = await fetchRevenueCatSubscriber({
      appUserId: USER_ID,
      secretApiKey: "sk_test_dummy",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            request_date: "2026-07-20T12:00:00Z",
            subscriber: {
              entitlements: {},
              subscriptions: {},
              non_subscriptions: {},
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
    });
    assert.equal(Object.keys(response.subscriber.entitlements).length, 0);
  });

  it("fails closed on timeout without upsert side effects", async () => {
    await assert.rejects(
      () =>
        fetchRevenueCatSubscriber({
          appUserId: USER_ID,
          secretApiKey: "sk_test_dummy",
          timeoutMs: 5,
          fetchImpl: async (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
            }),
        }),
      (error: unknown) =>
        error instanceof RevenueCatRestError && error.code === "timeout",
    );
  });
});

describe("mapRevenueCatSubscriberToSnapshots", () => {
  it("maps active sandbox monthly; production inactive/empty", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-31T12:00:00Z",
            grace_period_expires_date: null,
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({ is_sandbox: true, store: "test_store" }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isEntitlementActive, true);
    assert.equal(mapped.sandbox.willRenew, true);
    assert.equal(mapped.sandbox.store, "test_store");
    assert.equal(mapped.sandbox.providerEnvironment, "sandbox");
    assert.equal(mapped.production.isEntitlementActive, false);
    assert.equal(mapped.production.productIdentifier, null);
    assert.equal(
      mapProviderSnapshotToLifecycle(asDomainSnapshot(mapped.sandbox), NOW),
      "active",
    );
    assert.equal(
      mapProviderSnapshotToLifecycle(asDomainSnapshot(mapped.production), NOW),
      "never_subscribed",
    );
    assert.equal(
      buildSubscriptionStatusView(asDomainSnapshot(mapped.production), NOW)
        .hasPaidToolAccess,
      false,
    );
  });

  it("maps active production monthly; sandbox inactive/empty", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-31T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: false,
            store: "app_store",
            store_transaction_id: "txn_prod_1",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.production.isEntitlementActive, true);
    assert.equal(mapped.production.store, "app_store");
    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(mapped.sandbox.productIdentifier, null);
  });

  it("keeps simultaneous sandbox and production histories isolated", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-31T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: true,
            store: "test_store",
            expires_date: "2026-07-31T12:00:00Z",
          }),
          dubhub_artist_monthly_prod: baseSubscription({
            is_sandbox: false,
            store: "app_store",
            expires_date: "2026-06-01T12:00:00Z",
            store_transaction_id: "txn_prod_old",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isEntitlementActive, true);
    assert.equal(mapped.sandbox.store, "test_store");
    assert.equal(mapped.production.isEntitlementActive, false);
    assert.equal(mapped.production.productIdentifier, "dubhub_artist_monthly_prod");
    assert.equal(mapped.production.store, "app_store");
  });

  it("maps expired subscription", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-10T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-01T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: true,
            expires_date: "2026-07-10T12:00:00Z",
            unsubscribe_detected_at: "2026-07-05T12:00:00Z",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(mapped.sandbox.willRenew, false);
    assert.equal(
      mapProviderSnapshotToLifecycle(asDomainSnapshot(mapped.sandbox), NOW),
      "expired",
    );
  });

  it("maps cancelled but access remains until expiry", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-31T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: false,
            store: "app_store",
            unsubscribe_detected_at: "2026-07-18T12:00:00Z",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.production.isEntitlementActive, true);
    assert.equal(mapped.production.willRenew, false);
    assert.equal(mapped.production.unsubscribeDetected, true);
    assert.equal(
      mapProviderSnapshotToLifecycle(asDomainSnapshot(mapped.production), NOW),
      "cancelled_but_active_until_expiry",
    );
  });

  it("maps grace period", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-19T12:00:00Z",
            grace_period_expires_date: "2026-07-25T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-01T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: true,
            expires_date: "2026-07-19T12:00:00Z",
            grace_period_expires_date: "2026-07-25T12:00:00Z",
            billing_issues_detected_at: "2026-07-19T12:05:00Z",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isInGracePeriod, true);
    assert.equal(mapped.sandbox.hasBillingIssue, true);
    assert.equal(
      mapProviderSnapshotToLifecycle(asDomainSnapshot(mapped.sandbox), NOW),
      "grace_period",
    );
  });

  it("maps billing issue without grace", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-10T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-01T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: true,
            expires_date: "2026-07-10T12:00:00Z",
            billing_issues_detected_at: "2026-07-10T12:05:00Z",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.hasBillingIssue, true);
    assert.equal(mapped.sandbox.isInGracePeriod, false);
    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(
      mapProviderSnapshotToLifecycle(asDomainSnapshot(mapped.sandbox), NOW),
      "billing_issue",
    );
  });

  it("maps refund", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-31T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: true,
            refunded_at: "2026-07-19T12:00:00Z",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isRefunded, true);
    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(mapped.sandbox.isRevoked, false);
    assert.equal(
      mapProviderSnapshotToLifecycle(asDomainSnapshot(mapped.sandbox), NOW),
      "refunded",
    );
  });

  it("maps no purchase history without granting access", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({}),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(mapped.production.isEntitlementActive, false);
    assert.equal(mapped.sandbox.productIdentifier, null);
    assert.equal(mapped.sandbox.expiresAt, null);
    assert.equal(mapped.sandbox.store, null);
    assert.ok(mapped.sandbox.lastSuccessfulVerificationAt);
    assert.ok(mapped.sandbox.staleAfterAt);

    const sandboxView = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.sandbox),
      NOW,
    );
    const productionView = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.production),
      NOW,
    );
    assert.equal(sandboxView.state, "never_subscribed");
    assert.equal(productionView.state, "never_subscribed");
    assert.equal(sandboxView.freshness, "fresh");
    assert.equal(productionView.freshness, "fresh");
    assert.equal(sandboxView.hasPaidToolAccess, false);
    assert.equal(productionView.hasPaidToolAccess, false);
  });

  it("maps production promotional forever grant to lifetime access", () => {
    const promoProduct = "rc_promo_verified_artist_tools_lifetime";
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: null,
            product_identifier: promoProduct,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [promoProduct]: {
            auto_resume_date: null,
            billing_issues_detected_at: null,
            expires_date: null,
            grace_period_expires_date: null,
            is_sandbox: false,
            original_purchase_date: "2026-07-15T12:00:00Z",
            ownership_type: "PURCHASED",
            period_type: "promotional",
            purchase_date: "2026-07-15T12:00:00Z",
            refunded_at: null,
            store: "promotional",
            store_transaction_id: "promo_txn_1",
            unsubscribe_detected_at: null,
          },
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.production.isEntitlementActive, true);
    assert.equal(mapped.production.expiresAt, null);
    assert.equal(mapped.production.willRenew, false);
    assert.equal(mapped.production.store, "promotional");
    assert.equal(mapped.production.productIdentifier, promoProduct);
    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(mapped.sandbox.productIdentifier, null);

    const productionView = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.production),
      NOW,
    );
    assert.equal(productionView.state, "active");
    assert.equal(productionView.hasPaidToolAccess, true);
    assert.equal(productionView.expiresAt, null);
    assert.equal(productionView.accessThrough, null);
    assert.equal(productionView.willRenew, false);
    assert.equal(productionView.irreversibleActionsAllowed, true);

    const sandboxView = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.sandbox),
      NOW,
    );
    assert.equal(sandboxView.hasPaidToolAccess, false);
    assert.equal(sandboxView.state, "never_subscribed");
  });

  it("maps sandbox Test Store lifetime without granting production access", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: null,
            product_identifier: "dubhub_artist_lifetime",
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        non_subscriptions: {
          dubhub_artist_lifetime: [
            {
              id: "nsub_1",
              is_sandbox: true,
              purchase_date: "2026-07-15T12:00:00Z",
              store: "test_store",
            },
          ],
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isEntitlementActive, true);
    assert.equal(mapped.sandbox.expiresAt, null);
    assert.equal(mapped.sandbox.willRenew, false);
    assert.equal(mapped.sandbox.store, "test_store");
    assert.equal(mapped.production.isEntitlementActive, false);
    assert.equal(mapped.production.productIdentifier, null);

    const sandboxView = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.sandbox),
      NOW,
    );
    assert.equal(sandboxView.state, "active");
    assert.equal(sandboxView.hasPaidToolAccess, true);
    assert.equal(sandboxView.expiresAt, null);
    assert.equal(sandboxView.accessThrough, null);

    const productionView = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.production),
      NOW,
    );
    assert.equal(productionView.hasPaidToolAccess, false);
    assert.equal(productionView.state, "never_subscribed");
  });

  it("does not grant lifetime when expires_date is omitted", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            product_identifier: "dubhub_artist_lifetime",
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        non_subscriptions: {
          dubhub_artist_lifetime: [
            {
              id: "nsub_1",
              is_sandbox: true,
              purchase_date: "2026-07-15T12:00:00Z",
              store: "test_store",
            },
          ],
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(mapped.sandbox.expiresAt, null);
    const view = buildSubscriptionStatusView(asDomainSnapshot(mapped.sandbox), NOW);
    assert.equal(view.hasPaidToolAccess, false);
    assert.notEqual(view.state, "active");
  });

  it("fails closed when entitlement product_identifier is empty", () => {
    assert.throws(
      () =>
        mapRevenueCatSubscriberToSnapshots({
          response: subscriberResponse({
            entitlements: {
              verified_artist_tools: {
                expires_date: null,
                product_identifier: "   ",
                purchase_date: "2026-07-15T12:00:00Z",
              },
            },
            non_subscriptions: {
              dubhub_artist_lifetime: [
                {
                  id: "nsub_1",
                  is_sandbox: true,
                  purchase_date: "2026-07-15T12:00:00Z",
                  store: "test_store",
                },
              ],
            },
          }),
          userId: USER_ID,
          now: NOW,
        }),
      (error: unknown) =>
        error instanceof RevenueCatSubscriberMapError && error.code === "insufficient",
    );
  });

  it("does not cross-copy promotional lifetime into sandbox", () => {
    const promoProduct = "rc_promo_verified_artist_tools_lifetime";
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: null,
            product_identifier: promoProduct,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [promoProduct]: {
            billing_issues_detected_at: null,
            expires_date: null,
            grace_period_expires_date: null,
            is_sandbox: false,
            original_purchase_date: "2026-07-15T12:00:00Z",
            purchase_date: "2026-07-15T12:00:00Z",
            refunded_at: null,
            store: "promotional",
            store_transaction_id: "promo_txn_1",
            unsubscribe_detected_at: null,
          },
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.production.isEntitlementActive, true);
    assert.equal(mapped.sandbox.isEntitlementActive, false);
    assert.equal(mapped.sandbox.store, null);
  });

  it("maps refunded lifetime without access", () => {
    const promoProduct = "rc_promo_verified_artist_tools_lifetime";
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: null,
            product_identifier: promoProduct,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [promoProduct]: {
            billing_issues_detected_at: null,
            expires_date: null,
            grace_period_expires_date: null,
            is_sandbox: false,
            original_purchase_date: "2026-07-15T12:00:00Z",
            purchase_date: "2026-07-15T12:00:00Z",
            refunded_at: "2026-07-19T12:00:00Z",
            store: "promotional",
            store_transaction_id: "promo_txn_1",
            unsubscribe_detected_at: null,
          },
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.production.isRefunded, true);
    assert.equal(mapped.production.isEntitlementActive, false);
    const view = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.production),
      NOW,
    );
    assert.equal(view.hasPaidToolAccess, false);
    assert.equal(view.state, "refunded");
  });

  it("maps finite promotional grant via timed access path", () => {
    const promoProduct = "rc_promo_verified_artist_tools_monthly";
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-31T12:00:00Z",
            product_identifier: promoProduct,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [promoProduct]: {
            billing_issues_detected_at: null,
            expires_date: "2026-07-31T12:00:00Z",
            grace_period_expires_date: null,
            is_sandbox: false,
            original_purchase_date: "2026-07-15T12:00:00Z",
            purchase_date: "2026-07-15T12:00:00Z",
            refunded_at: null,
            store: "promotional",
            store_transaction_id: "promo_txn_finite",
            unsubscribe_detected_at: null,
          },
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.production.isEntitlementActive, true);
    assert.equal(mapped.production.expiresAt?.toISOString(), "2026-07-31T12:00:00.000Z");
    assert.equal(mapped.production.store, "promotional");
    const view = buildSubscriptionStatusView(
      asDomainSnapshot(mapped.production),
      NOW,
    );
    assert.equal(view.hasPaidToolAccess, true);
    assert.equal(view.expiresAt, "2026-07-31T12:00:00.000Z");
    assert.ok(view.state === "active" || view.state === "cancelled_but_active_until_expiry");
  });

  it("maps annual production subscription unchanged", () => {
    const annual = "dubhub_artist_annual";
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2027-07-15T12:00:00Z",
            product_identifier: annual,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [annual]: baseSubscription({
            is_sandbox: false,
            store: "app_store",
            expires_date: "2027-07-15T12:00:00Z",
            store_transaction_id: "txn_annual_1",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.production.isEntitlementActive, true);
    assert.equal(mapped.production.willRenew, true);
    assert.equal(mapped.production.productIdentifier, annual);
    assert.equal(
      buildSubscriptionStatusView(asDomainSnapshot(mapped.production), NOW).state,
      "active",
    );
  });

  it("fails closed on ambiguous multi-product history without entitlement", () => {
    assert.throws(
      () =>
        mapRevenueCatSubscriberToSnapshots({
          response: subscriberResponse({
            subscriptions: {
              product_a: baseSubscription({ is_sandbox: true, store: "test_store" }),
              product_b: baseSubscription({
                is_sandbox: true,
                store: "test_store",
                purchase_date: "2026-07-16T12:00:00Z",
                store_transaction_id: "txn_2",
              }),
            },
          }),
          userId: USER_ID,
          now: NOW,
        }),
      (error: unknown) =>
        error instanceof RevenueCatSubscriberMapError && error.code === "ambiguous",
    );
  });

  it("never copies test_store into production", () => {
    const mapped = mapRevenueCatSubscriberToSnapshots({
      response: subscriberResponse({
        entitlements: {
          verified_artist_tools: {
            expires_date: "2026-07-31T12:00:00Z",
            product_identifier: PRODUCT_MONTHLY,
            purchase_date: "2026-07-15T12:00:00Z",
          },
        },
        subscriptions: {
          [PRODUCT_MONTHLY]: baseSubscription({
            is_sandbox: true,
            store: "test_store",
          }),
        },
      }),
      userId: USER_ID,
      now: NOW,
    });

    assert.equal(mapped.sandbox.store, "test_store");
    assert.notEqual(mapped.production.store, "test_store");
    assert.equal(mapped.production.isEntitlementActive, false);
  });
});
