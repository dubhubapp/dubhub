import { getGenreChipStyle } from "@/lib/genre-styles";
import { getSubgenreLabel, isValidSubgenre } from "@shared/post-subgenre";

export type GenrePillDisplay = "parent" | "subgenre";

/** Trusted child label only — unknown/invalid IDs are not shown. */
export function resolveTrustedSubgenreLabel(
  parentGenre: string | null | undefined,
  subgenreId: string | null | undefined,
): string | null {
  if (!isValidSubgenre(parentGenre, subgenreId)) return null;
  return getSubgenreLabel(subgenreId);
}

export function getGenrePillVisibleLabel(
  parentLabel: string,
  trustedSubgenreLabel: string | null,
  display: GenrePillDisplay,
): string {
  if (display === "subgenre" && trustedSubgenreLabel) return trustedSubgenreLabel;
  return parentLabel;
}

export function toggleGenrePillDisplay(display: GenrePillDisplay): GenrePillDisplay {
  return display === "parent" ? "subgenre" : "parent";
}

export function getGenrePillAriaLabel(
  parentLabel: string,
  trustedSubgenreLabel: string,
  display: GenrePillDisplay,
): string {
  if (display === "subgenre") {
    return `Showing sub-genre ${trustedSubgenreLabel}. Double tap to show genre ${parentLabel}.`;
  }
  return `Genre ${parentLabel}. Sub-genre ${trustedSubgenreLabel}. Double tap to show sub-genre.`;
}

export function genrePillMemoFieldsDiffer(
  prev: { genre?: string | null; subgenre?: string | null },
  next: { genre?: string | null; subgenre?: string | null },
): boolean {
  return prev.genre !== next.genre || prev.subgenre !== next.subgenre;
}

/** Pill chrome always follows the parent genre, never the child. */
export function getGenrePillParentStyle(parentGenre: string | null | undefined) {
  return getGenreChipStyle(parentGenre);
}
