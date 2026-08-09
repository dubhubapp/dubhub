/**
 * DEV-only RevenueCat restorePurchases diagnostic + server subscription sync.
 * Same reconcile path as successful purchase. Not a production restore UI.
 */

import { Purchases } from "@revenuecat/purchases-capacitor";
import type { QueryClient } from "@tanstack/react-query";
import { RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS } from "./revenuecat-constants";
import {
  assertRevenueCatPurchaseApisEnabled,
  getRevenueCatIdentityDebugSnapshot,
  revenueCatIdentityDiagnosticsEnabled,
} from "./revenuecat-identity";
import {
  classifyRevenueCatPurchaseError,
  parsePurchaseEntitlementDiagnostic,
  type ServerSubscriptionSyncDiagnostic,
} from "./revenuecat-purchase-parse";
import { syncSubscriptionAfterRevenueCatSuccess } from "./subscription-sync";

export type RestorePurchasesDiagnosticOutcome =
  | "success"
  | "user_cancelled"
  | "purchase_pending"
  | "store_error"
  | "entitlement_missing"
  | "stale_identity"
  | "apis_disabled";

export type RestorePurchasesDiagnosticReport = {
  outcome: RestorePurchasesDiagnosticOutcome;
  entitlementIdentifier: typeof RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS;
  entitlementActive: boolean | null;
  expirationDate: string | null;
  willRenew: boolean | null;
  productIdentifier: string | null;
  message: string | null;
  identityGenerationStarted: number | null;
  identityGenerationMatched: boolean | null;
  serverSync: ServerSubscriptionSyncDiagnostic | null;
};

export type RestorePurchasesDiagnosticOptions = {
  queryClient?: QueryClient | null;
  syncAfterSuccess?: typeof syncSubscriptionAfterRevenueCatSuccess;
};

function emptyRestoreReport(
  overrides: Partial<RestorePurchasesDiagnosticReport> = {},
): RestorePurchasesDiagnosticReport {
  return {
    outcome: "store_error",
    entitlementIdentifier: RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
    entitlementActive: null,
    expirationDate: null,
    willRenew: null,
    productIdentifier: null,
    message: null,
    identityGenerationStarted: null,
    identityGenerationMatched: null,
    serverSync: null,
    ...overrides,
  };
}

/**
 * Call Purchases.restorePurchases(), then reconcile server subscription status.
 */
export async function restorePurchasesDiagnostic(
  options: RestorePurchasesDiagnosticOptions = {},
): Promise<RestorePurchasesDiagnosticReport> {
  if (!revenueCatIdentityDiagnosticsEnabled()) {
    return emptyRestoreReport({
      outcome: "apis_disabled",
      message: "revenuecat_diagnostics_disabled",
    });
  }

  const startedGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;

  try {
    assertRevenueCatPurchaseApisEnabled();
  } catch (error) {
    return emptyRestoreReport({
      outcome: "apis_disabled",
      message: error instanceof Error ? error.message : String(error),
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }

  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const currentGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGeneration !== startedGeneration) {
      return emptyRestoreReport({
        outcome: "stale_identity",
        message: `identity_generation_changed:started_${startedGeneration}:current_${currentGeneration}`,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: false,
      });
    }

    const entitlement = parsePurchaseEntitlementDiagnostic(
      customerInfo,
      null,
      RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
    );

    const syncFn = options.syncAfterSuccess ?? syncSubscriptionAfterRevenueCatSuccess;
    const sync = await syncFn({ queryClient: options.queryClient });
    const serverSync: ServerSubscriptionSyncDiagnostic = {
      verificationPending: sync.verificationPending,
      refreshOk: sync.refresh.ok,
      refreshHttpStatus: sync.refresh.httpStatus,
      refreshFailureReason: sync.refresh.failureReason,
      refreshLatencyMs: sync.refresh.latencyMs,
      message: sync.message,
    };

    return emptyRestoreReport({
      outcome: entitlement.outcome === "success" ? "success" : "entitlement_missing",
      entitlementActive: entitlement.entitlementActive,
      expirationDate: entitlement.expirationDate,
      willRenew: entitlement.willRenew,
      productIdentifier: entitlement.productIdentifier,
      message: sync.verificationPending
        ? sync.message ?? entitlement.message
        : entitlement.message,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
      serverSync,
    });
  } catch (error) {
    const currentGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGeneration !== startedGeneration) {
      return emptyRestoreReport({
        outcome: "stale_identity",
        message: `identity_generation_changed:started_${startedGeneration}:current_${currentGeneration}`,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: false,
      });
    }
    const classified = classifyRevenueCatPurchaseError(error);
    return emptyRestoreReport({
      outcome: classified.outcome,
      message: classified.message,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }
}
