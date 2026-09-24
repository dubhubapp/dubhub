/**
 * Deterministic catalog rank for release_links.sort_order backfill / fallback.
 * Known selectable platforms first (canonical catalog order), then unknowns A–Z.
 */

import {
  SELECTABLE_RELEASE_LINK_PLATFORM_IDS,
  normalizeReleaseLinkPlatformId,
} from "./release-link-platforms";

const CATALOG_RANK = new Map<string, number>(
  SELECTABLE_RELEASE_LINK_PLATFORM_IDS.map((id, index) => [id, index]),
);

/** Catalog index, or a high sentinel for unknown/legacy platforms. */
export function releaseLinkCatalogRank(platform: string): number {
  const key = normalizeReleaseLinkPlatformId(platform);
  return CATALOG_RANK.get(key) ?? 1000;
}

/**
 * Compare two platforms for deterministic backfill ordering:
 * catalog order, then alphabetical among unknowns/ties.
 */
export function compareReleaseLinkPlatformsForBackfill(
  a: string,
  b: string,
): number {
  const ra = releaseLinkCatalogRank(a);
  const rb = releaseLinkCatalogRank(b);
  if (ra !== rb) return ra - rb;
  const na = normalizeReleaseLinkPlatformId(a);
  const nb = normalizeReleaseLinkPlatformId(b);
  return na.localeCompare(nb);
}

/**
 * Assign sequential sort_order 0..n-1 for one release's links using catalog backfill.
 */
export function assignCatalogSortOrders<T extends { platform: string }>(
  links: T[],
): (T & { sortOrder: number })[] {
  const sorted = [...links].sort((a, b) =>
    compareReleaseLinkPlatformsForBackfill(a.platform, b.platform),
  );
  return sorted.map((link, index) => ({ ...link, sortOrder: index }));
}

/**
 * Prefer persisted sort_order; fall back to catalog only when order is missing.
 * Does not re-sort when every link already has a finite sortOrder.
 */
export function orderReleaseLinksForDisplay<
  T extends { platform: string; sortOrder?: number | null },
>(links: T[]): T[] {
  if (!links.length) return [];
  const allOrdered = links.every(
    (l) => typeof l.sortOrder === "number" && Number.isFinite(l.sortOrder),
  );
  if (allOrdered) {
    return [...links].sort((a, b) => {
      const d = (a.sortOrder as number) - (b.sortOrder as number);
      if (d !== 0) return d;
      return compareReleaseLinkPlatformsForBackfill(a.platform, b.platform);
    });
  }
  return [...links].sort((a, b) =>
    compareReleaseLinkPlatformsForBackfill(a.platform, b.platform),
  );
}
