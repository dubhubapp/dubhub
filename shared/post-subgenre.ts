/**
 * Optional post sub-genre taxonomy (shared client/server).
 * Parent genre remains authoritative; stored child values are stable snake_case IDs.
 * Does not change existing parent genre stored values or normalisation.
 */

import {
  CANONICAL_GENRE_IDS,
  normalizeCanonicalGenreId,
  type CanonicalGenreId,
} from "./report-genre";

export type PostSubgenreEntry = {
  id: string;
  label: string;
};

export const POST_SUBGENRES_BY_PARENT: Record<
  CanonicalGenreId,
  readonly PostSubgenreEntry[]
> = {
  dnb: [
    { id: "jump_up", label: "Jump Up" },
    { id: "liquid", label: "Liquid" },
    { id: "neuro", label: "Neuro" },
    { id: "dancefloor", label: "Dancefloor" },
    { id: "minimal", label: "Minimal" },
    { id: "rollers", label: "Rollers" },
    { id: "jungle", label: "Jungle" },
  ],
  ukg: [
    { id: "garage", label: "Garage" },
    { id: "2_step", label: "2-Step" },
    { id: "speed_garage", label: "Speed Garage" },
    { id: "uk_funky", label: "UK Funky" },
  ],
  bassline: [
    { id: "uk_bass", label: "UK Bass" },
    { id: "4x4", label: "4x4" },
  ],
  dubstep: [
    { id: "140", label: "140" },
    { id: "deep_dubstep", label: "Deep Dubstep" },
    { id: "riddim", label: "Riddim" },
    { id: "brostep", label: "Brostep" },
    { id: "colour_bass", label: "Colour Bass" },
  ],
  house: [
    { id: "tech_house", label: "Tech House" },
    { id: "deep_house", label: "Deep House" },
    { id: "future_house", label: "Future House" },
    { id: "bass_house", label: "Bass House" },
    { id: "progressive_house", label: "Progressive House" },
    { id: "electro_house", label: "Electro House" },
    { id: "jackin_house", label: "Jackin' House" },
    { id: "disco_house", label: "Disco House" },
    { id: "hard_house", label: "Hard House" },
  ],
  techno: [
    { id: "hard_techno", label: "Hard Techno" },
    { id: "minimal_techno", label: "Minimal Techno" },
    { id: "industrial_techno", label: "Industrial Techno" },
    { id: "acid_techno", label: "Acid Techno" },
    { id: "melodic_techno", label: "Melodic Techno" },
  ],
  trance: [
    { id: "psytrance", label: "Psytrance" },
    { id: "progressive_trance", label: "Progressive Trance" },
    { id: "uplifting_trance", label: "Uplifting Trance" },
    { id: "tech_trance", label: "Tech Trance" },
    { id: "hard_trance", label: "Hard Trance" },
  ],
  other: [
    { id: "donk", label: "Donk" },
    { id: "hardstyle", label: "Hardstyle" },
    { id: "uptempo", label: "Uptempo" },
  ],
};

const EMPTY_SUBGENRES: readonly PostSubgenreEntry[] = [];

const SUBGENRE_LABEL_BY_ID = new Map<string, string>();
for (const parentId of CANONICAL_GENRE_IDS) {
  for (const entry of POST_SUBGENRES_BY_PARENT[parentId]) {
    SUBGENRE_LABEL_BY_ID.set(entry.id, entry.label);
  }
}

function normalizeSubgenreId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const id = String(raw).trim();
  return id || null;
}

/** Sub-genres configured for a parent genre. Unknown / empty parent → []. */
export function getSubgenresForParent(
  parentRaw: string | null | undefined,
): readonly PostSubgenreEntry[] {
  const parentId = normalizeCanonicalGenreId(parentRaw);
  if (!parentId) return EMPTY_SUBGENRES;
  return POST_SUBGENRES_BY_PARENT[parentId];
}

/**
 * True only when subgenreId is a controlled ID under the normalised parent.
 * Empty / unknown parent or child → false. Labels are not accepted as IDs.
 */
export function isValidSubgenre(
  parentRaw: string | null | undefined,
  subgenreId: string | null | undefined,
): boolean {
  const id = normalizeSubgenreId(subgenreId);
  if (!id) return false;
  return getSubgenresForParent(parentRaw).some((entry) => entry.id === id);
}

/** Display label for a stored sub-genre ID, or null if unknown. */
export function getSubgenreLabel(subgenreId: string | null | undefined): string | null {
  const id = normalizeSubgenreId(subgenreId);
  if (!id) return null;
  return SUBGENRE_LABEL_BY_ID.get(id) ?? null;
}
