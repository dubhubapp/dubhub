import { getPublicPostShareUrl } from "@/lib/public-app-url";
import { shareLinkUrl, type ShareLinkResult } from "@/lib/link-share";

export type SharePostResult = ShareLinkResult;

/**
 * Share a post link via native sheet (Capacitor / Web Share) or clipboard fallback.
 * URL format is always https://dubhub.uk/?post=<postId>.
 */
export async function sharePost(postId: string): Promise<SharePostResult> {
  return shareLinkUrl(getPublicPostShareUrl(postId));
}
