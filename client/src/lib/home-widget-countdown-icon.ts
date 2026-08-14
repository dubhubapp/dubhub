/**
 * Dedicated Release Countdown icon (Lucide CalendarClock).
 * Do not use Clock — that is the Home Feed “Newest” filter icon.
 */

import { CalendarClock, Clock } from "lucide-react";
import { HOME_WIDGET_SELECTION_COPY } from "./home-widget-selection-eligibility";

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
  selectedAction: "Remove this release from your Release Countdown",
  /** Kept for copy/tests — not a visible Detail action after the binary toggle. */
  removeAction: "Remove from Release Countdown",
  cardSelectedSuffix: "In your Release Countdown.",
} as const;

export const HOME_WIDGET_COUNTDOWN_BUSY_COPY = {
  adding: "Adding…",
  removing: "Removing…",
} as const;

export type HomeWidgetSelectionButtonUiState =
  | "idle"
  | "selecting"
  | "selected"
  | "clearing";

export type HomeWidgetSelectionButtonPresentation = {
  label: string;
  ariaPressed: boolean;
  ariaLabel: string;
  iconToneClass: "text-muted-foreground" | "text-foreground";
  labelToneClass: "text-muted-foreground";
  action: "select" | "clear";
  testId: "button-home-widget-use" | "home-widget-selection-selected";
};

/** Release Detail Countdown binary control — presentation only, not a new state store. */
export function resolveHomeWidgetSelectionButtonPresentation(
  uiState: HomeWidgetSelectionButtonUiState,
): HomeWidgetSelectionButtonPresentation {
  const selected = uiState === "selected" || uiState === "clearing";
  if (selected) {
    return {
      label:
        uiState === "clearing"
          ? HOME_WIDGET_COUNTDOWN_BUSY_COPY.removing
          : HOME_WIDGET_SELECTION_COPY.selectedForWidget,
      ariaPressed: true,
      ariaLabel: HOME_WIDGET_COUNTDOWN_A11Y.selectedAction,
      iconToneClass: "text-foreground",
      labelToneClass: "text-muted-foreground",
      action: "clear",
      testId: "home-widget-selection-selected",
    };
  }
  return {
    label:
      uiState === "selecting"
        ? HOME_WIDGET_COUNTDOWN_BUSY_COPY.adding
        : HOME_WIDGET_SELECTION_COPY.useInWidget,
    ariaPressed: false,
    ariaLabel: HOME_WIDGET_COUNTDOWN_A11Y.addAction,
    iconToneClass: "text-muted-foreground",
    labelToneClass: "text-muted-foreground",
    action: "select",
    testId: "button-home-widget-use",
  };
}

export function buildReleaseFeedCardAccessibilityLabel(args: {
  byline: string;
  title: string;
  countdownSelected: boolean;
  schedule?: string;
  status?: string;
}): string {
  const parts = [
    args.title.trim(),
    args.byline.trim(),
    args.schedule?.trim() ?? "",
    args.status?.trim() ?? "",
  ].filter(Boolean);
  if (args.countdownSelected) {
    parts.push(HOME_WIDGET_COUNTDOWN_A11Y.cardSelectedSuffix);
  }
  return parts.join(". ");
}
