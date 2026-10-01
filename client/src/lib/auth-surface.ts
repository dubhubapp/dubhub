/**
 * Unauthenticated login canvas chrome.
 * Forces dark-compatible controls on the existing navy surface without
 * reading or writing `dubhub-theme`.
 */
export const AUTH_SURFACE_CLASS = "dubhub-auth-surface";

/** Tells the native shell the visible surface is auth/prelogin/onboarding. Not a theme preference. */
export const NATIVE_AUTH_SURFACE_ATTR = "data-dubhub-auth-surface";

let nativeAuthSurfaceDepth = 0;

export function retainNativeAuthSurface(): () => void {
  nativeAuthSurfaceDepth += 1;
  const root = document.documentElement;
  root.setAttribute(NATIVE_AUTH_SURFACE_ATTR, "on");
  return () => {
    nativeAuthSurfaceDepth = Math.max(0, nativeAuthSurfaceDepth - 1);
    if (nativeAuthSurfaceDepth === 0) {
      root.removeAttribute(NATIVE_AUTH_SURFACE_ATTR);
    }
  };
}
