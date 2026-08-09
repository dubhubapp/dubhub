/**
 * One-time “Add your Release Countdown” Home Screen widget setup guide.
 * Device-local acknowledgement only — no SQL.
 */

import { isHomeReleaseWidgetSelectionEnabled } from "@/lib/home-widget-selection-flag";

export const HOME_WIDGET_SETUP_GUIDE_KEY_PREFIX =
  "dubhub:release-countdown-widget-guide:" as const;

export const HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT =
  "dubhub:release-countdown-widget-guide-request" as const;

export const HOME_WIDGET_SETUP_GUIDE_COPY = {
  title: "Add your Release Countdown",
  body: "Keep track of the release from your Home Screen.",
  steps: [
    "Touch and hold your Home Screen.",
    "Add a widget and search for Dub Hub.",
    "Choose your Countdown size.",
  ],
  primaryCta: "Got it",
  secondaryCta: "Not now",
} as const;

export function homeWidgetSetupGuideStorageKey(userId: string): string {
  return `${HOME_WIDGET_SETUP_GUIDE_KEY_PREFIX}${userId}`;
}

export function hasAcknowledgedHomeWidgetSetupGuide(
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

export function markHomeWidgetSetupGuideAcknowledged(
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
 * True when the feature flag is on, user has a successful first Countdown
 * selection path, and they have not acknowledged the guide on this device.
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
  if (hasAcknowledgedHomeWidgetSetupGuide(args.userId, args.storage ?? undefined)) {
    return false;
  }
  return true;
}

/** Fire a browser event so the host drawer can open after selection. */
export function requestHomeWidgetSetupGuide(userId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT, {
      detail: { userId },
    }),
  );
}

export function maybeRequestHomeWidgetSetupGuide(args: {
  userId: string | null | undefined;
  selectionSucceeded: boolean;
}): boolean {
  if (!shouldOfferHomeWidgetSetupGuide(args)) return false;
  if (!args.userId) return false;
  requestHomeWidgetSetupGuide(args.userId);
  return true;
}
