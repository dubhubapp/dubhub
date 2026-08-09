/**
 * DEV-only RevenueCat monthly ($rc_monthly) purchase diagnostic.
 * After store success, reconciles server subscription snapshot (verification pending on refresh failure).
 */

import { Purchases, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import type { QueryClient } from "@tanstack/react-query";
import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";
import {
  assertRevenueCatPurchaseApisEnabled,
  getRevenueCatIdentityDebugSnapshot,
  revenueCatIdentityDiagnosticsEnabled,
} from "./revenuecat-identity";
import {
  classifyRevenueCatPurchaseError,
  createEmptyMonthlyPurchaseReport,
  findMonthlyPackageInOfferings,
  parsePurchaseEntitlementDiagnostic,
  type MonthlyPurchaseDiagnosticReport,
  type ServerSubscriptionSyncDiagnostic,
} from "./revenuecat-purchase-parse";
import { syncSubscriptionAfterRevenueCatSuccess } from "./subscription-sync";

export type { MonthlyPurchaseDiagnosticReport, MonthlyPurchaseDiagnosticOutcome } from "./revenuecat-purchase-parse";

export type PurchaseMonthlyDiagnosticOptions = {
  queryClient?: QueryClient | null;
  syncAfterSuccess?: typeof syncSubscriptionAfterRevenueCatSuccess;
};

function generationStaleReport(
  started: number,
  current: number,
  partial: Partial<MonthlyPurchaseDiagnosticReport> = {},
): MonthlyPurchaseDiagnosticReport {
  return createEmptyMonthlyPurchaseReport({
    outcome: "stale_identity",
    message: `identity_generation_changed:started_${started}:current_${current}`,
    identityGenerationStarted: started,
    identityGenerationMatched: false,
    ...partial,
  });
}

async function attachServerSync(
  report: MonthlyPurchaseDiagnosticReport,
  options: PurchaseMonthlyDiagnosticOptions,
): Promise<MonthlyPurchaseDiagnosticReport> {
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
 * Purchase the `$rc_monthly` package from offering `default` and report entitlement state.
 * Native iOS + identified RevenueCat only. Never logs API keys or receipts.
 */
export async function purchaseMonthlyTestProductDiagnostic(
  options: PurchaseMonthlyDiagnosticOptions = {},
): Promise<MonthlyPurchaseDiagnosticReport> {
  if (!revenueCatIdentityDiagnosticsEnabled()) {
    return createEmptyMonthlyPurchaseReport({
      outcome: "store_error",
      message: "revenuecat_diagnostics_disabled",
    });
  }

  const startedGeneration = getRevenueCatIdentityDebugSnapshot().identityGeneration;

  try {
    assertRevenueCatPurchaseApisEnabled();
  } catch (error) {
    return createEmptyMonthlyPurchaseReport({
      outcome: "store_error",
      message: error instanceof Error ? error.message : String(error),
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }

  let offeringIdentifier: string | null = null;
  let packageProductId: string | null = null;

  try {
    const offerings = await Purchases.getOfferings();
    const currentGenerationAfterOfferings =
      getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGenerationAfterOfferings !== startedGeneration) {
      return generationStaleReport(startedGeneration, currentGenerationAfterOfferings);
    }

    const found = findMonthlyPackageInOfferings(offerings);
    if (found.failure === "offering_missing") {
      return createEmptyMonthlyPurchaseReport({
        outcome: "offering_missing",
        message: `missing_offering:${RC_DEFAULT_OFFERING_IDENTIFIER}`,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: true,
      });
    }
    if (found.failure === "package_missing" || !found.package) {
      return createEmptyMonthlyPurchaseReport({
        outcome: "package_missing",
        offeringIdentifier: found.offering?.identifier ?? RC_DEFAULT_OFFERING_IDENTIFIER,
        message: `missing_package:${RC_PACKAGE_MONTHLY}`,
        identityGenerationStarted: startedGeneration,
        identityGenerationMatched: true,
      });
    }

    offeringIdentifier = found.offering?.identifier ?? RC_DEFAULT_OFFERING_IDENTIFIER;
    const aPackage = found.package as PurchasesPackage;
    packageProductId =
      typeof aPackage.product?.identifier === "string" ? aPackage.product.identifier : null;

    const purchaseResult = await Purchases.purchasePackage({ aPackage });

    const currentGenerationAfterPurchase =
      getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGenerationAfterPurchase !== startedGeneration) {
      return generationStaleReport(startedGeneration, currentGenerationAfterPurchase, {
        offeringIdentifier,
        productIdentifier: purchaseResult.productIdentifier ?? packageProductId,
      });
    }

    const entitlement = parsePurchaseEntitlementDiagnostic(
      purchaseResult.customerInfo,
      purchaseResult.productIdentifier ?? packageProductId,
      RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
    );

    const baseReport = createEmptyMonthlyPurchaseReport({
      ...entitlement,
      offeringIdentifier,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });

    // Store purchase succeeded — always attempt server reconcile (even if entitlement missing).
    return attachServerSync(baseReport, options);
  } catch (error) {
    const currentGenerationAfterError =
      getRevenueCatIdentityDebugSnapshot().identityGeneration;
    if (currentGenerationAfterError !== startedGeneration) {
      return generationStaleReport(startedGeneration, currentGenerationAfterError, {
        offeringIdentifier,
        productIdentifier: packageProductId,
      });
    }

    const classified = classifyRevenueCatPurchaseError(error);
    return createEmptyMonthlyPurchaseReport({
      outcome: classified.outcome,
      offeringIdentifier,
      productIdentifier: packageProductId,
      message: classified.message,
      identityGenerationStarted: startedGeneration,
      identityGenerationMatched: true,
    });
  }
}
