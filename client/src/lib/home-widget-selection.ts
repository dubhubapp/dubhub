/**
 * Listener selection actions for the Home Screen widget.
 */

import {
  HOME_WIDGET_SELECTION_COPY,
  resolveHomeWidgetSelectionActionVisibility,
  type HomeWidgetSelectionReleaseFields,
} from "@/lib/home-widget-selection-eligibility";
import {
  clearHomeWidgetSelectedReleaseId,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
} from "@/lib/home-widget-selection-store";
import {
  refreshHomeWidgetPayload,
  type HomeWidgetRefreshDeps,
  type HomeWidgetRefreshResult,
} from "@/lib/home-widget-refresh";

export type HomeWidgetSelectResult = {
  selectionSaved: boolean;
  refresh: HomeWidgetRefreshResult;
  toastMessage: string;
  refreshFailed: boolean;
};

export async function selectHomeWidgetRelease(args: {
  userId: string;
  releaseId: string;
  artistModeActive?: boolean;
  refreshDeps?: HomeWidgetRefreshDeps;
}): Promise<HomeWidgetSelectResult> {
  const written = writeHomeWidgetSelectedReleaseId(args.userId, args.releaseId);
  if (!written) {
    return {
      selectionSaved: false,
      refresh: {
        ok: false,
        reason: "invalid_response",
        preservedPriorPayload: false,
        error: "Could not persist selection",
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: true,
    };
  }

  const refresh = await refreshHomeWidgetPayload(args.refreshDeps);
  if (!refresh.ok) {
    return {
      selectionSaved: true,
      refresh,
      toastMessage: HOME_WIDGET_SELECTION_COPY.refreshFailed,
      refreshFailed: true,
    };
  }

  if (refresh.clearedInvalidSelection) {
    return {
      selectionSaved: false,
      refresh,
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: false,
    };
  }

  if (refresh.payload.dto.mode === "artist") {
    return {
      selectionSaved: true,
      refresh,
      toastMessage: HOME_WIDGET_SELECTION_COPY.artistFallbackSaved,
      refreshFailed: false,
    };
  }

  if (!refresh.payload.dto.release) {
    return {
      selectionSaved: false,
      refresh,
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: false,
    };
  }

  return {
    selectionSaved: true,
    refresh,
    toastMessage: HOME_WIDGET_SELECTION_COPY.successSelected,
    refreshFailed: false,
  };
}

export async function clearHomeWidgetReleaseSelection(args: {
  userId: string;
  refreshDeps?: HomeWidgetRefreshDeps;
}): Promise<HomeWidgetSelectResult> {
  clearHomeWidgetSelectedReleaseId(args.userId);
  const refresh = await refreshHomeWidgetPayload(args.refreshDeps);
  if (!refresh.ok) {
    return {
      selectionSaved: true,
      refresh,
      toastMessage: HOME_WIDGET_SELECTION_COPY.refreshFailed,
      refreshFailed: true,
    };
  }
  return {
    selectionSaved: true,
    refresh,
    toastMessage: HOME_WIDGET_SELECTION_COPY.successRemoved,
    refreshFailed: false,
  };
}

export function getCurrentHomeWidgetSelectedReleaseId(
  userId: string | null | undefined,
): string | null {
  return readHomeWidgetSelectedReleaseId(userId);
}

export function canOfferHomeWidgetSelection(args: {
  enabled: boolean;
  authenticated: boolean;
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  assumeSaved?: boolean;
}): boolean {
  const visibility = resolveHomeWidgetSelectionActionVisibility(args);
  return visibility.show === true;
}
