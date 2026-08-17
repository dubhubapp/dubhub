/**
 * Home feed chrome/filter continuity: keep the mounted first card when a
 * Discover chrome change does not actually replace the visible top post.
 *
 * Pure decision helpers only. Playback / VideoCard stay untouched.
 */

export type HomeFeedChromePreserveInput = {
  activePostId: string | null;
  firstEligiblePostId: string | null | undefined;
  viewportAtTop: boolean;
};

/**
 * Preserve the current active card across a chrome/filter query transition
 * only when the already-filtered first row is still that same post and the
 * viewport is already on the first post.
 */
export function shouldPreserveHomeFeedActivePostOnChromeChange(
  input: HomeFeedChromePreserveInput,
): boolean {
  const activePostId = input.activePostId;
  if (!activePostId) return false;
  if (!input.viewportAtTop) return false;
  const firstEligiblePostId = input.firstEligiblePostId;
  if (!firstEligiblePostId) return false;
  return firstEligiblePostId === activePostId;
}

export type HomeFeedChromeContinuityReconcileInput = {
  isPlaceholderData: boolean;
  activePostId: string | null;
  firstEligiblePostId: string | null | undefined;
};

/**
 * After real (non-placeholder) query data arrives for a preserved chrome
 * transition, switch to the new first row when it is no longer the preserved post.
 */
export function shouldReconcilePreservedHomeFeedActivePost(
  input: HomeFeedChromeContinuityReconcileInput,
): boolean {
  if (input.isPlaceholderData) return false;
  const activePostId = input.activePostId;
  const firstEligiblePostId = input.firstEligiblePostId;
  if (!activePostId || !firstEligiblePostId) return false;
  return firstEligiblePostId !== activePostId;
}
