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
