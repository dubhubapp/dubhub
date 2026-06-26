import { normalizeUsernameForStorage } from "@shared/usernameValidation";

const DUBHUB_PUBLIC_SHARE_ORIGIN = "https://dubhub.uk";
const OG_DESCRIPTION_MAX = 200;
const OG_TITLE_MAX = 80;

function truncateSharePreviewText(value: string, maxLen: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function normalizeArtistUsernameParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = normalizeUsernameForStorage(raw);
  if (!normalized || normalized.length > 128) return null;
  return normalized;
}

export function buildCanonicalArtistProfileShareUrl(username: string): string {
  return `${DUBHUB_PUBLIC_SHARE_ORIGIN}/?artist=${encodeURIComponent(username)}`;
}

export function buildArtistProfilePageTitle(username: string): string {
  const display = username.trim() ? `@${username.trim()}` : "@Artist";
  return truncateSharePreviewText(`${display} • Verified Artist`, OG_TITLE_MAX);
}

export function buildArtistProfileShareDescription(username: string): string {
  const mention = username.trim() ? `@${username.trim()}` : "@Artist";
  return truncateSharePreviewText(
    `Discover releases, track IDs and future drops from ${mention} on dub hub.`,
    OG_DESCRIPTION_MAX,
  );
}

export function buildArtistProfileImageAlt(username: string): string {
  const mention = username.trim() ? `@${username.trim()}` : "Artist";
  return truncateSharePreviewText(`${mention} on dub hub`, OG_DESCRIPTION_MAX);
}

export function isShareableVerifiedArtistProfile(user: {
  account_type?: string | null;
  verified_artist?: boolean | null;
}): boolean {
  return user.account_type === "artist" && user.verified_artist === true;
}
