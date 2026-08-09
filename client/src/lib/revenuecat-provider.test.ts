import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRevenueCatSdkApiKey } from "./revenuecat-provider";
import { parseOfferingsDiagnostic } from "./revenuecat-offerings-parse";
import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_LIFETIME,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";

describe("resolveRevenueCatSdkApiKey", () => {
  it("selects Test Store for local + flag + key", () => {
    const result = resolveRevenueCatSdkApiKey({
      buildChannel: "local",
      useTestStoreFlag: "true",
      applePublicApiKey: "appl_apple_key",
      testStoreApiKey: "test_store_key",
    });
    assert.equal(result.provider, "test_store");
    assert.equal(result.apiKey, "test_store_key");
    assert.equal(result.apiKeyPresent, true);
    assert.equal(result.error, null);
    assert.equal(result.buildChannel, "local");
  });

  it("fails closed for local + missing Test Store key", () => {
    const result = resolveRevenueCatSdkApiKey({
      buildChannel: "local",
      useTestStoreFlag: "true",
      applePublicApiKey: "appl_apple_key",
      testStoreApiKey: "",
    });
    assert.equal(result.provider, "test_store");
    assert.equal(result.apiKey, null);
    assert.equal(result.apiKeyPresent, false);
    assert.equal(result.error, "missing_test_store_api_key");
  });

  it("fails closed for testflight + Test Store flag", () => {
    assert.throws(
      () =>
        resolveRevenueCatSdkApiKey({
          buildChannel: "testflight",
          useTestStoreFlag: "true",
          applePublicApiKey: "appl_apple_key",
          testStoreApiKey: "test_store_key",
        }),
      /must not be enabled for VITE_APP_BUILD_CHANNEL=testflight/i,
    );
  });

  it("fails closed for production + Test Store flag", () => {
    assert.throws(
      () =>
        resolveRevenueCatSdkApiKey({
          buildChannel: "production",
          useTestStoreFlag: "true",
          applePublicApiKey: "appl_apple_key",
          testStoreApiKey: "test_store_key",
        }),
      /must not be enabled for VITE_APP_BUILD_CHANNEL=production/i,
    );
  });

  it("fails closed for missing channel + Test Store flag", () => {
    const result = resolveRevenueCatSdkApiKey({
      buildChannel: undefined,
      useTestStoreFlag: "true",
      applePublicApiKey: "appl_apple_key",
      testStoreApiKey: "test_store_key",
    });
    assert.equal(result.provider, "apple");
    assert.equal(result.apiKey, "appl_apple_key");
    assert.equal(result.buildChannel, null);
    assert.match(result.error ?? "", /test_store_requires_build_channel_local:got_missing/);
  });

  it("fails closed for invalid channel + Test Store flag", () => {
    const result = resolveRevenueCatSdkApiKey({
      buildChannel: "staging",
      useTestStoreFlag: "true",
      applePublicApiKey: "appl_apple_key",
      testStoreApiKey: "test_store_key",
    });
    assert.equal(result.provider, "apple");
    assert.equal(result.apiKey, "appl_apple_key");
    assert.equal(result.buildChannel, null);
    assert.match(result.error ?? "", /test_store_requires_build_channel_local:got_invalid/);
  });

  it("uses Apple for all channels when Test Store is not requested", () => {
    for (const buildChannel of ["local", "testflight", "production", undefined, "weird"] as const) {
      const result = resolveRevenueCatSdkApiKey({
        buildChannel,
        useTestStoreFlag: "false",
        applePublicApiKey: "appl_apple_key",
        testStoreApiKey: "test_store_key_must_be_ignored",
      });
      assert.equal(result.provider, "apple");
      assert.equal(result.apiKey, "appl_apple_key");
      assert.equal(result.error, null);
    }
  });

  it("reports missing Apple key fail-closed when Apple provider is selected", () => {
    const result = resolveRevenueCatSdkApiKey({
      buildChannel: "local",
      useTestStoreFlag: "false",
      applePublicApiKey: "   ",
      testStoreApiKey: null,
    });
    assert.equal(result.provider, "apple");
    assert.equal(result.apiKeyPresent, false);
    assert.equal(result.error, "missing_apple_public_api_key");
  });
});

describe("parseOfferingsDiagnostic", () => {
  function packageFixture(identifier: string, productIdentifier: string) {
    return {
      identifier,
      product: { identifier: productIdentifier },
    };
  }

  it("passes when default offering has expected packages", () => {
    const report = parseOfferingsDiagnostic({
      current: {
        identifier: RC_DEFAULT_OFFERING_IDENTIFIER,
        availablePackages: [
          packageFixture(RC_PACKAGE_MONTHLY, "monthly"),
          packageFixture(RC_PACKAGE_ANNUAL, "yearly"),
          packageFixture(RC_PACKAGE_LIFETIME, "lifetime"),
        ],
      },
      all: {},
    });
    assert.equal(report.ok, true);
    assert.equal(report.offeringIdentifier, "default");
    assert.deepEqual(report.missingPackageIds, []);
    assert.deepEqual(report.failures, []);
    assert.equal(report.packages.length, 3);
  });

  it("reports missing packages and missing offering as diagnostic failures", () => {
    const report = parseOfferingsDiagnostic({
      current: {
        identifier: RC_DEFAULT_OFFERING_IDENTIFIER,
        availablePackages: [packageFixture(RC_PACKAGE_MONTHLY, "monthly")],
      },
      all: {},
    });
    assert.equal(report.ok, false);
    assert.deepEqual(report.missingPackageIds, [RC_PACKAGE_ANNUAL, RC_PACKAGE_LIFETIME]);
    assert.ok(report.failures.includes(`missing_package:${RC_PACKAGE_ANNUAL}`));
    assert.ok(report.failures.includes(`missing_package:${RC_PACKAGE_LIFETIME}`));
  });

  it("fails closed when offerings response is missing", () => {
    const report = parseOfferingsDiagnostic(null);
    assert.equal(report.ok, false);
    assert.ok(report.failures.includes("offerings_response_missing"));
  });
});
