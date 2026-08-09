/**
 * RevenueCat catalogue identifiers for Verified Artist tooling diagnostics.
 * Dashboard source of truth; client constants are for diagnostics matching only.
 */

export const RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS = "verified_artist_tools" as const;

export const RC_DEFAULT_OFFERING_IDENTIFIER = "default" as const;

export const RC_PACKAGE_MONTHLY = "$rc_monthly" as const;
export const RC_PACKAGE_ANNUAL = "$rc_annual" as const;
export const RC_PACKAGE_LIFETIME = "$rc_lifetime" as const;

export const RC_EXPECTED_PACKAGE_IDENTIFIERS = [
  RC_PACKAGE_MONTHLY,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_LIFETIME,
] as const;

export type RcExpectedPackageIdentifier =
  (typeof RC_EXPECTED_PACKAGE_IDENTIFIERS)[number];
