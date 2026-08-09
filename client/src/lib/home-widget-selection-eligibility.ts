/**
 * Client eligibility helpers for Home Screen Release Countdown selection actions.
 * Server remains authoritative for final payload validation.
 *
 * PARKED — public “people counting down” aggregate:
 * Requires server-persisted selections, schema/RLS, privacy review, multi-device sync,
 * and abuse controls. Cannot be derived from per-device localStorage. Do not invent
 * fake or device-local aggregate counts.
 */

import { isPersistedReleaseSubscriptionSuspended } from "@/lib/release-subscription-paused";

export type HomeWidgetSelectionReleaseFields = {
  id?: string | null;
  releaseDate?: string | null;
  isComingSoon?: boolean | null;
  isPublic?: boolean | null;
  subscriptionSuspendedAt?: string | null;
  subscriptionPaused?: boolean | null;
  subscriptionSuspended?: boolean | null;
  availability?: string | null;
  viewerSavedRelease?: boolean | null;
};

export type HomeWidgetSelectionActionVisibility =
  | { show: false; reason: "flag_disabled" | "unauthenticated" | "unsaved" | "suspended" | "private" | "missing" }
  | { show: false; reason: "undated"; message: string }
  | { show: true; canSelect: true };

export const HOME_WIDGET_UNDATED_COPY =
  "Add a release date before using this in your Release Countdown." as const;

export function isHomeWidgetSelectionReleaseDated(
  release: Pick<HomeWidgetSelectionReleaseFields, "releaseDate"> | null | undefined,
): boolean {
  if (!release?.releaseDate) return false;
  return Number.isFinite(Date.parse(release.releaseDate));
}

/**
 * Whether the local UI may offer Add to Countdown / In your Countdown.
 * Feed items from scope=saved are already currently saved for the viewer.
 */
export function resolveHomeWidgetSelectionActionVisibility(args: {
  enabled: boolean;
  authenticated: boolean;
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  /** When true, treat as currently saved (Saved feed). When false/undefined, require viewerSavedRelease. */
  assumeSaved?: boolean;
}): HomeWidgetSelectionActionVisibility {
  if (!args.enabled) return { show: false, reason: "flag_disabled" };
  if (!args.authenticated) return { show: false, reason: "unauthenticated" };
  if (!args.release?.id) return { show: false, reason: "missing" };

  const saved =
    args.assumeSaved === true || args.release.viewerSavedRelease === true;
  if (!saved) return { show: false, reason: "unsaved" };

  if (isPersistedReleaseSubscriptionSuspended(args.release)) {
    return { show: false, reason: "suspended" };
  }

  if (args.release.isPublic === false) {
    return { show: false, reason: "private" };
  }

  if (!isHomeWidgetSelectionReleaseDated(args.release)) {
    return {
      show: false,
      reason: "undated",
      message: HOME_WIDGET_UNDATED_COPY,
    };
  }

  return { show: true, canSelect: true };
}

/** Customer-facing product copy. Internal module names may still say “widget”. */
export const HOME_WIDGET_SELECTION_COPY = {
  productName: "Release Countdown",
  useInWidget: "Add to Countdown",
  selectedForWidget: "In your Countdown",
  removeFromWidget: "Remove from Countdown",
  successSelected: "Added to your Release Countdown.",
  successRemoved: "Removed from your Release Countdown.",
  invalid: "This release can’t be used in your Release Countdown anymore.",
  refreshFailed:
    "Your selection was saved, but Release Countdown couldn’t refresh yet. Try again when you’re online.",
  artistFallbackSaved:
    "Saved as your fallback Countdown. Your next release is currently shown.",
  toastTitle: "Release Countdown",
  toastRefreshPending: "Countdown refresh pending",
} as const;

/** Machine reasons from the server that mean the stored selection must be cleared. */
export const HOME_WIDGET_INVALID_SELECTION_ELIGIBILITIES = new Set([
  "invalid_listener_selection",
  "selected_release_not_saved",
  "selected_release_undated",
  "selected_release_unavailable",
]);
