/**
 * Step 2 — RevenueCat SDK identity proof (native iOS only).
 *
 * - Configure once per process with a known Supabase UUID (never anonymous).
 * - Later account changes use logIn(uuid); never call Purchases.logOut().
 * - Logout quarantines in-memory state and blocks any future purchase APIs.
 * - No purchases, restore, offerings, or server sync in this module.
 */

import { Capacitor } from "@capacitor/core";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";

export const RC_IDENTITY_DIAG_TAG = "[DubHub][RevenueCat][identity]";

export type RevenueCatIdentityTransition =
  | "idle"
  | "configure"
  | "logIn"
  | "quarantine"
  | "error";

export type RevenueCatIdentityDebugSnapshot = {
  platform: string;
  isNative: boolean;
  configured: boolean;
  configuredOnce: boolean;
  configureCount: number;
  loginCount: number;
  quarantined: boolean;
  purchaseApisEnabled: boolean;
  identityGeneration: number;
  lastTransition: RevenueCatIdentityTransition;
  supabaseUserId: string | null;
  revenueCatAppUserId: string | null;
  idsMatch: boolean;
  isAnonymousId: boolean;
  customerInfoOk: boolean;
  customerInfoError: string | null;
  activeEntitlementCount: number;
  publicApiKeyPresent: boolean;
};

type InternalState = {
  configuredOnce: boolean;
  configureCount: number;
  loginCount: number;
  quarantined: boolean;
  purchaseApisEnabled: boolean;
  identityGeneration: number;
  lastTransition: RevenueCatIdentityTransition;
  supabaseUserId: string | null;
  revenueCatAppUserId: string | null;
  isAnonymousId: boolean;
  customerInfoOk: boolean;
  customerInfoError: string | null;
  activeEntitlementCount: number;
  identifiedUuid: string | null;
};

const state: InternalState = {
  configuredOnce: false,
  configureCount: 0,
  loginCount: 0,
  quarantined: true,
  purchaseApisEnabled: false,
  identityGeneration: 0,
  lastTransition: "idle",
  supabaseUserId: null,
  revenueCatAppUserId: null,
  isAnonymousId: false,
  customerInfoOk: false,
  customerInfoError: null,
  activeEntitlementCount: 0,
  identifiedUuid: null,
};

