/**
 * Arms ArtistSubscriptionIntroGate on first eligible owner Profile visit.
 * Must render inside UserProvider.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { getOnboardingSeenKey } from "@/lib/onboarding";
import {
  hasArtistSubscriptionIntroSurfaceBlocker,
  isArtistSubscriptionIntroSeen,
  isOwnerProfileRoute,
  resolveArtistSubscriptionIntroProfileQueue,
  subscribeArtistSubscriptionIntroSurfaceBlockers,
} from "@/lib/artist-subscription-intro";

type Props = {
  introAlreadyActive: boolean;
  appBlockingSurfaceActive: boolean;
  onQueue: (args: { userId: string }) => void;
};

function readOnboardingCompleted(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(getOnboardingSeenKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function ArtistSubscriptionIntroProfileTrigger({
  introAlreadyActive,
  appBlockingSurfaceActive,
  onQueue,
}: Props) {
  const [location] = useLocation();
  const { isAuthenticated, userType, verifiedArtist, currentUser } = useUser();
  const userId = currentUser?.id ?? null;
  const surfaceBlocked = useSyncExternalStore(
    subscribeArtistSubscriptionIntroSurfaceBlockers,
    hasArtistSubscriptionIntroSurfaceBlocker,
    () => false,
  );
  const onQueueRef = useRef(onQueue);
  onQueueRef.current = onQueue;
  /** One arm attempt per continuous owner-Profile sojourn (avoids stale-skip loops). */
  const armedForVisitRef = useRef(false);

  useEffect(() => {
    if (!isOwnerProfileRoute(location)) {
      armedForVisitRef.current = false;
      return;
    }
    if (armedForVisitRef.current || introAlreadyActive) return;

    const decision = resolveArtistSubscriptionIntroProfileQueue({
      isOwnerProfileRoute: true,
      authenticated: isAuthenticated,
      accountType: currentUser?.userType ?? userType,
      verifiedArtist,
      userId,
      onboardingCompleted: readOnboardingCompleted(userId),
      introSeen: isArtistSubscriptionIntroSeen(userId),
      introAlreadyActive,
      blockingSurfaceActive: appBlockingSurfaceActive || surfaceBlocked,
    });
    if (!decision.queue || !userId) return;
    armedForVisitRef.current = true;
    onQueueRef.current({ userId });
  }, [
    location,
    isAuthenticated,
    userType,
    verifiedArtist,
    currentUser?.userType,
    userId,
    introAlreadyActive,
    appBlockingSurfaceActive,
    surfaceBlocked,
  ]);

  return null;
}
