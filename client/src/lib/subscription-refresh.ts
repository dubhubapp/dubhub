/**
 * Authenticated POST /api/user/subscription-refresh helper.
 * Empty body only — server derives App User ID from the Bearer token.
 * Never logs tokens or full provider payloads.
 */

import { apiUrl } from "./apiBase";
import {
  parseSubscriptionStatusResponse,
  type UserSubscriptionStatusResponse,
} from "./subscription-status";

export const SUBSCRIPTION_REFRESH_TIMEOUT_MS = 15_000;
export const SUBSCRIPTION_REFRESH_DIAG_TAG = "[DubHub][Subscription][refresh]";

export type SubscriptionRefreshDiagnostics = {
  lastRefreshAttempt: string | null;
  lastRefreshSuccess: string | null;
  lastRefreshFailureReason: string | null;
  refreshLatencyMs: number | null;
  refreshHttpStatus: number | null;
  refreshContentType: string | null;
  refreshBodyPreview: string | null;
  verificationPending: boolean;
  /** Last successfully parsed subscription-status payload from refresh (no secrets). */
  lastStatus: UserSubscriptionStatusResponse | null;
};

export type SubscriptionRefreshResult = {
  ok: boolean;
  verificationPending: boolean;
  httpStatus: number | null;
  latencyMs: number;
  failureReason: string | null;
  contentType: string | null;
  bodyPreview: string | null;
  status: UserSubscriptionStatusResponse | null;
};

