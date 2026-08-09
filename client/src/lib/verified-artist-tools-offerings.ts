/**
 * Production paywall offerings: monthly + annual only.
 * Lifetime packages are filtered out silently (never shown or described).
 */

import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_LIFETIME,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";

export type PaywallPackageKind = "monthly" | "annual";

export type PaywallPackageOption = {
  kind: PaywallPackageKind;
  packageIdentifier: typeof RC_PACKAGE_MONTHLY | typeof RC_PACKAGE_ANNUAL;
  productIdentifier: string | null;
  priceString: string;
  subscriptionPeriod: string | null;
  periodLabel: string;
  /** Opaque SDK package reference for purchasePackage — not serializable. */
  sdkPackage: unknown;
};

export type PaywallOfferingsResult =
  | {
      ok: true;
      offeringIdentifier: string;
      packages: PaywallPackageOption[];
      monthly: PaywallPackageOption | null;
      annual: PaywallPackageOption | null;
    }
  | {
      ok: false;
      reason: "offerings_missing" | "offering_missing" | "no_purchasable_packages";
      packages: [];
      monthly: null;
      annual: null;
    };

type ProductLike = {
  identifier?: string;
  priceString?: string;
  subscriptionPeriod?: string | null;
};

type PackageLike = {
  identifier?: string;
  product?: ProductLike | null;
};

type OfferingLike = {
  identifier?: string;
  availablePackages?: PackageLike[] | null;
  monthly?: PackageLike | null;
  annual?: PackageLike | null;
  lifetime?: PackageLike | null;
};

type OfferingsLike = {
  current?: OfferingLike | null;
  all?: Record<string, OfferingLike> | null;
};

export function subscriptionPeriodLabel(period: string | null | undefined): string {
  const raw = String(period ?? "")
    .trim()
    .toUpperCase();
  if (raw === "P1M" || raw === "P1MO") return "per month";
  if (raw === "P1Y" || raw === "P12M") return "per year";
  if (raw === "P1W") return "per week";
  if (!raw) return "subscription";
  return "subscription";
}

function readPriceString(pkg: PackageLike | null | undefined): string | null {
  const price = pkg?.product?.priceString;
  if (typeof price === "string" && price.trim().length > 0) return price.trim();
  return null;
}

function readProductId(pkg: PackageLike | null | undefined): string | null {
  const id = pkg?.product?.identifier;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

function readPeriod(pkg: PackageLike | null | undefined): string | null {
  const period = pkg?.product?.subscriptionPeriod;
  return typeof period === "string" && period.trim().length > 0 ? period.trim() : null;
}

function isLifetimePackage(pkg: PackageLike | null | undefined): boolean {
  if (!pkg) return false;
  if (pkg.identifier === RC_PACKAGE_LIFETIME) return true;
  const period = readPeriod(pkg);
  if (period == null || period === "") {
    // Lifetime often has null subscriptionPeriod; only treat as lifetime when identifier says so.
    return pkg.identifier === RC_PACKAGE_LIFETIME;
  }
  return false;
}

function resolveDefaultOffering(offerings: OfferingsLike | null | undefined): {
  offering: OfferingLike | null;
  failure: "offerings_missing" | "offering_missing" | null;
} {
  if (!offerings || typeof offerings !== "object") {
    return { offering: null, failure: "offerings_missing" };
  }
  const all = offerings.all ?? {};
  const current = offerings.current ?? null;
  if (current && current.identifier === RC_DEFAULT_OFFERING_IDENTIFIER) {
    return { offering: current, failure: null };
  }
  if (all[RC_DEFAULT_OFFERING_IDENTIFIER]) {
    return { offering: all[RC_DEFAULT_OFFERING_IDENTIFIER], failure: null };
  }
  if (current) {
    // Prefer named default; fall back to current only if default missing.
    return { offering: current, failure: null };
  }
  return { offering: null, failure: "offering_missing" };
}

function toOption(
  kind: PaywallPackageKind,
  packageIdentifier: typeof RC_PACKAGE_MONTHLY | typeof RC_PACKAGE_ANNUAL,
  pkg: PackageLike,
): PaywallPackageOption | null {
  if (isLifetimePackage(pkg)) return null;
  const priceString = readPriceString(pkg);
  if (!priceString) return null;
  const subscriptionPeriod = readPeriod(pkg);
  return {
    kind,
    packageIdentifier,
    productIdentifier: readProductId(pkg),
    priceString,
    subscriptionPeriod,
    periodLabel: subscriptionPeriodLabel(subscriptionPeriod),
    sdkPackage: pkg,
  };
}

/**
 * Extract monthly/annual paywall options. Lifetime is omitted entirely.
 * Missing annual does not fail the result when monthly is present.
 */
export function parsePaywallOfferings(
  offerings: OfferingsLike | null | undefined,
): PaywallOfferingsResult {
  const resolved = resolveDefaultOffering(offerings);
  if (!resolved.offering) {
    return {
      ok: false,
      reason: resolved.failure ?? "offering_missing",
      packages: [],
      monthly: null,
      annual: null,
    };
  }

  const offering = resolved.offering;
  const available = offering.availablePackages ?? [];

  const monthlyPkg =
    available.find((p) => p.identifier === RC_PACKAGE_MONTHLY) ??
    offering.monthly ??
    null;
  const annualPkg =
    available.find((p) => p.identifier === RC_PACKAGE_ANNUAL) ??
    offering.annual ??
    null;

  // Explicitly ignore lifetime even if present on the offering.
  void offering.lifetime;
  void available.filter((p) => p.identifier === RC_PACKAGE_LIFETIME);

  const monthly =
    monthlyPkg && monthlyPkg.identifier === RC_PACKAGE_MONTHLY
      ? toOption("monthly", RC_PACKAGE_MONTHLY, monthlyPkg)
      : null;
  const annual =
    annualPkg && annualPkg.identifier === RC_PACKAGE_ANNUAL
      ? toOption("annual", RC_PACKAGE_ANNUAL, annualPkg)
      : null;

  const packages = [monthly, annual].filter(
    (p): p is PaywallPackageOption => p != null,
  );

  if (packages.length === 0) {
    return {
      ok: false,
      reason: "no_purchasable_packages",
      packages: [],
      monthly: null,
      annual: null,
    };
  }

  return {
    ok: true,
    offeringIdentifier: offering.identifier ?? RC_DEFAULT_OFFERING_IDENTIFIER,
    packages,
    monthly,
    annual,
  };
}
