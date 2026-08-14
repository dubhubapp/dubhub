/**
 * Attached-post card uploader verification.
 *
 * Distinct from posts.is_verified_artist / artist_verified_by, which mean the
 * post was artist-identified as a track — not that the uploader is a verified artist.
 *
 * Card field `isVerifiedArtist` on ReleaseAttachedClip means uploader identity only.
 */

export function isUploaderVerifiedArtist(args: {
  accountType?: string | null;
  verifiedArtist?: boolean | null;
}): boolean {
  return args.accountType === "artist" && args.verifiedArtist === true;
}

/**
 * Resolve attached-clip `isVerifiedArtist` from uploader profile columns.
 * Post identification fields are accepted only so callers can prove they are ignored.
 */
export function resolveAttachedClipUploaderIsVerifiedArtist(input: {
  uploaderAccountType?: string | null;
  uploaderVerifiedArtist?: boolean | null;
  /** Ignored — post track-ID state must not drive the uploader tick. */
  postIsVerifiedArtist?: boolean | null;
  /** Ignored — post track-ID state must not drive the uploader tick. */
  postArtistVerifiedBy?: string | null;
}): boolean {
  void input.postIsVerifiedArtist;
  void input.postArtistVerifiedBy;
  return isUploaderVerifiedArtist({
    accountType: input.uploaderAccountType ?? null,
    verifiedArtist: input.uploaderVerifiedArtist === true,
  });
}
