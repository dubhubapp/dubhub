/**
 * Client eligibility helpers for Home Screen Release Countdown selection actions.
 * Server remains authoritative for final payload validation.
 *
 * PARKED — public “people counting down” aggregate:
 * Requires server-persisted selections, schema/RLS, privacy review, multi-device sync,
 * and abuse controls. Cannot be derived from per-device localStorage. Do not invent
 * fake or device-local aggregate counts.
 */

import { computeHomeWidgetCountdown } from "@shared/home-widget-countdown";
import {
  extractCalendarYmdFromReleaseDate,
  normalizeReleaseTimingMode,
} from "@shared/release-timing";
import { isPersistedReleaseSubscriptionSuspended } from "@/lib/release-subscription-paused";

export type HomeWidgetSelectionReleaseFields = {
  id?: string | null;
  releaseDate?: string | null;
  releaseTimingMode?: string | null;
  releaseAt?: string | Date | null;
  isComingSoon?: boolean | null;
  isPublic?: boolean | null;
  subscriptionSuspendedAt?: string | null;
  subscriptionPaused?: boolean | null;
  subscriptionSuspended?: boolean | null;
  availability?: string | null;
  viewerSavedRelease?: boolean | null;
};

export type HomeWidgetSelectionActionVisibility =
  | {
      show: false;
      reason:
        | "flag_disabled"
        | "unauthenticated"
        | "unsaved"
        | "suspended"
        | "private"
        | "missing"
        | "released";
    }
  | { show: false; reason: "undated"; message: string }
  | { show: true; canSelect: true };

/** Countdown phase for Detail CTA presentation (shared countdown helpers only). */
export type HomeWidgetSelectionCountdownPhase =
  | "upcoming"
  | "out_now"
  | "expired"
  | "unavailable";

export const HOME_WIDGET_UNDATED_COPY =
  "Add a release date before using this in your Release Countdown." as const;

/** setTimeout delay ceiling (~24.8d); far-future wakes re-check and reschedule. */
const HOME_WIDGET_SELECTION_VISIBILITY_WAKE_MAX_MS = 2_147_483_647;

export function isHomeWidgetSelectionReleaseDated(
  release: Pick<HomeWidgetSelectionReleaseFields, "releaseDate"> | null | undefined,
): boolean {
  if (!release?.releaseDate) return false;
  return Number.isFinite(Date.parse(release.releaseDate));
}

/**
 * Map a dated release onto the shared countdown phase.
 * Does not invent retention math — delegates to computeHomeWidgetCountdown.
 */
export function resolveHomeWidgetSelectionCountdownPhase(
  release: HomeWidgetSelectionReleaseFields | null | undefined,
  now?: Date | string | number,
): HomeWidgetSelectionCountdownPhase {
  if (!isHomeWidgetSelectionReleaseDated(release)) return "unavailable";

  const timingMode = normalizeReleaseTimingMode(release?.releaseTimingMode);
  const releaseCalendarDate = extractCalendarYmdFromReleaseDate(
    release?.releaseDate,
  );
  const countdown = computeHomeWidgetCountdown({
    timingMode,
    releaseCalendarDate,
    releaseAt: release?.releaseAt ?? null,
    now:
      now == null
        ? undefined
        : typeof now === "number"
          ? new Date(now)
          : now,
  });
  if (!countdown) return "unavailable";
  if (countdown.isRetentionExpired) return "expired";
  if (countdown.isOutNow) return "out_now";
  return "upcoming";
}

/**
 * Absolute ms when Detail Countdown visibility may next change for this release.
 * Upcoming → boundary (Add hides / selected stays Out now).
 * Out now → retention end (selected control hides).
 */
export function resolveHomeWidgetSelectionVisibilityWakeAtMs(
  release: HomeWidgetSelectionReleaseFields | null | undefined,
  now?: Date | string | number,
): number | null {
  if (!isHomeWidgetSelectionReleaseDated(release)) return null;

  const timingMode = normalizeReleaseTimingMode(release?.releaseTimingMode);
  const releaseCalendarDate = extractCalendarYmdFromReleaseDate(
    release?.releaseDate,
  );
  const countdown = computeHomeWidgetCountdown({
    timingMode,
    releaseCalendarDate,
    releaseAt: release?.releaseAt ?? null,
    now:
      now == null
        ? undefined
        : typeof now === "number"
          ? new Date(now)
          : now,
  });
  if (!countdown || countdown.isRetentionExpired) return null;
  if (countdown.isOutNow) return countdown.outNowUntilMs;
  return countdown.boundaryMs;
}

/**
 * Whether the local UI may offer Add to Release Countdown / In your Countdown.
 * Feed items from scope=saved are already currently saved for the viewer.
 *
 * Phase rules (presentation only; does not clear selection storage):
 * - Upcoming dated → show (Add or In your Countdown).
 * - Released (Out now) + already selected → keep In your Countdown through retention.
 * - Released + unselected → hide (do not offer a new Add).
 * - Retention expired → hide.
 */
export function resolveHomeWidgetSelectionActionVisibility(args: {
  enabled: boolean;
  authenticated: boolean;
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  /** When true, treat as currently saved (Saved feed). When false/undefined, require viewerSavedRelease. */
  assumeSaved?: boolean;
  /** Current local selection for this release — required to retain Out now UI. */
  isSelected?: boolean;
  now?: Date | string | number;
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

  const phase = resolveHomeWidgetSelectionCountdownPhase(
    args.release,
    args.now,
  );
  if (phase === "upcoming") {
    return { show: true, canSelect: true };
  }
  if (phase === "out_now" && args.isSelected === true) {
    return { show: true, canSelect: true };
  }
  return { show: false, reason: "released" };
}

/**
 * Delay until the next visibility wake, clamped for setTimeout.
 * Null when no wake is needed (already terminal / undated).
 */
export function homeWidgetSelectionVisibilityWakeDelayMs(args: {
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  nowMs?: number;
}): number | null {
  const nowMs = args.nowMs ?? Date.now();
  const wakeAt = resolveHomeWidgetSelectionVisibilityWakeAtMs(
    args.release,
    nowMs,
  );
  if (wakeAt == null) return null;
  const delay = wakeAt - nowMs;
  if (delay <= 0) return 0;
  return Math.min(delay, HOME_WIDGET_SELECTION_VISIBILITY_WAKE_MAX_MS);
}

/** Customer-facing product copy. Internal module names may still say “widget”. */
export const HOME_WIDGET_SELECTION_COPY = {
  productName: "Release Countdown",
  useInWidget: "Add to Release Countdown",
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
  "selected_release_out_now_expired",
  // selected_release_not_upcoming is create-intent only — never clear a prior selection.
]);
