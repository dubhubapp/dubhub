/**
 * Global host for optional cancellation feedback.
 * Listens for return from Apple and refreshes subscription state once.
 * Not mounted from Home.
 */

import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useSyncExternalStore } from "react";
import { SubscriptionCancellationFeedbackSheet } from "@/components/subscription-cancellation-feedback-sheet";
import { useUser } from "@/lib/user-context";
import {
  hasExternalSurfaceBlockingCancellationFeedback,
  setArtistSubscriptionIntroSurfaceBlocker,
  subscribeArtistSubscriptionIntroSurfaceBlockers,
} from "@/lib/artist-subscription-intro";
import { ONBOARDING_ACTIVE_SESSION_KEY } from "@/lib/onboarding";
import {
  isAccountDeletionFlowActive,
  subscribeAccountDeletionFlow,
} from "@/lib/delete-account";
import {
  isVerifiedArtistToolsPaywallCoveringNativeNav,
  subscribeVerifiedArtistToolsPaywallNativeNavCover,
} from "@/lib/verified-artist-tools-paywall-native-cover";
import { getAppBuildChannelFromEnv } from "@/lib/subscription-environment";
import { SUBSCRIPTION_STATUS_QUERY_KEY } from "@/lib/subscription-status";
import { refreshServerSubscriptionSnapshot } from "@/lib/subscription-refresh";
import {
  canPresentCancellationFeedbackSheet,
  clearCancellationFeedbackOpportunity,
  handleCancellationFeedbackForeground,
  isCancellationFeedbackCommerceBusy,
  isCancellationFeedbackLocalQaBuild,
  isCancellationFeedbackSensitivePath,
  getCancellationFeedbackOpportunitySnapshot,
  logCancellationFeedback,
  markCancellationFeedbackEventSeen,
  registerCancellationFeedbackDebugOpener,
  subscribeCancellationFeedbackCommerceBusy,
  subscribeCancellationFeedbackOpportunity,
  syncCancellationFeedbackDebugHelper,
  writeCancellationFeedbackDebugOpportunity,
} from "@/lib/subscription-cancellation-feedback";

function readOnboardingActive(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_ACTIVE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeOnboardingActive(listener: () => void): () => void {
  window.addEventListener("dubhub:onboarding-active-changed", listener);
  return () => window.removeEventListener("dubhub:onboarding-active-changed", listener);
}

export function SubscriptionCancellationFeedbackHost() {
  const { currentUser, isAuthenticated } = useUser();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const userId = currentUser?.id ?? null;
  const [open, setOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const shownKeyRef = useRef<string | null>(null);
  const suppressDismissRef = useRef(false);
  const acknowledgedRef = useRef(false);

  const opportunity = useSyncExternalStore(
    subscribeCancellationFeedbackOpportunity,
    getCancellationFeedbackOpportunitySnapshot,
    () => null,
  );
  const onboardingActive = useSyncExternalStore(
    subscribeOnboardingActive,
    readOnboardingActive,
    () => false,
  );
  const accountDeletionActive = useSyncExternalStore(
    subscribeAccountDeletionFlow,
    isAccountDeletionFlowActive,
    () => false,
  );
  const paywallOpen = useSyncExternalStore(
    subscribeVerifiedArtistToolsPaywallNativeNavCover,
    isVerifiedArtistToolsPaywallCoveringNativeNav,
    () => false,
  );
  const commerceBusy = useSyncExternalStore(
    subscribeCancellationFeedbackCommerceBusy,
    isCancellationFeedbackCommerceBusy,
    () => false,
  );
  const otherBlockingSurface = useSyncExternalStore(
    subscribeArtistSubscriptionIntroSurfaceBlockers,
    hasExternalSurfaceBlockingCancellationFeedback,
    () => false,
  );

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    const run = () => {
      const documentVisible =
        typeof document === "undefined" || document.visibilityState === "visible";
      void handleCancellationFeedbackForeground({
        isActive: true,
        documentVisible,
        userId,
        refresh: refreshServerSubscriptionSnapshot,
      }).then((result) => {
        if (result.status) {
          queryClient.setQueryData([...SUBSCRIPTION_STATUS_QUERY_KEY], result.status);
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      run();
    }

    let removeCap: (() => void) | undefined;
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) run();
    }).then((handle) => {
      removeCap = () => {
        void handle.remove();
      };
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeCap?.();
    };
  }, [isAuthenticated, queryClient, userId]);

  useEffect(() => {
    const buildChannel = getAppBuildChannelFromEnv();
    syncCancellationFeedbackDebugHelper(buildChannel);
    if (!isCancellationFeedbackLocalQaBuild(buildChannel)) return;
    const unregister = registerCancellationFeedbackDebugOpener(() => {
      if (userId) writeCancellationFeedbackDebugOpportunity(userId);
      setDebugOpen(true);
    });
    return () => {
      unregister();
      syncCancellationFeedbackDebugHelper(null);
    };
  }, [userId]);

  const canShow =
    debugOpen ||
    (!!opportunity &&
      opportunity.userId === userId &&
      canPresentCancellationFeedbackSheet({
        onboardingActive,
        accountDeletionActive,
        paywallOpen,
        commerceBusy,
        otherBlockingSurface,
        sensitivePath: isCancellationFeedbackSensitivePath(location),
      }));

  useEffect(() => {
    if (debugOpen) {
      if (shownKeyRef.current !== "dev-qa") {
        shownKeyRef.current = "dev-qa";
        logCancellationFeedback("sheet_shown");
      }
      acknowledgedRef.current = false;
      setOpen(true);
      return;
    }
    if (!canShow || !opportunity) {
      if (open) {
        suppressDismissRef.current = true;
        setOpen(false);
      }
      return;
    }
    const key = `${opportunity.userId}:${opportunity.accessThrough}:${opportunity.productIdentifier}`;
    if (shownKeyRef.current !== key) {
      shownKeyRef.current = key;
      logCancellationFeedback("sheet_shown");
    }
    setOpen(true);
    acknowledgedRef.current = false;
  }, [canShow, debugOpen, open, opportunity]);

  useEffect(() => {
    setArtistSubscriptionIntroSurfaceBlocker("cancellation_feedback", open);
    return () => setArtistSubscriptionIntroSurfaceBlocker("cancellation_feedback", false);
  }, [open]);

  const acknowledge = (kind: "dismissed" | "submitted") => {
    if (suppressDismissRef.current) {
      suppressDismissRef.current = false;
      return;
    }
    if (acknowledgedRef.current) return;
    acknowledgedRef.current = true;
    setDebugOpen(false);
    if (opportunity && opportunity.userId === userId) {
      markCancellationFeedbackEventSeen({
        userId: opportunity.userId,
        environment: opportunity.environment,
        productIdentifier: opportunity.productIdentifier,
        accessThrough: opportunity.accessThrough,
      });
    }
    clearCancellationFeedbackOpportunity();
    logCancellationFeedback(kind);
    setOpen(false);
  };

  if (!isAuthenticated) return null;

  return (
    <SubscriptionCancellationFeedbackSheet
      open={open}
      onDismiss={() => acknowledge("dismissed")}
      onSubmitted={() => acknowledge("submitted")}
    />
  );
}
