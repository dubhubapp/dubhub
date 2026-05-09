import { queryClient } from "./queryClient";
import { supabase } from "./supabaseClient";

/** Set by auth callback after email verification; AuthPage shows a one-shot banner. */
export const EMAIL_VERIFIED_SESSION_STORAGE_KEY = "dubhub:email-verified-ok";

export const PROFILE_NOT_FOUND_CODE = "PGRST116";

export function isProfileRowMissingError(
  error: { code?: string } | null | undefined,
): boolean {
  return error?.code === PROFILE_NOT_FOUND_CODE;
}

export function isRecoverableAuthSessionError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const e = error as { message?: string; code?: string };
  const msg = (e.message ?? "").toLowerCase();
  const code = (e.code ?? "").toLowerCase();
  if (code === "session_not_found" || code === "invalid_grant") return true;
  if (msg.includes("session_not_found")) return true;
  if (msg.includes("auth session missing")) return true;
  if (msg.includes("invalid refresh token")) return true;
  if (msg.includes("jwt expired")) return true;
  if (msg.includes("invalid jwt")) return true;
  return false;
}

function hasAuthCallbackUrlPayload(): boolean {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  const hp = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return !!(
    sp.get("code") ||
    sp.get("type") ||
    sp.get("error") ||
    sp.get("error_description") ||
    hp.get("access_token") ||
    hp.get("refresh_token") ||
    hp.get("type") ||
    hp.get("error") ||
    hp.get("error_description")
  );
}

/**
 * When the WebView is handling a Supabase redirect (PKCE/hash), avoid signOut
 * during SIGNED_IN/profile races so the callback can finish exchange.
 */
export function shouldDeferSignOutForAuthCallback(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.toLowerCase();
  const onCallbackPath = path === "/auth-callback" || path.startsWith("/auth-callback/");
  return onCallbackPath && hasAuthCallbackUrlPayload();
}

export function clearDubhubAuthLocalMarkers(): void {
  localStorage.removeItem("dubhub-authenticated");
  localStorage.removeItem("dubhub-user-role");
  localStorage.removeItem("userRole");
}

/**
 * Clears Supabase local session, React Query cache, and dub hub auth markers.
 */
export async function hardResetLocalAuthState(options?: {
  clearSessionStorage?: boolean;
}): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Best effort: still wipe client state
  }
  queryClient.clear();
  clearDubhubAuthLocalMarkers();
  if (options?.clearSessionStorage) {
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  }
}

export function replaceHistoryPath(path: string): void {
  try {
    window.history.replaceState(null, "", path);
  } catch {
    // ignore
  }
}
