import { UserPlus } from "lucide-react";

/**
 * Release tools Collaborators row icon — same person-plus as the Invite action,
 * not the Users/community-identified glyph.
 */
export const ReleaseCollaboratorsRowIcon = UserPlus;

export function isCollaboratorsRowInviteIcon(
  icon: { displayName?: string | null } | null | undefined,
): boolean {
  return icon?.displayName === "UserPlus";
}