function isNativeIosShell(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

export function revenueCatIdentityDiagnosticsEnabled(): boolean {
  if (import.meta.env.DEV === true) return true;
  const forceRc =
    String(import.meta.env.VITE_FORCE_REVENUECAT_IDENTITY_DIAGNOSTICS ?? "").toLowerCase() ===
    "true";
  const forceApi =
    String(import.meta.env.VITE_FORCE_API_DIAGNOSTICS ?? "").toLowerCase() === "true";
  return forceRc || forceApi;
}

function diagLog(message: string, payload?: Record<string, unknown>): void {
  if (!revenueCatIdentityDiagnosticsEnabled()) return;
  if (payload !== undefined) {
    console.log(RC_IDENTITY_DIAG_TAG, message, payload);
  } else {
    console.log(RC_IDENTITY_DIAG_TAG, message);
  }
}

function readPublicApiKey(): string | null {
  const raw = String(import.meta.env.VITE_REVENUECAT_IOS_PUBLIC_API_KEY ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function isAnonymousAppUserId(appUserId: string | null | undefined): boolean {
  if (!appUserId) return false;
  return appUserId.startsWith("$RCAnonymousID:");
}

function countActiveEntitlements(customerInfo: {
  entitlements?: { active?: Record<string, unknown> };
  activeSubscriptions?: string[];
}): number {
  const activeMap = customerInfo.entitlements?.active;
  if (activeMap && typeof activeMap === "object") {
    return Object.keys(activeMap).length;
  }
  return Array.isArray(customerInfo.activeSubscriptions)
    ? customerInfo.activeSubscriptions.length
    : 0;
}

function clearCustomerFacingState(): void {
  state.supabaseUserId = null;
  state.revenueCatAppUserId = null;
  state.isAnonymousId = false;
  state.customerInfoOk = false;
  state.customerInfoError = null;
  state.activeEntitlementCount = 0;
  state.identifiedUuid = null;
}

function bumpGeneration(): number {
  state.identityGeneration += 1;
  return state.identityGeneration;
}

/**
 * Blocks purchase/restore paths. Step 2 does not call them; this hard-gate is intentional.
 */
export function assertRevenueCatPurchaseApisEnabled(): void {
  if (!state.purchaseApisEnabled || state.quarantined || !state.identifiedUuid) {
    throw new Error("RevenueCat purchase APIs are disabled (identity quarantine or not identified).");
  }
  if (!isNativeIosShell()) {
    throw new Error("RevenueCat purchase APIs require native iOS.");
  }
}

export function getRevenueCatIdentityDebugSnapshot(): RevenueCatIdentityDebugSnapshot {
  const supabaseUserId = state.supabaseUserId;
  const revenueCatAppUserId = state.revenueCatAppUserId;
  const idsMatch =
    !!supabaseUserId &&
    !!revenueCatAppUserId &&
    supabaseUserId === revenueCatAppUserId &&
    !isAnonymousAppUserId(revenueCatAppUserId);

  return {
    platform: (() => {
      try {
        return Capacitor.getPlatform();
      } catch {
        return "unknown";
      }
    })(),
    isNative: isNativeIosShell(),
    configured: state.configuredOnce,
    configuredOnce: state.configuredOnce,
    configureCount: state.configureCount,
    loginCount: state.loginCount,
    quarantined: state.quarantined,
    purchaseApisEnabled: state.purchaseApisEnabled,
    identityGeneration: state.identityGeneration,
    lastTransition: state.lastTransition,
    supabaseUserId,
    revenueCatAppUserId,
    idsMatch,
    isAnonymousId: state.isAnonymousId,
    customerInfoOk: state.customerInfoOk,
    customerInfoError: state.customerInfoError,
    activeEntitlementCount: state.activeEntitlementCount,
    publicApiKeyPresent: !!readPublicApiKey(),
  };
}

/**
 * Clears in-memory CustomerInfo/debug identity immediately.
 * Does NOT call Purchases.logOut() (would create an anonymous App User ID).
 */
export function quarantineRevenueCatIdentity(reason: string): void {
  const generation = bumpGeneration();
  clearCustomerFacingState();
  state.quarantined = true;
  state.purchaseApisEnabled = false;
  state.lastTransition = "quarantine";
  diagLog("quarantine", { reason, identityGeneration: generation });
}

async function refreshIdentitySnapshot(
  expectedGeneration: number,
  supabaseUserId: string,
): Promise<void> {
  if (expectedGeneration !== state.identityGeneration) return;

  try {
    const { appUserID } = await Purchases.getAppUserID();
    if (expectedGeneration !== state.identityGeneration) return;

    state.revenueCatAppUserId = appUserID;
    state.isAnonymousId = isAnonymousAppUserId(appUserID);
    if (state.isAnonymousId) {
      state.customerInfoOk = false;
      state.customerInfoError = "anonymous_app_user_id";
      state.activeEntitlementCount = 0;
      state.lastTransition = "error";
      state.purchaseApisEnabled = false;
      diagLog("anonymous_id_detected", { appUserIDPrefix: appUserID.slice(0, 18) });
      return;
    }

    const { customerInfo } = await Purchases.getCustomerInfo();
    if (expectedGeneration !== state.identityGeneration) return;

    state.customerInfoOk = true;
    state.customerInfoError = null;
    state.activeEntitlementCount = countActiveEntitlements(customerInfo);
    state.supabaseUserId = supabaseUserId;
    state.identifiedUuid = supabaseUserId;
    state.quarantined = false;
    state.purchaseApisEnabled = true;

    diagLog("identified", {
      idsMatch: supabaseUserId === appUserID,
      activeEntitlementCount: state.activeEntitlementCount,
      configureCount: state.configureCount,
      loginCount: state.loginCount,
      configuredOnce: state.configuredOnce,
      identityGeneration: expectedGeneration,
    });
  } catch (error) {
    if (expectedGeneration !== state.identityGeneration) return;
    state.customerInfoOk = false;
    state.customerInfoError = error instanceof Error ? error.message : String(error);
    state.activeEntitlementCount = 0;
    state.lastTransition = "error";
    state.purchaseApisEnabled = false;
    diagLog("customer_info_failed", { message: state.customerInfoError });
  }
}

/**
 * Ensure RevenueCat is identified as the given Supabase UUID.
 * Idempotent for the same UUID; uses configure once, then logIn for switches.
 */
export async function ensureRevenueCatIdentified(supabaseUserId: string): Promise<void> {
  const uuid = String(supabaseUserId ?? "").trim();
  if (!uuid) return;

  if (!isNativeIosShell()) {
    diagLog("skip_non_native", { platform: Capacitor.getPlatform?.() ?? "unknown" });
    return;
  }

  if (state.configuredOnce && state.identifiedUuid === uuid && !state.quarantined) {
    return;
  }

  const apiKey = readPublicApiKey();
  if (!apiKey) {
    state.lastTransition = "error";
    state.customerInfoError = "missing_public_api_key";
    state.customerInfoOk = false;
    state.purchaseApisEnabled = false;
    diagLog("missing_public_api_key");
    return;
  }

  const generation = bumpGeneration();
  // Drop prior CustomerInfo from app state before switching identity.
  state.supabaseUserId = uuid;
  state.revenueCatAppUserId = null;
  state.isAnonymousId = false;
  state.customerInfoOk = false;
  state.customerInfoError = null;
  state.activeEntitlementCount = 0;
  state.quarantined = false;
  state.purchaseApisEnabled = false;

  try {
    if (!state.configuredOnce) {
      if (import.meta.env.DEV) {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      }
      await Purchases.configure({
        apiKey,
        appUserID: uuid,
      });
      if (generation !== state.identityGeneration) return;
      state.configuredOnce = true;
      state.configureCount += 1;
      state.lastTransition = "configure";
      diagLog("configure", {
        configureCount: state.configureCount,
        identityGeneration: generation,
      });
    } else if (state.identifiedUuid !== uuid) {
      await Purchases.logIn({ appUserID: uuid });
      if (generation !== state.identityGeneration) return;
      state.loginCount += 1;
      state.lastTransition = "logIn";
      diagLog("logIn", {
        loginCount: state.loginCount,
        identityGeneration: generation,
      });
    } else {
      // Configured, same uuid, but was quarantined — refresh snapshot without reconfigure.
      state.lastTransition = "logIn";
    }

    await refreshIdentitySnapshot(generation, uuid);
  } catch (error) {
    if (generation !== state.identityGeneration) return;
    state.lastTransition = "error";
    state.customerInfoOk = false;
    state.customerInfoError = error instanceof Error ? error.message : String(error);
    state.purchaseApisEnabled = false;
    state.quarantined = true;
    diagLog("identify_failed", { message: state.customerInfoError });
  }
}
