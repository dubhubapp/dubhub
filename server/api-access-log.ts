/**
 * API access-log helpers — keep useful logging, redact sensitive auth routes.
 */

/** Paths whose response JSON must never appear in the access log. */
export const API_LOG_OMIT_RESPONSE_BODY_PATHS = new Set<string>([
  "/api/auth/age-gate",
  "/api/auth/pending-demographics",
  "/api/auth/ensure-demographics",
  "/api/auth/abandon-unconfirmed-signup",
]);

/**
 * True when the access logger should omit the captured JSON response body.
 * Request bodies are never logged by the access middleware today — keep it that way.
 */
export function shouldOmitApiResponseBodyFromLog(path: string): boolean {
  if (!path) return false;
  // Exact match or trailing slash variants only for listed paths.
  const normalized = path.split("?")[0] || path;
  return API_LOG_OMIT_RESPONSE_BODY_PATHS.has(normalized);
}

/**
 * Build the access-log suffix for a response. Never includes omitted routes' bodies.
 * Defense-in-depth: strip known DOB keys if a body is logged elsewhere by mistake.
 */
export function formatApiAccessLogResponseSuffix(
  path: string,
  capturedJsonResponse: unknown,
): string {
  if (shouldOmitApiResponseBodyFromLog(path)) {
    return " :: [body omitted]";
  }
  if (capturedJsonResponse === undefined) {
    return "";
  }
  return ` :: ${JSON.stringify(redactSensitiveApiLogFields(capturedJsonResponse))}`;
}

export function redactSensitiveApiLogFields(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(redactSensitiveApiLogFields);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (
      key === "dateofbirth" ||
      key === "date_of_birth" ||
      key === "dob" ||
      key === "age" ||
      key === "ageyears" ||
      key === "age_years" ||
      key === "ticket" ||
      key === "sealedticket" ||
      key === "email" ||
      key === "emailbinding" ||
      key === "email_binding"
    ) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = redactSensitiveApiLogFields(v);
  }
  return out;
}
