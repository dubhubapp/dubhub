/**
 * Pure offerings diagnostic parsing — no native RevenueCat SDK dependency.
 */

import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_EXPECTED_PACKAGE_IDENTIFIERS,
  type RcExpectedPackageIdentifier,
} from "./revenuecat-constants";

export type OfferingsPackageDiagnostic = {
  identifier: string;
  productIdentifier: string | null;
};

export type OfferingsDiagnosticReport = {
  ok: boolean;
  offeringIdentifier: string | null;
  usedCurrentOffering: boolean;
  packages: OfferingsPackageDiagnostic[];
  expectedPackageIds: readonly RcExpectedPackageIdentifier[];
  missingPackageIds: RcExpectedPackageIdentifier[];
  failures: string[];
};

/** Minimal structural types so parsing stays SDK-import free. */
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

function readProductIdentifier(pkg: OfferingsPackageLike): string | null {
  const id = pkg.product?.identifier;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

/**
 * Pure parser for getOfferings() results — unit-tested without native SDK.
 */
export function parseOfferingsDiagnostic(
  offerings: OfferingsLike | null | undefined,
  expectedOfferingId: string = RC_DEFAULT_OFFERING_IDENTIFIER,
  expectedPackageIds: readonly RcExpectedPackageIdentifier[] = RC_EXPECTED_PACKAGE_IDENTIFIERS,
): OfferingsDiagnosticReport {
  const failures: string[] = [];

  if (!offerings || typeof offerings !== "object") {
    return {
      ok: false,
      offeringIdentifier: null,
      usedCurrentOffering: false,
      packages: [],
      expectedPackageIds,
      missingPackageIds: [...expectedPackageIds],
      failures: ["offerings_response_missing"],
    };
  }

  const all = offerings.all ?? {};
  const current = offerings.current ?? null;
  let offering: OfferingLike | null = null;
  let usedCurrentOffering = false;

  if (current && current.identifier === expectedOfferingId) {
    offering = current;
    usedCurrentOffering = true;
  } else if (current) {
    offering = current;
    usedCurrentOffering = true;
    failures.push(
      `current_offering_mismatch:expected_${expectedOfferingId}:got_${current.identifier}`,
    );
  } else if (all[expectedOfferingId]) {
    offering = all[expectedOfferingId];
    usedCurrentOffering = false;
    failures.push("current_offering_null_used_named_default");
  } else {
    failures.push(`missing_offering:${expectedOfferingId}`);
    return {
      ok: false,
      offeringIdentifier: null,
      usedCurrentOffering: false,
      packages: [],
      expectedPackageIds,
      missingPackageIds: [...expectedPackageIds],
      failures,
    };
  }

  const packages: OfferingsPackageDiagnostic[] = (offering.availablePackages ?? []).map(
    (pkg) => ({
      identifier: String(pkg.identifier ?? ""),
      productIdentifier: readProductIdentifier(pkg),
    }),
  );

  const foundIds = new Set(packages.map((p) => p.identifier));
  const missingPackageIds = expectedPackageIds.filter((id) => !foundIds.has(id));
  for (const missing of missingPackageIds) {
    failures.push(`missing_package:${missing}`);
  }

  for (const pkg of packages) {
    if (!pkg.productIdentifier) {
      failures.push(`missing_product_identifier:${pkg.identifier || "unknown"}`);
    }
  }

  return {
    ok: failures.length === 0,
    offeringIdentifier: offering.identifier ?? null,
    usedCurrentOffering,
    packages,
    expectedPackageIds,
    missingPackageIds,
    failures,
  };
}
