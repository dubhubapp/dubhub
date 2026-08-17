import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getGenreChipStyle } from "@/lib/genre-styles";
import { getSubgenreLabel, getSubgenresForParent, isValidSubgenre } from "@shared/post-subgenre";
import { serializeSubgenreFilterQuery, toggleSelectedSubgenre } from "@shared/home-feed-subgenre-filter";
import { getHomeFeedEmptyCopy } from "./home-feed-empty-copy";
import {
  DISCOVER_GENRES_PAGE,
  DISCOVER_GENRE_PAGE_FRAME_CLASS,
  DISCOVER_GENRE_PAGE_GRID_CLASS,
  DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS,
  DISCOVER_GENRE_PAGE_MIN_HEIGHT_CLASS,
  DISCOVER_MENU_CONTENT_INSET_CLASS,
  DISCOVER_MENU_HEADING_TEXT_CLASS,
  DISCOVER_PAGE_ARROW_Y_CLASS,
  DISCOVER_PAGE_EDGE_INSET_CLASS,
  DISCOVER_PAGE_FLICK_PX_PER_MS,
  DISCOVER_PAGE_SNAP_RATIO,
  DISCOVER_PAGE_SWIPE_DOMINANCE,
  DISCOVER_PAGE_SWIPE_MIN_DX_PX,
  clampDiscoverPageDragOffset,
  discoverPageStripTranslatePx,
  getDiscoverAdjacentGenreFilterPages,
  getDiscoverGenreFilterPages,
  getDiscoverGenreGridRowCount,
  getDiscoverPagesVisibleInViewport,
  getDiscoverPageTrackSlots,
  getDiscoverSubgenreGroups,
  isDiscoverPageTrackReady,
  isDiscoverSubgenreChipSelected,
  parentHasActiveSubgenreRefinement,
  resolveDiscoverGenreFilterPage,
  resolveDiscoverPageDragLock,
  resolveDiscoverPageDragRelease,
  resolveDiscoverPageSwipe,
  stepDiscoverGenreFilterPage,
} from "./discover-subgenre-chips";

