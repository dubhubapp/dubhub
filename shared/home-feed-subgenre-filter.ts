/**
 * Home Discover subgenre filter model (shared client/server).
 * Optional refinement of already-selected parent genres. No SQL.
 */

import { isValidSubgenre } from "./post-subgenre";
import {
  normalizeCanonicalGenreId,
  type CanonicalGenreId,
} from "./report-genre";

/** Sanitized child IDs keyed by canonical parent. Empty/missing key = broad parent. */
export type SelectedSubgenresByGenre = {
  [K in CanonicalGenreId]?: string[];
};

/** One parent clause. Empty `subgenres` = broad parent (includes NULL children). */
export type GenreFilterClause = {
  parent: CanonicalGenreId;
  subgenres: string[];
};

function normalizeSelectedParentIds(selectedGenres: unknown): CanonicalGenreId[] {
  if (!Array.isArray(selectedGenres)) return [];
  const out: CanonicalGenreId[] = [];
  const seen = new Set<CanonicalGenreId>();
  for (const item of selectedGenres) {
    if (typeof item !== "string") continue;
    const id = normalizeCanonicalGenreId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function readRawChildList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    out.push(item);
  }
  return out;
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Keep only children that belong to currently selected canonical parents.
 * Does not auto-select parents. Omits parents with no valid children.
 */
export function sanitizeSelectedSubgenresByGenre(
  selectedGenres: unknown,
  selectedSubgenresByGenre: unknown,
): SelectedSubgenresByGenre {
  const selectedParents = normalizeSelectedParentIds(selectedGenres);
  if (selectedParents.length === 0) return {};

  const selectedSet = new Set(selectedParents);
  const collected = new Map<CanonicalGenreId, string[]>();

  if (
    selectedSubgenresByGenre &&
    typeof selectedSubgenresByGenre === "object" &&
    !Array.isArray(selectedSubgenresByGenre)
  ) {
    for (const [rawParent, rawChildren] of Object.entries(
      selectedSubgenresByGenre as Record<string, unknown>,
    )) {
      const parentId = normalizeCanonicalGenreId(rawParent);
      if (!parentId || !selectedSet.has(parentId)) continue;
      const existing = collected.get(parentId) ?? [];
      existing.push(...readRawChildList(rawChildren));
      collected.set(parentId, existing);
    }
  }

  const result: SelectedSubgenresByGenre = {};
  for (const parentId of selectedParents) {
    const rawChildren = collected.get(parentId);
    if (!rawChildren) continue;
    const seen = new Set<string>();
    const children: string[] = [];
    for (const child of rawChildren) {
      const id = child.trim();
      if (!id || seen.has(id) || !isValidSubgenre(parentId, id)) continue;
      seen.add(id);
      children.push(id);
    }
    if (children.length === 0) continue;
    result[parentId] = sortIds(children);
  }
  return result;
}

/**
 * Deterministic `parent:child` pairs for `subgenres=` query values.
 * Empty string when there is nothing to send.
 */
export function serializeSubgenreFilterQuery(
  selectedGenres: unknown,
  selectedSubgenresByGenre: unknown,
): string {
  const sanitized = sanitizeSelectedSubgenresByGenre(
    selectedGenres,
    selectedSubgenresByGenre,
  );
  const pairs: string[] = [];
  for (const parent of sortIds(Object.keys(sanitized))) {
    const children = sanitized[parent as CanonicalGenreId];
    if (!children) continue;
    for (const child of children) {
      pairs.push(`${parent}:${child}`);
    }
  }
  return pairs.join(",");
}

/** Structural parse only. Malformed segments are skipped; does not throw. */
export function parseSubgenreFilterQueryLoose(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "string") return {};
  const map: Record<string, string[]> = {};
  for (const segment of raw.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0 || colon === trimmed.length - 1) continue;
    if (trimmed.indexOf(":", colon + 1) !== -1) continue;
    const parent = trimmed.slice(0, colon).trim();
    const child = trimmed.slice(colon + 1).trim();
    if (!parent || !child) continue;
    const list = map[parent] ?? [];
    list.push(child);
    map[parent] = list;
  }
  return map;
}

/**
 * Parse a `subgenres=` query value and sanitise against currently selected parents.
 */
export function parseSubgenreFilterQuery(
  raw: unknown,
  selectedGenres: unknown,
): SelectedSubgenresByGenre {
  return sanitizeSelectedSubgenresByGenre(
    selectedGenres,
    parseSubgenreFilterQueryLoose(raw),
  );
}

/**
 * Normalised parent clauses for later SQL construction.
 * Empty `subgenres` means broad parent (NULL children included).
 */
export function buildGenreFilterClauses(
  selectedGenres: unknown,
  selectedSubgenresByGenre: unknown,
): GenreFilterClause[] {
  const parents = normalizeSelectedParentIds(selectedGenres);
  const sanitized = sanitizeSelectedSubgenresByGenre(
    parents,
    selectedSubgenresByGenre,
  );
  return parents.map((parent) => ({
    parent,
    subgenres: sanitized[parent] ? [...sanitized[parent]!] : [],
  }));
}

/**
 * Drop child refinements whose parent is no longer selected.
 * Does not auto-select parents. Empty next parents → {}.
 */
export function applySelectedGenresToSubgenreState(
  nextSelectedGenres: unknown,
  selectedSubgenresByGenre: unknown,
): SelectedSubgenresByGenre {
  return sanitizeSelectedSubgenresByGenre(
    nextSelectedGenres,
    selectedSubgenresByGenre,
  );
}

/**
 * Toggle a child ID under an already-selected parent. Does not change parent
 * selection. Removing the last child returns that parent to broad (key omitted).
 */
export function toggleSelectedSubgenre(
  selectedGenres: unknown,
  selectedSubgenresByGenre: unknown,
  parentRaw: string,
  childId: string,
): SelectedSubgenresByGenre {
  const parentId = normalizeCanonicalGenreId(parentRaw);
  const selectedParents = normalizeSelectedParentIds(selectedGenres);
  if (!parentId || !selectedParents.includes(parentId) || !isValidSubgenre(parentId, childId)) {
    return sanitizeSelectedSubgenresByGenre(selectedGenres, selectedSubgenresByGenre);
  }
  const current = sanitizeSelectedSubgenresByGenre(selectedGenres, selectedSubgenresByGenre);
  const existing = current[parentId] ?? [];
  const nextChildren = existing.includes(childId)
    ? existing.filter((id) => id !== childId)
    : [...existing, childId];
  return sanitizeSelectedSubgenresByGenre(selectedGenres, {
    ...current,
    [parentId]: nextChildren,
  });
}

/**
 * Client safety-net for Home `uiPosts`. Mirrors server clause semantics:
 * no parents → all posts; empty children → broad parent (NULL included);
 * refined parent → stored child ID must be in that parent's list.
 */
export function postMatchesGenreFilter(
  post: { genre?: string | null; subgenre?: string | null },
  selectedGenres: unknown,
  selectedSubgenresByGenre: unknown,
): boolean {
  const clauses = buildGenreFilterClauses(selectedGenres, selectedSubgenresByGenre);
  if (clauses.length === 0) return true;
  const parentId = normalizeCanonicalGenreId(post.genre);
  if (!parentId) return false;
  const childId = post.subgenre == null ? "" : String(post.subgenre).trim();
  for (const clause of clauses) {
    if (clause.parent !== parentId) continue;
    if (clause.subgenres.length === 0) return true;
    if (childId && clause.subgenres.includes(childId) && isValidSubgenre(parentId, childId)) {
      return true;
    }
  }
  return false;
}
