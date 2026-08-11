/**
 * Sticky release_announced_at write rules (server-authoritative now()).
 *
 * Set once when a release first becomes dated (create dated, or Coming Soon → dated
 * while announcedAt is still null).
 *
 * Never rewrite on later date/time/timezone/mode/title edits.
 * Dated → Coming Soon: do NOT clear (historical announcement preserved).
 * Coming Soon → dated again with existing announcedAt: do NOT create a new window.
 * Legacy dated with null announcedAt: do NOT invent on ordinary edits.
 */

export function shouldSetReleaseAnnouncedAt(args: {
  /** Prior row; null/undefined on create. */
  previous?: {
    isComingSoon?: boolean | null;
    releaseDate?: Date | string | null;
    releaseAnnouncedAt?: Date | string | null;
  } | null;
  next: {
    isComingSoon?: boolean | null;
    releaseDate?: Date | string | null;
  };
}): boolean {
  const nextComingSoon = !!args.next.isComingSoon;
  const nextDated =
    !nextComingSoon &&
    args.next.releaseDate != null &&
    String(args.next.releaseDate).trim() !== "";
  // Coming Soon / undated next → never set (and never clear existing via this helper).
  if (!nextDated) return false;

  const prev = args.previous;
  if (!prev) {
    // Create dated release → announce.
    return true;
  }

  const already =
    prev.releaseAnnouncedAt != null && String(prev.releaseAnnouncedAt).trim() !== "";
  if (already) return false;

  const prevComingSoon = !!prev.isComingSoon;
  const prevDated =
    !prevComingSoon &&
    prev.releaseDate != null &&
    String(prev.releaseDate).trim() !== "";

  // Coming Soon / undated → dated.
  if (!prevDated) return true;

  // Already dated with null announcedAt (legacy) — do NOT invent announce on edit.
  return false;
}
