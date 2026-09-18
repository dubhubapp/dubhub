/**
 * Canonical signup email normalization — shared by age-gate binding,
 * claim, abandon, and check-email conventions.
 *
 * Contract (matches existing `/api/auth/check-email`):
 * - trim whitespace
 * - lowercase
 *
 * Does NOT strip Gmail dots, plus-aliases, or other provider-specific folding.
 * Supabase Auth stores emails case-insensitively; this matches that surface.
 */

export function normalizeSignupEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 3 || !normalized.includes("@")) return null;
  if (normalized.length > 320) return null;
  return normalized;
}
