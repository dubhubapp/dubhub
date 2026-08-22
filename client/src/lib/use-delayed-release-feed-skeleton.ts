import { useEffect, useState } from "react";
import {
  RELEASE_FEED_SKELETON_DELAY_MS,
  shouldShowReleaseFeedSkeleton,
} from "@/lib/release-tracker-delayed-skeleton";

/**
 * Returns true only after `isLoading` has stayed true for the delay.
 * Remount (e.g. key={scope-view}) resets the timer for each uncached tab.
 */
export function useDelayedReleaseFeedSkeleton(
  isLoading: boolean,
  delayMs: number = RELEASE_FEED_SKELETON_DELAY_MS,
): boolean {
  const [skeletonDelayElapsed, setSkeletonDelayElapsed] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setSkeletonDelayElapsed(false);
      return;
    }

    setSkeletonDelayElapsed(false);
    const id = window.setTimeout(() => {
      setSkeletonDelayElapsed(true);
    }, delayMs);

    return () => {
      window.clearTimeout(id);
    };
  }, [isLoading, delayMs]);

  return shouldShowReleaseFeedSkeleton({ isLoading, skeletonDelayElapsed });
}
