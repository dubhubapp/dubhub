/**
 * Server-only RevenueCat REST API v1 client.
 * Never log REVENUECAT_SECRET_API_KEY or full subscriber payloads.
 */

export const REVENUECAT_V1_BASE_URL = "https://api.revenuecat.com/v1";
export const REVENUECAT_REST_TIMEOUT_MS = 10_000;

export class RevenueCatRestError extends Error {
  readonly status: number | null;
  readonly code: "missing_secret" | "timeout" | "http_error" | "invalid_json" | "invalid_shape";

  constructor(
    code: RevenueCatRestError["code"],
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "RevenueCatRestError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Distinguishes omitted expires_date from explicit JSON null (lifetime) and datetime.
 * Missing keys must never be coerced to null.
 */
export type RevenueCatExpiresDateField =
  | { kind: "omitted" }
  | { kind: "null" }
  | { kind: "datetime"; iso: string };

export type RevenueCatV1Entitlement = {
  expires_date: RevenueCatExpiresDateField;
  grace_period_expires_date?: string | null;
  product_identifier: string;
  purchase_date: string | null;
};

export type RevenueCatV1Subscription = {
  auto_resume_date?: string | null;
  billing_issues_detected_at: string | null;
  expires_date: string | null;
  grace_period_expires_date: string | null;
  is_sandbox: boolean;
  original_purchase_date: string | null;
  ownership_type?: string | null;
  period_type?: string | null;
  purchase_date: string | null;
  refunded_at: string | null;
  store: string | null;
  store_transaction_id?: string | null;
  unsubscribe_detected_at: string | null;
};

export type RevenueCatV1NonSubscription = {
  id?: string;
  is_sandbox: boolean;
  purchase_date: string | null;
  store: string | null;
};

export type RevenueCatV1Subscriber = {
  entitlements: Record<string, RevenueCatV1Entitlement>;
  non_subscriptions: Record<string, RevenueCatV1NonSubscription[]>;
  original_app_user_id?: string;
  subscriptions: Record<string, RevenueCatV1Subscription>;
};

export type RevenueCatV1SubscriberResponse = {
  request_date: string;
  request_date_ms?: number;
  subscriber: RevenueCatV1Subscriber;
};

export type FetchRevenueCatSubscriberOptions = {
  appUserId: string;
  secretApiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidIsoDateString(value: string): boolean {
  if (value.trim().length === 0) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

/**
 * Parse entitlement/subscription expires_date without coercing omission to null.
 * Accepts already-parsed `{ kind }` fields so callers may safely re-parse.
 */
export function parseExpiresDateField(
  raw: Record<string, unknown>,
  path: string,
): RevenueCatExpiresDateField {
  if (!Object.prototype.hasOwnProperty.call(raw, "expires_date")) {
    return { kind: "omitted" };
  }
  const value = raw.expires_date;
  if (
    isPlainObject(value) &&
    typeof value.kind === "string"
  ) {
    if (value.kind === "omitted" || value.kind === "null") {
      return { kind: value.kind };
    }
    if (
      value.kind === "datetime" &&
      typeof value.iso === "string" &&
      isValidIsoDateString(value.iso)
    ) {
      return { kind: "datetime", iso: value.iso };
    }
    throw new RevenueCatRestError(
      "invalid_shape",
      `${path}.expires_date is malformed`,
    );
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (typeof value === "string" && isValidIsoDateString(value)) {
    return { kind: "datetime", iso: value };
  }
  throw new RevenueCatRestError(
    "invalid_shape",
    `${path}.expires_date is malformed`,
  );
}

function isEntitlementShape(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  return typeof value.product_identifier === "string";
}

function isSubscription(value: unknown): value is RevenueCatV1Subscription {
  if (!isPlainObject(value)) return false;
  if (typeof value.is_sandbox !== "boolean") return false;
  return true;
}

function isNonSubscription(value: unknown): value is RevenueCatV1NonSubscription {
  if (!isPlainObject(value)) return false;
  if (typeof value.is_sandbox !== "boolean") return false;
  return true;
}

/**
 * Structural validation for RC v1 GET /subscribers/{id} JSON.
 * Does not log the payload.
 */
export function parseRevenueCatV1SubscriberResponse(
  payload: unknown,
): RevenueCatV1SubscriberResponse {
  if (!isPlainObject(payload)) {
    throw new RevenueCatRestError("invalid_shape", "RevenueCat response must be an object");
  }
  if (typeof payload.request_date !== "string" || payload.request_date.trim().length === 0) {
    throw new RevenueCatRestError("invalid_shape", "RevenueCat response missing request_date");
  }
  if (!isPlainObject(payload.subscriber)) {
    throw new RevenueCatRestError("invalid_shape", "RevenueCat response missing subscriber");
  }

  const rawEntitlements = payload.subscriber.entitlements;
  const rawSubscriptions = payload.subscriber.subscriptions;
  const rawNonSubscriptions = payload.subscriber.non_subscriptions;

  if (rawEntitlements !== undefined && !isPlainObject(rawEntitlements)) {
    throw new RevenueCatRestError("invalid_shape", "subscriber.entitlements must be an object");
  }
  if (rawSubscriptions !== undefined && !isPlainObject(rawSubscriptions)) {
    throw new RevenueCatRestError("invalid_shape", "subscriber.subscriptions must be an object");
  }
  if (rawNonSubscriptions !== undefined && !isPlainObject(rawNonSubscriptions)) {
    throw new RevenueCatRestError(
      "invalid_shape",
      "subscriber.non_subscriptions must be an object",
    );
  }

  const entitlements: Record<string, RevenueCatV1Entitlement> = {};
  for (const [key, value] of Object.entries(rawEntitlements ?? {})) {
    if (!isEntitlementShape(value)) {
      throw new RevenueCatRestError(
        "invalid_shape",
        `subscriber.entitlements.${key} is malformed`,
      );
    }

    let gracePeriodExpiresDate: string | null | undefined;
    if (!Object.prototype.hasOwnProperty.call(value, "grace_period_expires_date")) {
      gracePeriodExpiresDate = undefined;
    } else if (value.grace_period_expires_date === null) {
      gracePeriodExpiresDate = null;
    } else if (
      typeof value.grace_period_expires_date === "string" &&
      isValidIsoDateString(value.grace_period_expires_date)
    ) {
      gracePeriodExpiresDate = value.grace_period_expires_date;
    } else {
      throw new RevenueCatRestError(
        "invalid_shape",
        `subscriber.entitlements.${key}.grace_period_expires_date is malformed`,
      );
    }

    let purchaseDate: string | null = null;
    if (
      value.purchase_date !== undefined &&
      value.purchase_date !== null
    ) {
      if (
        typeof value.purchase_date === "string" &&
        isValidIsoDateString(value.purchase_date)
      ) {
        purchaseDate = value.purchase_date;
      } else {
        throw new RevenueCatRestError(
          "invalid_shape",
          `subscriber.entitlements.${key}.purchase_date is malformed`,
        );
      }
    }

    entitlements[key] = {
      expires_date: parseExpiresDateField(value, `subscriber.entitlements.${key}`),
      grace_period_expires_date: gracePeriodExpiresDate,
      product_identifier: value.product_identifier,
      purchase_date: purchaseDate,
    };
  }

  const subscriptions: Record<string, RevenueCatV1Subscription> = {};
  for (const [key, value] of Object.entries(rawSubscriptions ?? {})) {
    if (!isSubscription(value)) {
      throw new RevenueCatRestError(
        "invalid_shape",
        `subscriber.subscriptions.${key} is malformed`,
      );
    }
    // Subscription expires_date: keep string|null for mapping; reject invalid strings.
    let expiresDate: string | null;
    if (!Object.prototype.hasOwnProperty.call(value, "expires_date")) {
      expiresDate = null;
    } else if (value.expires_date === null) {
      expiresDate = null;
    } else if (
      typeof value.expires_date === "string" &&
      isValidIsoDateString(value.expires_date)
    ) {
      expiresDate = value.expires_date;
    } else {
      throw new RevenueCatRestError(
        "invalid_shape",
        `subscriber.subscriptions.${key}.expires_date is malformed`,
      );
    }

    subscriptions[key] = {
      auto_resume_date: value.auto_resume_date ?? null,
      billing_issues_detected_at: value.billing_issues_detected_at ?? null,
      expires_date: expiresDate,
      grace_period_expires_date: value.grace_period_expires_date ?? null,
      is_sandbox: value.is_sandbox,
      original_purchase_date: value.original_purchase_date ?? null,
      ownership_type: value.ownership_type ?? null,
      period_type: value.period_type ?? null,
      purchase_date: value.purchase_date ?? null,
      refunded_at: value.refunded_at ?? null,
      store: value.store ?? null,
      store_transaction_id: value.store_transaction_id ?? null,
      unsubscribe_detected_at: value.unsubscribe_detected_at ?? null,
    };
  }

  const non_subscriptions: Record<string, RevenueCatV1NonSubscription[]> = {};
  for (const [key, value] of Object.entries(rawNonSubscriptions ?? {})) {
    if (!Array.isArray(value)) {
      throw new RevenueCatRestError(
        "invalid_shape",
        `subscriber.non_subscriptions.${key} must be an array`,
      );
    }
    non_subscriptions[key] = value.map((entry, index) => {
      if (!isNonSubscription(entry)) {
        throw new RevenueCatRestError(
          "invalid_shape",
          `subscriber.non_subscriptions.${key}[${index}] is malformed`,
        );
      }
      return {
        id: typeof entry.id === "string" ? entry.id : undefined,
        is_sandbox: entry.is_sandbox,
        purchase_date: entry.purchase_date ?? null,
        store: entry.store ?? null,
      };
    });
  }

  return {
    request_date: payload.request_date,
    request_date_ms:
      typeof payload.request_date_ms === "number" ? payload.request_date_ms : undefined,
    subscriber: {
      entitlements,
      non_subscriptions,
      original_app_user_id:
        typeof payload.subscriber.original_app_user_id === "string"
          ? payload.subscriber.original_app_user_id
          : undefined,
      subscriptions,
    },
  };
}

export async function fetchRevenueCatSubscriber(
  options: FetchRevenueCatSubscriberOptions,
): Promise<RevenueCatV1SubscriberResponse> {
  const secret =
    options.secretApiKey ?? process.env.REVENUECAT_SECRET_API_KEY ?? "";
  if (!secret.trim()) {
    throw new RevenueCatRestError(
      "missing_secret",
      "REVENUECAT_SECRET_API_KEY is not configured",
    );
  }

  const appUserId = String(options.appUserId ?? "").trim();
  if (!appUserId) {
    throw new RevenueCatRestError("invalid_shape", "appUserId is required");
  }

  const timeoutMs = options.timeoutMs ?? REVENUECAT_REST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? REVENUECAT_V1_BASE_URL;
  const url = `${baseUrl}/subscribers/${encodeURIComponent(appUserId)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "AbortError")
    ) {
      throw new RevenueCatRestError("timeout", "RevenueCat request timed out");
    }
    throw new RevenueCatRestError(
      "http_error",
      error instanceof Error ? error.message : "RevenueCat network error",
    );
  } finally {
    clearTimeout(timeout);
  }

  // RC may return 200 for existing customers or 201 when creating an empty customer.
  if (response.status !== 200 && response.status !== 201) {
    throw new RevenueCatRestError(
      "http_error",
      `RevenueCat HTTP ${response.status}`,
      response.status,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RevenueCatRestError("invalid_json", "RevenueCat response was not JSON");
  }

  return parseRevenueCatV1SubscriberResponse(json);
}
