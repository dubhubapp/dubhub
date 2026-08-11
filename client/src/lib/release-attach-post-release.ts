/**
 * Post-release attach/detach presentation helpers (Edit Release).
 * Behaviour mirrors existing product rules; this only drives UI affordances.
 */

export const RELEASE_LIVE_ATTACH_NOTICE =
  "Attached posts can’t be removed after release. You can still attach eligible posts.";

export type AttachClipToggleKind = "attach" | "detach" | "attached-readonly";

/**
 * When detach is locked for an already-attached clip, hide the detach action
 * and show a read-only attached state instead of a disabled control.
 */
export function resolveAttachClipToggleKind(args: {
  isSelected: boolean;
  isDetachLocked: boolean;
}): AttachClipToggleKind {
  if (args.isSelected && args.isDetachLocked) return "attached-readonly";
  if (args.isSelected) return "detach";
  return "attach";
}

/** Detach all is hidden (not merely disabled) once the release is live. */
export function shouldShowDetachAllControl(detachAllDisabled: boolean): boolean {
  return !detachAllDisabled;
}

/** Local selection toggle — does not persist. Locked/at-limit are no-ops. */
export function nextSelectedPostIds(args: {
  prev: string[];
  postId: string;
  locked?: boolean;
  maxSelectable?: number | null;
}): string[] {
  if (args.locked) return args.prev;
  if (args.prev.includes(args.postId)) {
    return args.prev.filter((id) => id !== args.postId);
  }
  if (
    typeof args.maxSelectable === "number" &&
    args.prev.length >= args.maxSelectable
  ) {
    return args.prev;
  }
  return [...args.prev, args.postId];
}
