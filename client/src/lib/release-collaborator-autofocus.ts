/**
 * Collaborators sheet search autofocus.
 * Timing matches Release title sheet (short post-open focus, not a long delay).
 */

export const COLLABORATOR_SEARCH_AUTOFOCUS_MS = 50 as const;

export function shouldAutofocusCollaboratorSearch(args: {
  sheetOpen: boolean;
  invitesLocked: boolean;
  searchDisabled?: boolean;
}): boolean {
  if (!args.sheetOpen) return false;
  if (args.invitesLocked) return false;
  if (args.searchDisabled) return false;
  return true;
}
