import type { InferSelectModel } from "drizzle-orm";
import type { artistSubscriptionSnapshots } from "@shared/schema";

export const SUBSCRIPTION_PROVIDER = "revenuecat" as const;
export const SUBSCRIPTION_ENVIRONMENTS = ["production", "sandbox"] as const;
export const SUBSCRIPTION_LIFECYCLE_STATES = [
  "never_subscribed",
  "active",
  "cancelled_but_active_until_expiry",
  "grace_period",
  "billing_issue",
  "expired",
  "refunded",
  "revoked",
  "stale",
  "unknown",
] as const;
export const SUBSCRIPTION_OVERRIDE_TYPES = [
  "beta_active",
  "force_active",
  "force_inactive",
] as const;
export const DEFAULT_ENTITLEMENT_IDENTIFIER = "verified_artist_tools" as const;
export const SUBSCRIPTION_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type SubscriptionProvider = typeof SUBSCRIPTION_PROVIDER;
export type SubscriptionEnvironment = (typeof SUBSCRIPTION_ENVIRONMENTS)[number];
export type SubscriptionLifecycleState = (typeof SUBSCRIPTION_LIFECYCLE_STATES)[number];
export type SubscriptionOverrideType = (typeof SUBSCRIPTION_OVERRIDE_TYPES)[number];
export type SnapshotFreshness = "never_subscribed" | "fresh" | "stale" | "unknown";

export type ArtistSubscriptionSnapshot = InferSelectModel<typeof artistSubscriptionSnapshots>;

export type EffectivePaidAccess = {
  hasPaidToolAccess: boolean;
  accessThrough: string | null;
  source: "none" | "provider" | "override";
};

export type SubscriptionStatusView = {
  state: SubscriptionLifecycleState;
  freshness: SnapshotFreshness;
  hasPaidToolAccess: boolean;
  irreversibleActionsAllowed: boolean;
  accessThrough: string | null;
  entitlementIdentifier: string;
  productIdentifier: string | null;
  willRenew: boolean | null;
  billingIssue: boolean;
  gracePeriod: boolean;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  updatedAt: string | null;
};

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
}

function isRecognizedOverrideType(
  value: string | null | undefined,
): value is SubscriptionOverrideType {
  return (
    value === "beta_active" || value === "force_active" || value === "force_inactive"
  );
}

function isOverrideActive(
  snapshot: ArtistSubscriptionSnapshot,
  now: Date,
): SubscriptionOverrideType | null {
  if (!isRecognizedOverrideType(snapshot.overrideType)) return null;
  const startsAt = parseDate(snapshot.overrideStartsAt);
  if (!startsAt) return null;
  const endsAt = parseDate(snapshot.overrideEndsAt);
  if (endsAt && endsAt.getTime() < startsAt.getTime()) return null;
  if (now.getTime() < startsAt.getTime()) return null;
  if (endsAt && now.getTime() >= endsAt.getTime()) return null;
  return snapshot.overrideType;
}

function hasFutureAccessWindow(
  value: Date | string | null | undefined,
  now: Date,
): boolean {
  const parsed = parseDate(value);
  if (!parsed) return false;
  return parsed.getTime() > now.getTime() - SUBSCRIPTION_CLOCK_SKEW_MS;
}

function hasRequiredTimingFacts(snapshot: ArtistSubscriptionSnapshot): boolean {
  const lastVerifiedAt = parseDate(snapshot.lastSuccessfulVerificationAt);
  const staleAfterAt = parseDate(snapshot.staleAfterAt);
  if (!lastVerifiedAt || !staleAfterAt) return false;
  if (staleAfterAt.getTime() < lastVerifiedAt.getTime()) return false;

  const expiryRequired =
    snapshot.isEntitlementActive ||
    snapshot.unsubscribeDetected ||
    snapshot.isInGracePeriod;

  if (expiryRequired && !parseDate(snapshot.expiresAt)) {
    return false;
  }

  return true;
}

export function getSnapshotFreshness(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date,
): SnapshotFreshness {
  if (!snapshot) return "never_subscribed";
  const lastVerifiedAt = parseDate(snapshot.lastSuccessfulVerificationAt);
  const staleAfterAt = parseDate(snapshot.staleAfterAt);
  if (!lastVerifiedAt || !staleAfterAt) return "unknown";
  if (staleAfterAt.getTime() < lastVerifiedAt.getTime()) return "unknown";
  if (now.getTime() >= staleAfterAt.getTime()) return "stale";
  return "fresh";
}

