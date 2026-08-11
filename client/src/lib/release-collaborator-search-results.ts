/**
 * Pure collaborator search filtering for the Release Collaborators sheet.
 * Sheet height must not depend on this list length.
 */

export function filterCollaboratorSearchResults(args: {
  searchResults: { id: string; username: string }[];
  excludeIds: Iterable<string>;
  stagedCount: number;
  maxStaged?: number;
  maxResults?: number;
}): { id: string; username: string }[] {
  const exclude = new Set(args.excludeIds);
  const maxStaged = args.maxStaged ?? 4;
  const maxResults = args.maxResults ?? 20;
  if (args.stagedCount >= maxStaged) return [];
  return args.searchResults
    .filter((a) => !exclude.has(a.id))
    .slice(0, maxResults);
}
