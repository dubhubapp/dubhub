/**
 * Client subscription status types, canonical parser, and TanStack Query key.
 * Server snapshots are authoritative; CustomerInfo must not grant access.
 */

import {
  getAppBuildChannelFromEnv,
  selectAuthoritativeSubscriptionEnvironment,
  withAuthoritativeSubscriptionSelection,
  type AuthoritativeSubscriptionStatusView,
  type SubscriptionEnvironmentSelection,
} from "./subscription-environment";

export const SUBSCRIPTION_STATUS_QUERY_KEY = [
  "/api/user/subscription-status",
] as const;

export type SubscriptionEnvironmentStatusView = {
  state: string;
  freshness: string;
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

/** Canonical backend shape for GET status and POST refresh success bodies. */
export type UserSubscriptionStatusResponse = {
  account: {
    userId: string;
    accountType: string;
    verifiedArtist: boolean;
    subscriptionSubject: boolean;
  };
  provider: string;
  environments: {
    production: SubscriptionEnvironmentStatusView;
    sandbox: SubscriptionEnvironmentStatusView;
  };
};

export type {
  AuthoritativeSubscriptionStatusView,
  SubscriptionEnvironmentSelection,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate one environment view. Nullable commerce fields may be null.
 * Does not accept wrapper envelopes.
 */
export function parseSubscriptionEnvironmentStatusView(
  value: unknown,
): SubscriptionEnvironmentStatusView | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.state !== "string") return null;
  if (typeof value.freshness !== "string") return null;
  if (typeof value.hasPaidToolAccess !== "boolean") return null;
  if (typeof value.irreversibleActionsAllowed !== "boolean") return null;
  if (typeof value.entitlementIdentifier !== "string") return null;
  if (typeof value.billingIssue !== "boolean") return null;
  if (typeof value.gracePeriod !== "boolean") return null;

  // Nullable fields: accept null or the declared type; reject wrong types.
  const nullableString = (v: unknown): v is string | null =>
    v === null || typeof v === "string";
  const nullableBoolean = (v: unknown): v is boolean | null =>
    v === null || typeof v === "boolean";

  if (!nullableString(value.accessThrough)) return null;
  if (!nullableString(value.productIdentifier)) return null;
  if (!nullableBoolean(value.willRenew)) return null;
  if (!nullableString(value.expiresAt)) return null;
  if (!nullableString(value.lastVerifiedAt)) return null;
  if (!nullableString(value.updatedAt)) return null;

  return {
    state: value.state,
    freshness: value.freshness,
    hasPaidToolAccess: value.hasPaidToolAccess,
    irreversibleActionsAllowed: value.irreversibleActionsAllowed,
    accessThrough: value.accessThrough,
    entitlementIdentifier: value.entitlementIdentifier,
    productIdentifier: value.productIdentifier,
    willRenew: value.willRenew,
    billingIssue: value.billingIssue,
    gracePeriod: value.gracePeriod,
    expiresAt: value.expiresAt,
    lastVerifiedAt: value.lastVerifiedAt,
    updatedAt: value.updatedAt,
  };
}

/**
 * Parse GET /api/user/subscription-status or POST refresh success JSON
 * into the canonical status type. Rejects wrappers like `{ data: ... }`.
 */
export function parseSubscriptionStatusResponse(
  payload: unknown,
): UserSubscriptionStatusResponse | null {
  if (!isPlainObject(payload)) return null;
  // Reject common wrappers — unwrapping is not done here or in the selector.
  if ("data" in payload && !("environments" in payload)) return null;
  if ("result" in payload && !("environments" in payload)) return null;
  if ("status" in payload && !("environments" in payload) && !("account" in payload)) {
    return null;
  }

  if (!isPlainObject(payload.account)) return null;
  if (typeof payload.provider !== "string") return null;
  if (!isPlainObject(payload.environments)) return null;

  const account = payload.account;
  if (typeof account.userId !== "string") return null;
  if (typeof account.accountType !== "string") return null;
  if (typeof account.verifiedArtist !== "boolean") return null;
  if (typeof account.subscriptionSubject !== "boolean") return null;

  const production = parseSubscriptionEnvironmentStatusView(
    payload.environments.production,
  );
  const sandbox = parseSubscriptionEnvironmentStatusView(
    payload.environments.sandbox,
  );
  if (!production || !sandbox) return null;

  return {
    account: {
      userId: account.userId,
      accountType: account.accountType,
      verifiedArtist: account.verifiedArtist,
      subscriptionSubject: account.subscriptionSubject,
    },
    provider: payload.provider,
    environments: { production, sandbox },
  };
}

export async function fetchUserSubscriptionStatus(): Promise<UserSubscriptionStatusResponse> {
  const { apiRequest } = await import("./queryClient");
  const res = await apiRequest("GET", "/api/user/subscription-status");
  const json: unknown = await res.json();
  const parsed = parseSubscriptionStatusResponse(json);
  if (!parsed) {
    throw new Error("Invalid subscription-status response shape");
  }
  return parsed;
}

/**
 * Derive authoritative selection for consumers (e.g. paid-tool gates).
 */
export function getAuthoritativeSubscriptionStatus(
  status: UserSubscriptionStatusResponse | null | undefined,
  buildChannel = getAppBuildChannelFromEnv(),
): AuthoritativeSubscriptionStatusView | null {
  if (!status) return null;
  return withAuthoritativeSubscriptionSelection(status, buildChannel);
}

export function selectSubscriptionEnvironmentFromStatus(
  status: UserSubscriptionStatusResponse | null | undefined,
  buildChannel = getAppBuildChannelFromEnv(),
): SubscriptionEnvironmentSelection {
  return selectAuthoritativeSubscriptionEnvironment(status, buildChannel);
}