export function mapProviderSnapshotToLifecycle(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date,
): SubscriptionLifecycleState {
  if (!snapshot) return "never_subscribed";
  if (!hasRequiredTimingFacts(snapshot)) return "unknown";

  const freshness = getSnapshotFreshness(snapshot, now);
  if (freshness === "unknown") return "unknown";
  if (freshness === "stale") return "stale";

  if (snapshot.isRevoked) return "revoked";
  if (snapshot.isRefunded) return "refunded";
  if (snapshot.isInGracePeriod) return "grace_period";
  if (snapshot.hasBillingIssue) return "billing_issue";

  const renewalDisabled =
    snapshot.unsubscribeDetected || snapshot.willRenew === false;
  if (
    snapshot.isEntitlementActive &&
    renewalDisabled &&
    hasFutureAccessWindow(snapshot.expiresAt, now)
  ) {
    return "cancelled_but_active_until_expiry";
  }

  if (
    snapshot.isEntitlementActive &&
    snapshot.willRenew !== false &&
    hasFutureAccessWindow(snapshot.expiresAt, now)
  ) {
    return "active";
  }

  if (parseDate(snapshot.expiresAt) && !hasFutureAccessWindow(snapshot.expiresAt, now)) {
    return "expired";
  }

  return "unknown";
}

function getBasePaidAccessFromLifecycle(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  lifecycle: SubscriptionLifecycleState,
  now: Date,
): EffectivePaidAccess {
  if (!snapshot) {
    return {
      hasPaidToolAccess: false,
      accessThrough: null,
      source: "none",
    };
  }

  const expiresAt = toIsoString(snapshot.expiresAt);
  switch (lifecycle) {
    case "active":
    case "cancelled_but_active_until_expiry":
    case "grace_period":
      return {
        hasPaidToolAccess: hasFutureAccessWindow(snapshot.expiresAt, now),
        accessThrough: expiresAt,
        source: "provider",
      };
    default:
      return {
        hasPaidToolAccess: false,
        accessThrough: null,
        source: "none",
      };
  }
}

export function applySubscriptionOverride(
  baseAccess: EffectivePaidAccess,
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date,
): EffectivePaidAccess {
  if (!snapshot) return baseAccess;
  const activeOverride = isOverrideActive(snapshot, now);
  if (!activeOverride) return baseAccess;

  if (activeOverride === "force_inactive") {
    return {
      hasPaidToolAccess: false,
      accessThrough: null,
      source: "override",
    };
  }

  if (baseAccess.hasPaidToolAccess) {
    return baseAccess;
  }

  return {
    hasPaidToolAccess: true,
    accessThrough: toIsoString(snapshot.overrideEndsAt),
    source: "override",
  };
}

export function getEffectivePaidAccess(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date,
): EffectivePaidAccess {
  const lifecycle = mapProviderSnapshotToLifecycle(snapshot, now);
  const baseAccess = getBasePaidAccessFromLifecycle(snapshot, lifecycle, now);
  return applySubscriptionOverride(baseAccess, snapshot, now);
}

export function canPerformIrreversiblePaidAction(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date,
): boolean {
  const lifecycle = mapProviderSnapshotToLifecycle(snapshot, now);
  const freshness = getSnapshotFreshness(snapshot, now);
  const effectiveAccess = getEffectivePaidAccess(snapshot, now);

  if (!effectiveAccess.hasPaidToolAccess) return false;
  if (freshness !== "fresh") return false;
  if (
    lifecycle !== "active" &&
    lifecycle !== "cancelled_but_active_until_expiry" &&
    lifecycle !== "grace_period"
  ) {
    return false;
  }
  if (snapshot?.isRefunded || snapshot?.isRevoked) return false;
  if (effectiveAccess.accessThrough && !hasFutureAccessWindow(effectiveAccess.accessThrough, now)) {
    return false;
  }
  return true;
}

export function buildSubscriptionStatusView(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date,
  entitlementIdentifier = DEFAULT_ENTITLEMENT_IDENTIFIER,
): SubscriptionStatusView {
  const state = mapProviderSnapshotToLifecycle(snapshot, now);
  const freshness = getSnapshotFreshness(snapshot, now);
  const effectiveAccess = getEffectivePaidAccess(snapshot, now);

  return {
    state,
    freshness,
    hasPaidToolAccess: effectiveAccess.hasPaidToolAccess,
    irreversibleActionsAllowed: canPerformIrreversiblePaidAction(snapshot, now),
    accessThrough: effectiveAccess.accessThrough,
    entitlementIdentifier:
      snapshot?.entitlementIdentifier?.trim() || entitlementIdentifier,
    productIdentifier: snapshot?.productIdentifier ?? null,
    willRenew: snapshot?.willRenew ?? null,
    billingIssue: snapshot?.hasBillingIssue ?? false,
    gracePeriod: snapshot?.isInGracePeriod ?? false,
    expiresAt: toIsoString(snapshot?.expiresAt),
    lastVerifiedAt: toIsoString(snapshot?.lastSuccessfulVerificationAt),
    updatedAt: toIsoString(snapshot?.updatedAt),
  };
}
