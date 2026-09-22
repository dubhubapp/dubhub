/**
 * VAT-ANON-3: shared post identification presentation kinds + copy.
 * Presentation only — does not mutate server state.
 */

export type PostIdentificationPresentationKind =
  | "under_review"
  | "unidentified"
  | "artist_verified_anonymous"
  | "artist_verified"
  | "moderator_identified"
  | "community_approved"
  | "community"
  | "none";

/** Primary pill label for every identified variant (including anonymous). */
export const IDENTIFIED_PILL_LABEL = "Identified" as const;
export const UNIDENTIFIED_PILL_LABEL = "Unidentified" as const;

/** Supporting copy for anonymous artist verification (where secondary text exists). */
export const ANONYMOUS_IDENTIFIED_SUPPORTING_COPY =
  "artist verified · identity hidden" as const;

/** Accessible meaning when EyeOff is the compact identity cue. */
export const ANONYMOUS_IDENTIFIED_A11Y_LABEL =
  "Artist verified, identity hidden" as const;

/** First-login / explainer body for the anonymous identified state. */
export const ANONYMOUS_IDENTIFIED_ONBOARDING_BODY =
  "A verified artist has confirmed the track but chosen to keep their identity hidden for now." as const;

export function isArtistVerifiedAnonymousPost(post: unknown): boolean {
  if (post == null || typeof post !== "object") return false;
  const p = post as Record<string, unknown>;
  return (
    p.isArtistVerifiedAnonymous === true || p.is_artist_verified_anonymous === true
  );
}

function readVerificationStatus(post: Record<string, unknown>): string | undefined {
  const status = post.verificationStatus ?? post.verification_status;
  return typeof status === "string" ? status : undefined;
}

function isPublicArtistVerified(post: Record<string, unknown>): boolean {
  const artistVerifiedBy = post.artistVerifiedBy ?? post.artist_verified_by;
  const isArtistVerified = !!(post.isVerifiedArtist ?? post.is_verified_artist);
  return (
    isArtistVerified &&
    artistVerifiedBy != null &&
    String(artistVerifiedBy).trim() !== ""
  );
}

/**
 * Resolve which identified/unidentified presentation to render.
 * Anonymous artist verification wins over other identified branches.
 */
export function resolvePostIdentificationPresentationKind(
  post: unknown,
): PostIdentificationPresentationKind {
  if (post == null || typeof post !== "object") return "none";
  const p = post as Record<string, unknown>;
  const status = readVerificationStatus(p);
  const isModeratorVerified = !!(p.verifiedByModerator ?? p.verified_by_moderator);

  // Home-only special state — keep ahead of identified tiers.
  if (status === "under_review") return "under_review";

  // Anonymous artist verification takes precedence (public identity scrubbed).
  if (isArtistVerifiedAnonymousPost(p)) return "artist_verified_anonymous";

  if (isPublicArtistVerified(p)) return "artist_verified";

  if (status === "identified" || isModeratorVerified) return "moderator_identified";
  if (status === "community_approved") return "community_approved";
  if (status === "community") return "community";

  if (status === "unverified") return "unidentified";

  return "none";
}

export function postIdentificationPillLabel(
  kind: PostIdentificationPresentationKind,
): typeof IDENTIFIED_PILL_LABEL | typeof UNIDENTIFIED_PILL_LABEL | null {
  switch (kind) {
    case "unidentified":
      return UNIDENTIFIED_PILL_LABEL;
    case "artist_verified_anonymous":
    case "artist_verified":
    case "moderator_identified":
    case "community_approved":
    case "community":
      return IDENTIFIED_PILL_LABEL;
    default:
      return null;
  }
}

export function postIdentificationSupportingCopy(
  kind: PostIdentificationPresentationKind,
): string | null {
  if (kind === "artist_verified_anonymous") {
    return ANONYMOUS_IDENTIFIED_SUPPORTING_COPY;
  }
  return null;
}

export function postIdentificationTestId(
  kind: PostIdentificationPresentationKind,
  prefix = "badge",
): string {
  switch (kind) {
    case "under_review":
      return `${prefix}-under-review`;
    case "unidentified":
      return `${prefix}-unidentified`;
    case "artist_verified_anonymous":
      return `${prefix}-artist-verified-anonymous`;
    case "artist_verified":
      return `${prefix}-artist-verified`;
    case "moderator_identified":
      return `${prefix}-identified`;
    case "community_approved":
      return `${prefix}-community-approved-identified`;
    case "community":
      return `${prefix}-community-identified`;
    default:
      return `${prefix}-none`;
  }
}
