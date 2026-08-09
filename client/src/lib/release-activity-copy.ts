/**
 * Release activity timeline copy for the gap between first post and release date.
 * Duration math is supplied by the caller — this only chooses tense.
 */

export function buildReleaseAfterFirstPostCopy(args: {
  /** Preformatted duration, e.g. "85 days". */
  durationLabel: string | null | undefined;
  /** Same upcoming signal as ReleaseStatusPill / isReleaseUpcoming. */
  isUpcoming: boolean;
}): string | null {
  if (args.durationLabel == null) return null;
  const duration = String(args.durationLabel).trim();
  if (!duration) return null;

  // X is first-post → release-date gap, never "days remaining from today".
  return args.isUpcoming
    ? `Releasing ${duration} after first post`
    : `Released ${duration} after first post`;
}
