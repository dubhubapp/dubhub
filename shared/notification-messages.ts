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

/** VAT-ANON-5: title for manual reveal (identity now public). */
export const TRACK_ID_REVEALED_TITLE = "Track ID Revealed";

/** VAT-ANON-5: uploader body when a track is identified anonymously (no artist). */
export const ANONYMOUS_TRACK_IDENTIFIED_UPLOADER_MESSAGE =
  "A track you uploaded was identified.";

/** VAT-ANON-5: liker body when a saved track is identified anonymously with a title. */
export const ANONYMOUS_TRACK_IDENTIFIED_LIKER_WITH_TITLE_MESSAGE =
  "A track you saved was identified.";

function appendAnonymousTitleLine(base: string, trackTitle: string | null | undefined): string {
  const trimmed =
    typeof trackTitle === "string" && trackTitle.trim().length > 0 ? trackTitle.trim() : null;
  if (!trimmed) return base;
  return `${base}\nID - ${trimmed}`;
}

/** VAT-ANON-5: uploader anonymous-identified body (± optional public title). */
export function formatAnonymousTrackIdentifiedUploaderMessage(
  trackTitle: string | null | undefined,
): string {
  return appendAnonymousTitleLine(ANONYMOUS_TRACK_IDENTIFIED_UPLOADER_MESSAGE, trackTitle);
}

/** VAT-ANON-5: liker anonymous-identified body (± optional public title). */
export function formatAnonymousTrackIdentifiedLikerMessage(
  trackTitle: string | null | undefined,
): string {
  const trimmed =
    typeof trackTitle === "string" && trackTitle.trim().length > 0 ? trackTitle.trim() : null;
  if (!trimmed) return TRACK_IDENTIFIED_NOTIFICATION_MESSAGE;
  return appendAnonymousTitleLine(ANONYMOUS_TRACK_IDENTIFIED_LIKER_WITH_TITLE_MESSAGE, trimmed);
}

/** VAT-ANON-5: uploader body after manual reveal (identity public). */
export function formatAnonymousTrackRevealedUploaderMessage(
  artistUsername: string | null | undefined,
  trackTitle?: string | null,
): string {
  const cleaned = cleanUsernameMention(artistUsername);
  const base = cleaned
    ? `Mystery solved — it's @${cleaned}`
    : "The artist has revealed this track.";
  return appendAnonymousTitleLine(base, trackTitle);
}

/** VAT-ANON-5.1: liker/saver body after manual reveal. */
export function formatAnonymousTrackRevealedLikerMessage(
  artistUsername: string | null | undefined,
  trackTitle?: string | null,
): string {
  const cleaned = cleanUsernameMention(artistUsername);
  const base = cleaned
    ? `The artist behind a track you saved has revealed themselves — @${cleaned}`
    : "The artist behind a track you saved has revealed themselves.";
  return appendAnonymousTitleLine(base, trackTitle);
}

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
