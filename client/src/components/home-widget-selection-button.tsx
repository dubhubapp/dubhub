/**
 * Release Detail–only Release Countdown configuration control.
 * Hidden unless VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED=true.
 *
 * Saved Releases must not mount this — they use a status-only indicator.
 */

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHomeWidgetSelection } from "@/hooks/use-home-widget-selection";
import {
  HOME_WIDGET_COUNTDOWN_A11Y,
  HomeWidgetCountdownIcon,
} from "@/lib/home-widget-countdown-icon";
import type { HomeWidgetSelectionReleaseFields } from "@/lib/home-widget-selection-eligibility";
import {
  RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS,
  RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS,
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
  const {
    uiState,
    undatedMessage,
    labels,
    select,
    clear,
    busy,
  } = useHomeWidgetSelection({ release, assumeSaved });

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

  if (uiState === "selected" || uiState === "clearing") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, className)}
            disabled={busy}
            aria-label={HOME_WIDGET_COUNTDOWN_A11Y.selectedAction}
            aria-haspopup="menu"
            data-testid="home-widget-selection-selected"
          >
            <HomeWidgetCountdownIcon
              className={cn(RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS, "text-accent")}
              aria-hidden
            />
            <span className="truncate">
              {uiState === "clearing" ? "Removing…" : labels.selectedForWidget}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[12rem]">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault();
              void clear();
            }}
            aria-label={HOME_WIDGET_COUNTDOWN_A11Y.removeAction}
            data-testid="button-home-widget-remove"
          >
            {labels.removeFromWidget}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <button
      type="button"
      className={cn(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, className)}
      disabled={busy}
      onClick={() => void select()}
      aria-label={HOME_WIDGET_COUNTDOWN_A11Y.addAction}
      data-testid="button-home-widget-use"
    >
      <HomeWidgetCountdownIcon
        className={cn(RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS, "text-muted-foreground")}
        aria-hidden
      />
      <span className="truncate">
        {uiState === "selecting" ? "Adding…" : labels.useInWidget}
      </span>
    </button>
  );
}
