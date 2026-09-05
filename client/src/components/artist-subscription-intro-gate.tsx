/**
 * Resolves whether to show the artist-tools intro after owner Profile queues it.
 * Must render inside UserProvider + QueryClientProvider.
 *
 * ARTIST-SUB-INTRO-1C: stale/unknown triggers one authoritative refresh before skip.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import { useUser } from "@/lib/user-context";
import { getOnboardingSeenKey } from "@/lib/onboarding";
import {
  isArtistSubscriptionIntroSeen,
  resolveArtistSubscriptionIntroGateAction,
  resolveArtistSubscriptionIntroOffer,
} from "@/lib/artist-subscription-intro";
import { retryAuthoritativeSubscriptionStatus } from "@/lib/subscription-sync";

type Props = {
  pending: boolean;
  open: boolean;
  userId: string | null;
  blockingSurfaceActive: boolean;
  onShow: () => void;
  onSkip: () => void;
};

function readOnboardingCompleted(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(getOnboardingSeenKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function ArtistSubscriptionIntroGate({
  pending,
  open,
  userId,
  blockingSurfaceActive,
  onShow,
  onSkip,
}: Props) {
  const queryClient = useQueryClient();
  const { isAuthenticated, userType, verifiedArtist, currentUser } = useUser();
  const subscription = useAuthoritativeSubscriptionStatus({
    enabled: pending || open,
  });
  const onShowRef = useRef(onShow);
  const onSkipRef = useRef(onSkip);
  onShowRef.current = onShow;
  onSkipRef.current = onSkip;

  const refreshAttemptedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  /** Bumps after a refresh settles so we re-resolve even if selection identity is unchanged. */
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useEffect(() => {
    if (!pending) {
      refreshAttemptedRef.current = false;
      refreshInFlightRef.current = false;
      return;
    }
    if (open) return;

    const decision = resolveArtistSubscriptionIntroOffer({
      pendingOwnerProfileIntro: pending,
      authenticated: isAuthenticated,
      accountType: currentUser?.userType ?? userType,
      verifiedArtist,
      userId,
      onboardingCompleted: readOnboardingCompleted(userId),
      blockingSurfaceActive,
      introSeen: isArtistSubscriptionIntroSeen(userId),
      subscriptionLoading: subscription.loading,
      subscriptionHasError: subscription.error != null,
      selection: subscription.selection,
    });
    const action = resolveArtistSubscriptionIntroGateAction({
      decision,
      refreshAttempted: refreshAttemptedRef.current,
      refreshInFlight: refreshInFlightRef.current,
    });

    if (action.type === "wait") return;
    if (action.type === "show") {
      onShowRef.current();
      return;
    }
    if (action.type === "skip") {
      onSkipRef.current();
      return;
    }

    // One-shot authoritative reconcile (same path as Settings Retry).
    refreshAttemptedRef.current = true;
    refreshInFlightRef.current = true;
    void retryAuthoritativeSubscriptionStatus({ queryClient }).finally(() => {
      refreshInFlightRef.current = false;
      setRefreshEpoch((n) => n + 1);
    });
  }, [
    pending,
    open,
    isAuthenticated,
    userType,
    verifiedArtist,
    currentUser?.userType,
    userId,
    blockingSurfaceActive,
    subscription.loading,
    subscription.error,
    subscription.selection,
    queryClient,
    refreshEpoch,
  ]);

  return null;
}
