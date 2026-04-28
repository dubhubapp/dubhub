/** Production callback used in Supabase confirmation and recovery emails (must match redirect allow list). */
const DEFAULT_AUTH_CALLBACK_URL = "https://dubhub.uk/auth-callback";

/**
 * Redirect URL for Supabase email actions (signup verification, password recovery).
 * Deep linking is intentionally disabled; use the web callback URL only.
 */
export function getAuthCallbackUrl(): string {
  return DEFAULT_AUTH_CALLBACK_URL;
}
