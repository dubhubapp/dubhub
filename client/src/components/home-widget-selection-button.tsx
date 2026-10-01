/**
 * Release Detail Release Countdown controls.
 * Hidden only when VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED=false.
 *
 * Saved Releases must not mount this — they use a status-only indicator.
 * Icon and CTA share one selection scope. Binary toggle, no dropdown.
 */

import { createContext, useContext, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useHomeWidgetSelection } from "@/hooks/use-home-widget-selection";
import {
  HomeWidgetCountdownIcon,
  resolveHomeWidgetSelectionButtonPresentation,
} from "@/lib/home-widget-countdown-icon";
import type { HomeWidgetSelectionReleaseFields } from "@/lib/home-widget-selection-eligibility";
import {
  RELEASE_DETAIL_COUNTDOWN_CTA_CLASS,
  RELEASE_DETAIL_COUNTDOWN_CTA_ICON_CLASS,
} from "@/lib/release-detail-secondary-action";
import { cn } from "@/lib/utils";

type SelectionApi = ReturnType<typeof useHomeWidgetSelection>;

const HomeWidgetSelectionContext = createContext<SelectionApi | null>(null);

type HomeWidgetSelectionScopeProps = {
  /** When false, children render without a selection subscription. */
  enabled: boolean;
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  assumeSaved?: boolean;
  children: ReactNode;
};

export function HomeWidgetSelectionScope({
  enabled,
  release,
  assumeSaved,
  children,
}: HomeWidgetSelectionScopeProps) {
  if (!enabled) return <>{children}</>;
  return (
    <HomeWidgetSelectionScopeActive release={release} assumeSaved={assumeSaved}>
      {children}
    </HomeWidgetSelectionScopeActive>
  );
}

function HomeWidgetSelectionScopeActive({
  release,
  assumeSaved,
  children,
}: Omit<HomeWidgetSelectionScopeProps, "enabled">) {
  const api = useHomeWidgetSelection({ release, assumeSaved });
  return (
    <HomeWidgetSelectionContext.Provider value={api}>
      {children}
    </HomeWidgetSelectionContext.Provider>
  );
}

type HomeWidgetSelectionButtonProps = {
  release?: HomeWidgetSelectionReleaseFields | null | undefined;
  /** True when the release is already known saved (rare; Detail uses viewerSavedRelease). */
  assumeSaved?: boolean;
  className?: string;
};

export function HomeWidgetSelectionButton({
  release,
  assumeSaved,
  className,
}: HomeWidgetSelectionButtonProps) {
  const scoped = useContext(HomeWidgetSelectionContext);
  if (scoped) {
    return <HomeWidgetSelectionPresentation api={scoped} className={className} />;
  }
  return (
    <HomeWidgetSelectionStandalone
      release={release}
      assumeSaved={assumeSaved}
      className={className}
    />
  );
}

function HomeWidgetSelectionStandalone({
  release,
  assumeSaved,
  className,
}: HomeWidgetSelectionButtonProps) {
  const api = useHomeWidgetSelection({ release, assumeSaved });
  return <HomeWidgetSelectionPresentation api={api} className={className} />;
}

function HomeWidgetSelectionPresentation({
  api,
  className,
}: {
  api: SelectionApi;
  className?: string;
}) {
  const { uiState, undatedMessage, select, clear, busy } = api;

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
  const onClick = () => {
    if (view.action === "clear") void clear();
    else void select();
  };

  return (
    <button
      type="button"
      className={cn(RELEASE_DETAIL_COUNTDOWN_CTA_CLASS, className)}
      disabled={busy}
      aria-pressed={view.ariaPressed}
      aria-label={view.ariaLabel}
      data-testid={view.testId}
      data-countdown-selected={view.ariaPressed ? "true" : "false"}
      onClick={onClick}
    >
      {view.ariaPressed ? (
        <Check className={RELEASE_DETAIL_COUNTDOWN_CTA_ICON_CLASS} aria-hidden />
      ) : (
        <HomeWidgetCountdownIcon
          className={RELEASE_DETAIL_COUNTDOWN_CTA_ICON_CLASS}
          aria-hidden
        />
      )}
      <span className="truncate">{view.label}</span>
    </button>
  );
}
