/** Mirrors video-card.tsx / comments-modal.tsx artist-verified post gate. */
export function isPostArtistVerified(post: unknown): boolean {
  if (post == null || typeof post !== "object") return false;
  const p = post as Record<string, unknown>;
  const artistVerifiedBy = p.artistVerifiedBy ?? p.artist_verified_by;
  if (artistVerifiedBy == null || String(artistVerifiedBy).trim() === "") return false;
  return !!((p.isVerifiedArtist ?? p.is_verified_artist) as boolean | undefined);
}
