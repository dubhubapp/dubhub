/**
 * Profile Posts/Likes grid render window — sticky/hysteresis row windowing.
 * Caps mounted tiles at 21 (7×3) with top/bottom spacers and a frozen row stride.
 */

import { APP_PAGE_SCROLL_CLASS } from "@/lib/app-shell-layout";

/** 3-column Profile Posts/Likes grid. */
export const PROFILE_GRID_COLUMNS = 3;

/** Mounted rows: ~3 visible + overscan buffer (sticky window size). */
export const PROFILE_GRID_WINDOW_ROWS = 7;

/** Initial overscan docs constant; sticky logic uses EDGE/SHIFT. */
export const PROFILE_GRID_OVERSCAN_ROWS = 2;

/** Rows to advance when near a window edge. */
export const PROFILE_GRID_WINDOW_SHIFT_ROWS = 2;

/**
 * Shift when the visible edge is within this many rows of the window edge.
 * Down: visibleBottom >= endRow - EDGE
 * Up: visibleTop < startRow + EDGE (and startRow > 0)
 */
export const PROFILE_GRID_WINDOW_EDGE_ROWS = 1;

/** Approximate visible rows in the Profile grid viewport (phone). */
export const PROFILE_GRID_VISIBLE_ROWS_APPROX = 3;

/** Max mounted tiles per Posts/Likes panel. */
export const PROFILE_GRID_MAX_MOUNTED_TILES =
  PROFILE_GRID_WINDOW_ROWS * PROFILE_GRID_COLUMNS;

/**
 * Profile page scroller: shared APP_PAGE_SCROLL + overflow-anchor none.
 * Scoped to Profile only — does not change Home.
 */
export const PROFILE_PAGE_SCROLL_CLASS =
  `${APP_PAGE_SCROLL_CLASS} [overflow-anchor:none]` as const;

/**
 * Production Posts/Likes phone grid. 3-col denser layout (product baseline).
 */
export const PROFILE_POSTS_LIKES_GRID_CLASS = "grid grid-cols-3 gap-1";

/** Vertical gap matching Tailwind `gap-1` (4px) — used only for estimate fallback. */
export const PROFILE_GRID_GAP_Y_PX = 4;

/** Horizontal page inset `px-6` × 2. */
export const PROFILE_GRID_PAGE_INSET_X_PX = 48;

export type ProfileGridRowWindow = {
  startRow: number;
  endRow: number;
};

export function profileGridTotalRows(itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.ceil(itemCount / PROFILE_GRID_COLUMNS);
}

/** Estimate stride before first DOM measure (phone 3-col 9:16 + gap-1). */
export function estimateProfileGridRowStride(viewportWidthCssPx: number): number {
  const contentW = Math.max(0, viewportWidthCssPx - PROFILE_GRID_PAGE_INSET_X_PX);
  const tileW = (contentW - PROFILE_GRID_GAP_Y_PX * 2) / PROFILE_GRID_COLUMNS;
  const tileH = tileW * (16 / 9);
  return tileH + PROFILE_GRID_GAP_Y_PX;
}

/**
 * Measure row stride from live grid tiles.
 * Prefers distance between row0 and row1 first tiles; else tile height + gap.
 * Caller should freeze the result — do not overwrite mid-scroll.
 */
export function measureProfileGridRowStride(gridEl: HTMLElement | null): number {
  if (!gridEl) return 0;
  const tiles = gridEl.querySelectorAll<HTMLElement>("[data-profile-pager-card=\"true\"]");
  if (tiles.length === 0) return 0;
  const first = tiles[0]!.getBoundingClientRect();
  if (tiles.length >= PROFILE_GRID_COLUMNS + 1) {
    const nextRow = tiles[PROFILE_GRID_COLUMNS]!.getBoundingClientRect();
    const stride = nextRow.top - first.top;
    if (Number.isFinite(stride) && stride > 0) return stride;
  }
  // Single-row window: not enough to freeze a reliable stride yet.
  return 0;
}

/** True when the grid has ≥2 rows of tiles for a stable stride measure. */
export function canFreezeProfileGridRowStride(gridEl: HTMLElement | null): boolean {
  if (!gridEl) return false;
  return (
    gridEl.querySelectorAll("[data-profile-pager-card=\"true\"]").length >=
    PROFILE_GRID_COLUMNS + 1
  );
}

/** Grid/shell top relative to scroller content (scrollTop space). */
export function measureProfileGridOffsetTop(
  scroller: HTMLElement,
  gridShell: HTMLElement,
): number {
  const sRect = scroller.getBoundingClientRect();
  const gRect = gridShell.getBoundingClientRect();
  return gRect.top - sRect.top + scroller.scrollTop;
}

/**
 * Sticky/hysteresis window: keep current start/end until visible range nears
 * an overscan edge, then shift by PROFILE_GRID_WINDOW_SHIFT_ROWS.
 *
 * When `strideReady` is false, force the initial top window (no eviction).
 */
