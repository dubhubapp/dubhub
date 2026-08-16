/** UI-only Radix Select value; never sent to the API. */
export const SUBMIT_SUBGENRE_NONE_VALUE = "none";

/** Map Submit form subgenre to the create-post payload value. */
export function serializeSubmitSubgenre(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === SUBMIT_SUBGENRE_NONE_VALUE) return null;
  return trimmed;
}
