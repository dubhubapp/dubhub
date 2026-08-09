/**
 * Pure RevenueCat v1 subscriber → artist_subscription_snapshots candidates.
 * Splits sandbox vs production using each subscription/non-subscription is_sandbox.
 * Never grants access on malformed/ambiguous data (throws).
 */

import {
  DEFAULT_ENTITLEMENT_IDENTIFIER,
  SUBSCRIPTION_CLOCK_SKEW_MS,
  SUBSCRIPTION_PROVIDER,
  type SubscriptionEnvironment,
} from "./subscription-status-domain";
import type {
  RevenueCatExpiresDateField,
  RevenueCatV1Entitlement,
  RevenueCatV1NonSubscription,
  RevenueCatV1SubscriberResponse,
  RevenueCatV1Subscription,
} from "./revenuecat-rest-client";

/**
 * Freshness TTL for REST-reconciled snapshots.
 * Domain freshness compares now >= stale_after_at; this is the writer-side window.
 */
export const SUBSCRIPTION_SNAPSHOT_FRESHNESS_TTL_MS = 24 * 60 * 60 * 1000;

export class RevenueCatSubscriberMapError extends Error {
  readonly code: "ambiguous" | "insufficient" | "invalid_input";

  constructor(code: RevenueCatSubscriberMapError["code"], message: string) {
    super(message);
    this.name = "RevenueCatSubscriberMapError";
    this.code = code;
  }
}

export type ArtistSubscriptionSnapshotWrite = {
  userId: string;
  provider: typeof SUBSCRIPTION_PROVIDER;
  providerEnvironment: SubscriptionEnvironment;
  providerAppUserId: string;
  entitlementIdentifier: string;
  productIdentifier: string | null;
  store: string | null;
  ownershipType: string | null;
  storeSubscriptionIdentifier: string | null;
  isEntitlementActive: boolean;
  willRenew: boolean | null;
  hasBillingIssue: boolean;
  isInGracePeriod: boolean;
  isRefunded: boolean;
  /**
   * REST v1 has no explicit revocation flag on subscriber entitlements/subscriptions.
   * This slice never invents revocation from absence; always false unless a future
   * provider field justifies a documented rule.
   */
  isRevoked: boolean;
  unsubscribeDetected: boolean;
  originalPurchasedAt: Date | null;
  latestPurchasedAt: Date | null;
  expiresAt: Date | null;
  providerEventAt: Date | null;
  lastWebhookAt: null;
  lastRestReconciledAt: Date;
  lastSuccessfulVerificationAt: Date;
  staleAfterAt: Date;
  /** Minimised: never store full subscriber JSON. */
  rawProviderPayload: {
    source: "revenuecat_v1_rest";
    requestDate: string;
    environment: SubscriptionEnvironment;
    productIdentifier: string | null;
    store: string | null;
  } | null;
};

export type RevenueCatMappedSnapshots = {
  sandbox: ArtistSubscriptionSnapshotWrite;
  production: ArtistSubscriptionSnapshotWrite;
};

