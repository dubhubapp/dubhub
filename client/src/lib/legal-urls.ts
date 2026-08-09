/**
 * Legal and App Store management URLs for subscription surfaces.
 * Privacy page must exist at the public origin; Apple Standard EULA is used for Terms of Use.
 */

import { Capacitor } from "@capacitor/core";
import { DUBHUB_PUBLIC_ORIGIN } from "./public-app-url";

/** Apple Standard EULA (acceptable Terms of Use link for IAP subscriptions). */
export const DUBHUB_TERMS_OF_USE_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" as const;

/** Public privacy policy. Confirm page is live before App Store review. */
export const DUBHUB_PRIVACY_POLICY_URL = `${DUBHUB_PUBLIC_ORIGIN}/privacy` as const;

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
