/**
 * Release Detail loading presentation. Unknown optional sections must not
 * fabricate large content blocks.
 */

export type ReleaseAttachedPostsSectionState = "omit" | "ready";

/**
 * Attached-posts gallery is optional. Unknown presence must not fabricate cards.
 * Full detail always includes `attachedClips` (possibly empty).
 */
export function resolveReleaseAttachedPostsSectionState(args: {
  hasFullDetail: boolean;
  attachedClips: unknown[] | undefined;
}): ReleaseAttachedPostsSectionState {
  if (args.hasFullDetail && Array.isArray(args.attachedClips)) return "ready";
  return "omit";
}
