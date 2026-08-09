/**
 * Release Detail "Saved to your Releases" visibility — server viewerSavedRelease only.
 */

import { Calendar } from "lucide-react";

/** Same Calendar icon used by the bottom-nav Releases tab. */
export const RELEASE_SAVED_STATUS_ICON = Calendar;

export const RELEASE_SAVED_TO_RELEASES_LABEL = "Saved to your Releases" as const;

/**
 * Show only when detail is fully loaded, viewer is not owner, and server says saved.
 * Do not infer from likes, notifications, or local lists.
 */
export function shouldShowViewerSavedReleaseStatus(args: {
  hasFullDetail: boolean;
  isOwner: boolean;
  viewerSavedRelease: boolean | undefined | null;
}): boolean {
  return (
    args.hasFullDetail === true &&
    args.isOwner === false &&
    args.viewerSavedRelease === true
  );
}

/** Render contract for the saved status row (icon + label). */
export function getViewerSavedReleaseStatusParts(args: {
  hasFullDetail: boolean;
  isOwner: boolean;
  viewerSavedRelease: boolean | undefined | null;
}): { Icon: typeof Calendar; label: typeof RELEASE_SAVED_TO_RELEASES_LABEL } | null {
  if (!shouldShowViewerSavedReleaseStatus(args)) return null;
  return {
    Icon: RELEASE_SAVED_STATUS_ICON,
    label: RELEASE_SAVED_TO_RELEASES_LABEL,
  };
}
