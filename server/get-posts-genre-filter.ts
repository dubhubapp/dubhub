/**
 * getPosts genre WHERE planning. SQL stays in storage; this module has no SQL.
 * Parent-only path must keep today's IN-list semantics when no children are active.
 */

import {
  buildGenreFilterClauses,
  sanitizeSelectedSubgenresByGenre,
  type GenreFilterClause,
  type SelectedSubgenresByGenre,
} from "@shared/home-feed-subgenre-filter";

export type GetPostsGenreWherePlan =
  | { kind: "unrestricted" }
  | { kind: "parent_in"; parents: string[] }
  | { kind: "parent_clauses"; clauses: GenreFilterClause[] };

/** Same parent normalisation getPosts uses today: trim + lower, drop empty/"all". */
export function normalizeGetPostsParentGenres(genres: unknown): string[] {
  if (!Array.isArray(genres)) return [];
  return genres
    .map((g) => (g ?? "").toString().trim().toLowerCase())
    .filter((g) => !!g && g !== "all");
}

/**
 * Decide how getPosts should filter by genre/subgenre.
 * Empty parents → unrestricted (ignore any child params).
 * Parents with no valid children → today's parent IN list.
 * Any valid child refinement → per-parent clauses (empty child list = broad).
 */
export function planGetPostsGenreWhere(
  genres: unknown,
  subgenresByGenre: unknown,
): GetPostsGenreWherePlan {
  const parents = normalizeGetPostsParentGenres(genres);
  if (parents.length === 0) return { kind: "unrestricted" };

  const sanitized: SelectedSubgenresByGenre = sanitizeSelectedSubgenresByGenre(
    genres,
    subgenresByGenre,
  );
  if (Object.keys(sanitized).length === 0) {
    return { kind: "parent_in", parents };
  }

  return {
    kind: "parent_clauses",
    clauses: buildGenreFilterClauses(genres, sanitized),
  };
}