const here = dirname(fileURLToPath(import.meta.url));
const genreFilterSrc = readFileSync(join(here, "../components/genre-filter.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const continuitySrc = readFileSync(join(here, "./home-feed-chrome-continuity.ts"), "utf8");
const sessionSrc = readFileSync(join(here, "./home-feed-session.ts"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "../../../server/storage.ts"), "utf8");

const collapsedStart = genreFilterSrc.indexOf("if (isCollapsed)");
const uncollapsedStart = genreFilterSrc.indexOf('return (\n    <div className="space-y-4 p-4">');
const collapsedSrc = genreFilterSrc.slice(collapsedStart, uncollapsedStart);
const uncollapsedSrc = genreFilterSrc.slice(uncollapsedStart);

describe("discover genre filter pages", () => {
  it("no selected parents → only Genres page", () => {
    assert.deepEqual(getDiscoverGenreFilterPages([]), [DISCOVER_GENRES_PAGE]);
  });

  it("DnB selected → pages are Genres + DnB", () => {
    assert.deepEqual(getDiscoverGenreFilterPages(["dnb"]), [DISCOVER_GENRES_PAGE, "dnb"]);
  });

  it("DnB + Dubstep → pages are Genres + DnB + Dubstep", () => {
    assert.deepEqual(getDiscoverGenreFilterPages(["dnb", "dubstep"]), [
      DISCOVER_GENRES_PAGE,
      "dnb",
      "dubstep",
    ]);
  });

  it("unselected genres do not create pages", () => {
    const pages = getDiscoverGenreFilterPages(["dnb"]);
    assert.equal(pages.includes("house"), false);
    assert.equal(pages.includes("ukg"), false);
  });

  it("page order follows selectedGenres", () => {
    assert.deepEqual(getDiscoverGenreFilterPages(["house", "dnb"]), [
      DISCOVER_GENRES_PAGE,
      "house",
      "dnb",
    ]);
  });

  it("forward paging loops", () => {
    const pages = getDiscoverGenreFilterPages(["dnb", "dubstep"]);
    assert.equal(stepDiscoverGenreFilterPage("genres", pages, 1), "dnb");
    assert.equal(stepDiscoverGenreFilterPage("dnb", pages, 1), "dubstep");
    assert.equal(stepDiscoverGenreFilterPage("dubstep", pages, 1), "genres");
  });

  it("backward paging loops", () => {
    const pages = getDiscoverGenreFilterPages(["dnb", "dubstep"]);
    assert.equal(stepDiscoverGenreFilterPage("genres", pages, -1), "dubstep");
    assert.equal(stepDiscoverGenreFilterPage("dubstep", pages, -1), "dnb");
    assert.equal(stepDiscoverGenreFilterPage("dnb", pages, -1), "genres");
  });

  it("active parent page becoming invalid resets to Genres", () => {
    assert.equal(
      resolveDiscoverGenreFilterPage("dnb", getDiscoverGenreFilterPages(["dubstep"])),
      DISCOVER_GENRES_PAGE,
    );
    assert.equal(
      resolveDiscoverGenreFilterPage("dnb", getDiscoverGenreFilterPages([])),
      DISCOVER_GENRES_PAGE,
    );
  });

  it("Clear resets page to Genres", () => {
    assert.equal(resolveDiscoverGenreFilterPage("dnb", getDiscoverGenreFilterPages([])), "genres");
    assert.match(collapsedSrc, /setActiveGenreFilterPage\(DISCOVER_GENRES_PAGE\)/);
    assert.match(collapsedSrc, /onGenresChange\(\[\]\)/);
  });
});

describe("discover refinement page content", () => {
  it("DnB refinement page contains Jump Up", () => {
    const group = getDiscoverSubgenreGroups(["dnb"])[0];
    assert.ok(group?.children.some((child) => child.id === "jump_up" && child.label === "Jump Up"));
  });

  it("House page contains Future House", () => {
    const group = getDiscoverSubgenreGroups(["house"])[0];
    assert.ok(
      group?.children.some((child) => child.id === "future_house" && child.label === "Future House"),
    );
    assert.ok(
      group?.children.some(
        (child) => child.id === "progressive_house" && child.label === "Prog. House",
      ),
    );
    assert.equal(group?.children.some((child) => child.label === "Progressive House"), false);
    assert.equal(group?.children.length, 9);
  });

  it("Bassline page contains UK Bass + 4x4", () => {
    const ids = getDiscoverSubgenreGroups(["bassline"])[0]?.children.map((child) => child.id) ?? [];
    assert.deepEqual(ids, ["uk_bass", "4x4"]);
  });

  it("child chips use shared taxonomy", () => {
    assert.deepEqual(
      getDiscoverSubgenreGroups(["dnb"])[0]?.children,
      getSubgenresForParent("dnb"),
    );
    assert.doesNotMatch(genreFilterSrc, /jump_up/);
    assert.doesNotMatch(genreFilterSrc, /future_house/);
  });
});

describe("discover child selected state and toggle", () => {
  it("child chip selected state derives from selectedSubgenresByGenre", () => {
    const selected = { dnb: ["jump_up"] };
    assert.equal(isDiscoverSubgenreChipSelected(selected, "dnb", "jump_up"), true);
    assert.equal(isDiscoverSubgenreChipSelected(selected, "dnb", "neuro"), false);
  });

  it("child multi-select semantics unchanged", () => {
    const afterJump = toggleSelectedSubgenre(["dnb"], {}, "dnb", "jump_up");
    assert.deepEqual(afterJump, { dnb: ["jump_up"] });
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], afterJump, "dnb", "neuro"),
      { dnb: ["jump_up", "neuro"] },
    );
  });

  it("final child deselect leaves parent broad", () => {
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], { dnb: ["jump_up"] }, "dnb", "jump_up"),
      {},
    );
  });

  it("selected child retains parent colour", () => {
    const dnb = getGenreChipStyle("dnb");
    const group = getDiscoverSubgenreGroups(["dnb"])[0];
    assert.equal(group?.bgColor, dnb.bgColor);
    assert.match(collapsedSrc, /group\.bgColor/);
  });
});

