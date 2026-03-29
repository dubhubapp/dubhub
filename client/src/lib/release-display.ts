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

/** Compute display title line: "@owner & @collab1 — title" */
export function formatReleaseTitleLine(
  ownerUsername: string,
  title: string,
  collaborators?: CollaboratorLike[] | null
): string {
  const accepted = (collaborators || []).filter((c) => c.status === "ACCEPTED");
  const parts: string[] = [];
  const ownerDisp = formatUsernameDisplay(ownerUsername);
  if (ownerDisp) parts.push(ownerDisp);
  else {
    const raw = String(ownerUsername ?? "").trim().replace(/^@+/, "");
    parts.push(raw ? `@${raw}` : "@");
  }
  for (const c of accepted) {
    const seg = formatUsernameDisplay(c.username);
    if (seg) parts.push(seg);
  }
  const byline = parts.length > 1 ? parts.join(" & ") : parts[0];
  return `${byline} — ${title}`;
}
