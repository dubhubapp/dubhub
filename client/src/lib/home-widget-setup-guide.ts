/**
 * Contextual Release Countdown setup guide.
 * The stored marker means this user opted out with “Don’t show again”.
 * Device-local only — no SQL.
 */

import type { HomeWidgetRelease } from "@shared/home-widget";
import { isHomeReleaseWidgetSelectionEnabled } from "@/lib/home-widget-selection-flag";

export type HomeWidgetSetupGuideRequestDetail = {
  userId: string;
  /** Canonical widget release from the payload just written. Null only when none exists. */
  release?: HomeWidgetRelease | null;
};

export const HOME_WIDGET_SETUP_GUIDE_KEY_PREFIX =
  "dubhub:release-countdown-widget-guide:" as const;

export const HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT =
  "dubhub:release-countdown-widget-guide-request" as const;

export const HOME_WIDGET_SETUP_GUIDE_COPY = {
  title: "Add your Release Countdown",
  body: "Keep track of the release from your Home Screen.",
  steps: [
    "Touch and hold your Home Screen.",
    "Add a widget and search for dub hub.",
    "Choose your countdown size.",
  ],
  primaryCta: "Got it",
  secondaryCta: "Don't show again",
} as const;

/** Only an explicit opt-out persists. Got it and swipe dismiss stay temporary. */
export type HomeWidgetSetupGuideDismissKind = "temporary" | "opt-out";

export function homeWidgetSetupGuideDismissWritesMarker(
  kind: HomeWidgetSetupGuideDismissKind,
): boolean {
  return kind === "opt-out";
}

export function homeWidgetSetupGuideStorageKey(userId: string): string {
  return `${HOME_WIDGET_SETUP_GUIDE_KEY_PREFIX}${userId}`;
}

/** True when this user chose “Don’t show again”. */
export function hasOptedOutOfHomeWidgetSetupGuide(
  userId: string | null | undefined,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): boolean {
  if (!userId || !storage) return false;
  try {
    return storage.getItem(homeWidgetSetupGuideStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Clears only this user’s “Don’t show again” marker.
 * Does not touch countdown selection, widget payload, or saved releases.
 */
export function resetHomeWidgetSetupGuideOptOut(
  userId: string | null | undefined,
  storage: Pick<Storage, "removeItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): boolean {
  if (!userId || !storage) return false;
  try {
    storage.removeItem(homeWidgetSetupGuideStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}

/** Persist “Don’t show again” for this user. */
export function markHomeWidgetSetupGuideOptedOut(
  userId: string | null | undefined,
  storage: Pick<Storage, "setItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): void {
  if (!userId || !storage) return;
  try {
    storage.setItem(homeWidgetSetupGuideStorageKey(userId), "1");
  } catch {
    // ignore
  }
}

/**
 * True when the feature flag is on, an add just succeeded, and this user
 * has not chosen “Don’t show again”.
 */
export function shouldOfferHomeWidgetSetupGuide(args: {
  userId: string | null | undefined;
  selectionSucceeded: boolean;
  enabled?: boolean;
  storage?: Pick<Storage, "getItem"> | null;
}): boolean {
  const enabled =
    args.enabled ?? isHomeReleaseWidgetSelectionEnabled();
  if (!enabled) return false;
  if (!args.selectionSucceeded) return false;
  if (!args.userId) return false;
  if (hasOptedOutOfHomeWidgetSetupGuide(args.userId, args.storage ?? undefined)) {
    return false;
  }
  return true;
}

/** Fire a browser event so the host drawer can open after selection. */
export function requestHomeWidgetSetupGuide(
  userId: string,
  release?: HomeWidgetRelease | null,
): void {
  if (typeof window === "undefined") return;
  const detail: HomeWidgetSetupGuideRequestDetail = { userId, release: release ?? null };
  window.dispatchEvent(
    new CustomEvent(HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT, {
      detail,
    }),
  );
}

export function maybeRequestHomeWidgetSetupGuide(args: {
  userId: string | null | undefined;
  selectionSucceeded: boolean;
  release?: HomeWidgetRelease | null;
}): boolean {
  if (!shouldOfferHomeWidgetSetupGuide(args)) return false;
  if (!args.userId) return false;
  requestHomeWidgetSetupGuide(args.userId, args.release);
  return true;
}
