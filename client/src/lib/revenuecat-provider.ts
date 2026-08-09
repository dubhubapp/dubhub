/**
 * Compile-time RevenueCat provider / public SDK key selection.
 *
 * Authority is VITE_APP_BUILD_CHANNEL (local | testflight | production), not
 * import.meta.env.DEV / PROD. A normal `vite build` for Capacitor sets PROD=true
 * even for local native diagnostics builds.
 *
 * Test Store may only be selected when:
 * - build channel is local
 * - VITE_REVENUECAT_USE_TEST_STORE=true
 * - VITE_REVENUECAT_TEST_STORE_API_KEY is present
 *
 * Provider changes require a rebuild and app relaunch: Purchases.configure runs
 * once per native process.
 *
 * Never log API key values.
 */

export type RevenueCatProviderKind = "apple" | "test_store";

export type AppBuildChannel = "local" | "testflight" | "production";

export type RevenueCatProviderEnvInput = {
  buildChannel: string | undefined | null;
  useTestStoreFlag: string | undefined | null;
  applePublicApiKey: string | undefined | null;
  /** Only read when build channel is local. Never read for testflight/production. */
  testStoreApiKey: string | undefined | null;
};

export type RevenueCatProviderSelection = {
  provider: RevenueCatProviderKind;
  apiKey: string | null;
  apiKeyPresent: boolean;
  error: string | null;
  buildChannel: AppBuildChannel | null;
};

const VALID_BUILD_CHANNELS = new Set<AppBuildChannel>([
  "local",
  "testflight",
  "production",
]);

function trimKey(value: string | undefined | null): string | null {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function isTestStoreFlagEnabled(flag: string | undefined | null): boolean {
  return String(flag ?? "").trim().toLowerCase() === "true";
}

export function parseAppBuildChannel(
  value: string | undefined | null,
): AppBuildChannel | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (VALID_BUILD_CHANNELS.has(normalized as AppBuildChannel)) {
    return normalized as AppBuildChannel;
  }
  return null;
}

function appleSelection(
  applePublicApiKey: string | undefined | null,
  buildChannel: AppBuildChannel | null,
  extraError: string | null = null,
): RevenueCatProviderSelection {
  const appleKey = trimKey(applePublicApiKey);
  const missingApple = appleKey ? null : "missing_apple_public_api_key";
  return {
    provider: "apple",
    apiKey: appleKey,
    apiKeyPresent: !!appleKey,
    error: extraError ?? missingApple,
    buildChannel,
  };
}

/**
 * Resolve which public SDK key to configure with.
 * Pure / injectable for tests — do not call Date.now or Capacitor here.
 */
export function resolveRevenueCatSdkApiKey(
  env: RevenueCatProviderEnvInput,
): RevenueCatProviderSelection {
  const useTestStoreRequested = isTestStoreFlagEnabled(env.useTestStoreFlag);
  const buildChannel = parseAppBuildChannel(env.buildChannel);

  // Release channels: never read or select the Test Store key.
  if (buildChannel === "testflight" || buildChannel === "production") {
    if (useTestStoreRequested) {
      throw new Error(
        `VITE_REVENUECAT_USE_TEST_STORE must not be enabled for VITE_APP_BUILD_CHANNEL=${buildChannel}. Rebuild without Test Store selection.`,
      );
    }
    return appleSelection(env.applePublicApiKey, buildChannel);
  }

  // Local channel: Test Store only when flag + key are present.
  if (buildChannel === "local" && useTestStoreRequested) {
    const testStoreKey = trimKey(env.testStoreApiKey);
    if (!testStoreKey) {
      return {
        provider: "test_store",
        apiKey: null,
        apiKeyPresent: false,
        error: "missing_test_store_api_key",
        buildChannel,
      };
    }
    return {
      provider: "test_store",
      apiKey: testStoreKey,
      apiKeyPresent: true,
      error: null,
      buildChannel,
    };
  }

  // Missing/invalid channel, or local without Test Store request → Apple only.
  if (useTestStoreRequested && buildChannel !== "local") {
    const channelLabel =
      env.buildChannel == null || String(env.buildChannel).trim() === ""
        ? "missing"
        : "invalid";
    return appleSelection(
      env.applePublicApiKey,
      null,
      `test_store_requires_build_channel_local:got_${channelLabel}`,
    );
  }

  return appleSelection(env.applePublicApiKey, buildChannel);
}

/** Build env input from Vite import.meta.env (identity / diagnostics callers). */
export function getViteRevenueCatProviderEnv(): RevenueCatProviderEnvInput {
  const buildChannel = import.meta.env.VITE_APP_BUILD_CHANNEL;
  const parsed = parseAppBuildChannel(buildChannel);
  return {
    buildChannel,
    useTestStoreFlag: import.meta.env.VITE_REVENUECAT_USE_TEST_STORE,
    applePublicApiKey: import.meta.env.VITE_REVENUECAT_IOS_PUBLIC_API_KEY,
    // Only local channel may read the Test Store key.
    testStoreApiKey:
      parsed === "local"
        ? import.meta.env.VITE_REVENUECAT_TEST_STORE_API_KEY
        : undefined,
  };
}
