function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Human copy for when a user saved a release via liking an attached post. */
export function formatSavedAgoLabel(savedAt: string | Date | null | undefined): string | null {
  const saved = asDate(savedAt);
  if (!saved) return null;

  const diffDays = Math.round((startOfLocalDay(new Date()) - startOfLocalDay(saved)) / 86_400_000);
  if (diffDays <= 0) return "Saved today";
  if (diffDays === 1) return "Saved yesterday";
  if (diffDays < 7) return `Saved ${diffDays} days ago`;

  const weeks = Math.floor(diffDays / 7);
  if (weeks === 1) return "Saved 1 week ago";
  if (weeks < 5) return `Saved ${weeks} weeks ago`;

  const months = Math.floor(diffDays / 30);
  if (months <= 1) return "Saved 1 month ago";
  if (months < 12) return `Saved ${months} months ago`;

  const years = Math.floor(diffDays / 365);
  return years === 1 ? "Saved 1 year ago" : `Saved ${years} years ago`;
}
