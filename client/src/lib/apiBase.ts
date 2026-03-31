import { Capacitor } from "@capacitor/core";

/** LAN backend for local iOS/Android shells (no Vite proxy). Override with VITE_API_ORIGIN for real deployments. */
const DEFAULT_NATIVE_DEV_ORIGIN = "http://192.168.1.184:5001";

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

function apiOriginFromEnv(): string {
  const raw = String(import.meta.env.VITE_API_ORIGIN ?? import.meta.env.VITE_DEV_API_ORIGIN ?? "").trim();
  return raw ? trimTrailingSlashes(raw) : "";
}

/**
 * Origin prepended to `/api/...` paths in Capacitor native builds. Empty in browser so `/api/*` stays same-origin (Vite proxy in dev).
 */
function computeApiBase(): string {
  if (!Capacitor.isNativePlatform()) {
    return "";
  }
  return apiOriginFromEnv() || DEFAULT_NATIVE_DEV_ORIGIN;
}

export const API_BASE = computeApiBase();

/** Build an absolute API URL from a path that starts with `/` (e.g. `/api/posts`). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