export function resolveProfileGridStickyRowWindow(input: {
  scrollTop: number;
  gridOffsetTop: number;
  rowStride: number;
  totalRows: number;
  current: ProfileGridRowWindow;
  strideReady: boolean;
  windowRows?: number;
  shiftRows?: number;
  edgeRows?: number;
  visibleRowsApprox?: number;
}): ProfileGridRowWindow {
  const windowRows = input.windowRows ?? PROFILE_GRID_WINDOW_ROWS;
  const shiftRows = input.shiftRows ?? PROFILE_GRID_WINDOW_SHIFT_ROWS;
  const edgeRows = input.edgeRows ?? PROFILE_GRID_WINDOW_EDGE_ROWS;
  const visibleRowsApprox =
    input.visibleRowsApprox ?? PROFILE_GRID_VISIBLE_ROWS_APPROX;
  const totalRows = Math.max(0, input.totalRows);
  if (totalRows === 0) return { startRow: 0, endRow: 0 };

  if (!input.strideReady || !(input.rowStride > 0)) {
    return initialProfileGridRowWindow(totalRows);
  }

  let startRow = Math.max(0, input.current.startRow);
  let endRow = Math.max(startRow, input.current.endRow);
  if (endRow - startRow < Math.min(windowRows, totalRows) || endRow > totalRows) {
    ({ startRow, endRow } = clampProfileGridRowWindow(
      { startRow, endRow },
      totalRows,
    ));
  }

  const relative = input.scrollTop - input.gridOffsetTop;
  const visibleTop = Math.max(0, Math.floor(relative / input.rowStride));
  const visibleBottom = visibleTop + Math.max(1, visibleRowsApprox) - 1;

  if (visibleBottom >= endRow - edgeRows && endRow < totalRows) {
    startRow = Math.min(startRow + shiftRows, Math.max(0, totalRows - windowRows));
    endRow = Math.min(totalRows, startRow + windowRows);
  } else if (visibleTop < startRow + edgeRows && startRow > 0) {
    startRow = Math.max(0, startRow - shiftRows);
    endRow = Math.min(totalRows, startRow + windowRows);
  }

  return clampProfileGridRowWindow({ startRow, endRow }, totalRows);
}

export function profileGridItemSlice(input: {
  startRow: number;
  endRow: number;
  itemCount: number;
}): { startIndex: number; endIndex: number } {
  const startIndex = Math.max(0, input.startRow * PROFILE_GRID_COLUMNS);
  const endIndex = Math.min(
    input.itemCount,
    Math.max(startIndex, input.endRow * PROFILE_GRID_COLUMNS),
  );
  return { startIndex, endIndex };
}

export function profileGridAbsoluteIndex(
  startRow: number,
  localIndex: number,
): number {
  return startRow * PROFILE_GRID_COLUMNS + localIndex;
}

/**
 * Spacer heights for unmounted rows.
 * Uses frozen uniform rowStride (includes mid-row gap from DOM measure).
 */
export function profileGridSpacerHeights(input: {
  startRow: number;
  endRow: number;
  totalRows: number;
  rowStride: number;
}): { topPx: number; bottomPx: number } {
  const stride = input.rowStride > 0 ? input.rowStride : 0;
  const topPx = Math.max(0, input.startRow) * stride;
  const remaining = Math.max(0, input.totalRows - input.endRow);
  const bottomPx = remaining * stride;
  return { topPx, bottomPx };
}

/** Virtual grid height under uniform stride (invariant across window shifts). */
export function profileGridVirtualHeight(
  totalRows: number,
  rowStride: number,
): number {
  if (totalRows <= 0 || !(rowStride > 0)) return 0;
  return totalRows * rowStride;
}

/** Clamp window after dataset shrink; expand empty windows when data appears. */
export function clampProfileGridRowWindow(
  window: ProfileGridRowWindow,
  totalRows: number,
): ProfileGridRowWindow {
  if (totalRows <= 0) return { startRow: 0, endRow: 0 };
  if (totalRows <= PROFILE_GRID_WINDOW_ROWS) {
    return { startRow: 0, endRow: totalRows };
  }
  let startRow = Math.max(0, Math.min(window.startRow, totalRows - 1));
  let endRow = Math.min(totalRows, Math.max(window.endRow, startRow));
  if (endRow <= startRow) {
    endRow = Math.min(totalRows, startRow + PROFILE_GRID_WINDOW_ROWS);
  }
  if (endRow - startRow > PROFILE_GRID_WINDOW_ROWS) {
    endRow = startRow + PROFILE_GRID_WINDOW_ROWS;
  }
  if (endRow - startRow < PROFILE_GRID_WINDOW_ROWS && endRow < totalRows) {
    endRow = Math.min(totalRows, startRow + PROFILE_GRID_WINDOW_ROWS);
  }
  if (endRow - startRow < PROFILE_GRID_WINDOW_ROWS) {
    startRow = Math.max(0, endRow - PROFILE_GRID_WINDOW_ROWS);
  }
  return { startRow, endRow };
}

export function initialProfileGridRowWindow(totalRows: number): ProfileGridRowWindow {
  return {
    startRow: 0,
    endRow: Math.min(PROFILE_GRID_WINDOW_ROWS, Math.max(0, totalRows)),
  };
}
