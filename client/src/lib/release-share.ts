import { getPublicReleaseShareUrl } from "@/lib/public-app-url";
import { shareLinkUrl, type ShareLinkResult } from "@/lib/link-share";

export type ShareReleaseResult = ShareLinkResult;

/**
 * Share a release link via native sheet (Capacitor / Web Share) or clipboard fallback.
 * URL format is always https://dubhub.uk/?release=<releaseId>.
 * Native payload is the URL only (no text/title), matching post share.
 */
export async function shareRelease(releaseId: string): Promise<ShareReleaseResult> {
  // Future: record release share event.
  return shareLinkUrl(getPublicReleaseShareUrl(releaseId));
}
