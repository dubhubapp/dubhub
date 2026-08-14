/**
 * React state for Home Screen widget listener selection.
 */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import { useUser } from "@/lib/user-context";
import { isHomeReleaseWidgetSelectionEnabled } from "@/lib/home-widget-selection-flag";
import {
  HOME_WIDGET_SELECTION_COPY,
  HOME_WIDGET_UNDATED_COPY,
  resolveHomeWidgetSelectionActionVisibility,
  type HomeWidgetSelectionReleaseFields,
} from "@/lib/home-widget-selection-eligibility";
import {
  clearHomeWidgetReleaseSelection,
  getCurrentHomeWidgetSelectedReleaseId,
  selectHomeWidgetRelease,
} from "@/lib/home-widget-selection";
import { readHomeWidgetSelectedReleaseId } from "@/lib/home-widget-selection-store";
import { maybeRequestHomeWidgetSetupGuide } from "@/lib/home-widget-setup-guide";

export type HomeWidgetSelectionUiState =
  | "hidden"
  | "idle"
  | "selected"
  | "selecting"
  | "clearing"
  | "undated";

export function useHomeWidgetSelection(args: {
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  assumeSaved?: boolean;
}) {
  const { toast } = useToast();
  const { currentUser, isAuthenticated, userType, verifiedArtist } = useUser();
  const subscription = useAuthoritativeSubscriptionStatus({
    enabled: isAuthenticated,
  });
  const enabled = isHomeReleaseWidgetSelectionEnabled();
  const userId = currentUser?.id ?? null;

  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    () => (userId ? readHomeWidgetSelectedReleaseId(userId) : null),
  );
  const [busy, setBusy] = useState<"selecting" | "clearing" | null>(null);

  useEffect(() => {
    setSelectedReleaseId(userId ? getCurrentHomeWidgetSelectedReleaseId(userId) : null);
  }, [userId]);

  const visibility = resolveHomeWidgetSelectionActionVisibility({
    enabled,
    authenticated: isAuthenticated,
    release: args.release,
    assumeSaved: args.assumeSaved,
  });

  const releaseId = args.release?.id ? String(args.release.id) : null;
  const isSelected =
    !!releaseId && !!selectedReleaseId && selectedReleaseId === releaseId;

  const artistModeLikelyActive =
    subscription.ok &&
    subscription.hasPaidToolAccess === true &&
    subscription.freshness === "fresh" &&
    userType === "artist" &&
    verifiedArtist === true;

  let uiState: HomeWidgetSelectionUiState = "hidden";
  if (visibility.show === false && visibility.reason === "undated") {
    uiState = "undated";
  } else if (visibility.show === true) {
    if (busy === "selecting") uiState = "selecting";
    else if (busy === "clearing") uiState = "clearing";
    else if (isSelected) uiState = "selected";
    else uiState = "idle";
  }

  const select = useCallback(async () => {
    if (!userId || !releaseId || busy) return;
    setBusy("selecting");
    try {
      const result = await selectHomeWidgetRelease({
        userId,
        releaseId,
        artistModeActive: artistModeLikelyActive,
      });
      // Authoritative store after persist + refresh (may clear/advance).
      setSelectedReleaseId(getCurrentHomeWidgetSelectedReleaseId(userId));
      toast({
        title: result.refreshFailed
          ? HOME_WIDGET_SELECTION_COPY.toastRefreshPending
          : result.selectionSaved
            ? HOME_WIDGET_SELECTION_COPY.toastTitle
            : "Can’t use this release",
        description: result.toastMessage,
        variant: result.selectionSaved ? "default" : "destructive",
      });
      if (result.selectionSaved && !result.refreshFailed) {
        maybeRequestHomeWidgetSetupGuide({
          userId,
          selectionSucceeded: true,
        });
      }
    } finally {
      setBusy(null);
    }
  }, [artistModeLikelyActive, busy, releaseId, toast, userId]);

  const clear = useCallback(async () => {
    if (!userId || busy) return;
    setBusy("clearing");
    try {
      const result = await clearHomeWidgetReleaseSelection({ userId });
      // Authoritative store after local clear + refresh (must not resurrect A).
      setSelectedReleaseId(getCurrentHomeWidgetSelectedReleaseId(userId));
      toast({
        title: result.refreshFailed
          ? HOME_WIDGET_SELECTION_COPY.toastRefreshPending
          : HOME_WIDGET_SELECTION_COPY.toastTitle,
        description: result.toastMessage,
      });
    } finally {
      setBusy(null);
    }
  }, [busy, toast, userId]);

  return {
    enabled,
    uiState,
    isSelected,
    undatedMessage:
      visibility.show === false && visibility.reason === "undated"
        ? visibility.message
        : HOME_WIDGET_UNDATED_COPY,
    labels: HOME_WIDGET_SELECTION_COPY,
    artistModeLikelyActive,
    select,
    clear,
    busy: busy != null,
  };
}
