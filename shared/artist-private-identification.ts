/**
 * VAT-ANON-1: public projection rules for anonymous artist identification.
 * Pure helpers — no DB. Public APIs must never expose the claiming artist while anonymous.
 */

import { INPUT_LIMITS } from "./input-limits";

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

/**
 * Normalize optional anonymous track title from client body.
 * Empty/whitespace → null. Rejects non-strings and over-length.
 */
export function normalizeAnonymousTrackTitleInput(
  raw: unknown,
  maxLen: number = INPUT_LIMITS.postTitle,
): { ok: true; title: string | null } | { ok: false; message: string } {
  if (raw == null) return { ok: true, title: null };
  if (typeof raw !== "string") {
    return { ok: false, message: "Title must be a string" };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, title: null };
  if (trimmed.length > maxLen) {
    return {
      ok: false,
      message: `Title must be at most ${maxLen} characters`,
    };
  }
  return { ok: true, title: trimmed };
}

/**
 * Map a raw SQL title onto the public payload only while the post is anonymous.
 * Never used as a channel for claim/artist metadata.
 */
export function mapPublicAnonymousTrackTitle(
  isArtistVerifiedAnonymous: boolean,
  rawTitle: unknown,
): string | null {
  if (!isArtistVerifiedAnonymous) return null;
  if (typeof rawTitle !== "string") return null;
  const trimmed = rawTitle.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Comments / neutral system label: `ID - Test Song`. */
export function formatAnonymousIdentificationTitleLabel(
  title: string | null | undefined,
): string | null {
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  if (!trimmed) return null;
  return `ID - ${trimmed}`;
}

/**
 * Parse artist-supplied track title from confirm comment bodies:
 * `@User confirmed: ArtistCredit - Track Title`
 * `@User confirmed: ArtistCredit` → null (no title)
 *
 * Uses the last ` - ` after `confirmed:` so collaborator credits stay in the credit segment.
 */
export function extractArtistTrackTitleFromConfirmComment(
  body: string | null | undefined,
): string | null {
  if (typeof body !== "string") return null;
  const trimmed = body.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const marker = "confirmed:";
  const idx = lower.indexOf(marker);
  if (idx < 0) return null;
  const after = trimmed.slice(idx + marker.length).trim();
  if (!after) return null;
  const dashIdx = after.lastIndexOf(" - ");
  if (dashIdx < 0) return null;
  const title = after.slice(dashIdx + 3).trim();
  return title.length > 0 ? title : null;
}

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
