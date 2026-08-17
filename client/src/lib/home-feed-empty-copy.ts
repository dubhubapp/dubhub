import { sanitizeSelectedSubgenresByGenre, type SelectedSubgenresByGenre } from "@shared/home-feed-subgenre-filter";
import { getSubgenreLabel } from "@shared/post-subgenre";

export type HomeFeedEmptyCopy = {
  title: string;
  subtitle: string;
};

export function listActiveSubgenreRefinementIds(
  selectedGenres: unknown,
  selectedSubgenresByGenre: unknown,
): string[] {
  const sanitized = sanitizeSelectedSubgenresByGenre(selectedGenres, selectedSubgenresByGenre);
  const ids: string[] = [];
  for (const children of Object.values(sanitized)) {
    if (!Array.isArray(children)) continue;
    ids.push(...children);
  }
  return ids;
}

export function getHomeFeedEmptyCopy(input: {
  identificationFilter: "all" | "identified" | "unidentified";
  selectedGenres: readonly string[];
  selectedSubgenresByGenre: SelectedSubgenresByGenre;
  postsLength: number;
}): HomeFeedEmptyCopy {
  const childIds = listActiveSubgenreRefinementIds(
    input.selectedGenres,
    input.selectedSubgenresByGenre,
  );
  if (childIds.length === 1) {
    const label = getSubgenreLabel(childIds[0]) ?? "matching";
    return {
      title: `No ${label} posts yet`,
      subtitle: "Be the first to post one.",
    };
  }
  if (childIds.length > 1) {
    return {
      title: "No posts match these sub-genres yet",
      subtitle: "Try another sub-genre or check back soon.",
    };
  }
  if (input.identificationFilter !== "all" || input.selectedGenres.length > 0) {
    return {
      title: "No matching posts",
      subtitle: "Try changing your filters",
    };
  }
  if (input.postsLength === 0) {
    return {
      title: "No posts yet. Be the first to upload!",
      subtitle: "Try selecting different filters",
    };
  }
  return {
    title: "No matching posts",
    subtitle: "Try changing your filters",
  };
}
