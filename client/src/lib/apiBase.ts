import { Capacitor } from "@capacitor/core";

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

function apiOriginFromEnv(envName: "VITE_API_ORIGIN" | "VITE_DEV_API_ORIGIN"): string {
  const raw = String(import.meta.env[envName] ?? "").trim();
  return raw ? trimTrailingSlashes(raw) : "";
}

/**
 * Origin prepended to `/api/...` paths in Capacitor native builds. Empty in browser so `/api/*` stays same-origin (Vite proxy in dev).
 */
function computeApiBase(): string {
  if (!Capacitor.isNativePlatform()) {
    return "";
  }

  // Native production/TestFlight must explicitly target hosted backend.
  const hostedOrigin = apiOriginFromEnv("VITE_API_ORIGIN");
  if (hostedOrigin) {
    return hostedOrigin;
  }

  // Native development can keep using LAN/local API origin.
  if (import.meta.env.DEV) {
    return apiOriginFromEnv("VITE_DEV_API_ORIGIN");
  }

  throw new Error(
    "[apiBase] Missing VITE_API_ORIGIN for native production build. Configure hosted API origin explicitly.",
  );
}

export const API_BASE = computeApiBase();

/** Build an absolute API URL from a path that starts with `/` (e.g. `/api/posts`). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
