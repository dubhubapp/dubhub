import { getGenreChipStyle } from "@/lib/genre-styles";
import type { SelectedSubgenresByGenre } from "@shared/home-feed-subgenre-filter";
import type { CanonicalGenreId } from "@shared/report-genre";
import { getSubgenresForParent, type PostSubgenreEntry } from "@shared/post-subgenre";

export type DiscoverSubgenreGroup = {
  parentId: string;
  label: string;
  bgColor: string;
  textClass: string;
  children: readonly PostSubgenreEntry[];
};

export const DISCOVER_GENRES_PAGE = "genres";
export type DiscoverGenreFilterPage = typeof DISCOVER_GENRES_PAGE | string;

/** Minimum travel before a Genres-area gesture can lock as horizontal. */
export const DISCOVER_PAGE_SWIPE_MIN_DX_PX = 12;
/** Horizontal travel must exceed vertical travel by this ratio. */
export const DISCOVER_PAGE_SWIPE_DOMINANCE = 1.25;
/** Release distance as a fraction of page width (25–30%). */
export const DISCOVER_PAGE_SNAP_RATIO = 0.28;
/** Clear horizontal flick, px/ms. */
export const DISCOVER_PAGE_FLICK_PX_PER_MS = 0.45;

/** Arrow-safe horizontal gutter; reserved on every page, including Genres. */
export const DISCOVER_PAGE_EDGE_INSET_CLASS = "px-9";
/** Shared left/right inset for Feed, Status, Genres, and subgenre content. */
export const DISCOVER_MENU_CONTENT_INSET_CLASS = DISCOVER_PAGE_EDGE_INSET_CLASS;
export const DISCOVER_MENU_HEADING_TEXT_CLASS =
  "justify-self-start text-sm font-semibold text-white";
/** Parent grid is 8 chips / 3 rows of min-h-9 + gap-1.5. */
export const DISCOVER_GENRE_PAGE_GRID_MIN_HEIGHT_CLASS = "min-h-[7.5rem]";
/** Heading min-h-9 + mb-2 + 3-row grid. */
export const DISCOVER_GENRE_PAGE_MIN_HEIGHT_CLASS = "min-h-[10.25rem]";
export const DISCOVER_GENRE_PAGE_FRAME_CLASS = `w-full ${DISCOVER_MENU_CONTENT_INSET_CLASS} ${DISCOVER_GENRE_PAGE_MIN_HEIGHT_CLASS}`;
export const DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS =
  "mb-2 grid min-h-9 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center";
export const DISCOVER_GENRE_PAGE_GRID_CLASS = `grid ${DISCOVER_GENRE_PAGE_GRID_MIN_HEIGHT_CLASS} grid-cols-3 content-start gap-1.5`;
/**
 * Centre of parent row 2 (Bassline / House / Techno).
 * heading min-h-9 (2.25) + mb-2 (0.5) + row1 (2.25) + gap-1.5 (0.375) + half row2 (1.125) = 6.5rem
 */
export const DISCOVER_PAGE_ARROW_Y_CLASS = "top-[6.5rem] -translate-y-1/2";

export function getDiscoverGenreGridRowCount(itemCount: number): number {
  if (!(itemCount > 0)) return 0;
  return Math.ceil(itemCount / 3);
}

export type DiscoverPageDragLock = "undecided" | "horizontal" | "vertical";

export type DiscoverAdjacentGenreFilterPages = {
  previous: DiscoverGenreFilterPage;
  current: DiscoverGenreFilterPage;
  next: DiscoverGenreFilterPage;
};

/** Child groups for currently selected parents, in `selectedGenres` order. */
export function getDiscoverSubgenreGroups(
  selectedGenres: readonly string[],
): DiscoverSubgenreGroup[] {
  const groups: DiscoverSubgenreGroup[] = [];
  for (const parentId of selectedGenres) {
    const children = getSubgenresForParent(parentId);
    if (children.length === 0) continue;
    const style = getGenreChipStyle(parentId);
    groups.push({
      parentId,
      label: style.label,
      bgColor: style.bgColor,
      textClass: style.textClass,
      children,
    });
  }
  return groups;
}

export function isDiscoverSubgenreChipSelected(
  selectedSubgenresByGenre: SelectedSubgenresByGenre | undefined,
  parentId: string,
  childId: string,
): boolean {
  if (!selectedSubgenresByGenre) return false;
  const list = selectedSubgenresByGenre[parentId as CanonicalGenreId];
  return Array.isArray(list) && list.includes(childId);
}

export function parentHasActiveSubgenreRefinement(
  selectedSubgenresByGenre: SelectedSubgenresByGenre | undefined,
  parentId: string,
): boolean {
  if (!selectedSubgenresByGenre) return false;
  const list = selectedSubgenresByGenre[parentId as CanonicalGenreId];
  return Array.isArray(list) && list.length > 0;
}

/** Genres page first, then one page per selected parent that has children. */
export function getDiscoverGenreFilterPages(
  selectedGenres: readonly string[],
): DiscoverGenreFilterPage[] {
  return [DISCOVER_GENRES_PAGE, ...getDiscoverSubgenreGroups(selectedGenres).map((group) => group.parentId)];
}

export function resolveDiscoverGenreFilterPage(
  activePage: DiscoverGenreFilterPage,
  pages: readonly DiscoverGenreFilterPage[],
): DiscoverGenreFilterPage {
  if (pages.includes(activePage)) return activePage;
  return DISCOVER_GENRES_PAGE;
}