function parseDate(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFutureOrSkew(value: Date | null, now: Date): boolean {
  if (!value) return false;
  return value.getTime() > now.getTime() - SUBSCRIPTION_CLOCK_SKEW_MS;
}

function accessWindowEnd(
  expiresAt: Date | null,
  graceEndsAt: Date | null,
): Date | null {
  if (expiresAt && graceEndsAt) {
    return graceEndsAt.getTime() > expiresAt.getTime() ? graceEndsAt : expiresAt;
  }
  return graceEndsAt ?? expiresAt;
}

type EnvProductFacts = {
  productIdentifier: string;
  subscription: RevenueCatV1Subscription | null;
  nonSubscription: RevenueCatV1NonSubscription | null;
  store: string | null;
};

type EntitlementExpiryResolution = {
  /** Explicit JSON null on entitlement.expires_date — lifetime candidate. */
  lifetimeNullExpiry: boolean;
  /** Parsed datetime when kind is datetime; otherwise null. */
  entitlementExpiresAt: Date | null;
  /**
   * False when expires_date was omitted — never treat as lifetime or timed
   * entitlement access from the entitlement object.
   */
  entitlementExpiryPresent: boolean;
};

function resolveEntitlementExpiresDate(
  field: RevenueCatExpiresDateField,
): EntitlementExpiryResolution {
  switch (field.kind) {
    case "omitted":
      return {
        lifetimeNullExpiry: false,
        entitlementExpiresAt: null,
        entitlementExpiryPresent: false,
      };
    case "null":
      return {
        lifetimeNullExpiry: true,
        entitlementExpiresAt: null,
        entitlementExpiryPresent: true,
      };
    case "datetime": {
      const entitlementExpiresAt = parseDate(field.iso);
      if (!entitlementExpiresAt) {
        throw new RevenueCatSubscriberMapError(
          "insufficient",
          "entitlement expires_date datetime is malformed",
        );
      }
      return {
        lifetimeNullExpiry: false,
        entitlementExpiresAt,
        entitlementExpiryPresent: true,
      };
    }
    default: {
      const _exhaustive: never = field;
      void _exhaustive;
      throw new RevenueCatSubscriberMapError(
        "insufficient",
        "entitlement expires_date is unrecognized",
      );
    }
  }
}

function collectEnvProducts(
  subscriber: RevenueCatV1SubscriberResponse["subscriber"],
  environment: SubscriptionEnvironment,
): Map<string, EnvProductFacts> {
  const wantSandbox = environment === "sandbox";
  const map = new Map<string, EnvProductFacts>();

  for (const [productIdentifier, subscription] of Object.entries(
    subscriber.subscriptions,
  )) {
    if (subscription.is_sandbox !== wantSandbox) continue;
    map.set(productIdentifier, {
      productIdentifier,
      subscription,
      nonSubscription: null,
      store: subscription.store,
    });
  }

  for (const [productIdentifier, purchases] of Object.entries(
    subscriber.non_subscriptions,
  )) {
    const matching = purchases.filter((p) => p.is_sandbox === wantSandbox);
    if (matching.length === 0) continue;
    // Deterministic: latest purchase_date wins.
    const sorted = [...matching].sort((a, b) => {
      const aTime = parseDate(a.purchase_date)?.getTime() ?? 0;
      const bTime = parseDate(b.purchase_date)?.getTime() ?? 0;
      return bTime - aTime;
    });
    const nonSubscription = sorted[0]!;
    const existing = map.get(productIdentifier);
    if (existing?.subscription) {
      // Prefer subscription facts when both exist for the same product id.
      continue;
    }
    map.set(productIdentifier, {
      productIdentifier,
      subscription: null,
      nonSubscription,
      store: nonSubscription.store,
    });
  }

  return map;
}

function relevanceTimestamp(facts: EnvProductFacts): number {
  const sub = facts.subscription;
  if (sub) {
    return (
      parseDate(sub.expires_date)?.getTime() ??
      parseDate(sub.purchase_date)?.getTime() ??
      parseDate(sub.original_purchase_date)?.getTime() ??
      0
    );
  }
  return parseDate(facts.nonSubscription?.purchase_date)?.getTime() ?? 0;
}

function pickLatestEnvProduct(
  products: Map<string, EnvProductFacts>,
): EnvProductFacts | null {
  const values = [...products.values()];
  if (values.length === 0) return null;
  values.sort((a, b) => {
    const diff = relevanceTimestamp(b) - relevanceTimestamp(a);
    if (diff !== 0) return diff;
    return a.productIdentifier.localeCompare(b.productIdentifier);
  });
  return values[0] ?? null;
}

function deriveWillRenew(
  subscription: RevenueCatV1Subscription | null,
  isRefunded: boolean,
  now: Date,
): boolean | null {
  if (!subscription) {
    // Non-subscription / lifetime products do not renew.
    return false;
  }
  if (isRefunded) return false;
  if (subscription.unsubscribe_detected_at != null) return false;

  const expiresAt = parseDate(subscription.expires_date);
  const graceEndsAt = parseDate(subscription.grace_period_expires_date);
  const windowEnd = accessWindowEnd(expiresAt, graceEndsAt);
  if (windowEnd && !isFutureOrSkew(windowEnd, now)) {
    return false;
  }
  return true;
}

function buildEmptyEnvironmentSnapshot(args: {
  userId: string;
  environment: SubscriptionEnvironment;
  now: Date;
  requestDate: string;
}): ArtistSubscriptionSnapshotWrite {
  const staleAfterAt = new Date(
    args.now.getTime() + SUBSCRIPTION_SNAPSHOT_FRESHNESS_TTL_MS,
  );
  return {
    userId: args.userId,
    provider: SUBSCRIPTION_PROVIDER,
    providerEnvironment: args.environment,
    providerAppUserId: args.userId,
    entitlementIdentifier: DEFAULT_ENTITLEMENT_IDENTIFIER,
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
    providerEventAt: parseDate(args.requestDate),
    lastWebhookAt: null,
    lastRestReconciledAt: args.now,
    lastSuccessfulVerificationAt: args.now,
    staleAfterAt,
    rawProviderPayload: {
      source: "revenuecat_v1_rest",
      requestDate: args.requestDate,
      environment: args.environment,
      productIdentifier: null,
      store: null,
    },
  };
}

function mapEnvProductToSnapshot(args: {
  userId: string;
  environment: SubscriptionEnvironment;
  now: Date;
  requestDate: string;
  entitlementExpiresAt: Date | null;
  entitlementPurchaseAt: Date | null;
  entitlementPresent: boolean;
  lifetimeNullExpiry: boolean;
  entitlementExpiryPresent: boolean;
  facts: EnvProductFacts;
}): ArtistSubscriptionSnapshotWrite {
  const sub = args.facts.subscription;
  const nonSub = args.facts.nonSubscription;
  const isRefunded = sub?.refunded_at != null;
  const unsubscribeDetected = sub?.unsubscribe_detected_at != null;
  const hasBillingIssue = sub?.billing_issues_detected_at != null;
  const graceEndsAt = parseDate(sub?.grace_period_expires_date) ?? null;
  const isInGracePeriod = isFutureOrSkew(graceEndsAt, args.now);

  const store =
    sub?.store ??
    nonSub?.store ??
    args.facts.store;

  // Test Store must never be classified as production — enforced by is_sandbox
  // filtering before this function. Belt: reject test_store in production.
  if (
    args.environment === "production" &&
    typeof store === "string" &&
    store.toLowerCase() === "test_store"
  ) {
    throw new RevenueCatSubscriberMapError(
      "insufficient",
      "test_store product appeared in production environment mapping",
    );
  }

  // Lifetime: only explicit entitlement null expiry with linked same-env product.
  // Do not invent an expiry date.
  let expiresAt: Date | null = null;
  if (args.entitlementPresent && args.lifetimeNullExpiry) {
    expiresAt = null;
  } else if (args.entitlementPresent && args.entitlementExpiryPresent) {
    expiresAt =
      args.entitlementExpiresAt ??
      parseDate(sub?.expires_date) ??
      null;
  } else if (!args.entitlementPresent) {
    expiresAt = args.entitlementExpiresAt ?? parseDate(sub?.expires_date) ?? null;
  } else {
    // Entitlement present but expires_date omitted — fail closed: no entitlement
    // access window from the entitlement object.
    expiresAt = null;
  }

  let isEntitlementActive = false;
  if (args.entitlementPresent && !isRefunded) {
    if (args.lifetimeNullExpiry && args.entitlementExpiryPresent) {
      // Require authoritative store for lifetime candidacy at map time.
      if (typeof store === "string" && store.trim().length > 0) {
        isEntitlementActive = true;
      }
    } else if (args.entitlementExpiryPresent && expiresAt) {
      isEntitlementActive = isFutureOrSkew(expiresAt, args.now) || isInGracePeriod;
    }
  }

  // Lifetime and non-subscription purchases never renew. Finite subscriptions
  // (including finite promotional) keep deriveWillRenew.
  const willRenew = args.lifetimeNullExpiry
    ? false
    : deriveWillRenew(sub, isRefunded, args.now);

  // Promotional lifetime must land production only (is_sandbox false on product).
  // Test Store lifetime must land sandbox only (is_sandbox true). Already enforced
  // by collectEnvProducts; belt-check contradictory lifetime stores.
  if (args.lifetimeNullExpiry && isEntitlementActive && typeof store === "string") {
    const normalized = store.toLowerCase();
    if (normalized === "promotional" && args.environment !== "production") {
      isEntitlementActive = false;
    }
    if (normalized === "test_store" && args.environment !== "sandbox") {
      isEntitlementActive = false;
    }
  }

  const staleAfterAt = new Date(
    args.now.getTime() + SUBSCRIPTION_SNAPSHOT_FRESHNESS_TTL_MS,
  );

  return {
    userId: args.userId,
    provider: SUBSCRIPTION_PROVIDER,
    providerEnvironment: args.environment,
    providerAppUserId: args.userId,
    entitlementIdentifier: DEFAULT_ENTITLEMENT_IDENTIFIER,
    productIdentifier: args.facts.productIdentifier,
    store,
    ownershipType: sub?.ownership_type ?? null,
    storeSubscriptionIdentifier: sub?.store_transaction_id ?? nonSub?.id ?? null,
    isEntitlementActive,
    willRenew,
    hasBillingIssue,
    isInGracePeriod,
    isRefunded,
    isRevoked: false,
    unsubscribeDetected,
    originalPurchasedAt:
      parseDate(sub?.original_purchase_date) ??
      parseDate(nonSub?.purchase_date) ??
      args.entitlementPurchaseAt,
    latestPurchasedAt:
      parseDate(sub?.purchase_date) ??
      parseDate(nonSub?.purchase_date) ??
      args.entitlementPurchaseAt,
    expiresAt,
    providerEventAt: parseDate(args.requestDate),
    lastWebhookAt: null,
    lastRestReconciledAt: args.now,
    lastSuccessfulVerificationAt: args.now,
    staleAfterAt,
    rawProviderPayload: {
      source: "revenuecat_v1_rest",
      requestDate: args.requestDate,
      environment: args.environment,
      productIdentifier: args.facts.productIdentifier,
      store,
    },
  };
}

function mapLinkedEntitlement(args: {
  userId: string;
  environment: SubscriptionEnvironment;
  now: Date;
  requestDate: string;
  entitlement: RevenueCatV1Entitlement;
  facts: EnvProductFacts;
}): ArtistSubscriptionSnapshotWrite {
  const expiry = resolveEntitlementExpiresDate(args.entitlement.expires_date);

  return mapEnvProductToSnapshot({
    userId: args.userId,
    environment: args.environment,
    now: args.now,
    requestDate: args.requestDate,
    entitlementExpiresAt: expiry.entitlementExpiresAt,
    entitlementPurchaseAt: parseDate(args.entitlement.purchase_date),
    entitlementPresent: true,
    lifetimeNullExpiry: expiry.lifetimeNullExpiry,
    entitlementExpiryPresent: expiry.entitlementExpiryPresent,
    facts: args.facts,
  });
}

function mapOneEnvironment(args: {
  userId: string;
  environment: SubscriptionEnvironment;
  response: RevenueCatV1SubscriberResponse;
  entitlementIdentifier: string;
  now: Date;
}): ArtistSubscriptionSnapshotWrite {
  const { subscriber, request_date: requestDate } = args.response;
  const envProducts = collectEnvProducts(subscriber, args.environment);
  const entitlement = subscriber.entitlements[args.entitlementIdentifier];

  if (entitlement) {
    const productId = entitlement.product_identifier?.trim();
    if (!productId) {
      throw new RevenueCatSubscriberMapError(
        "insufficient",
        "entitlement missing product_identifier",
      );
    }

    const linked = envProducts.get(productId) ?? null;
    if (linked) {
      return mapLinkedEntitlement({
        userId: args.userId,
        environment: args.environment,
        now: args.now,
        requestDate,
        entitlement,
        facts: linked,
      });
    }

    // Entitlement exists but product lives only in the other environment.
    // Do not copy facts across environments. If this env has other history,
    // use historical mapping without treating the foreign entitlement as active.
    if (envProducts.size === 0) {
      return buildEmptyEnvironmentSnapshot({
        userId: args.userId,
        environment: args.environment,
        now: args.now,
        requestDate,
      });
    }
  }

  if (envProducts.size === 0) {
    return buildEmptyEnvironmentSnapshot({
      userId: args.userId,
      environment: args.environment,
      now: args.now,
      requestDate,
    });
  }

  // Historical path: entitlement absent (or not linked in this env) but env has
  // purchase history. Prefer entitlement product if present in map; else latest.
  let historical: EnvProductFacts | null = null;
  if (entitlement?.product_identifier && envProducts.has(entitlement.product_identifier)) {
    historical = envProducts.get(entitlement.product_identifier) ?? null;
  } else if (envProducts.size === 1) {
    historical = pickLatestEnvProduct(envProducts);
  } else if (!entitlement) {
    // Multiple products and no entitlement — ambiguous which maps to tooling.
    throw new RevenueCatSubscriberMapError(
      "ambiguous",
      `multiple ${args.environment} products without entitlement linkage`,
    );
  } else {
    historical = pickLatestEnvProduct(envProducts);
  }

  if (!historical) {
    return buildEmptyEnvironmentSnapshot({
      userId: args.userId,
      environment: args.environment,
      now: args.now,
      requestDate,
    });
  }

  return mapEnvProductToSnapshot({
    userId: args.userId,
    environment: args.environment,
    now: args.now,
    requestDate,
    entitlementExpiresAt: parseDate(historical.subscription?.expires_date),
    entitlementPurchaseAt:
      parseDate(historical.subscription?.purchase_date) ??
      parseDate(historical.nonSubscription?.purchase_date),
    entitlementPresent: false,
    lifetimeNullExpiry: false,
    entitlementExpiryPresent: historical.subscription?.expires_date != null,
    facts: historical,
  });
}

/**
 * Map one RC v1 subscriber response into sandbox + production snapshot writes.
 */
export function mapRevenueCatSubscriberToSnapshots(args: {
  response: RevenueCatV1SubscriberResponse;
  userId: string;
  now: Date;
  entitlementIdentifier?: string;
}): RevenueCatMappedSnapshots {
  const userId = String(args.userId ?? "").trim();
  if (!userId) {
    throw new RevenueCatSubscriberMapError("invalid_input", "userId is required");
  }
  if (!args.response?.subscriber) {
    throw new RevenueCatSubscriberMapError("invalid_input", "subscriber response required");
  }

  const entitlementIdentifier =
    args.entitlementIdentifier ?? DEFAULT_ENTITLEMENT_IDENTIFIER;

  return {
    sandbox: mapOneEnvironment({
      userId,
      environment: "sandbox",
      response: args.response,
      entitlementIdentifier,
      now: args.now,
    }),
    production: mapOneEnvironment({
      userId,
      environment: "production",
      response: args.response,
      entitlementIdentifier,
      now: args.now,
    }),
  };
}
