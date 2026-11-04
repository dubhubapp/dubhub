/** Link object returned by both the single-release and batched feed lookups. */
export type ReleaseLinkRecord = {
  id: unknown;
  releaseId: unknown;
  platform: unknown;
  url: unknown;
  linkType: unknown;
  /** Stored released destination. Null when the column is absent or blank. */
  postReleaseUrl: string | null;
  sortOrder: number;
  createdAt: unknown;
};

function storedPostReleaseUrl(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function mapReleaseLinkRow(row: {
  id: unknown;
  release_id: unknown;
  platform: unknown;
  url: unknown;
  link_type: unknown;
  post_release_url?: unknown;
  sort_order?: unknown;
  created_at: unknown;
}): ReleaseLinkRecord {
  return {
    id: row.id,
    releaseId: row.release_id,
    platform: row.platform,
    url: row.url,
    linkType: row.link_type,
    postReleaseUrl: storedPostReleaseUrl(row.post_release_url),
    sortOrder: (row.sort_order ?? 0) as number,
    createdAt: row.created_at,
  };
}

/** Preserve SQL encounter order inside each release. Missing releases stay []. */
export function groupReleaseLinksByReleaseId(
  releaseIds: readonly string[],
  rows: readonly ReleaseLinkRecord[],
): Map<string, ReleaseLinkRecord[]> {
  const grouped = new Map<string, ReleaseLinkRecord[]>();
  for (const id of releaseIds) {
    if (!grouped.has(id)) grouped.set(id, []);
  }
  for (const row of rows) {
    const key = row.releaseId == null ? "" : String(row.releaseId);
    const list = grouped.get(key);
    if (list) list.push(row);
  }
  return grouped;
}

/** Keep the feed row order. A release with no grouped rows still gets links: []. */
export function attachBatchedReleaseLinks<T extends { id: string }>(
  releases: readonly T[],
  linksByReleaseId: ReadonlyMap<string, readonly ReleaseLinkRecord[]>,
): Array<T & { links: ReleaseLinkRecord[] }> {
  return releases.map((release) => ({
    ...release,
    links: [...(linksByReleaseId.get(String(release.id)) ?? [])],
  }));
}