export function stepDiscoverGenreFilterPage(
  activePage: DiscoverGenreFilterPage,
  pages: readonly DiscoverGenreFilterPage[],
  direction: 1 | -1,
): DiscoverGenreFilterPage {
  if (pages.length <= 1) return DISCOVER_GENRES_PAGE;
  const resolved = resolveDiscoverGenreFilterPage(activePage, pages);
  const index = pages.indexOf(resolved);
  const nextIndex = (index + direction + pages.length) % pages.length;
  return pages[nextIndex] ?? DISCOVER_GENRES_PAGE;
}

export function getDiscoverAdjacentGenreFilterPages(
  activePage: DiscoverGenreFilterPage,
  pages: readonly DiscoverGenreFilterPage[],
): DiscoverAdjacentGenreFilterPages {
  const current = resolveDiscoverGenreFilterPage(activePage, pages);
  if (pages.length <= 1) {
    return { previous: current, current, next: current };
  }
  return {
    previous: stepDiscoverGenreFilterPage(current, pages, -1),
    current,
    next: stepDiscoverGenreFilterPage(current, pages, 1),
  };
}

export function clampDiscoverPageDragOffset(offsetPx: number, pageWidthPx: number): number {
  if (!(pageWidthPx > 0) || !Number.isFinite(offsetPx)) return 0;
  return Math.max(-pageWidthPx, Math.min(pageWidthPx, offsetPx));
}

export function discoverPageStripTranslatePx(pageWidthPx: number, dragOffsetPx: number): number {
  const width = pageWidthPx > 0 ? pageWidthPx : 0;
  return -width + clampDiscoverPageDragOffset(dragOffsetPx, width);
}

export function isDiscoverPageTrackReady(pageWidthPx: number): boolean {
  return Number.isFinite(pageWidthPx) && pageWidthPx > 0;
}

export type DiscoverPageTrackSlots = {
  pageWidth: number;
  trackWidth: number;
  previousOffsetPx: number;
  currentOffsetPx: number;
  nextOffsetPx: number;
  settledTranslatePx: number;
};

/** Geometry for a 3-page track. Inset/padding must not change `pageWidth`. */
export function getDiscoverPageTrackSlots(pageWidthPx: number): DiscoverPageTrackSlots {
  const pageWidth = isDiscoverPageTrackReady(pageWidthPx) ? pageWidthPx : 0;
  return {
    pageWidth,
    trackWidth: pageWidth * 3,
    previousOffsetPx: 0,
    currentOffsetPx: pageWidth,
    nextOffsetPx: pageWidth * 2,
    settledTranslatePx: pageWidth > 0 ? -pageWidth : 0,
  };
}

export type DiscoverVisiblePagerPage = "previous" | "current" | "next";

/**
 * Pages whose boxes intersect the viewport [0, pageWidth).
 * Width 0 → no track, so nothing is visible from the 3-page strip.
 */
export function getDiscoverPagesVisibleInViewport(
  pageWidthPx: number,
  dragOffsetPx: number,
): DiscoverVisiblePagerPage[] {
  if (!isDiscoverPageTrackReady(pageWidthPx)) return [];
  const translate = discoverPageStripTranslatePx(pageWidthPx, dragOffsetPx);
  const viewRight = pageWidthPx;
  const pages: Array<{ id: DiscoverVisiblePagerPage; left: number }> = [
    { id: "previous", left: translate },
    { id: "current", left: translate + pageWidthPx },
    { id: "next", left: translate + pageWidthPx * 2 },
  ];
  return pages
    .filter((page) => page.left < viewRight && page.left + pageWidthPx > 0)
    .map((page) => page.id);
}

/**
 * Conservative lock: ignore until movement is clearly horizontal or vertical.
 */
export function resolveDiscoverPageDragLock(dx: number, dy: number): DiscoverPageDragLock {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < DISCOVER_PAGE_SWIPE_MIN_DX_PX && absDy < DISCOVER_PAGE_SWIPE_MIN_DX_PX) {
    return "undecided";
  }
  if (absDx > absDy * DISCOVER_PAGE_SWIPE_DOMINANCE) return "horizontal";
  return "vertical";
}

/**
 * Conservative horizontal-page decision. 0 = ignore (vertical / diagonal / too small).
 * +1 = next page (swipe left). -1 = previous page (swipe right).
 */
export function resolveDiscoverPageSwipe(dx: number, dy: number): 1 | -1 | 0 {
  if (resolveDiscoverPageDragLock(dx, dy) !== "horizontal") return 0;
  return dx < 0 ? 1 : -1;
}

export function resolveDiscoverPageDragRelease(input: {
  offsetPx: number;
  pageWidthPx: number;
  velocityXPxPerMs: number;
}): 1 | -1 | 0 {
  const pageWidthPx = input.pageWidthPx;
  if (!(pageWidthPx > 0)) return 0;
  const offsetPx = clampDiscoverPageDragOffset(input.offsetPx, pageWidthPx);
  const velocity = Number.isFinite(input.velocityXPxPerMs) ? input.velocityXPxPerMs : 0;
  if (velocity <= -DISCOVER_PAGE_FLICK_PX_PER_MS) return 1;
  if (velocity >= DISCOVER_PAGE_FLICK_PX_PER_MS) return -1;
  const threshold = pageWidthPx * DISCOVER_PAGE_SNAP_RATIO;
  if (offsetPx <= -threshold) return 1;
  if (offsetPx >= threshold) return -1;
  return 0;
}
