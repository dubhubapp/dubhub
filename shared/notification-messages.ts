/** In-app notification body for artist-verified ID (post uploader). */
export const ARTIST_IDENTIFIED_POST_MESSAGE =
  "Nice one — the artist confirmed your ID.";

/** In-app notification body when a community ID is confirmed by moderators. */
export const COMMUNITY_ID_CONFIRMED_MESSAGE = "Your ID was confirmed by the community.";

export function formatReleaseAnnounceMessage(artistUsername: string, releaseTitle: string): string {
  const mention = `@${String(artistUsername ?? "").trim().replace(/^@+/, "") || "Artist"}`;
  const title = String(releaseTitle ?? "").trim() || "a release";
  return `${mention} just announced ${title}.`;
}
