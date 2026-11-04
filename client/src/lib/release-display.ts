/**
 * Display helpers for releases: title line with collaborators.
 * Collaborators come from release_collaborators (status=ACCEPTED). Display string is computed.
 *
 * Public credit names drop a leading @ and use natural-language joining:
 * - One: "Artist"
 * - Two: "Artist & Artist1"
 * - Three or more: "Artist, Artist1 & Artist2"
 * The em dash is only the separator before a release title: "Artist & Artist1 — title".
 */

export type CollaboratorLike = { artistId?: string; username?: string; status?: string };

function normalizeInlineReleaseText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripEmbeddedImageDataUris(value: string): string {
  return value
    .replace(/\b[a-z]*data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeReleaseText(value: unknown): string {
  return stripEmbeddedImageDataUris(normalizeInlineReleaseText(value));
}

/** Public credit name. Strips a leading @. Does not change stored usernames. */
export function formatArtistCreditName(username: string | null | undefined): string {
  return sanitizeReleaseText(username).replace(/^@+/, "").trim();
}

/** Separator before names[index]. Empty for the first name. */
export function artistCreditSeparator(index: number, count: number): string {
  if (index <= 0 || count <= 1) return "";
  if (index === count - 1) return " & ";
  return ", ";
}

/**
 * Natural-language public credit.
 * One: "Artist". Two: "Artist & Artist1". Three+: "Artist, Artist1 & Artist2".
 */
export function formatArtistCreditList(names: Array<string | null | undefined>): string {
  const cleaned = names.map((name) => formatArtistCreditName(name)).filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned
    .map((name, index) => `${artistCreditSeparator(index, cleaned.length)}${name}`)
    .join("");
}

function acceptedCollaboratorNames(
  collaborators?: CollaboratorLike[] | null,
): string[] {
  return (collaborators || [])
    .filter((c) => c.status === "ACCEPTED")
    .map((c) => formatArtistCreditName(c.username))
    .filter(Boolean);
}

/** Compute display byline: "Artist & Artist1" */
export function formatReleaseByline(
  ownerUsername: string,
  collaborators?: CollaboratorLike[] | null
): string {
  return formatArtistCreditList([
    formatArtistCreditName(ownerUsername),
    ...acceptedCollaboratorNames(collaborators),
  ]);
}

export type ReleaseBylineSegment = {
  /** Raw username for navigation (no leading @). */
  username: string;
  /** Display label matching formatReleaseByline. */
  label: string;
};

/** Structured owner + accepted collaborators for tappable Release Detail bylines. */
export function getReleaseBylineSegments(
  ownerUsername: string,
  collaborators?: CollaboratorLike[] | null,
): { owner: ReleaseBylineSegment; collaborators: ReleaseBylineSegment[] } {
  const ownerNav = formatArtistCreditName(ownerUsername);
  const ownerLabel = ownerNav;

  const accepted = (collaborators || []).filter((c) => c.status === "ACCEPTED");
  const collabSegments: ReleaseBylineSegment[] = [];
  for (const c of accepted) {
    const nav = formatArtistCreditName(c.username);
    if (!nav) continue;
    collabSegments.push({ username: nav, label: nav });
  }

  return {
    owner: { username: ownerNav || sanitizeReleaseText(ownerUsername), label: ownerLabel },
    collaborators: collabSegments,
  };
}

/** Compute display title line: "Artist & Artist1 — title" */
export function formatReleaseTitleLine(
  ownerUsername: string,
  title: string,
  collaborators?: CollaboratorLike[] | null
): string {
  const byline = formatReleaseByline(ownerUsername, collaborators);
  const cleanedTitle = sanitizeReleaseText(title);
  if (!cleanedTitle) return byline;
  return `${byline} — ${cleanedTitle}`;
}

/**
 * Releases list combined line helper (not the default list layout).
 * Prefer stacked title then @artist in ReleaseFeedCard.
 * If combined text is needed elsewhere, separator is " - " (not ·).
 */
export function formatReleaseFeedPrimaryLine(
  byline: string,
  title: string,
): string {
  const attribution = sanitizeReleaseText(byline);
  const cleanedTitle = sanitizeReleaseText(title);
  if (attribution && cleanedTitle) return `${attribution} - ${cleanedTitle}`;
  return attribution || cleanedTitle;
}
