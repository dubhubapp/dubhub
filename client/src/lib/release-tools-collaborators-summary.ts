import { formatUsernameDisplay } from "@/lib/utils";

export type ReleaseCollaboratorSummaryRow = {
  username: string;
  status?: string | null;
};

/**
 * Compact Collaborators management-row secondary line.
 * Existing (persisted) collaborators take priority over staged invites.
 */
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
    const pendingCount = existing.filter(
      (c) => String(c.status || "").toUpperCase() === "PENDING",
    ).length;
    const first = formatUsernameDisplay(existing[0].username);
    if (existing.length === 1) {
      if (pendingCount === 1) return `${first} · pending`;
      return first;
    }
    if (pendingCount > 0) {
      return `${existing.length} artists · ${pendingCount} pending`;
    }
    return `${first} + ${existing.length - 1} more`;
  }

  const first = formatUsernameDisplay(staged[0].username);
  if (staged.length === 1) return first;
  return `${first} + ${staged.length - 1} more`;
}

export function isCollaboratorInviteSetLocked(
  existingCount: number,
): boolean {
  return existingCount > 0;
}
