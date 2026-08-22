/**
 * Releases feed loading presentation — delay skeleton until load is "slow".
 * Does not change query keys, caching, or fetch behaviour.
 */

export const RELEASE_FEED_SKELETON_DELAY_MS = 200 as const;

export type ReleaseFeedLoadingPresentation = "quiet" | "skeleton" | "ready";

/**
 * Visual loading phase only.
 * Semantic loading (aria-busy) may still apply while quiet.
 */
export function getReleaseFeedLoadingPresentation(args: {
  isLoading: boolean;
  skeletonDelayElapsed: boolean;
}): ReleaseFeedLoadingPresentation {
  if (!args.isLoading) return "ready";
  return args.skeletonDelayElapsed ? "skeleton" : "quiet";
}

export function shouldShowReleaseFeedSkeleton(args: {
  isLoading: boolean;
  skeletonDelayElapsed: boolean;
}): boolean {
  return getReleaseFeedLoadingPresentation(args) === "skeleton";
}
