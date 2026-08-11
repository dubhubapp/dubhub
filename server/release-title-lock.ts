/**
 * Post-live release title immutability for owner PATCH.
 * Uses the same live predicate as timing lock (isServerReleaseLiveForMutation).
 */

/**
 * True when a PATCH body attempts to change the persisted title while live.
 * Same-title (stale client) is not a mutation.
 */
export function isForbiddenLiveTitleMutation(args: {
  live: boolean;
  requestedTitle: string | undefined;
  currentTitle: string;
}): boolean {
  if (!args.live) return false;
  if (args.requestedTitle === undefined) return false;
  return args.requestedTitle.trim() !== args.currentTitle;
}