describe("discover paging chrome", () => {
  it("Genres/Clear heading row contains no paging arrows", () => {
    const headingStart = collapsedSrc.indexOf('data-discover-genre-heading="genres"');
    const headingEnd = collapsedSrc.indexOf('data-discover-genre-grid="parent"', headingStart);
    const heading = collapsedSrc.slice(headingStart, headingEnd);
    assert.ok(heading.length > 0);
    assert.match(heading, />\s*Genres\s*</);
    assert.match(heading, />\s*Clear\s*</);
    assert.doesNotMatch(heading, /DiscoverPageArrow/);
    assert.doesNotMatch(heading, /goGenreFilterPage/);
  });

  it("paging arrows live on content edges and remain accessible", () => {
    assert.match(collapsedSrc, /data-discover-page-arrows/);
    assert.match(collapsedSrc, /absolute left-0/);
    assert.match(collapsedSrc, /absolute right-0/);
    assert.match(collapsedSrc, /DISCOVER_PAGE_ARROW_Y_CLASS/);
    assert.match(genreFilterSrc, /Next genre refinement/);
    assert.match(genreFilterSrc, /Previous genre refinement/);
    assert.match(collapsedSrc, /goGenreFilterPage\(1\)/);
    assert.match(collapsedSrc, /goGenreFilterPage\(-1\)/);
  });

  it("arrows only appear when refinement pages exist", () => {
    assert.match(collapsedSrc, /hasGenreRefinementPages/);
    assert.match(collapsedSrc, /DiscoverPageArrow/);
  });

  it("subgenre controls use the approved parent-sized visual language", () => {
    assert.match(genreFilterSrc, /const discoverGenrePillClass =/);
    assert.match(
      genreFilterSrc,
      /min-h-9 min-w-0 w-full items-center justify-center gap-1 whitespace-normal rounded-full px-2 py-1\.5 text-center text-xs leading-tight/,
    );
    assert.match(collapsedSrc, /discoverGenrePillClass/);
    assert.match(collapsedSrc, /DISCOVER_GENRE_PAGE_GRID_CLASS/);
    assert.equal(DISCOVER_PAGE_EDGE_INSET_CLASS, "px-9");
    assert.match(collapsedSrc, /renderSharedGenrePage/);
    assert.doesNotMatch(collapsedSrc, /text-\[11px\]/);
    assert.doesNotMatch(collapsedSrc, /flex flex-wrap gap-1\.5/);
  });

  it("parent with active child shows informational ↔ that is not separately interactive", () => {
    assert.equal(parentHasActiveSubgenreRefinement({ dnb: ["jump_up"] }, "dnb"), true);
    assert.equal(parentHasActiveSubgenreRefinement({}, "dnb"), false);
    assert.equal(parentHasActiveSubgenreRefinement({ dnb: ["jump_up"] }, "house"), false);
    assert.match(collapsedSrc, /parentHasActiveSubgenreRefinement/);
    assert.match(collapsedSrc, /ArrowLeftRight/);
    assert.match(collapsedSrc, /aria-hidden="true"/);
    assert.match(collapsedSrc, /pointer-events-none h-2 w-2 shrink-0 opacity-45/);
  });

  it("collapsed Discover trigger stays parent-only", () => {
    const triggerBlock = genreFilterSrc.slice(
      genreFilterSrc.indexOf("const collapsedLabel"),
      genreFilterSrc.indexOf("const showFeedModeGlyph"),
    );
    assert.match(triggerBlock, /selectedGenres\.map\(getGenreLabel\)/);
    assert.doesNotMatch(triggerBlock, /subgenre/i);
    assert.doesNotMatch(triggerBlock, /ArrowLeftRight/);
    assert.doesNotMatch(triggerBlock, /Jump Up/);
  });

  it("stacked child sections are gone", () => {
    assert.doesNotMatch(collapsedSrc, /subgenreGroups\.map/);
    assert.doesNotMatch(collapsedSrc, /discover-subgenre-heading-\$\{group\.parentId\}/);
    assert.doesNotMatch(collapsedSrc, /className="mt-3"/);
    assert.match(collapsedSrc, /data-discover-genre-page=\{resolvedGenreFilterPage\}/);
    assert.match(genreFilterSrc, /getDiscoverAdjacentGenreFilterPages/);
  });

  it("Done content padding prevents overlap and vertical scrolling stays available", () => {
    assert.match(collapsedSrc, /data-discover-done-clearance/);
    assert.match(collapsedSrc, /discoverDoneClearanceClass/);
    assert.match(genreFilterSrc, /const discoverDoneClearanceClass = "pb-14"/);
    assert.match(
      collapsedSrc,
      /sticky bottom-0 border-t border-white\/20 bg-white\/10 px-3 py-2\.5 backdrop-blur-xl/,
    );
    assert.match(
      collapsedSrc,
      /className="overflow-y-auto rounded-xl border border-white\/20 bg-white\/10 shadow-2xl backdrop-blur-xl"/,
    );
    assert.doesNotMatch(collapsedSrc, /overflow-y-hidden/);
    assert.doesNotMatch(collapsedSrc, /overflow-hidden rounded-xl/);
  });

  it("child chips have aria-pressed and refinement groups are labelled", () => {
    assert.match(collapsedSrc, /aria-pressed=\{childSelected\}/);
    assert.match(collapsedSrc, /aria-labelledby=\{headingId\}/);
    assert.match(collapsedSrc, /id=\{headingId\}/);
    assert.match(collapsedSrc, /discover-subgenre-heading/);
  });

  it("child groups exist only on the collapsed Discover path", () => {
    assert.match(collapsedSrc, /data-discover-genre-page=\{resolvedGenreFilterPage\}/);
    assert.match(collapsedSrc, /DiscoverPageArrow/);
    assert.doesNotMatch(uncollapsedSrc, /DiscoverPageArrow/);
    assert.doesNotMatch(uncollapsedSrc, /data-discover-genre-page/);
    assert.doesNotMatch(uncollapsedSrc, /discover-subgenre-heading/);
  });
});

