/**
 * Create-route subgenre parsing. Taxonomy lives in shared/post-subgenre.ts.
 * Empty/missing child -> null. Non-empty must be a stored ID under the parent.
 */

import { INPUT_LIMITS } from "@shared/input-limits";
import { isValidSubgenre } from "@shared/post-subgenre";

export const INVALID_SUBGENRE_CODE = "INVALID_SUBGENRE" as const;

export type ParseCreatePostSubgenreResult =
  | { ok: true; subgenre: string | null }
  | { ok: false; message: string; code: typeof INVALID_SUBGENRE_CODE };

/** Map a DB/API subgenre value to the post contract field. */
export function mapStoredSubgenre(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed || null;
}

/**
 * Parse optional create-post subgenre against the supplied parent genre string
 * (parent validation is unchanged and happens separately).
 */
export function parseCreatePostSubgenre(
  parentGenre: string,
  raw: unknown,
): ParseCreatePostSubgenreResult {
  if (raw === undefined || raw === null) {
    return { ok: true, subgenre: null };
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { ok: true, subgenre: null };
  }
  if (trimmed.length > INPUT_LIMITS.postSubgenre) {
    return {
      ok: false,
      message: `Subgenre must be at most ${INPUT_LIMITS.postSubgenre} characters`,
      code: INVALID_SUBGENRE_CODE,
    };
  }
  if (!isValidSubgenre(parentGenre, trimmed)) {
    return {
      ok: false,
      message: "Invalid subgenre",
      code: INVALID_SUBGENRE_CODE,
    };
  }
  return { ok: true, subgenre: trimmed };
}