type RefreshDeps = {
  getAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

const diagnostics: SubscriptionRefreshDiagnostics = {
  lastRefreshAttempt: null,
  lastRefreshSuccess: null,
  lastRefreshFailureReason: null,
  refreshLatencyMs: null,
  refreshHttpStatus: null,
  refreshContentType: null,
  refreshBodyPreview: null,
  verificationPending: false,
  lastStatus: null,
};

let inFlightRefresh: Promise<SubscriptionRefreshResult> | null = null;

export function getSubscriptionRefreshDiagnostics(): SubscriptionRefreshDiagnostics {
  return { ...diagnostics };
}

/** Test-only reset. */
export function resetSubscriptionRefreshDiagnosticsForTests(): void {
  diagnostics.lastRefreshAttempt = null;
  diagnostics.lastRefreshSuccess = null;
  diagnostics.lastRefreshFailureReason = null;
  diagnostics.refreshLatencyMs = null;
  diagnostics.refreshHttpStatus = null;
  diagnostics.refreshContentType = null;
  diagnostics.refreshBodyPreview = null;
  diagnostics.verificationPending = false;
  diagnostics.lastStatus = null;
  inFlightRefresh = null;
}

async function defaultGetAccessToken(): Promise<string | null> {
  const { supabase } = await import("./supabaseClient");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function recordAttempt(now: Date): void {
  diagnostics.lastRefreshAttempt = now.toISOString();
}

function recordSuccess(
  now: Date,
  latencyMs: number,
  httpStatus: number,
  contentType: string | null,
  status: UserSubscriptionStatusResponse,
): void {
  diagnostics.lastRefreshSuccess = now.toISOString();
  diagnostics.lastRefreshFailureReason = null;
  diagnostics.refreshLatencyMs = latencyMs;
  diagnostics.refreshHttpStatus = httpStatus;
  diagnostics.refreshContentType = contentType;
  diagnostics.refreshBodyPreview = null;
  diagnostics.verificationPending = false;
  diagnostics.lastStatus = status;
}

function recordFailure(
  latencyMs: number,
  httpStatus: number | null,
  reason: string,
  contentType: string | null = null,
  bodyPreview: string | null = null,
): void {
  diagnostics.lastRefreshFailureReason = reason;
  diagnostics.refreshLatencyMs = latencyMs;
  diagnostics.refreshHttpStatus = httpStatus;
  diagnostics.refreshContentType = contentType;
  diagnostics.refreshBodyPreview = bodyPreview;
  diagnostics.verificationPending = true;
}

function safeBodyPreview(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "(empty)";
  // Never include Authorization or long payloads; enough to spot HTML SPA fallbacks.
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed;
}

function looksLikeHtml(text: string, contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html")) return true;
  const head = text.trim().slice(0, 64).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function diagLog(message: string, payload?: Record<string, unknown>): void {
  if (payload) {
    console.log(SUBSCRIPTION_REFRESH_DIAG_TAG, message, payload);
  } else {
    console.log(SUBSCRIPTION_REFRESH_DIAG_TAG, message);
  }
}

async function refreshServerSubscriptionSnapshotOnce(
  deps: RefreshDeps = {},
): Promise<SubscriptionRefreshResult> {
  const getAccessToken = deps.getAccessToken ?? defaultGetAccessToken;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? SUBSCRIPTION_REFRESH_TIMEOUT_MS;
  const nowFn = deps.now ?? (() => new Date());
  const startedAt = Date.now();
  const attemptAt = nowFn();
  recordAttempt(attemptAt);

  const token = await getAccessToken();
  if (!token) {
    const latencyMs = Date.now() - startedAt;
    const failureReason = "missing_access_token";
    recordFailure(latencyMs, 401, failureReason);
    diagLog("refresh_failed", { failureReason, httpStatus: 401, latencyMs });
    return {
      ok: false,
      verificationPending: true,
      httpStatus: 401,
      latencyMs,
      failureReason,
      contentType: null,
      bodyPreview: null,
      status: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = apiUrl("/api/user/subscription-refresh");

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: "{}",
      credentials: "include",
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const httpStatus = response.status;
    const contentType = response.headers.get("content-type");
    const rawText = await response.text();
    const bodyPreview = safeBodyPreview(rawText);

    if (httpStatus === 200) {
      let parsedJson: unknown;
      try {
        parsedJson = rawText.trim() ? JSON.parse(rawText) : null;
      } catch {
        parsedJson = null;
      }

      if (looksLikeHtml(rawText, contentType)) {
        const failureReason =
          "invalid_json:html_body_check_api_origin_or_deployed_refresh_route";
        recordFailure(latencyMs, httpStatus, failureReason, contentType, bodyPreview);
        diagLog("refresh_failed", {
          failureReason,
          httpStatus,
          latencyMs,
          contentType,
          bodyPreview,
        });
        return {
          ok: false,
          verificationPending: true,
          httpStatus,
          latencyMs,
          failureReason,
          contentType,
          bodyPreview,
          status: null,
        };
      }

      const parsed = parseSubscriptionStatusResponse(parsedJson);
      if (!parsed) {
        const failureReason =
          parsedJson == null && !rawText.trim()
            ? "invalid_json:empty_body"
            : "invalid_json:parse_error";
        // Prefer shape-specific reason when JSON parsed but failed canonical validation.
        const shapeFailure =
          parsedJson != null
            ? "invalid_json:missing_environments_or_canonical_shape"
            : failureReason;
        recordFailure(latencyMs, httpStatus, shapeFailure, contentType, bodyPreview);
        diagLog("refresh_failed", {
          failureReason: shapeFailure,
          httpStatus,
          latencyMs,
          contentType,
          bodyPreview,
        });
        return {
          ok: false,
          verificationPending: true,
          httpStatus,
          latencyMs,
          failureReason: shapeFailure,
          contentType,
          bodyPreview,
          status: null,
        };
      }
      recordSuccess(nowFn(), latencyMs, httpStatus, contentType, parsed);
      diagLog("refresh_ok", { httpStatus, latencyMs, contentType });
      return {
        ok: true,
        verificationPending: false,
        httpStatus,
        latencyMs,
        failureReason: null,
        contentType,
        bodyPreview: null,
        status: parsed,
      };
    }

    const failureReason =
      httpStatus === 401
        ? "unauthorized"
        : httpStatus === 403
          ? "forbidden"
          : httpStatus === 409
            ? "conflict"
            : httpStatus >= 500
              ? `server_error_${httpStatus}`
              : `http_${httpStatus}`;
    recordFailure(latencyMs, httpStatus, failureReason, contentType, bodyPreview);
    diagLog("refresh_failed", {
      failureReason,
      httpStatus,
      latencyMs,
      contentType,
      bodyPreview,
    });
    return {
      ok: false,
      verificationPending: true,
      httpStatus,
      latencyMs,
      failureReason,
      contentType,
      bodyPreview,
      status: null,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isAbort =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "AbortError");
    const failureReason = isAbort
      ? "timeout"
      : error instanceof Error
        ? `network:${error.message}`
        : "network_error";
    recordFailure(latencyMs, null, failureReason);
    diagLog("refresh_failed", { failureReason, httpStatus: null, latencyMs });
    return {
      ok: false,
      verificationPending: true,
      httpStatus: null,
      latencyMs,
      failureReason,
      contentType: null,
      bodyPreview: null,
      status: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST /api/user/subscription-refresh with empty body.
 * Dedupes concurrent callers onto one in-flight request (no refresh storms).
 */
export async function refreshServerSubscriptionSnapshot(
  deps: RefreshDeps = {},
): Promise<SubscriptionRefreshResult> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }
  inFlightRefresh = refreshServerSubscriptionSnapshotOnce(deps).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}
