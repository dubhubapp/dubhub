import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";
import {
  classifyRevenueCatPurchaseError,
  findMonthlyPackageInOfferings,
  parsePurchaseEntitlementDiagnostic,
  RC_ERROR_PAYMENT_PENDING,
  RC_ERROR_PURCHASE_CANCELLED,
} from "./revenuecat-purchase-parse";

describe("findMonthlyPackageInOfferings", () => {
  it("fails when monthly package is missing", () => {
    const result = findMonthlyPackageInOfferings({
      current: {
        identifier: RC_DEFAULT_OFFERING_IDENTIFIER,
        availablePackages: [
          { identifier: "$rc_annual", product: { identifier: "annual_sku" } },
        ],
      },
      all: {},
    });
    assert.equal(result.failure, "package_missing");
    assert.equal(result.package, null);
    assert.equal(result.offering?.identifier, RC_DEFAULT_OFFERING_IDENTIFIER);
  });

  it("finds $rc_monthly on default offering", () => {
    const monthly = {
      identifier: RC_PACKAGE_MONTHLY,
      product: { identifier: "monthly_sku" },
    };
    const result = findMonthlyPackageInOfferings({
      current: {
        identifier: RC_DEFAULT_OFFERING_IDENTIFIER,
        availablePackages: [monthly],
      },
      all: {},
    });
    assert.equal(result.failure, null);
    assert.equal(result.package, monthly);
  });
});

describe("parsePurchaseEntitlementDiagnostic", () => {
  it("reports success when verified_artist_tools is active", () => {
    const parsed = parsePurchaseEntitlementDiagnostic(
      {
        entitlements: {
          active: {
            [RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS]: {
              isActive: true,
              willRenew: true,
              expirationDate: "2026-08-28T12:00:00Z",
              productIdentifier: "monthly_sku",
            },
          },
          all: {},
        },
      },
      "fallback_sku",
    );
    assert.equal(parsed.outcome, "success");
    assert.equal(parsed.entitlementActive, true);
    assert.equal(parsed.willRenew, true);
    assert.equal(parsed.expirationDate, "2026-08-28T12:00:00Z");
    assert.equal(parsed.productIdentifier, "monthly_sku");
    assert.equal(parsed.message, null);
  });

  it("reports entitlement_missing after purchase when entitlement inactive", () => {
    const parsed = parsePurchaseEntitlementDiagnostic(
      {
        entitlements: {
          active: {},
          all: {
            [RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS]: {
              isActive: false,
              willRenew: false,
              expirationDate: "2026-01-01T00:00:00Z",
              productIdentifier: "monthly_sku",
            },
          },
        },
      },
      "monthly_sku",
    );
    assert.equal(parsed.outcome, "entitlement_missing");
    assert.equal(parsed.entitlementActive, false);
    assert.match(parsed.message ?? "", /entitlement_not_active_after_purchase/);
    assert.equal(parsed.productIdentifier, "monthly_sku");
  });
});

describe("classifyRevenueCatPurchaseError", () => {
  it("classifies cancelled purchases", () => {
    assert.deepEqual(
      classifyRevenueCatPurchaseError({
        code: RC_ERROR_PURCHASE_CANCELLED,
        message: "Purchase was cancelled.",
        userCancelled: true,
      }),
      { outcome: "user_cancelled", message: "purchase_cancelled_by_user" },
    );
  });

  it("classifies payment pending", () => {
    const result = classifyRevenueCatPurchaseError({
      code: RC_ERROR_PAYMENT_PENDING,
      message: "Payment is pending",
    });
    assert.equal(result.outcome, "purchase_pending");
  });

  it("classifies other failures as store_error", () => {
    const result = classifyRevenueCatPurchaseError({
      code: "2",
      message: "Store problem",
    });
    assert.equal(result.outcome, "store_error");
    assert.match(result.message, /store_error:code_2/);
  });
});