describe("discover adjacent pages and drag", () => {
  it("page model exposes previous/current/next", () => {
    const pages = getDiscoverGenreFilterPages(["dnb", "dubstep", "house"]);
    assert.deepEqual(getDiscoverAdjacentGenreFilterPages("dnb", pages), {
      previous: DISCOVER_GENRES_PAGE,
      current: "dnb",
      next: "dubstep",
    });
  });

  it("circular previous/next calculation is correct at first and last pages", () => {
    const pages = getDiscoverGenreFilterPages(["dnb", "house"]);
    assert.deepEqual(getDiscoverAdjacentGenreFilterPages("genres", pages), {
      previous: "house",
      current: "genres",
      next: "dnb",
    });
    assert.deepEqual(getDiscoverAdjacentGenreFilterPages("house", pages), {
      previous: "dnb",
      current: "house",
      next: "genres",
    });
  });

  it("arrow navigation and drag completion use the same navigation helper", () => {
    assert.match(genreFilterSrc, /stepDiscoverGenreFilterPage/);
    assert.match(genreFilterSrc, /applyGenreFilterPageStep/);
    assert.match(collapsedSrc, /goGenreFilterPage\(1\)/);
    assert.match(collapsedSrc, /goGenreFilterPage\(-1\)/);
    assert.match(genreFilterSrc, /resolveDiscoverPageDragRelease/);
    assert.match(genreFilterSrc, /genrePagePendingStepRef/);
    assert.match(genreFilterSrc, /applyGenreFilterPageStep\(direction\)/);
    assert.match(genreFilterSrc, /applyGenreFilterPageStep\(step\)/);
  });

  it("horizontal drag updates page offset", () => {
    assert.equal(clampDiscoverPageDragOffset(-40, 200), -40);
    assert.equal(clampDiscoverPageDragOffset(-500, 200), -200);
    assert.equal(clampDiscoverPageDragOffset(500, 200), 200);
    assert.equal(discoverPageStripTranslatePx(200, -40), -240);
    assert.match(genreFilterSrc, /setGenrePageDragOffsetPx/);
    assert.match(genreFilterSrc, /discoverPageStripTranslatePx/);
  });

  it("below-threshold drag snaps back", () => {
    assert.equal(
      resolveDiscoverPageDragRelease({ offsetPx: -20, pageWidthPx: 200, velocityXPxPerMs: 0 }),
      0,
    );
    assert.ok(DISCOVER_PAGE_SNAP_RATIO >= 0.25 && DISCOVER_PAGE_SNAP_RATIO <= 0.3);
  });

  it("above-threshold left drag advances", () => {
    assert.equal(
      resolveDiscoverPageDragRelease({ offsetPx: -80, pageWidthPx: 200, velocityXPxPerMs: 0 }),
      1,
    );
  });

  it("above-threshold right drag goes previous", () => {
    assert.equal(
      resolveDiscoverPageDragRelease({ offsetPx: 80, pageWidthPx: 200, velocityXPxPerMs: 0 }),
      -1,
    );
  });

  it("clear horizontal velocity can complete the page change", () => {
    assert.equal(
      resolveDiscoverPageDragRelease({
        offsetPx: -10,
        pageWidthPx: 200,
        velocityXPxPerMs: -DISCOVER_PAGE_FLICK_PX_PER_MS,
      }),
      1,
    );
    assert.equal(
      resolveDiscoverPageDragRelease({
        offsetPx: 10,
        pageWidthPx: 200,
        velocityXPxPerMs: DISCOVER_PAGE_FLICK_PX_PER_MS,
      }),
      -1,
    );
  });

  it("circular drag works at first/last page", () => {
    const pages = getDiscoverGenreFilterPages(["dnb"]);
    assert.equal(stepDiscoverGenreFilterPage("genres", pages, 1), "dnb");
    assert.equal(stepDiscoverGenreFilterPage("genres", pages, -1), "dnb");
    assert.equal(stepDiscoverGenreFilterPage("dnb", pages, 1), "genres");
    assert.equal(stepDiscoverGenreFilterPage("dnb", pages, -1), "genres");
  });

  it("vertical-dominant movement does not trigger horizontal paging", () => {
    assert.equal(resolveDiscoverPageDragLock(-40, 8), "horizontal");
    assert.equal(resolveDiscoverPageDragLock(-8, 40), "vertical");
    assert.equal(resolveDiscoverPageDragLock(-4, 4), "undecided");
    assert.equal(resolveDiscoverPageSwipe(-40, 40), 0);
    assert.equal(resolveDiscoverPageSwipe(-10, 2), 0);
    assert.ok(DISCOVER_PAGE_SWIPE_MIN_DX_PX >= 10);
    assert.ok(DISCOVER_PAGE_SWIPE_DOMINANCE > 1);
    assert.match(genreFilterSrc, /resolveDiscoverPageDragLock/);
    assert.match(genreFilterSrc, /if \(drag\.lock !== "horizontal"\) return;/);
    assert.match(genreFilterSrc, /event\.preventDefault\(\)/);
    assert.match(genreFilterSrc, /suppressGenrePageClickRef/);
    assert.match(collapsedSrc, /onClickCapture=\{onGenrePageClickCapture\}/);
    assert.match(collapsedSrc, /touch-pan-y/);
  });

  it("page state is not persisted", () => {
    assert.doesNotMatch(sessionSrc, /activeGenreFilterPage/);
    assert.doesNotMatch(homeSrc, /activeGenreFilterPage/);
    assert.doesNotMatch(homeSrc, /genrePageDragOffsetPx/);
    assert.match(genreFilterSrc, /useState<DiscoverGenreFilterPage>\(DISCOVER_GENRES_PAGE\)/);
    assert.match(genreFilterSrc, /if \(isOpen\) return;/);
    assert.match(genreFilterSrc, /setActiveGenreFilterPage\(DISCOVER_GENRES_PAGE\)/);
  });

  it("renders only previous/current/next pages", () => {
    assert.match(collapsedSrc, /adjacentGenrePages\.previous/);
    assert.match(collapsedSrc, /adjacentGenrePages\.current/);
    assert.match(collapsedSrc, /adjacentGenrePages\.next/);
    assert.doesNotMatch(collapsedSrc, /genreFilterPages\.map/);
    assert.match(genreFilterSrc, /getDiscoverAdjacentGenreFilterPages/);
  });
});

