/**
 * VAT-ANON-1: public projection rules for anonymous artist identification.
 * Pure helpers — no DB. Public APIs must never expose the claiming artist while anonymous.
 */

export const ARTIST_PRIVATE_IDENTIFICATION_STATES = ["anonymous", "revealed"] as const;
export type ArtistPrivateIdentificationState =
  (typeof ARTIST_PRIVATE_IDENTIFICATION_STATES)[number];

export type PublicArtistVerificationProjectionInput = {
  isArtistVerifiedAnonymous?: boolean | null;
  is_artist_verified_anonymous?: boolean | null;
  isVerifiedArtist?: boolean | null;
  is_verified_artist?: boolean | null;
  artistVerifiedBy?: string | null;
  artist_verified_by?: string | null;
};

export type PublicArtistVerificationProjection = {
  /** Public: artist attested this track; identity intentionally hidden. */
  isArtistVerifiedAnonymous: boolean;
  /**
   * Public artist-verified flag. Forced false while anonymous so clients cannot
   * treat the post as publicly attached to an artist profile.
   */
  isVerifiedArtist: boolean;
  /** Public artist id. Always null while anonymous. */
  artistVerifiedBy: null | string;
};

function readAnonymousFlag(input: PublicArtistVerificationProjectionInput): boolean {
  return (
    input.isArtistVerifiedAnonymous === true ||
    input.is_artist_verified_anonymous === true
  );
}

/**
 * Scrub identifying artist fields from any public post payload.
 * Defense-in-depth: even if DB incorrectly has artist_verified_by set while
 * anonymous, public serializers must still omit it.
 */
export function projectPublicArtistVerificationFields(
  input: PublicArtistVerificationProjectionInput,
): PublicArtistVerificationProjection {
  const isAnonymous = readAnonymousFlag(input);
  if (isAnonymous) {
    return {
      isArtistVerifiedAnonymous: true,
      isVerifiedArtist: false,
      artistVerifiedBy: null,
    };
  }

  const isVerifiedArtist =
    input.isVerifiedArtist === true || input.is_verified_artist === true;
  const artistVerifiedByRaw = input.artistVerifiedBy ?? input.artist_verified_by ?? null;
  const artistVerifiedBy =
    typeof artistVerifiedByRaw === "string" && artistVerifiedByRaw.trim() !== ""
      ? artistVerifiedByRaw
      : null;

  return {
    isArtistVerifiedAnonymous: false,
    isVerifiedArtist,
    artistVerifiedBy,
  };
}

/** True when a public payload still leaks a claiming artist id (test helper). */
export function publicPayloadLeaksAnonymousArtistId(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const anonymous =
    p.isArtistVerifiedAnonymous === true || p.is_artist_verified_anonymous === true;
  if (!anonymous) return false;

  if (p.artistVerifiedBy != null && String(p.artistVerifiedBy).trim() !== "") {
    return true;
  }
  if (p.artist_verified_by != null && String(p.artist_verified_by).trim() !== "") {
    return true;
  }
  if (p.isVerifiedArtist === true || p.is_verified_artist === true) {
    // Public is_verified_artist implies artist-attached identity in existing clients.
    return true;
  }
  if (p.verifiedArtist != null || p.artist != null || p.identifyingArtist != null) {
    return true;
  }
  if (p.privateClaimId != null || p.artistPrivateIdentificationId != null) {
    return true;
  }
  return false;
}
