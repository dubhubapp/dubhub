/**
 * Release Detail–only Release Countdown configuration control.
 * Hidden unless VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED=true.
 *
 * Saved Releases must not mount this — they use a status-only indicator.
 * Binary direct toggle: Add to Countdown ↔ In your Countdown. No dropdown.
 */

import { useHomeWidgetSelection } from "@/hooks/use-home-widget-selection";
import {
  HomeWidgetCountdownIcon,
  resolveHomeWidgetSelectionButtonPresentation,
} from "@/lib/home-widget-countdown-icon";
import type { HomeWidgetSelectionReleaseFields } from "@/lib/home-widget-selection-eligibility";
import {
  RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS,
  RELEASE_DETAIL_COUNTDOWN_ACTION_ICON_CLASS,
} from "@/lib/release-detail-secondary-action";
import { cn } from "@/lib/utils";

type HomeWidgetSelectionButtonProps = {
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  /** True when the release is already known saved (rare; Detail uses viewerSavedRelease). */
  assumeSaved?: boolean;
  className?: string;
};

export function HomeWidgetSelectionButton({
  release,
  assumeSaved,
  className,
}: HomeWidgetSelectionButtonProps) {
  const { uiState, undatedMessage, select, clear, busy } = useHomeWidgetSelection({
    release,
    assumeSaved,
  });

  if (uiState === "hidden") return null;

  if (uiState === "undated") {
    return (
      <p
        className={cn("text-xs text-muted-foreground leading-snug", className)}
        data-testid="text-home-widget-undated"
      >
        {undatedMessage}
      </p>
    );
  }

  const view = resolveHomeWidgetSelectionButtonPresentation(uiState);

  return (
    <button
      type="button"
      className={cn(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, className)}
      disabled={busy}
      aria-pressed={view.ariaPressed}
      aria-label={view.ariaLabel}
      data-testid={view.testId}
      onClick={() => {
        if (view.action === "clear") void clear();
        else void select();
      }}
    >
      <HomeWidgetCountdownIcon
        className={cn(RELEASE_DETAIL_COUNTDOWN_ACTION_ICON_CLASS, view.iconToneClass)}
        aria-hidden
      />
      <span className={cn("truncate", view.labelToneClass)}>{view.label}</span>
    </button>
  );
}
