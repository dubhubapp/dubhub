import { Capacitor } from "@capacitor/core";

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

function apiOriginFromEnv(envName: "VITE_API_ORIGIN" | "VITE_DEV_API_ORIGIN"): string {
  const raw = String(import.meta.env[envName] ?? "").trim();
  return raw ? trimTrailingSlashes(raw) : "";
}

function readAppBuildChannel(): string {
  return String(import.meta.env.VITE_APP_BUILD_CHANNEL ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Origin prepended to `/api/...` paths in Capacitor native builds. Empty in browser so `/api/*` stays same-origin (Vite proxy in dev).
 *
 * Authority for local vs hosted is VITE_APP_BUILD_CHANNEL (same as RevenueCat), not Vite DEV/PROD.
 * A plain `vite build` sets import.meta.env.PROD=true; local native diagnostics builds must still
 * reach the LAN/dev API via VITE_DEV_API_ORIGIN when channel=local.
 */
function computeApiBase(): string {
  if (!Capacitor.isNativePlatform()) {
    return "";
  }

  const buildChannel = readAppBuildChannel();

  if (buildChannel === "local") {
    const localOrigin =
      apiOriginFromEnv("VITE_DEV_API_ORIGIN") || apiOriginFromEnv("VITE_API_ORIGIN");
    if (localOrigin) {
      return localOrigin;
    }
    throw new Error(
      "[apiBase] VITE_APP_BUILD_CHANNEL=local requires VITE_DEV_API_ORIGIN (LAN/dev API) for native builds.",
    );
  }

  // testflight / production / missing channel: hosted API origin.
  const hostedOrigin = apiOriginFromEnv("VITE_API_ORIGIN");
  if (hostedOrigin) {
    return hostedOrigin;
  }

  // Native vite-dev (rare): allow LAN origin when Vite DEV is true.
  if (import.meta.env.DEV) {
    return apiOriginFromEnv("VITE_DEV_API_ORIGIN");
  }

  throw new Error(
    "[apiBase] Missing VITE_API_ORIGIN for native production/TestFlight build. Configure hosted API origin explicitly.",
  );
}

export const API_BASE = computeApiBase();

/** Build an absolute API URL from a path that starts with `/` (e.g. `/api/posts`). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
