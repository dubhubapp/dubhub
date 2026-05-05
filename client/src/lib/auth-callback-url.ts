/** Production callback used in Supabase confirmation and recovery emails (must match redirect allow list). */
const DEFAULT_AUTH_CALLBACK_URL = "https://dubhub.uk/auth-callback";
const IOS_NATIVE_AUTH_CALLBACK_URL = "uk.dubhub.app://auth-callback";

/**
 * Redirect URL for Supabase email actions (signup verification, password recovery).
 * Web uses production callback URL; native iOS uses custom URL scheme.
 */
export function getAuthCallbackUrl(): string {
  const isNativeRuntime =
    typeof window !== "undefined" && window.location.protocol === "capacitor:";
  return isNativeRuntime ? IOS_NATIVE_AUTH_CALLBACK_URL : DEFAULT_AUTH_CALLBACK_URL;
}
