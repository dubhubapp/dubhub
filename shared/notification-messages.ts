/** Shared title for all Track ID confirmation surfaces (push, toast, list). */
export const TRACK_ID_CONFIRMED_TITLE = "🔌 Track ID Confirmed";

/** Uploader body when the post is community-identified. */
export const COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE =
  "Great news - your post has just been identified by the community.";

/**
 * @deprecated Legacy static copy — use formatArtistIdentifiedPostMessage.
 * Kept for legacy classifier matching of older notification rows.
 */
export const ARTIST_IDENTIFIED_POST_MESSAGE =
  "Nice one — the artist confirmed your ID.";

/** Fallback when confirming artist username is unavailable. */
export const ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE =
  "The artist just confirmed the track you uploaded.";

/** Listener/saver body when a liked post first becomes identified. */
export const TRACK_IDENTIFIED_NOTIFICATION_MESSAGE =
  "You finally found it - that track you saved has been identified.";

/** In-app notification body when a community ID is confirmed by moderators. */
export const COMMUNITY_ID_CONFIRMED_MESSAGE = "Your ID was confirmed by the community.";

function cleanUsernameMention(username: string | null | undefined): string | null {
  const cleaned = String(username ?? "")
    .trim()
    .replace(/^@+/, "");
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (lower === "undefined" || lower === "null") return null;
  return cleaned;
}

/** Uploader body when a verified artist confirms their own track. */
export function formatArtistIdentifiedPostMessage(
  artistUsername: string | null | undefined,
): string {
  const cleaned = cleanUsernameMention(artistUsername);
  if (!cleaned) return ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE;
  return `@${cleaned} just confirmed the track you uploaded.`;
}

export function formatReleaseAnnounceMessage(artistUsername: string, releaseTitle: string): string {
  const mention = `@${String(artistUsername ?? "").trim().replace(/^@+/, "") || "Artist"}`;
  const title = String(releaseTitle ?? "").trim() || "a release";
  return `${mention} just announced ${title}.`;
}
