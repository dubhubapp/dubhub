import { getPublicArtistProfileShareUrl } from "@/lib/public-app-url";
import { shareLinkUrl, type ShareLinkResult } from "@/lib/link-share";

export type ShareArtistProfileResult = ShareLinkResult;

/**
 * Share a profile link via native sheet or clipboard fallback.
 * URL format is always https://dubhub.uk/?artist=<username> (lowercase).
 * Deep-link format is unchanged and works for Community + Artist usernames.
 */
export async function shareArtistProfile(username: string): Promise<ShareArtistProfileResult> {
  return shareLinkUrl(getPublicArtistProfileShareUrl(username));
}
