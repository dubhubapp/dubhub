import { Capacitor } from "@capacitor/core";

/** Temporary dev diagnostics — grep this tag to remove later. */
export const API_DIAG_TAG = "[DubHub][API][dev]";

/**
 * Dev build: always on. Production bundle (e.g. Capacitor from `vite build`): off by default.
 * Set `VITE_FORCE_API_DIAGNOSTICS=true` in `.env` when you need Xcode/device logs without a dev Vite build.
 */
export function apiDevDiagnosticsEnabled(): boolean {
  if (import.meta.env.DEV === true) return true;
  return String(import.meta.env.VITE_FORCE_API_DIAGNOSTICS ?? "").toLowerCase() === "true";
}

export function apiDiagIsNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function apiDiagLog(message: string, payload?: Record<string, unknown>): void {
  if (!apiDevDiagnosticsEnabled()) return;
  if (payload !== undefined) {
    console.log(API_DIAG_TAG, message, payload);
  } else {
    console.log(API_DIAG_TAG, message);
  }
}

/**
 * Thrown for failed API responses so React Query / logs retain url, status, and body snippet.
 * (Plain Error leaves console/state looking like `{}` in some serializers.)
 */
export class ApiRequestError extends Error {
  readonly url: string;
  readonly method: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly responseBody?: string;

  constructor(opts: {
    message: string;
    url: string;
    method: string;
    status?: number;
    statusText?: string;
    responseBody?: string;
  }) {
    super(opts.message);
    this.name = "ApiRequestError";
    this.url = opts.url;
    this.method = opts.method;
    this.status = opts.status;
    this.statusText = opts.statusText;
    this.responseBody = opts.responseBody;
  }
}

export function serializeQueryError(e: unknown): Record<string, unknown> {
  if (e instanceof ApiRequestError) {
    return {
      name: e.name,
      message: e.message,
      url: e.url,
      method: e.method,
      status: e.status,
      statusText: e.statusText,
      responseBody:
        e.responseBody && e.responseBody.length > 800
          ? `${e.responseBody.slice(0, 800)}…`
          : e.responseBody,
      stack: e.stack?.split("\n").slice(0, 14).join("\n"),
    };
  }
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: apiDevDiagnosticsEnabled() ? e.stack?.split("\n").slice(0, 12).join("\n") : undefined,
    };
  }
  return { raw: String(e) };
}

export function getApiRequestErrorDetail(e: unknown): {
  message: string;
  url?: string;
  status?: number;
  responseBody?: string;
} {
  if (e instanceof ApiRequestError) {
    return {
      message: e.message,
      url: e.url,
      status: e.status,
      responseBody: e.responseBody,
    };
  }
  if (e instanceof Error) {
    return { message: e.message };
  }
  return { message: typeof e === "string" ? e : "Unknown error" };
}
