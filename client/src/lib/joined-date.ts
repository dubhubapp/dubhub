const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function asDate(date?: Date | string | null): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Joined date copy used across profile UI.
 * Format: `Joined {Mon} ’{YY}` (e.g. `Joined Nov ’25`)
 */
export function formatJoinedDateLine(date?: Date | string | null): string {
  const d = asDate(date);
  if (!d) return "Joined —";

  const mon = MONTH_ABBREVIATIONS[d.getMonth()] ?? "Jan";
  const yy = String(d.getFullYear()).slice(-2);
  return `Joined ${mon} ’${yy}`;
}

