/**
 * Pure RevenueCat purchase diagnostic parsing — no native SDK dependency.
 * Used by DEV monthly Test Store purchase diagnostics only.
 */

import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";

/** Known Capacitor / RC error code strings (PURCHASES_ERROR_CODE). */
export const RC_ERROR_PURCHASE_CANCELLED = "1";
export const RC_ERROR_PAYMENT_PENDING = "20";

export type MonthlyPurchaseDiagnosticOutcome =
  | "success"
  | "user_cancelled"
  | "purchase_pending"
  | "store_error"
  | "package_missing"
  | "entitlement_missing"
  | "stale_identity"
  | "offering_missing";

export type ServerSubscriptionSyncDiagnostic = {
  verificationPending: boolean;
  refreshOk: boolean;
  refreshHttpStatus: number | null;
  refreshFailureReason: string | null;
  refreshLatencyMs: number | null;
  message: string | null;
};

export type MonthlyPurchaseDiagnosticReport = {
  outcome: MonthlyPurchaseDiagnosticOutcome;
  packageIdentifier: typeof RC_PACKAGE_MONTHLY;
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

export type EntitlementInfoLike = {
  isActive?: boolean;
  willRenew?: boolean;
  expirationDate?: string | null;
  productIdentifier?: string | null;
};

export type CustomerInfoLike = {
  entitlements?: {
    active?: Record<string, EntitlementInfoLike> | null;
    all?: Record<string, EntitlementInfoLike> | null;
  } | null;
};

export type OfferingsPackageLike = {
  identifier?: string;
  product?: { identifier?: string } | null;
};

export type OfferingLike = {
  identifier?: string;
  availablePackages?: OfferingsPackageLike[] | null;
};

export type OfferingsLike = {
  current?: OfferingLike | null;
  all?: Record<string, OfferingLike> | null;
};

export function createEmptyMonthlyPurchaseReport(
  overrides: Partial<MonthlyPurchaseDiagnosticReport> = {},
): MonthlyPurchaseDiagnosticReport {
  return {
    outcome: "store_error",
    packageIdentifier: RC_PACKAGE_MONTHLY,
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

/**
 * Resolve the `default` offering and `$rc_monthly` package from getOfferings().
 * Returns structural package reference for purchasePackage({ aPackage }).
 */
export function findMonthlyPackageInOfferings(offerings: OfferingsLike | null | undefined): {
  offering: OfferingLike | null;
  package: OfferingsPackageLike | null;
  failure: "offering_missing" | "package_missing" | null;
} {
  if (!offerings || typeof offerings !== "object") {
    return { offering: null, package: null, failure: "offering_missing" };
  }

  const all = offerings.all ?? {};
  const current = offerings.current ?? null;
  let offering: OfferingLike | null = null;

  if (current && current.identifier === RC_DEFAULT_OFFERING_IDENTIFIER) {
    offering = current;
  } else if (all[RC_DEFAULT_OFFERING_IDENTIFIER]) {
    offering = all[RC_DEFAULT_OFFERING_IDENTIFIER];
  } else {
    return { offering: null, package: null, failure: "offering_missing" };
  }

  const packages = offering.availablePackages ?? [];
  const monthly =
    packages.find((pkg) => pkg.identifier === RC_PACKAGE_MONTHLY) ?? null;

  if (!monthly) {
    return { offering, package: null, failure: "package_missing" };
  }

  return { offering, package: monthly, failure: null };
}

/**
 * Inspect CustomerInfo after a purchase for verified_artist_tools.
 */
export function parsePurchaseEntitlementDiagnostic(
  customerInfo: CustomerInfoLike | null | undefined,
  purchasedProductIdentifier: string | null = null,
  entitlementId: string = RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
): Pick<
  MonthlyPurchaseDiagnosticReport,
  | "outcome"
  | "entitlementActive"
  | "expirationDate"
  | "willRenew"
  | "productIdentifier"
  | "message"
> {
  const activeMap = customerInfo?.entitlements?.active ?? {};
  const allMap = customerInfo?.entitlements?.all ?? {};
  const info = activeMap[entitlementId] ?? allMap[entitlementId] ?? null;

  if (!info || info.isActive !== true) {
    return {
      outcome: "entitlement_missing",
      entitlementActive: info?.isActive === true,
      expirationDate: info?.expirationDate ?? null,
      willRenew: typeof info?.willRenew === "boolean" ? info.willRenew : null,
      productIdentifier:
        (typeof info?.productIdentifier === "string" && info.productIdentifier) ||
        purchasedProductIdentifier,
      message: `entitlement_not_active_after_purchase:${entitlementId}`,
    };
  }

  return {
    outcome: "success",
    entitlementActive: true,
    expirationDate: info.expirationDate ?? null,
    willRenew: typeof info.willRenew === "boolean" ? info.willRenew : null,
    productIdentifier:
      (typeof info.productIdentifier === "string" && info.productIdentifier) ||
      purchasedProductIdentifier,
    message: null,
  };
}

type PurchaseErrorLike = {
  code?: string | number | null;
  message?: string | null;
  userCancelled?: boolean | null;
};

/**
 * Classify purchasePackage rejection into cancelled / pending / store_error.
 * Never reads or logs receipts or API keys.
 */
export function classifyRevenueCatPurchaseError(error: unknown): {
  outcome: "user_cancelled" | "purchase_pending" | "store_error";
  message: string;
} {
  const err = (error ?? {}) as PurchaseErrorLike;
  const code = err.code != null ? String(err.code) : "";
  const message =
    typeof err.message === "string" && err.message.trim().length > 0
      ? err.message.trim()
      : error instanceof Error
        ? error.message
        : String(error ?? "unknown_purchase_error");

  if (err.userCancelled === true || code === RC_ERROR_PURCHASE_CANCELLED) {
    return { outcome: "user_cancelled", message: "purchase_cancelled_by_user" };
  }

  if (code === RC_ERROR_PAYMENT_PENDING) {
    return { outcome: "purchase_pending", message: "purchase_payment_pending" };
  }

  return {
    outcome: "store_error",
    message: code ? `store_error:code_${code}:${message}` : `store_error:${message}`,
  };
}
