/**
 * Production RevenueCat purchase for Verified Artist Tools (monthly or annual).
 * Reuses identity gates + error classification from diagnostics; not DEV-gated.
 */

import { Purchases, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import type { QueryClient } from "@tanstack/react-query";
import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";
import {
  assertRevenueCatPurchaseApisEnabled,
  getRevenueCatIdentityDebugSnapshot,
} from "./revenuecat-identity";
import {
  classifyRevenueCatPurchaseError,
  parsePurchaseEntitlementDiagnostic,
  type MonthlyPurchaseDiagnosticOutcome,
  type ServerSubscriptionSyncDiagnostic,
} from "./revenuecat-purchase-parse";
import { syncSubscriptionAfterRevenueCatSuccess } from "./subscription-sync";
import type { PaywallPackageKind, PaywallPackageOption } from "./verified-artist-tools-offerings";

export type VerifiedArtistToolsPurchaseOutcome = MonthlyPurchaseDiagnosticOutcome;

export type VerifiedArtistToolsPurchaseReport = {
  outcome: VerifiedArtistToolsPurchaseOutcome;
  packageKind: PaywallPackageKind | null;
  packageIdentifier:
    | typeof RC_PACKAGE_MONTHLY
    | typeof RC_PACKAGE_ANNUAL
    | null;
  offeringIdentifier: string | null;
  productIdentifier: string | null;
  entitlementIdentifier: typeof RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS;
  entitlementActive: boolean | null;
  expirationDate: string | null;
  willRenew: boolean | null;
  message: string | null;
  identityGenerationStarted: number | null;
  identityGenerationMatched: boolean | null;
  serverSync: ServerSubscriptionSyncDiagnostic | null;
};

export type PurchaseVerifiedArtistToolsOptions = {
  queryClient?: QueryClient | null;
  syncAfterSuccess?: typeof syncSubscriptionAfterRevenueCatSuccess;
  /**
   * Called after the native store purchase resolves successfully and before
   * server snapshot sync — for UI “Unlocking your tools…” presentation.
   */
  onBeforeServerSync?: () => void;
};

function emptyReport(
  overrides: Partial<VerifiedArtistToolsPurchaseReport> = {},
): VerifiedArtistToolsPurchaseReport {
  return {
    outcome: "store_error",
    packageKind: null,
    packageIdentifier: null,
    offeringIdentifier: null,
    productIdentifier: null,
    entitlementIdentifier: RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
    entitlementActive: null,
    expirationDate: null,
    willRenew: null,
    message: null,
    identityGenerationStarted: null,
    identityGenerationMatched: null,
    serverSync: null,
    ...overrides,
  };
}

async function attachServerSync(
  report: VerifiedArtistToolsPurchaseReport,
  options: PurchaseVerifiedArtistToolsOptions,
): Promise<VerifiedArtistToolsPurchaseReport> {
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
  return {
    ...report,
    serverSync,
    message: sync.verificationPending
      ? sync.message ?? report.message
      : report.message,
  };
}

/**
 * Purchase a selected monthly/annual paywall package.
 * Lifetime must never be passed here.
 */
export async function purchaseVerifiedArtistToolsPackage(
  option: PaywallPackageOption,
  options: PurchaseVerifiedArtistToolsOptions = {},
): Promise<VerifiedArtistToolsPurchaseReport> {
  if (
    option.packageIdentifier !== RC_PACKAGE_MONTHLY &&
    option.packageIdentifier !== RC_PACKAGE_ANNUAL
  ) {
    return emptyReport({
      outcome: "package_missing",
      message: "unsupported_package",
    });
  }

  const startedGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;

  try {
    assertRevenueCatPurchaseApisEnabled();
  } catch (error) {
    return emptyReport({
      outcome: "stale_identity",
      packageKind: option.kind,
      packageIdentifier: option.packageIdentifier,
      message: error instanceof Error ? error.message : String(error),
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }

  const aPackage = option.sdkPackage as PurchasesPackage | null;
  if (!aPackage || typeof aPackage !== "object") {
    return emptyReport({
      outcome: "package_missing",
      packageKind: option.kind,
      packageIdentifier: option.packageIdentifier,
      message: `missing_package:${option.packageIdentifier}`,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }

  const packageProductId =
    typeof aPackage.product?.identifier === "string"
      ? aPackage.product.identifier
      : option.productIdentifier;

  try {
    const purchaseResult = await Purchases.purchasePackage({ aPackage });

    const currentGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGeneration !== startedGeneration) {
      return emptyReport({
        outcome: "stale_identity",
        packageKind: option.kind,
        packageIdentifier: option.packageIdentifier,
        offeringIdentifier: RC_DEFAULT_OFFERING_IDENTIFIER,
        productIdentifier: purchaseResult.productIdentifier ?? packageProductId,
        message: `identity_generation_changed:started_${startedGeneration}:current_${currentGeneration}`,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: false,
      });
    }

    const entitlement = parsePurchaseEntitlementDiagnostic(
      purchaseResult.customerInfo,
      purchaseResult.productIdentifier ?? packageProductId,
      RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
    );

    const base = emptyReport({
      ...entitlement,
      packageKind: option.kind,
      packageIdentifier: option.packageIdentifier,
      offeringIdentifier: RC_DEFAULT_OFFERING_IDENTIFIER,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });

    // Store succeeded — notify UI before the (possibly multi-second) server sync.
    options.onBeforeServerSync?.();

    return attachServerSync(base, options);
  } catch (error) {
    const currentGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGeneration !== startedGeneration) {
      return emptyReport({
        outcome: "stale_identity",
        packageKind: option.kind,
        packageIdentifier: option.packageIdentifier,
        productIdentifier: packageProductId,
        message: `identity_generation_changed:started_${startedGeneration}:current_${currentGeneration}`,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: false,
      });
    }

    const classified = classifyRevenueCatPurchaseError(error);
    return emptyReport({
      outcome: classified.outcome,
      packageKind: option.kind,
      packageIdentifier: option.packageIdentifier,
      offeringIdentifier: RC_DEFAULT_OFFERING_IDENTIFIER,
      productIdentifier: packageProductId,
      message: classified.message,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }
}
