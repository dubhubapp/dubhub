import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { getPublicReleaseShareUrl } from "@/lib/public-app-url";
import type { SharePostResult } from "@/lib/post-share";

const RELEASE_SHARE_MESSAGE = "Check out this release on dub hub.";

function isUserCancelledShareError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: string }).name ?? "") : "";
  if (name === "AbortError") return true;
  const message = "message" in error ? String((error as { message?: string }).message ?? "") : "";
  return /cancel/i.test(message) || /abort/i.test(message);
}

function buildReleaseShareText(url: string): string {
  return `${RELEASE_SHARE_MESSAGE}\n\nURL:\n${url}`;
}

/**
 * Share a release link via native sheet (Capacitor / Web Share) or clipboard fallback.
 * URL format is always https://dubhub.uk/?release=<releaseId>.
 */
export async function shareRelease(releaseId: string): Promise<SharePostResult> {
  const url = getPublicReleaseShareUrl(releaseId);
  const text = buildReleaseShareText(url);

  // Future: record release share event.

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ text, url });
      return "shared";
    } catch (error) {
      if (isUserCancelledShareError(error)) return "cancelled";
      return "failed";
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch (error) {
      if (isUserCancelledShareError(error)) return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
