/**
 * Listener multi-release widget paging helpers.
 * Bounded navigation: no wrap at either edge.
 */

export type HomeWidgetPageDirection = "next" | "previous";

export type HomeWidgetPagingAvailability = {
  index: number;
  count: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
};

function normalizeReleaseIds(releaseIds: readonly string[]): string[] {
  return releaseIds.map((id) => id.trim()).filter((id) => id.length > 0);
}

export function resolveHomeWidgetPageIndex(args: {
  releaseIds: readonly string[];
  activeReleaseId: string | null | undefined;
}): { index: number; count: number } | null {
  const ids = normalizeReleaseIds(args.releaseIds);
  if (ids.length === 0) return null;
  const active = args.activeReleaseId?.trim() ?? "";
  const index = active ? ids.findIndex((id) => id === active) : 0;
  return {
    index: index >= 0 ? index : 0,
    count: ids.length,
  };
}

export function resolveHomeWidgetPagingAvailability(args: {
  releaseIds: readonly string[];
  activeReleaseId: string | null | undefined;
}): HomeWidgetPagingAvailability | null {
  const page = resolveHomeWidgetPageIndex(args);
  if (!page) return null;
  if (page.count <= 1) {
    return {
      ...page,
      canGoPrevious: false,
      canGoNext: false,
    };
  }
  return {
    ...page,
    canGoPrevious: page.index > 0,
    canGoNext: page.index < page.count - 1,
  };
}

/**
 * Bounded page step. Returns null at edges (and for empty/single collections
 * when the direction cannot move).
 */
export function resolveHomeWidgetPagedReleaseId(args: {
  releaseIds: readonly string[];
  activeReleaseId: string | null | undefined;
  direction: HomeWidgetPageDirection;
}): string | null {
  const ids = normalizeReleaseIds(args.releaseIds);
  if (ids.length === 0) return null;
  if (ids.length === 1) return null;

  const active = args.activeReleaseId?.trim() ?? "";
  let index = active ? ids.findIndex((id) => id === active) : 0;
  if (index < 0) index = 0;

  if (args.direction === "next") {
    if (index >= ids.length - 1) return null;
    return ids[index + 1] ?? null;
  }
  if (index <= 0) return null;
  return ids[index - 1] ?? null;
}
