/**
 * Collapse CR/LF runs (and spaces/tabs touching them) to a single space.
 * Ordinary space runs with no newline are left intact so typing is not altered.
 */
export function normalizeDescriptionNewlines(value: string): string {
  return value.replace(/[^\S\r\n]*[\r\n]+[^\S\r\n]*/g, " ");
}
