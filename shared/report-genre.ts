/**
 * Genre reporting + moderator correction helpers (shared client/server).
 * Suggested genre is stored in reports.description — no schema migration.
 */

export const INCORRECT_GENRE_REPORT_REASON = "Incorrect genre" as const;

/** Machine-readable prefix in reports.description for post genre suggestions. */
export const SUGGESTED_GENRE_PREFIX = "SUGGESTED_GENRE:";

export const CANONICAL_GENRE_IDS = [
  "dnb",
  "ukg",
  "dubstep",
  "bassline",
  "house",
  "techno",
  "trance",
  "other",
] as const;

export type CanonicalGenreId = (typeof CANONICAL_GENRE_IDS)[number];

export const CANONICAL_GENRE_ID_SET = new Set<string>(CANONICAL_GENRE_IDS);

export const GENRE_LABEL_BY_ID: Record<CanonicalGenreId, string> = {
  dnb: "DnB",
  ukg: "UKG",
  dubstep: "Dubstep",
  bassline: "Bassline",
  house: "House",
  techno: "Techno",
  trance: "Trance",
  other: "Other",
};

/** Map stored genre (id or label) to canonical id. */
export function normalizeCanonicalGenreId(raw: string | null | undefined): CanonicalGenreId | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  if (CANONICAL_GENRE_ID_SET.has(key)) return key as CanonicalGenreId;
  const byLabel = CANONICAL_GENRE_IDS.find((id) => GENRE_LABEL_BY_ID[id].toLowerCase() === key);
  return byLabel ?? null;
}

export function getCanonicalGenreLabel(genreId: string | null | undefined): string {
  const id = normalizeCanonicalGenreId(genreId);
  if (!id) return "Unknown";
  return GENRE_LABEL_BY_ID[id];
}

const MAX_REPORT_DESCRIPTION_LENGTH = 200;

/** Build reports.description for an incorrect-genre post report. */
export function buildReportDescriptionWithSuggestedGenre(
  suggestedGenreId: string,
  userNotes?: string,
): string {
  const id = normalizeCanonicalGenreId(suggestedGenreId);
  if (!id) {
    throw new Error("Invalid suggested genre");
  }
  let desc = `${SUGGESTED_GENRE_PREFIX}${id}`;
  const notes = (userNotes ?? "").trim();
  if (notes) {
    desc += `|${notes}`;
  }
  return desc.slice(0, MAX_REPORT_DESCRIPTION_LENGTH);
}

export function parseSuggestedGenreFromReportDescription(description: string | null | undefined): {
  suggestedGenreId: CanonicalGenreId | null;
  userNotes: string | null;
} {
  if (!description || typeof description !== "string") {
    return { suggestedGenreId: null, userNotes: null };
  }
  const trimmed = description.trim();
  if (!trimmed || trimmed.startsWith("COMMENT_ID:")) {
    return { suggestedGenreId: null, userNotes: null };
  }

  if (trimmed.startsWith(SUGGESTED_GENRE_PREFIX)) {
    const rest = trimmed.slice(SUGGESTED_GENRE_PREFIX.length);
    const pipeIdx = rest.indexOf("|");
    const idPart = (pipeIdx >= 0 ? rest.slice(0, pipeIdx) : rest).trim();
    const notesRaw = pipeIdx >= 0 ? rest.slice(pipeIdx + 1).trim() : "";
    return {
      suggestedGenreId: normalizeCanonicalGenreId(idPart),
      userNotes: notesRaw || null,
    };
  }

  const legacy = /^Suggested genre:\s*(.+)$/i.exec(trimmed);
  if (legacy) {
    const tail = legacy[1].trim();
    const pipeIdx = tail.indexOf("|");
    const genrePart = pipeIdx >= 0 ? tail.slice(0, pipeIdx).trim() : tail;
    const notesRaw = pipeIdx >= 0 ? tail.slice(pipeIdx + 1).trim() : "";
    return {
      suggestedGenreId: normalizeCanonicalGenreId(genrePart),
      userNotes: notesRaw || null,
    };
  }

  return { suggestedGenreId: null, userNotes: trimmed };
}
