/**
 * Maps Supabase Auth / GoTrue errors (sign up, password reset, etc.) to stable UI copy.
 * See: HTTP 429, x-sb-error-code: over_email_send_rate_limit
 */

export const AUTH_EMAIL_RATE_LIMIT_MESSAGE =
  "Too many auth emails have been sent recently. Please wait and try again later.";

type AuthLikeError = {
  status?: number;
  code?: string;
  message?: string;
};

function asAuthLike(error: unknown): AuthLikeError | null {
  if (error == null || typeof error !== "object") return null;
  return error as AuthLikeError;
}

/** True when auth email sending is throttled (429 / over_email_send_rate_limit). */
export function isAuthEmailRateLimitError(error: unknown): boolean {
  const e = asAuthLike(error);
  if (!e) return false;
  if (e.status === 429) return true;
  if (e.code === "over_email_send_rate_limit") return true;
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("over_email_send_rate_limit")) return true;
  if (msg.includes("too many requests") && (msg.includes("email") || msg.includes("mail"))) {
    return true;
  }
  return false;
}

/**
 * Duplicate email / user on sign up — only patterns that indicate an existing account,
 * not generic "email" wording (e.g. rate limit messages).
 */
export function isDuplicateSignupEmailError(error: unknown): boolean {
  if (isAuthEmailRateLimitError(error)) return false;
  const e = asAuthLike(error);
  if (!e) return false;
  const msg = (e.message ?? "").toLowerCase();
  const code = (e.code ?? "").toLowerCase();

  if (code === "user_already_registered" || code === "email_exists") return true;
  if (msg.includes("already registered")) return true;
  if (msg.includes("user already registered")) return true;
  if (msg.includes("email address is already registered")) return true;
  if (msg.includes("email has already been registered")) return true;
  if (msg.includes("a user with this email address has already been registered")) return true;
  if (msg.includes("user already exists")) return true;
  return false;
}
