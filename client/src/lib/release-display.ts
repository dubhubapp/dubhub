/**
 * Display helpers for releases: title line with collaborators.
 * Collaborators come from release_collaborators (status=ACCEPTED). Display string is computed.
 *
 * Format:
 * - With ACCEPTED collaborators: "@owner & @collab1 & @collab2 — title"
 * - Without: "@owner — title"
 */

import { formatUsernameDisplay } from "@/lib/utils";

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

/** Compute display byline: "@owner & @collab1" */
export function formatReleaseByline(
  ownerUsername: string,
  collaborators?: CollaboratorLike[] | null
): string {
  const accepted = (collaborators || []).filter((c) => c.status === "ACCEPTED");
  const parts: string[] = [];
  const ownerDisp = formatUsernameDisplay(ownerUsername);
  if (ownerDisp) parts.push(sanitizeReleaseText(ownerDisp));
  else {
    const raw = sanitizeReleaseText(ownerUsername).replace(/^@+/, "");
    parts.push(raw ? `@${raw}` : "@");
  }
  for (const c of accepted) {
    const seg = formatUsernameDisplay(c.username);
    if (seg) parts.push(sanitizeReleaseText(seg));
  }
  return parts.length > 1 ? parts.join(" & ") : parts[0];
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
  const ownerNav = sanitizeReleaseText(ownerUsername).replace(/^@+/, "").trim();
  const ownerDisp = formatUsernameDisplay(ownerUsername);
  const ownerLabel = ownerDisp
    ? sanitizeReleaseText(ownerDisp)
    : ownerNav
      ? `@${ownerNav}`
      : "@";

  const accepted = (collaborators || []).filter((c) => c.status === "ACCEPTED");
  const collabSegments: ReleaseBylineSegment[] = [];
  for (const c of accepted) {
    const nav = sanitizeReleaseText(c.username ?? "").replace(/^@+/, "").trim();
    if (!nav) continue;
    const seg = formatUsernameDisplay(c.username);
    const label = seg ? sanitizeReleaseText(seg) : `@${nav}`;
    collabSegments.push({ username: nav, label });
  }

  return {
    owner: { username: ownerNav || sanitizeReleaseText(ownerUsername), label: ownerLabel },
    collaborators: collabSegments,
  };
}

/** Compute display title line: "@owner & @collab1 — title" */
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