describe("discover pager alignment", () => {
  it("width=0 does not expose a stacked 3-page track", () => {
    assert.equal(isDiscoverPageTrackReady(0), false);
    assert.deepEqual(getDiscoverPagesVisibleInViewport(0, 0), []);
    assert.equal(discoverPageStripTranslatePx(0, 0), 0);
    assert.match(collapsedSrc, /isDiscoverPageTrackReady\(pageWidth\)/);
    assert.match(collapsedSrc, /renderSharedGenrePage\(adjacentGenrePages\.current, true\)/);
  });

  it("valid width settles current page at -pageWidth", () => {
    assert.equal(isDiscoverPageTrackReady(224), true);
    assert.equal(discoverPageStripTranslatePx(224, 0), -224);
    assert.equal(getDiscoverPageTrackSlots(224).settledTranslatePx, -224);
    assert.match(collapsedSrc, /discoverPageStripTranslatePx\(pageWidth, genrePageDragOffsetPx\)/);
  });

  it("previous/current/next each occupy exactly one page width", () => {
    assert.deepEqual(getDiscoverPageTrackSlots(224), {
      pageWidth: 224,
      trackWidth: 672,
      previousOffsetPx: 0,
      currentOffsetPx: 224,
      nextOffsetPx: 448,
      settledTranslatePx: -224,
    });
    assert.match(collapsedSrc, /width: pageWidth \* 3/);
    assert.match(collapsedSrc, /style=\{\{ width: pageWidth \}\}/);
  });

  it("settled state shows current page only", () => {
    assert.deepEqual(getDiscoverPagesVisibleInViewport(224, 0), ["current"]);
  });

  it("adjacent pages become visible only through drag offset", () => {
    assert.deepEqual(getDiscoverPagesVisibleInViewport(224, -20), ["current", "next"]);
    assert.deepEqual(getDiscoverPagesVisibleInViewport(224, 20), ["previous", "current"]);
    assert.deepEqual(getDiscoverPagesVisibleInViewport(224, 0), ["current"]);
  });

  it("pager viewport clips horizontally and dialog still scrolls vertically", () => {
    const pagerStart = collapsedSrc.indexOf("data-discover-genre-pager");
    const pagerBlock = collapsedSrc.slice(pagerStart, pagerStart + 280);
    assert.match(pagerBlock, /overflow-x-hidden/);
    assert.doesNotMatch(pagerBlock, /DISCOVER_PAGE_EDGE_INSET_CLASS/);
    assert.match(
      collapsedSrc,
      /className="overflow-y-auto rounded-xl border border-white\/20 bg-white\/10 shadow-2xl backdrop-blur-xl"/,
    );
    assert.doesNotMatch(collapsedSrc, /overflow-y-hidden/);
  });

  it("arrow content inset does not alter page-step width", () => {
    const slots = getDiscoverPageTrackSlots(296);
    assert.equal(slots.pageWidth, 296);
    assert.equal(slots.currentOffsetPx, 296);
    assert.match(collapsedSrc, /className=\{DISCOVER_GENRE_PAGE_FRAME_CLASS\}/);
    const pagerStart = collapsedSrc.indexOf("data-discover-genre-pager");
    const pagerClass = collapsedSrc.slice(pagerStart, pagerStart + 160);
    assert.doesNotMatch(pagerClass, /px-9/);
    assert.match(genreFilterSrc, /setGenrePageWidthPx\(el\.clientWidth\)/);
  });

  it("selecting an additional genre does not create an invalid transform", () => {
    const before = getDiscoverGenreFilterPages(["dnb"]);
    const after = getDiscoverGenreFilterPages(["dnb", "house"]);
    assert.equal(resolveDiscoverGenreFilterPage("dnb", before), "dnb");
    assert.equal(resolveDiscoverGenreFilterPage("dnb", after), "dnb");
    assert.equal(discoverPageStripTranslatePx(224, 0), -224);
    assert.deepEqual(getDiscoverPagesVisibleInViewport(224, 0), ["current"]);
    assert.match(
      genreFilterSrc,
      /if \(!el \|\| !hasGenreRefinementPages\) \{\s*setGenrePageWidthPx\(0\);/s,
    );
  });
});

describe("discover pager frame consistency", () => {
  it("Genres and refinement pages use the same page wrapper", () => {
    assert.match(DISCOVER_GENRE_PAGE_FRAME_CLASS, /w-full/);
    assert.match(DISCOVER_GENRE_PAGE_FRAME_CLASS, /px-9/);
    assert.match(collapsedSrc, /data-discover-genre-page-frame/);
    assert.match(collapsedSrc, /renderSharedGenrePage\(DISCOVER_GENRES_PAGE, true\)/);
    assert.match(collapsedSrc, /renderSharedGenrePage\(adjacentGenrePages\.previous, false\)/);
    assert.match(collapsedSrc, /renderSharedGenrePage\(adjacentGenrePages\.current, true\)/);
    assert.match(collapsedSrc, /renderSharedGenrePage\(adjacentGenrePages\.next, false\)/);
  });

  it("heading row uses shared fixed/min geometry", () => {
    assert.match(DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS, /min-h-9/);
    assert.match(DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS, /mb-2/);
    assert.equal(
      (collapsedSrc.match(/DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS/g) ?? []).length >= 2,
      true,
    );
    const genresHeadingStart = collapsedSrc.lastIndexOf(
      "DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS",
      collapsedSrc.indexOf('data-discover-genre-heading="genres"'),
    );
    const genresHeading = collapsedSrc.slice(
      genresHeadingStart,
      collapsedSrc.indexOf('data-discover-genre-grid="parent"'),
    );
    const childHeadingStart = collapsedSrc.lastIndexOf(
      "DISCOVER_GENRE_PAGE_HEADING_ROW_CLASS",
      collapsedSrc.indexOf("data-discover-genre-heading={group.parentId}"),
    );
    const childHeading = collapsedSrc.slice(
      childHeadingStart,
      collapsedSrc.indexOf('data-discover-genre-grid="child"'),
    );
    assert.match(genresHeading, /DISCOVER_MENU_HEADING_TEXT_CLASS/);
    assert.match(childHeading, /DISCOVER_MENU_HEADING_TEXT_CLASS/);
    assert.doesNotMatch(childHeading, /justify-self-center/);
    assert.doesNotMatch(childHeading, /text-center text-sm/);
    assert.doesNotMatch(childHeading, /mb-2 text-center text-sm/);
  });

  it("parent and child grids share the same horizontal frame and top origin", () => {
    assert.match(DISCOVER_GENRE_PAGE_GRID_CLASS, /grid-cols-3/);
    assert.match(DISCOVER_GENRE_PAGE_GRID_CLASS, /content-start/);
    assert.match(DISCOVER_GENRE_PAGE_GRID_CLASS, /gap-1\.5/);
    assert.match(collapsedSrc, /data-discover-genre-grid="parent"/);
    assert.match(collapsedSrc, /data-discover-genre-grid="child"/);
    assert.equal(
      (collapsedSrc.match(/DISCOVER_GENRE_PAGE_GRID_CLASS/g) ?? []).length >= 2,
      true,
    );
  });

  it("navigation gutters are reserved consistently", () => {
    assert.match(DISCOVER_GENRE_PAGE_FRAME_CLASS, /px-9/);
    assert.match(collapsedSrc, /if \(!hasGenreRefinementPages\) \{\s*return renderSharedGenrePage/s);
    assert.match(collapsedSrc, /className=\{DISCOVER_GENRE_PAGE_FRAME_CLASS\}/);
  });

  it("arrow x-position does not depend on current page content width", () => {
    assert.equal(DISCOVER_PAGE_ARROW_Y_CLASS, "top-[6.5rem] -translate-y-1/2");
    assert.match(collapsedSrc, /absolute left-0/);
    assert.match(collapsedSrc, /absolute right-0/);
    assert.doesNotMatch(collapsedSrc, /top-1\/2 -translate-y-1\/2/);
    const arrowsStart = collapsedSrc.indexOf("data-discover-page-arrows");
    const arrowsBlock = collapsedSrc.slice(arrowsStart, arrowsStart + 520);
    assert.match(arrowsBlock, /DISCOVER_PAGE_ARROW_Y_CLASS/);
    assert.doesNotMatch(arrowsBlock, /clientHeight/);
    assert.doesNotMatch(arrowsBlock, /offsetHeight/);
  });

  it("shorter refinement pages do not shrink the page frame", () => {
    assert.match(DISCOVER_GENRE_PAGE_MIN_HEIGHT_CLASS, /min-h-\[10\.25rem\]/);
    assert.match(DISCOVER_GENRE_PAGE_GRID_CLASS, /min-h-\[7\.5rem\]/);
    assert.equal(getDiscoverGenreGridRowCount(8), 3);
    assert.equal(getDiscoverGenreGridRowCount(9), 3);
    assert.equal(getDiscoverGenreGridRowCount(5), 2);
    assert.equal(getDiscoverGenreGridRowCount(2), 1);
    assert.ok(getDiscoverGenreGridRowCount(getDiscoverSubgenreGroups(["house"])[0]?.children.length ?? 0) <= 3);
    assert.ok(getDiscoverGenreGridRowCount(getDiscoverSubgenreGroups(["dubstep"])[0]?.children.length ?? 0) <= 3);
  });

  it("selecting a genre does not change pager width", () => {
    assert.match(collapsedSrc, /renderSharedGenrePage\(DISCOVER_GENRES_PAGE, true\)/);
    assert.match(collapsedSrc, /DISCOVER_GENRE_PAGE_FRAME_CLASS/);
    assert.equal(DISCOVER_PAGE_EDGE_INSET_CLASS, "px-9");
  });

  it("Clear does not affect grid width", () => {
    const genresHeading = collapsedSrc.slice(
      collapsedSrc.indexOf('data-discover-genre-heading="genres"'),
      collapsedSrc.indexOf('data-discover-genre-grid="parent"'),
    );
    assert.match(genresHeading, /Clear genre filters/);
    assert.match(collapsedSrc, /data-discover-genre-grid="parent"/);
    assert.match(collapsedSrc, /DISCOVER_GENRE_PAGE_GRID_CLASS/);
    assert.doesNotMatch(DISCOVER_GENRE_PAGE_GRID_CLASS, /Clear/);
  });
});

describe("discover final alignment", () => {
  it("Feed, Status, and Genres headings use the same left content edge", () => {
    assert.equal(DISCOVER_MENU_CONTENT_INSET_CLASS, "px-9");
    assert.match(DISCOVER_MENU_HEADING_TEXT_CLASS, /justify-self-start/);
    assert.match(collapsedSrc, /data-discover-shared-content="feed"/);
    assert.match(collapsedSrc, /data-discover-shared-content="status"/);
    assert.match(collapsedSrc, /data-discover-shared-content="genres"/);
    assert.equal(
      (collapsedSrc.match(/DISCOVER_MENU_HEADING_TEXT_CLASS/g) ?? []).length >= 4,
      true,
    );
  });

  it("subgenre headings use the same left edge as Genres and are not centred", () => {
    const childHeading = collapsedSrc.slice(
      collapsedSrc.indexOf("data-discover-genre-heading={group.parentId}"),
      collapsedSrc.indexOf('data-discover-genre-grid="child"'),
    );
    assert.match(childHeading, /DISCOVER_MENU_HEADING_TEXT_CLASS/);
    assert.doesNotMatch(childHeading, /justify-self-center/);
    assert.doesNotMatch(childHeading, /text-center/);
  });

  it("Feed/Status control frames align with the Genre grid frame", () => {
    assert.match(collapsedSrc, /data-discover-shared-content="feed"/);
    assert.match(collapsedSrc, /data-discover-shared-content="status"/);
    assert.match(DISCOVER_GENRE_PAGE_FRAME_CLASS, /px-9/);
    assert.equal(DISCOVER_MENU_CONTENT_INSET_CLASS, DISCOVER_PAGE_EDGE_INSET_CLASS);
    assert.match(collapsedSrc, /className="grid grid-cols-2 gap-1\.5"/);
    assert.match(collapsedSrc, /className="flex gap-1\.5"/);
  });

  it("arrow y-position uses stable middle-row geometry and ignores child count", () => {
    assert.equal(DISCOVER_PAGE_ARROW_Y_CLASS, "top-[6.5rem] -translate-y-1/2");
    const arrowsStart = collapsedSrc.indexOf("data-discover-page-arrows");
    const arrowsBlock = collapsedSrc.slice(arrowsStart, arrowsStart + 520);
    assert.match(arrowsBlock, /DISCOVER_PAGE_ARROW_Y_CLASS/);
    assert.doesNotMatch(arrowsBlock, /children\.length/);
    assert.doesNotMatch(arrowsBlock, /getDiscoverGenreGridRowCount/);
  });

  it("incomplete child rows are not horizontally re-centred", () => {
    assert.match(DISCOVER_GENRE_PAGE_GRID_CLASS, /content-start/);
    assert.doesNotMatch(DISCOVER_GENRE_PAGE_GRID_CLASS, /justify-items-center/);
    assert.doesNotMatch(collapsedSrc, /justify-items-center/);
  });

  it("progressive_house keeps its stored ID and displays Prog. House", () => {
    const house = getSubgenresForParent("house");
    const prog = house.find((child) => child.id === "progressive_house");
    assert.equal(prog?.id, "progressive_house");
    assert.equal(prog?.label, "Prog. House");
    assert.equal(getSubgenreLabel("progressive_house"), "Prog. House");
    assert.equal(isValidSubgenre("house", "progressive_house"), true);
    assert.equal(
      serializeSubgenreFilterQuery(["house"], { house: ["progressive_house"] }),
      "house:progressive_house",
    );
    assert.doesNotMatch(genreFilterSrc, /Progressive House/);
    assert.doesNotMatch(genreFilterSrc, /progressive_house/);
  });
});

describe("home empty-state copy", () => {
  it("single active child empty-state uses display label", () => {
    const copy = getHomeFeedEmptyCopy({
      identificationFilter: "all",
      selectedGenres: ["dubstep"],
      selectedSubgenresByGenre: { dubstep: ["brostep"] },
      postsLength: 10,
    });
    assert.equal(copy.title, "No Brostep posts yet");
    assert.equal(copy.subtitle, "Be the first to post one.");
    assert.doesNotMatch(copy.title, /brostep/);
  });

  it("single House child empty-state uses Prog. House display label", () => {
    const copy = getHomeFeedEmptyCopy({
      identificationFilter: "all",
      selectedGenres: ["house"],
      selectedSubgenresByGenre: { house: ["progressive_house"] },
      postsLength: 10,
    });
    assert.equal(copy.title, "No Prog. House posts yet");
    assert.doesNotMatch(copy.title, /Progressive House/);
    assert.doesNotMatch(copy.title, /progressive_house/);
  });

  it("multiple child empty-state uses plural copy", () => {
    const copy = getHomeFeedEmptyCopy({
      identificationFilter: "all",
      selectedGenres: ["dnb"],
      selectedSubgenresByGenre: { dnb: ["jump_up", "neuro"] },
      postsLength: 10,
    });
    assert.equal(copy.title, "No posts match these sub-genres yet");
    assert.equal(copy.subtitle, "Try another sub-genre or check back soon.");
  });

  it("no child filters retains generic empty state", () => {
    const copy = getHomeFeedEmptyCopy({
      identificationFilter: "all",
      selectedGenres: ["dnb"],
      selectedSubgenresByGenre: {},
      postsLength: 10,
    });
    assert.equal(copy.title, "No matching posts");
    assert.equal(copy.subtitle, "Try changing your filters");
  });

  it("Home uses the empty-copy helper", () => {
    assert.match(homeSrc, /getHomeFeedEmptyCopy/);
    assert.doesNotMatch(homeSrc, /Be the first to post one/);
  });
});

describe("discover freeze contracts", () => {
  it("playback/VideoCard files unchanged", () => {
    assert.match(videoCardSrc, /const videoDomKey = `\$\{post\.id\}-/);
    assert.doesNotMatch(genreFilterSrc, /from "@\/components\/video-card"/);
  });

  it("Home continuity and server/session/query architecture unchanged", () => {
    assert.match(continuitySrc, /export function shouldPreserveHomeFeedActivePostOnChromeChange/);
    assert.match(homeSrc, /feedChromeContinuityPendingRef/);
    assert.match(
      homeSrc,
      /queryKey: \["\/api\/posts", \{ genresKey, subgenresKey, identification: identificationFilter, sortMode \}/,
    );
    assert.match(sessionSrc, /selectedSubgenresByGenre/);
    assert.match(routesSrc, /subgenres/);
    assert.match(storageSrc, /subgenres/);
    assert.doesNotMatch(homeSrc, /activeGenreFilterPage/);
    assert.doesNotMatch(sessionSrc, /genrePageDragOffsetPx/);
  });

  it("parent and child filter semantics unchanged", () => {
    const afterJump = toggleSelectedSubgenre(["dnb"], {}, "dnb", "jump_up");
    assert.deepEqual(afterJump, { dnb: ["jump_up"] });
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], afterJump, "dnb", "neuro"),
      { dnb: ["jump_up", "neuro"] },
    );
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], { dnb: ["jump_up"] }, "dnb", "jump_up"),
      {},
    );
    assert.match(collapsedSrc, /toggleGenre\(genre\.id\)/);
    assert.match(collapsedSrc, /toggleSelectedSubgenre/);
    assert.match(collapsedSrc, /onGenresChange\(\[\]\)/);
    assert.match(collapsedSrc, /parentHasActiveSubgenreRefinement/);
  });
});
