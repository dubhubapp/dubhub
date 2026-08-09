/**
 * Production RevenueCat restore for Verified Artist Tools.
 * Same reconcile path as purchase. Does not quarantine or log out identity.
 */

import { Purchases } from "@revenuecat/purchases-capacitor";
import type { QueryClient } from "@tanstack/react-query";
import { RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS } from "./revenuecat-constants";
import {
  assertRevenueCatPurchaseApisEnabled,
  getRevenueCatIdentityDebugSnapshot,
} from "./revenuecat-identity";
import {
  classifyRevenueCatPurchaseError,
  parsePurchaseEntitlementDiagnostic,
  type ServerSubscriptionSyncDiagnostic,
} from "./revenuecat-purchase-parse";
import { syncSubscriptionAfterRevenueCatSuccess } from "./subscription-sync";

export type VerifiedArtistToolsRestoreOutcome =
  | "success"
  | "nothing_to_restore"
  | "user_cancelled"
  | "purchase_pending"
  | "store_error"
  | "stale_identity"
  | "apis_disabled";

export type VerifiedArtistToolsRestoreReport = {
  outcome: VerifiedArtistToolsRestoreOutcome;
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

export type RestoreVerifiedArtistToolsOptions = {
  queryClient?: QueryClient | null;
  syncAfterSuccess?: typeof syncSubscriptionAfterRevenueCatSuccess;
  /** After native restore resolves, before server sync. */
  onBeforeServerSync?: () => void;
};

function emptyReport(
  overrides: Partial<VerifiedArtistToolsRestoreReport> = {},
): VerifiedArtistToolsRestoreReport {
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

export async function restoreVerifiedArtistToolsPurchases(
  options: RestoreVerifiedArtistToolsOptions = {},
): Promise<VerifiedArtistToolsRestoreReport> {
  const startedGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;

  try {
    assertRevenueCatPurchaseApisEnabled();
  } catch (error) {
    return emptyReport({
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
      return emptyReport({
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

    // Native restore returned — UI may show verifying before server reconcile.
    if (entitlement.outcome === "success") {
      options.onBeforeServerSync?.();
    }

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

    if (entitlement.outcome !== "success") {
      return emptyReport({
        outcome: "nothing_to_restore",
        entitlementActive: entitlement.entitlementActive,
        expirationDate: entitlement.expirationDate,
        willRenew: entitlement.willRenew,
        productIdentifier: entitlement.productIdentifier,
        message: entitlement.message,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: true,
        serverSync,
      });
    }

    return emptyReport({
      outcome: "success",
      entitlementActive: true,
      expirationDate: entitlement.expirationDate,
      willRenew: entitlement.willRenew,
      productIdentifier: entitlement.productIdentifier,
      message: sync.verificationPending ? sync.message ?? null : null,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
      serverSync,
    });
  } catch (error) {
    const currentGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGeneration !== startedGeneration) {
      return emptyReport({
        outcome: "stale_identity",
        message: `identity_generation_changed:started_${startedGeneration}:current_${currentGeneration}`,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: false,
      });
    }
    const classified = classifyRevenueCatPurchaseError(error);
    return emptyReport({
      outcome: classified.outcome,
      message: classified.message,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }
}
