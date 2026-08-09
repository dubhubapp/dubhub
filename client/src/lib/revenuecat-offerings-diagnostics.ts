/**
 * Read-only RevenueCat offerings diagnostics (DEV / identity diagnostics only).
 * Does not purchase, restore, or mutate entitlements.
 */

import { Purchases } from "@revenuecat/purchases-capacitor";
import { assertRevenueCatPurchaseApisEnabled } from "./revenuecat-identity";
import {
  parseOfferingsDiagnostic,
  type OfferingsDiagnosticReport,
} from "./revenuecat-offerings-parse";

export type {
  OfferingsDiagnosticReport,
  OfferingsPackageDiagnostic,
} from "./revenuecat-offerings-parse";
export { parseOfferingsDiagnostic } from "./revenuecat-offerings-parse";

/**
 * Load offerings from RevenueCat when identity purchase APIs are enabled.
 * Read-only: no purchasePackage / restorePurchases.
 */
export async function loadRevenueCatOfferingsDiagnostic(): Promise<OfferingsDiagnosticReport> {
  assertRevenueCatPurchaseApisEnabled();
  const offerings = await Purchases.getOfferings();
  return parseOfferingsDiagnostic(offerings);
}
