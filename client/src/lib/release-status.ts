export type ReleaseStatus = "upcoming" | "released";

export function getReleaseStatus(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined
): ReleaseStatus {
  if (isComingSoon) return "upcoming";
  if (releaseDate) {
    const d = new Date(releaseDate);
    if (d > new Date()) return "upcoming";
  }
  return "released";
}

export function isReleaseUpcoming(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined
): boolean {
  return getReleaseStatus(isComingSoon, releaseDate) === "upcoming";
}

/** Local calendar date as YYYY-MM-DD (for same-day checks in the user's timezone). */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * True when today (local) is the scheduled release calendar day and the release is not "coming soon" without a date.
 * Used for artist-only celebration UI on drop day.
 */
export function isReleaseDayToday(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined
): boolean {
  if (isComingSoon) return false;
  if (!releaseDate) return false;
  const rd = new Date(releaseDate);
  if (Number.isNaN(rd.getTime())) return false;
  return toLocalDateKey(rd) === toLocalDateKey(new Date());
}
