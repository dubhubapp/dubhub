/**
 * Legal and App Store management URLs.
 *
 * Website Privacy / Terms (`DUBHUB_WEBSITE_*`) are the canonical public documents
 * for SignUp acknowledgement and Settings Legal. Apple Standard EULA remains the
 * Terms of Use link on IAP / paywall surfaces only.
 */

import { Capacitor } from "@capacitor/core";
import { DUBHUB_PUBLIC_ORIGIN } from "./public-app-url";

/** Apple Standard EULA (acceptable Terms of Use link for IAP subscriptions). */
export const DUBHUB_TERMS_OF_USE_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" as const;

/**
 * Public privacy policy for IAP / paywall surfaces.
 * Apex origin — keep VAT/paywall semantics unchanged.
 */
export const DUBHUB_PRIVACY_POLICY_URL = `${DUBHUB_PUBLIC_ORIGIN}/privacy` as const;

/**
 * Canonical website legal pages (Settings Legal + SignUp acknowledgement).
 * Opens in the system browser (`target="_blank"` / window.open) so the Capacitor
 * WebView keeps form / Settings state. Distinct from Apple EULA on IAP surfaces.
 */
export const DUBHUB_WEBSITE_TERMS_URL = "https://www.dubhub.uk/terms" as const;
export const DUBHUB_WEBSITE_PRIVACY_URL = "https://www.dubhub.uk/privacy" as const;

/** SignUp alias — same website Terms SOT. */
export const DUBHUB_SIGNUP_TERMS_URL = DUBHUB_WEBSITE_TERMS_URL;

/** SignUp alias — same website Privacy SOT. */
export const DUBHUB_SIGNUP_PRIVACY_URL = DUBHUB_WEBSITE_PRIVACY_URL;

/** Official App Store subscriptions management page. */
export const IOS_MANAGE_SUBSCRIPTIONS_URL =
  "https://apps.apple.com/account/subscriptions" as const;

/**
 * Open Apple’s Manage Subscriptions page when possible.
 * Uses a plain navigation (no Capacitor Browser plugin in this project).
 */
export function openIosManageSubscriptions(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
      window.location.href = IOS_MANAGE_SUBSCRIPTIONS_URL;
      return true;
    }
    window.open(IOS_MANAGE_SUBSCRIPTIONS_URL, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
