/**
 * Compact Collaborators management-row secondary line.
 * Existing (persisted) collaborators take priority over staged invites.
 * Prefer listing usernames so invited artists are scannable at a glance.
 */

import { formatUsernameDisplay } from "@/lib/utils";

export type ReleaseCollaboratorSummaryRow = {
  username: string;
  status?: string | null;
};

function formatCollaboratorNames(
  rows: ReleaseCollaboratorSummaryRow[],
): string {
  return rows.map((c) => formatUsernameDisplay(c.username)).filter(Boolean).join(", ");
}

export function formatReleaseCollaboratorsRowSummary(args: {
  existing: ReleaseCollaboratorSummaryRow[];
  staged: ReleaseCollaboratorSummaryRow[];
}): string {
  const existing = args.existing;
  const staged = args.staged;

  if (existing.length === 0 && staged.length === 0) {
    return "Add verified artists";
  }

  if (existing.length > 0) {
    const names = formatCollaboratorNames(existing);
    const pendingCount = existing.filter(
      (c) => String(c.status || "").toUpperCase() === "PENDING",
    ).length;
    if (existing.length === 1 && pendingCount === 1) {
      return `${names} · pending`;
    }
    if (pendingCount > 0) {
      return `${names} · ${pendingCount} pending`;
    }
    return names;
  }

  return formatCollaboratorNames(staged);
}

export function isCollaboratorInviteSetLocked(
  existingCount: number,
): boolean {
  return existingCount > 0;
}
