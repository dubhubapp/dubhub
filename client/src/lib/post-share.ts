import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { getPublicPostShareUrl } from "@/lib/public-app-url";

export type SharePostResult = "shared" | "copied" | "cancelled" | "failed";

function isUserCancelledShareError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: string }).name ?? "") : "";
  if (name === "AbortError") return true;
  const message = "message" in error ? String((error as { message?: string }).message ?? "") : "";
  return /cancel/i.test(message) || /abort/i.test(message);
}

/**
 * Share a post link via native sheet (Capacitor / Web Share) or clipboard fallback.
 * URL format is always https://dubhub.uk/?post=<postId>.
 */
export async function sharePost(postId: string): Promise<SharePostResult> {
  const url = getPublicPostShareUrl(postId);

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ url });
      return "shared";
    } catch (error) {
      if (isUserCancelledShareError(error)) return "cancelled";
      return "failed";
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url });
      return "shared";
    } catch (error) {
      if (isUserCancelledShareError(error)) return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
