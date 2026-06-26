import { normalizeUsernameForStorage } from "@shared/usernameValidation";

/**
 * Canonical public web origin for off-device links (share, future Universal Links).
 * Not the Capacitor WebView origin (e.g. capacitor://localhost).
 */
export const DUBHUB_PUBLIC_ORIGIN = "https://dubhub.uk";

export function getPublicPostShareUrl(postId: string): string {
  return `${DUBHUB_PUBLIC_ORIGIN}/?post=${encodeURIComponent(postId)}`;
}

export function getPublicReleaseShareUrl(releaseId: string): string {
  return `${DUBHUB_PUBLIC_ORIGIN}/?release=${encodeURIComponent(releaseId)}`;
}

export function getPublicArtistProfileShareUrl(username: string): string {
  const normalized = normalizeUsernameForStorage(username);
  return `${DUBHUB_PUBLIC_ORIGIN}/?artist=${encodeURIComponent(normalized)}`;
}
