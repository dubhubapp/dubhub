/**
 * Capacitor often keeps `window.location` at capacitor://localhost/ while wouter carries
 * /auth-callback?code=... from deep links. Store the original native URL App.tsx receives
 * so AuthCallbackPage can call exchangeCodeForSession with the real redirect URI.
 */

export const PENDING_NATIVE_AUTH_CALLBACK_KEY = "dubhub:pending-native-auth-callback-url";

export function storePendingNativeAuthCallbackUrl(fullIncomingUrl: string): void {
  if (!fullIncomingUrl || !fullIncomingUrl.trim()) return;
  try {
    sessionStorage.setItem(PENDING_NATIVE_AUTH_CALLBACK_KEY, fullIncomingUrl.trim());
  } catch {
    /* ignore */
  }
}

export function peekPendingNativeAuthCallbackUrl(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_NATIVE_AUTH_CALLBACK_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

/** Remove stored URL after resolve completes (success or terminal failure). */
export function clearPendingNativeAuthCallbackUrl(): void {
  try {
    sessionStorage.removeItem(PENDING_NATIVE_AUTH_CALLBACK_KEY);
  } catch {
    /* ignore */
  }
}
