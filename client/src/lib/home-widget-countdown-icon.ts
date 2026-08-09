/**
 * Dedicated Release Countdown icon (Lucide CalendarClock).
 * Do not use Clock — that is the Home Feed “Newest” filter icon.
 */

import { CalendarClock, Clock } from "lucide-react";

/** Lucide component for Countdown UI (Detail action + Saved Releases indicator). */
export const HomeWidgetCountdownIcon = CalendarClock;

/** Stable name for presentation / regression tests. */
export const HOME_WIDGET_COUNTDOWN_ICON_NAME = "CalendarClock" as const;

/** Home Feed Newest filter icon — must remain distinct from Countdown. */
export const HOME_FEED_NEWEST_ICON = Clock;
export const HOME_FEED_NEWEST_ICON_NAME = "Clock" as const;

export function isCountdownIconDistinctFromNewest(): boolean {
  return HOME_WIDGET_COUNTDOWN_ICON_NAME !== HOME_FEED_NEWEST_ICON_NAME;
}

/** Whether a Saved Releases card should show the status-only Countdown indicator. */
export function shouldShowSavedReleaseCountdownIndicator(args: {
  flagEnabled: boolean;
  selectedReleaseId: string | null | undefined;
  cardReleaseId: string | null | undefined;
}): boolean {
  if (!args.flagEnabled) return false;
  const selected = args.selectedReleaseId?.trim();
  const card = args.cardReleaseId?.trim();
  if (!selected || !card) return false;
  return selected === card;
}

export const HOME_WIDGET_COUNTDOWN_A11Y = {
  addAction: "Add this release to your Release Countdown",
  selectedAction: "This release is in your Release Countdown. Double tap for options.",
  removeAction: "Remove from Release Countdown",
  cardSelectedSuffix: "In your Release Countdown.",
} as const;

export function buildReleaseFeedCardAccessibilityLabel(args: {
  byline: string;
  title: string;
  countdownSelected: boolean;
}): string {
  const parts = [args.byline.trim(), args.title.trim()].filter(Boolean);
  if (args.countdownSelected) {
    parts.push(HOME_WIDGET_COUNTDOWN_A11Y.cardSelectedSuffix);
  }
  return parts.join(". ");
}
