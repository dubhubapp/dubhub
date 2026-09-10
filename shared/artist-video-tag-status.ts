/**
 * artist_video_tags.status — live code uses pending/confirmed/denied
 * (case variants exist). Docs sometimes say REJECTED; treat as denied.
 */

export function normalizeArtistVideoTagStatus(status: unknown): string {
  if (typeof status !== "string") return "";
  return status.trim().toLowerCase();
}

export function isArtistVideoTagDeniedStatus(status: unknown): boolean {
  const normalized = normalizeArtistVideoTagStatus(status);
  return normalized === "denied" || normalized === "rejected";
}

export function isArtistVideoTagPendingStatus(status: unknown): boolean {
  return normalizeArtistVideoTagStatus(status) === "pending";
}

export function artistIdFromVideoTagRow(tag: {
  artistId?: string | null;
  artist_id?: string | null;
}): string | null {
  const id = tag.artistId ?? tag.artist_id ?? null;
  return id ? String(id) : null;
}

/** Artist IDs with an authoritative denial row on this post. */
export function collectDeniedArtistIdsFromTags(
  tags: ReadonlyArray<{
    artistId?: string | null;
    artist_id?: string | null;
    status?: string | null;
  }>,
): Set<string> {
  const denied = new Set<string>();
  for (const tag of tags) {
    if (!isArtistVideoTagDeniedStatus(tag.status)) continue;
    const artistId = artistIdFromVideoTagRow(tag);
    if (artistId) denied.add(artistId);
  }
  return denied;
}

export const ARTIST_DENIED_MENTION_HINT = "Confirmed this isn't their track";
