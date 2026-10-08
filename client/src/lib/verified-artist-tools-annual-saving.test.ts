import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RC_PACKAGE_ANNUAL, RC_PACKAGE_MONTHLY } from "./revenuecat-constants";
import {
  formatAnnualSavingLabel,
  parsePaywallOfferings,
  resolveAnnualSavingPercent,
} from "./verified-artist-tools-offerings";

describe("resolveAnnualSavingPercent", () => {
  it("monthly 7.99 / annual 69.99 → 27%", () => {
    const percent = resolveAnnualSavingPercent({
      monthlyPrice: 7.99,
      annualPrice: 69.99,
    });
    assert.equal(percent, 27);
    assert.equal(formatAnnualSavingLabel(percent!), "Save 27%");
  });

  it("annual exactly equal to 12 monthly payments → no saving", () => {
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: 10, annualPrice: 120 }),
      null,
    );
  });

  it("annual more expensive → no saving", () => {
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: 7.99, annualPrice: 99.99 }),
      null,
    );
  });

  it("missing monthly price → no saving", () => {
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: null, annualPrice: 69.99 }),
      null,
    );
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: undefined, annualPrice: 69.99 }),
      null,
    );
  });

  it("missing annual price → no saving", () => {
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: 7.99, annualPrice: null }),
      null,
    );
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: 7.99, annualPrice: undefined }),
      null,
    );
  });

  it("rejects zero, non-finite, and non-numeric prices", () => {
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: 0, annualPrice: 69.99 }),
      null,
    );
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: 7.99, annualPrice: 0 }),
      null,
    );
    assert.equal(
      resolveAnnualSavingPercent({ monthlyPrice: Number.NaN, annualPrice: 69.99 }),
      null,
    );
    assert.equal(
      resolveAnnualSavingPercent({
        monthlyPrice: Number.POSITIVE_INFINITY,
        annualPrice: 69.99,
      }),
      null,
    );
  });
});

describe("parsePaywallOfferings numeric prices", () => {
  it("reads product.price and ignores formatted currency strings", () => {
    const result = parsePaywallOfferings({
      current: {
        identifier: "default",
        availablePackages: [
          {
            identifier: RC_PACKAGE_MONTHLY,
            product: {
              identifier: "verified_artist_tools_monthly",
              price: 7.99,
              priceString: "$0.01",
              subscriptionPeriod: "P1M",
            },
          },
          {
            identifier: RC_PACKAGE_ANNUAL,
            product: {
              identifier: "verified_artist_tools_annual",
              price: 69.99,
              priceString: "£999.00",
              subscriptionPeriod: "P1Y",
            },
          },
        ],
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.monthly?.price, 7.99);
    assert.equal(result.annual?.price, 69.99);
    assert.equal(result.monthly?.priceString, "$0.01");
    assert.equal(result.annual?.priceString, "£999.00");
    assert.equal(
      resolveAnnualSavingPercent({
        monthlyPrice: result.monthly?.price,
        annualPrice: result.annual?.price,
      }),
      27,
    );
  });

  it("keeps the package when the numeric price is missing", () => {
    const result = parsePaywallOfferings({
      current: {
        identifier: "default",
        availablePackages: [
          {
            identifier: RC_PACKAGE_MONTHLY,
            product: {
              identifier: "verified_artist_tools_monthly",
              priceString: "£7.99",
              subscriptionPeriod: "P1M",
            },
          },
          {
            identifier: RC_PACKAGE_ANNUAL,
            product: {
              identifier: "verified_artist_tools_annual",
              priceString: "£69.99",
              subscriptionPeriod: "P1Y",
            },
          },
        ],
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.monthly?.price, null);
    assert.equal(result.annual?.price, null);
    assert.equal(
      resolveAnnualSavingPercent({
        monthlyPrice: result.monthly?.price,
        annualPrice: result.annual?.price,
      }),
      null,
    );
  });
});
