/**
 * Subtle Release Detail status when the viewer has this release in Saved Releases.
 * Uses the same Calendar icon as the bottom-nav Releases tab.
 */

import {
  getViewerSavedReleaseStatusParts,
  type shouldShowViewerSavedReleaseStatus,
} from "@/lib/release-saved-status";

type SavedStatusArgs = Parameters<typeof shouldShowViewerSavedReleaseStatus>[0];

export function ReleaseSavedToReleasesStatus(props: SavedStatusArgs) {
  const parts = getViewerSavedReleaseStatusParts(props);
  if (!parts) return null;

  const { Icon, label } = parts;
  return (
    <p
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      data-testid="text-release-saved-to-releases"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </p>
  );
}
