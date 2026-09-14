/**
 * PROFILE-GRID-WINDOWING-8 — production sticky bounded Profile grid.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_PAGE_SCROLL_CLASS } from "./app-shell-layout";
import {
  PROFILE_GRID_COLUMNS,
  PROFILE_GRID_MAX_MOUNTED_TILES,
  PROFILE_GRID_WINDOW_EDGE_ROWS,
  PROFILE_GRID_WINDOW_ROWS,
  PROFILE_GRID_WINDOW_SHIFT_ROWS,
  PROFILE_PAGE_SCROLL_CLASS,
  PROFILE_POSTS_LIKES_GRID_CLASS,
  clampProfileGridRowWindow,
  initialProfileGridRowWindow,
  profileGridAbsoluteIndex,
  profileGridItemSlice,
  profileGridSpacerHeights,
  profileGridTotalRows,
  profileGridVirtualHeight,
  resolveProfileGridStickyRowWindow,
} from "./profile-grid-window";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const windowSrc = readFileSync(join(here, "./profile-grid-window.ts"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const pagerSrc = readFileSync(join(here, "./profile-tab-swipe.ts"), "utf8");

describe("PROFILE-GRID-WINDOWING-8 — production constants", () => {
  it("3-col grid, 7 rows, 21 tiles, edge 1, shift 2", () => {
    assert.equal(PROFILE_GRID_COLUMNS, 3);
    assert.equal(PROFILE_GRID_WINDOW_ROWS, 7);
    assert.equal(PROFILE_GRID_WINDOW_SHIFT_ROWS, 2);
    assert.equal(PROFILE_GRID_WINDOW_EDGE_ROWS, 1);
    assert.equal(PROFILE_GRID_MAX_MOUNTED_TILES, 21);
    assert.equal(PROFILE_POSTS_LIKES_GRID_CLASS, "grid grid-cols-3 gap-1");
  });

  it("strips TEMP / EXPERIMENT / diagnostic windowing language", () => {
    assert.doesNotMatch(windowSrc, /TEMP|EXPERIMENT|diagnostic|first-12|append-only/i);
    assert.doesNotMatch(userProfileSrc, /PROFILE_GRID_TEMP_/);
    assert.doesNotMatch(userProfileSrc, /TEMP WINDOWING|PROFILE_GRID_TEMP|first-12 experiment|append-only/i);
  });
});

describe("PROFILE-GRID-WINDOWING-8 — sticky window + hysteresis", () => {
  it("does not recenter every row; shifts downward by 2 near lower edge", () => {
    const stride = 200;
    const totalRows = 40;
    let current = { startRow: 0, endRow: 7 };

    current = resolveProfileGridStickyRowWindow({
      scrollTop: 200 + 2 * stride,
      gridOffsetTop: 200,
      rowStride: stride,
      totalRows,
      current,
      strideReady: true,
    });
    assert.deepEqual(current, { startRow: 0, endRow: 7 });

    current = resolveProfileGridStickyRowWindow({
      scrollTop: 200 + 5 * stride,
      gridOffsetTop: 200,
      rowStride: stride,
      totalRows,
      current,
      strideReady: true,
    });
    assert.deepEqual(current, { startRow: 2, endRow: 9 });
  });

  it("shifts upward by 2 near upper edge", () => {
    const stride = 200;
    let current = { startRow: 4, endRow: 11 };
    current = resolveProfileGridStickyRowWindow({
      scrollTop: 200 + 4 * stride,
      gridOffsetTop: 200,
      rowStride: stride,
      totalRows: 40,
      current,
      strideReady: true,
    });
    assert.deepEqual(current, { startRow: 2, endRow: 9 });
  });

  it("caps mounted slice at 21 tiles", () => {
    const slice = profileGridItemSlice({
      startRow: 10,
      endRow: 17,
      itemCount: 100,
    });
    assert.equal(slice.endIndex - slice.startIndex, 21);
    assert.equal(PROFILE_GRID_MAX_MOUNTED_TILES, 21);
  });

  it("no eviction until strideReady", () => {
    const next = resolveProfileGridStickyRowWindow({
      scrollTop: 5000,
      gridOffsetTop: 0,
      rowStride: 200,
      totalRows: 40,
      current: { startRow: 0, endRow: 7 },
      strideReady: false,
    });
    assert.deepEqual(next, initialProfileGridRowWindow(40));
  });
});

describe("PROFILE-GRID-WINDOWING-8 — spacers + stride lifecycle", () => {
  it("spacer invariant across 2-row shift; virtual height constant", () => {
    const stride = 232;
    const totalRows = 30;
    const a = profileGridSpacerHeights({
      startRow: 4,
      endRow: 11,
      totalRows,
      rowStride: stride,
    });
    const b = profileGridSpacerHeights({
      startRow: 6,
      endRow: 13,
      totalRows,
      rowStride: stride,
    });
    assert.equal(a.topPx + a.bottomPx + 7 * stride, b.topPx + b.bottomPx + 7 * stride);
    assert.equal(b.topPx - a.topPx, 2 * stride);
    assert.equal(a.bottomPx - b.bottomPx, 2 * stride);
    assert.equal(
      profileGridVirtualHeight(totalRows, stride),
      a.topPx + a.bottomPx + 7 * stride,
    );
  });

  it("freezes stride once; does not overwrite mid-scroll", () => {
    assert.match(userProfileSrc, /profileGridStrideReadyRef/);
    assert.match(userProfileSrc, /canFreezeProfileGridRowStride/);
    assert.match(
      userProfileSrc,
      /!profileGridStrideReadyRef\.current && canFreezeProfileGridRowStride/,
    );
    assert.match(windowSrc, /do not overwrite mid-scroll/i);
    assert.match(userProfileSrc, /resolveProfileGridStickyRowWindow/);
    assert.doesNotMatch(userProfileSrc, /resolveProfileGridRowWindow\(/);
  });

  it("caches grid offset; invalidates on resize / identity", () => {
    assert.match(userProfileSrc, /profileGridOffsetTopRef/);
    assert.match(userProfileSrc, /profileGridOffsetTopRef\.current\[tab\]/);
    assert.match(userProfileSrc, /profileGridOffsetTopRef\.current = \{\}/);
    assert.match(userProfileSrc, /window\.addEventListener\("resize"/);
  });
});

describe("PROFILE-GRID-WINDOWING-8 — reset / clamp / viewer / data", () => {
  it("identity reset + filter reset + shrink clamp", () => {
    assert.match(userProfileSrc, /}, \[currentUser\?\.id\]\);/);
    assert.match(
      userProfileSrc,
      /setPostsGridWindow\(initialProfileGridRowWindow\(profileGridTotalRows\(filteredPosts\.length\)\)\)/,
    );
    assert.match(
      userProfileSrc,
      /setLikedGridWindow\(initialProfileGridRowWindow\(profileGridTotalRows\(filteredLikedPosts\.length\)\)\)/,
    );
    assert.match(userProfileSrc, /}, \[postFilter\]\);/);
    assert.match(userProfileSrc, /}, \[likesFilter\]\);/);
    assert.match(
      userProfileSrc,
      /clampProfileGridRowWindow\(prev, profileGridTotalRows\(filteredPosts\.length\)\)/,
    );
    assert.match(
      userProfileSrc,
      /clampProfileGridRowWindow\(prev, profileGridTotalRows\(filteredLikedPosts\.length\)\)/,
    );

    assert.deepEqual(clampProfileGridRowWindow({ startRow: 20, endRow: 27 }, 5), {
      startRow: 0,
      endRow: 5,
    });
    assert.deepEqual(clampProfileGridRowWindow({ startRow: 20, endRow: 27 }, 12), {
      startRow: 5,
      endRow: 12,
    });
    assert.deepEqual(clampProfileGridRowWindow({ startRow: 0, endRow: 0 }, 10), {
      startRow: 0,
      endRow: 7,
    });
  });

  it("deep viewer absolute index + full filtered arrays intact", () => {
    assert.equal(profileGridAbsoluteIndex(6, 2), 20);
    assert.equal(profileGridTotalRows(22), 8);
    assert.match(userProfileSrc, /openPostsPostViewer\(absoluteIndex\)/);
    assert.match(userProfileSrc, /openLikedPostViewer\(absoluteIndex\)/);
    assert.match(userProfileSrc, /setPostsViewerSequence\(filteredPosts\)/);
    assert.match(userProfileSrc, /setLikesViewerSequence\(filteredLikedPosts\)/);
    assert.match(
      userProfileSrc,
      /const filteredPosts = useMemo\(\s*\(\) => filterPostsByIdentificationStatus\(userPosts, postFilter\)/,
    );
    assert.match(
      userProfileSrc,
      /const filteredLikedPosts = useMemo\(\s*\(\) => filterPostsByIdentificationStatus\(likedPosts, likesFilter\)/,
    );
    assert.match(userProfileSrc, /filteredPosts\s*\.slice\(postsGridSlice\.startIndex/);
    assert.match(userProfileSrc, /filteredLikedPosts\s*\.slice\(likedGridSlice\.startIndex/);
  });
});

describe("PROFILE-GRID-WINDOWING-8 — scroll anchoring + no per-tab restore", () => {
  it("removes per-tab scrollTop restore", () => {
    assert.doesNotMatch(userProfileSrc, /profileTabScrollTopRef/);
    assert.doesNotMatch(userProfileSrc, /profileGridPendingScrollRestoreRef/);
    assert.doesNotMatch(userProfileSrc, /profileGridHeavyTabPrevRef/);
    assert.doesNotMatch(userProfileSrc, /scroller\.scrollTop = pending/);
  });

  it("Profile-only overflow-anchor:none; Home untouched by PROFILE_PAGE_SCROLL_CLASS", () => {
    assert.match(PROFILE_PAGE_SCROLL_CLASS, /overflow-anchor:none/);
    assert.match(
      PROFILE_PAGE_SCROLL_CLASS,
      new RegExp(APP_PAGE_SCROLL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(userProfileSrc, /PROFILE_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(userProfileSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(homeSrc, /PROFILE_PAGE_SCROLL_CLASS/);
  });
});

describe("PROFILE-GRID-WINDOWING-8 — wiring + pager untouched", () => {
  it("wires max tiles + spacers + production grid class", () => {
    assert.match(userProfileSrc, /data-profile-grid-max-tiles=\{PROFILE_GRID_MAX_MOUNTED_TILES\}/);
    assert.match(userProfileSrc, /data-profile-grid-window-rows=\{PROFILE_GRID_WINDOW_ROWS\}/);
    assert.match(userProfileSrc, /PROFILE_POSTS_LIKES_GRID_CLASS/);
    assert.match(userProfileSrc, /profile-posts-grid-top-spacer/);
    assert.match(userProfileSrc, /profile-posts-grid-bottom-spacer/);
    assert.match(userProfileSrc, /disableVideoFallback/);
  });

  it("pager module has no grid-window coupling; windowing does not edit swipe math", () => {
    assert.doesNotMatch(pagerSrc, /profile-grid-window|PROFILE_GRID_WINDOW|resolveProfileGrid/);
    assert.doesNotMatch(windowSrc, /profile-tab-swipe|PROFILE_TAB_PAGER|gesture|haptic/i);
    assert.match(userProfileSrc, /from "@\/lib\/profile-tab-swipe"/);
    assert.match(userProfileSrc, /from "@\/lib\/profile-grid-window"/);
  });
});
