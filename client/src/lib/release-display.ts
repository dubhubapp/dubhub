/**
 * Display helpers for releases: title line with collaborators.
 * Collaborators come from release_collaborators (status=ACCEPTED). Display string is computed.
 *
 * Format:
 * - With ACCEPTED collaborators: "@owner & @collab1 & @collab2 — title"
 * - Without: "@owner — title"
 */

export type CollaboratorLike = { artistId?: string; username?: string; status?: string };

/** Compute display title line: "@owner & @collab1 — title" */
export function formatReleaseTitleLine(
  ownerUsername: string,
  title: string,
  collaborators?: CollaboratorLike[] | null
): string {
  const accepted = (collaborators || []).filter((c) => c.status === "ACCEPTED");
  const parts = [`@${ownerUsername}`];
  for (const c of accepted) {
    if (c.username) parts.push(`@${c.username}`);
  }
  const byline = parts.length > 1 ? parts.join(" & ") : parts[0];
  return `${byline} — ${title}`;
}
