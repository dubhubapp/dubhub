/**
 * RELEASES-SWIPE-TABS-2 — list-mode secondary tab pager contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTWORK_LOOP_MIN_COUNT,
  shouldEnableArtworkLoop,
} from "./artwork-release-browser";
import { getReleaseTrackerSecondaryViews, RELEASE_TRACKER_EMPTY_REGION_CLASS, RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS, RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS, RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS, RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS } from "./release-tracker-presentation";
import {
  RELEASE_TRACKER_TAB_PAGER_COMMIT_PROGRESS,
  RELEASE_TRACKER_TAB_PAGER_FLICK_MIN_DX_PX,
  RELEASE_TRACKER_TAB_PAGER_FLICK_PX_PER_MS,
  RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS,
  RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS,
  RELEASE_TRACKER_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS,
  RELEASE_TRACKER_TAB_PAGER_TRACK_CLASS,
  RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS,
  RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX,
  RELEASE_TRACKER_TAB_SWIPE_EDGE_START_PX,
  RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO,
  RELEASE_TRACKER_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX,
  RELEASE_TRACKER_SECONDARY_INDICATOR_INSET_PX,
  armReleaseTrackerPagerCardClickSuppression,
  clearReleaseTrackerPagerCardClickSuppression,
  consumeReleaseTrackerPagerCardClickSuppression,
  evaluateReleaseTrackerPagerRelease,
  getReleaseTrackerPagerAdjacentViews,
  getReleaseTrackerPagerMountedViews,
  interpolateReleaseTrackerNavIndicator,
  isReleaseTrackerPagerCardClickSuppressionArmed,
  isReleaseTrackerTabSwipeInteractiveTarget,
  prefersReleaseTrackerPagerReducedMotion,
  releaseTrackerPagerDragProgress,
  releaseTrackerPagerRestTranslatePx,
  releaseTrackerPagerUnlockCovers,
  releaseTrackerSecondaryIndicatorMetricsFromTabRect,
  releaseTrackerSecondaryTabEmphasisColor,
  RELEASE_TRACKER_SECONDARY_TAB_INACTIVE_ALPHA,
  releaseTrackerViewIndex,
  resolveReleaseTrackerPagerPrepareUnlockIndices,
  resolveReleaseTrackerPagerVertUnlockIndices,
  resolveReleaseTrackerSecondaryTabEmphasis,
  resolveReleaseTrackerViewFromDelta,
} from "./release-tracker-tab-swipe";

const here = dirname(fileURLToPath(import.meta.url));
const swipeSrc = readFileSync(join(here, "./release-tracker-tab-swipe.ts"), "utf8");
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const cardSrc = readFileSync(join(here, "../components/release-feed-card.tsx"), "utf8");
const presentationSrc = readFileSync(
  join(here, "./release-tracker-presentation.ts"),
  "utf8",
);
const WIDTH = 390;

describe("A/B/C — secondary swipe sequences from getReleaseTrackerSecondaryViews", () => {
  it("Artist My: Upcoming → Collaborations → Past", () => {
    const views = getReleaseTrackerSecondaryViews("my");
    assert.deepEqual([...views], ["upcoming", "collaborations", "past"]);
    assert.equal(resolveReleaseTrackerViewFromDelta(views, "upcoming", -40), "collaborations");
    assert.equal(
      resolveReleaseTrackerViewFromDelta(views, "collaborations", -40),
      "past",
    );
    assert.equal(resolveReleaseTrackerViewFromDelta(views, "past", 40), "collaborations");
    assert.equal(
      resolveReleaseTrackerViewFromDelta(views, "collaborations", 40),
      "upcoming",
    );
  });

  it("Artist Saved: Upcoming → Past", () => {
    const views = getReleaseTrackerSecondaryViews("saved");
    assert.deepEqual([...views], ["upcoming", "past"]);
    assert.equal(resolveReleaseTrackerViewFromDelta(views, "upcoming", -40), "past");
    assert.equal(resolveReleaseTrackerViewFromDelta(views, "past", 40), "upcoming");
  });

  it("Community uses saved sequence Upcoming → Past", () => {
    // Community effectiveScope is always "saved".
    const views = getReleaseTrackerSecondaryViews("saved");
    assert.deepEqual([...views], ["upcoming", "past"]);
    assert.equal(resolveReleaseTrackerViewFromDelta(views, "upcoming", -40), "past");
  });
});

describe("D — no My↔Saved swipe", () => {
  it("pager resolves only within secondary views — never scope", () => {
    assert.doesNotMatch(swipeSrc, /FeedScope|"my".*"saved".*delta|scope.*swipe/i);
    assert.match(trackerSrc, /listPagerEnabled/);
    assert.match(trackerSrc, /useReleaseTrackerTabPager/);
    assert.match(trackerSrc, /getReleaseTrackerSecondaryViews/);
    // Primary My/Saved remains setScope tap handlers only.
    assert.match(trackerSrc, /onClick=\{\(\) => setScope\(s\)\}/);
    assert.doesNotMatch(trackerSrc, /onCommitScope|scopePager|primary.*pager/i);
  });
});

describe("E — artwork mode disables pager", () => {
  it("gates pager on effectiveLayout === list", () => {
    assert.match(
      trackerSrc,
      /listPagerEnabled = !!currentUser\?\.id && effectiveLayout === "list"/,
    );
    assert.match(trackerSrc, /enabled: listPagerEnabled/);
    assert.match(trackerSrc, /enabled: !!currentUser\?\.id && !listPagerEnabled/);
    assert.match(trackerSrc, /ArtworkReleaseBrowser/);
  });
});

describe("F/G/H — gesture thresholds", () => {
  it("F: 24px left-edge reserve", () => {
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_EDGE_START_PX, 24);
    assert.match(swipeSrc, /clientX <= RELEASE_TRACKER_TAB_SWIPE_EDGE_START_PX/);
  });

  it("G: horizontal arm threshold 12px + 1.2 ratio", () => {
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX, 12);
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.match(
      swipeSrc,
      /absX >= RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX/,
    );
    assert.match(
      swipeSrc,
      /absX > absY \* RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO/,
    );
  });

  it("H: vertical cancel at 14px drift", () => {
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
    const views = getReleaseTrackerSecondaryViews("my");
    const d = evaluateReleaseTrackerPagerRelease({
      views,
      currentView: "upcoming",
      deltaX: 8,
      deltaY: 20,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "cancel");
    if (d.action === "cancel") assert.equal(d.reason, "vertical");
  });
});

describe("I/J — commit timing", () => {
  it("I: cancelled swipe does not commit (insufficient distance)", () => {
    const views = getReleaseTrackerSecondaryViews("saved");
    const d = evaluateReleaseTrackerPagerRelease({
      views,
      currentView: "upcoming",
      deltaX: -(WIDTH * 0.3),
      deltaY: 0,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "cancel");
    assert.match(swipeSrc, /onCommitRef\.current\(commitView\)/);
    assert.match(swipeSrc, /Calls onCommitView only after a successful snap/);
    // Page does not call setFeedView during drag — only onCommitView / tab click.
    assert.match(trackerSrc, /onCommitView: setFeedView/);
  });

  it("J: successful swipe commits after snap (distance)", () => {
    const views = getReleaseTrackerSecondaryViews("my");
    const d = evaluateReleaseTrackerPagerRelease({
      views,
      currentView: "upcoming",
      deltaX: -(WIDTH * RELEASE_TRACKER_TAB_PAGER_COMMIT_PROGRESS),
      deltaY: 2,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.nextView, "collaborations");
      assert.equal(d.reason, "distance");
    }
    assert.match(swipeSrc, /finishSnap\([\s\S]*decision\.nextView\)/);
    assert.match(swipeSrc, /runCommit/);
  });

  it("flick commit still requires min travel", () => {
    const views = getReleaseTrackerSecondaryViews("saved");
    const ok = evaluateReleaseTrackerPagerRelease({
      views,
      currentView: "upcoming",
      deltaX: -RELEASE_TRACKER_TAB_PAGER_FLICK_MIN_DX_PX,
      deltaY: 0,
      velocityX: -RELEASE_TRACKER_TAB_PAGER_FLICK_PX_PER_MS,
      viewportWidth: WIDTH,
    });
    assert.equal(ok.action, "commit");
    const short = evaluateReleaseTrackerPagerRelease({
      views,
      currentView: "upcoming",
      deltaX: -20,
      deltaY: 0,
      velocityX: -1,
      viewportWidth: WIDTH,
    });
    assert.equal(short.action, "cancel");
  });
});

describe("K/L/M — click suppression + interactive targets", () => {
  it("K: click suppressed after armed drag", () => {
    clearReleaseTrackerPagerCardClickSuppression();
    assert.equal(isReleaseTrackerPagerCardClickSuppressionArmed(), false);
    armReleaseTrackerPagerCardClickSuppression();
    assert.equal(isReleaseTrackerPagerCardClickSuppressionArmed(), true);
    assert.equal(consumeReleaseTrackerPagerCardClickSuppression(), true);
    assert.equal(consumeReleaseTrackerPagerCardClickSuppression(), false);
  });

  it("L: normal row tap unaffected when suppress not armed", () => {
    clearReleaseTrackerPagerCardClickSuppression();
    assert.equal(consumeReleaseTrackerPagerCardClickSuppression(), false);
    assert.match(
      cardSrc,
      /if \(consumeReleaseTrackerPagerCardClickSuppression\(\)\) return;/,
    );
  });

  it("M: provider link tap excluded from pager arm", () => {
    assert.match(swipeSrc, /input, textarea, select, button, a/);
    assert.match(cardSrc, /stopReleaseRowNavigation/);
    assert.match(cardSrc, /RELEASE_TRACKER_TAB_PAGER_CARD_ATTR/);
    assert.match(
      swipeSrc,
      /card && interactive === card\) return false/,
    );
    assert.equal(isReleaseTrackerTabSwipeInteractiveTarget(null), false);
  });
});

describe("N — adjacent query prefetch ±1 only", () => {
  it("adjacent helpers exclude non-neighbors", () => {
    const my = getReleaseTrackerSecondaryViews("my");
    assert.deepEqual(getReleaseTrackerPagerAdjacentViews(my, "upcoming"), [
      "collaborations",
    ]);
    assert.deepEqual(getReleaseTrackerPagerAdjacentViews(my, "collaborations"), [
      "upcoming",
      "past",
    ]);
    assert.deepEqual(getReleaseTrackerPagerAdjacentViews(my, "past"), [
      "collaborations",
    ]);
    assert.deepEqual(getReleaseTrackerPagerMountedViews(my, "upcoming"), [
      "upcoming",
      "collaborations",
    ]);
    assert.deepEqual(getReleaseTrackerPagerMountedViews(my, "collaborations"), [
      "upcoming",
      "collaborations",
      "past",
    ]);
  });

  it("tracker prefetches adjacentViews only with feed query key", () => {
    assert.match(trackerSrc, /for \(const view of adjacentViews\)/);
    assert.match(
      trackerSrc,
      /queryKey: \["\/api\/releases\/feed", effectiveScope, view\]/,
    );
    assert.match(trackerSrc, /prefetchQuery/);
    assert.match(trackerSrc, /isActive \|\| isAdjacent/);
  });
});

describe("O — shared indicator interpolates between secondary tabs", () => {
  it("presentation uses shared indicator (no per-tab ::after)", () => {
    assert.match(presentationSrc, /RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS/);
    assert.match(
      presentationSrc,
      /RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS =\s*"font-semibold text-foreground"/,
    );
    assert.doesNotMatch(
      presentationSrc,
      /RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS =[\s\S]*after:bg-\[#0a83ff\]/,
    );
    assert.match(presentationSrc, /h-0\.5 rounded-full bg-\[#0a83ff\]/);
    assert.equal(RELEASE_TRACKER_SECONDARY_INDICATOR_INSET_PX, 8);
  });

  it("interpolates left/width between tab metrics", () => {
    const from = { left: 8, width: 100 };
    const to = { left: 120, width: 100 };
    const mid = interpolateReleaseTrackerNavIndicator(from, to, 0.5);
    assert.equal(mid.left, 64);
    assert.equal(mid.width, 100);
    const metrics = releaseTrackerSecondaryIndicatorMetricsFromTabRect({
      tabLeft: 100,
      tabWidth: 120,
      tabBottom: 200,
      listLeft: 100,
      listBottom: 200,
    });
    assert.equal(metrics.left, 8);
    assert.equal(metrics.width, 104);
    assert.equal(metrics.bottom, 0);
  });

  it("drag progress drives indicator toward adjacent", () => {
    assert.equal(
      releaseTrackerPagerDragProgress({
        deltaX: -195,
        rubberDx: -195,
        viewportWidth: 390,
        hasAdjacent: true,
      }),
      0.5,
    );
    assert.equal(
      releaseTrackerPagerDragProgress({
        deltaX: -100,
        rubberDx: -28,
        viewportWidth: 390,
        hasAdjacent: false,
      }),
      0,
    );
    assert.match(trackerSrc, /interpolateReleaseTrackerNavIndicator/);
    assert.match(trackerSrc, /data-testid="releases-secondary-indicator"/);
  });
});

describe("P — reduced-motion commit behavior", () => {
  it("skips animated settle when reduced motion", () => {
    assert.match(swipeSrc, /prefersReleaseTrackerPagerReducedMotion/);
    assert.match(swipeSrc, /if \(reduced\) \{\s*runCommit\(\);/);
    // Function exists and is safe without matchMedia.
    assert.equal(typeof prefersReleaseTrackerPagerReducedMotion, "function");
  });

  it("secondary setFeedView owns one light haptic on change", () => {
    assert.match(trackerSrc, /import \{ playInteractionLight \} from "@\/lib\/haptic"/);
    assert.match(
      trackerSrc,
      /const setFeedView = \(v: FeedView\) => \{\s*[\s\S]*?if \(v !== feedView\) \{\s*playInteractionLight\(\);/,
    );
    assert.match(trackerSrc, /onCommitView: setFeedView/);
    assert.match(trackerSrc, /onClick=\{\(\) => setFeedView\(v\)\}/);
    // Swipe module itself must not fire haptics (avoid duplicate with setFeedView).
    assert.doesNotMatch(swipeSrc, /haptic|playInteractionLight|ImpactFeedback/i);
    // Primary My/Saved stays silent (assert scoped to setScope body only).
    const scopeBlock = trackerSrc.slice(
      trackerSrc.indexOf("const setScope = "),
      trackerSrc.indexOf("const setFeedView = "),
    );
    assert.doesNotMatch(scopeBlock, /playInteractionLight/);
  });
});

describe("wiring — no primary underline glide / list gate", () => {
  it("keeps primary My/Saved ::after underline", () => {
    assert.match(trackerSrc, /RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS/);
    assert.doesNotMatch(trackerSrc, /primaryIndicator|interpolatePrimary/);
  });

  it("mounts pager panels for secondary views only", () => {
    assert.match(trackerSrc, /data-testid=\{`releases-pager-panel-\$\{view\}`\}/);
    assert.match(trackerSrc, /mountContent = isActivePanel \|\| isAdjacentPanel/);
  });
});

describe("RELEASES-SWIPE-TABS-4 — full-height list swipe canvas", () => {
  it("A: list pager fills content column via existing artwork column tokens", () => {
    assert.match(
      trackerSrc,
      /fillReleasesContentColumn =\s*artworkWellActive \|\| isEmptyContentRegion \|\| listPagerEnabled/,
    );
    assert.match(trackerSrc, /fillReleasesContentColumn && ARTWORK_VIEW_COLUMN_CLASS/);
    assert.match(
      trackerSrc,
      /fillReleasesContentColumn && resolveArtworkViewColumnMinHClass\(isArtist\)/,
    );
    assert.match(trackerSrc, /listPagerEnabled && "flex min-h-0 flex-1 flex-col"/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS, /flex-1/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS, /min-h-0/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS, /flex-col/);
  });

  it("B: active panel stretches beyond short list content", () => {
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /data-\[state=active\]:min-h-full/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /data-\[state=active\]:h-auto/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_TRACK_CLASS, /min-h-full/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_TRACK_CLASS, /flex-1/);
  });

  it("C: inactive panels preserve collapsed behavior", () => {
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /data-\[state=inactive\]:min-h-0/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /data-\[state=inactive\]:overflow-y-hidden/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS, /!h-auto/);
  });

  it("D: no absolute overlay introduced", () => {
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS, /absolute|fixed|inset-0/);
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /absolute|fixed|inset-0/);
    assert.doesNotMatch(trackerSrc, /pointer-events-none.*pager|gesture-overlay|touch-overlay/i);
  });

  it("E: no new viewport-height magic values on pager classes", () => {
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS, /\b\d+vh\b|\b\d+dvh\b|100vh|100dvh/);
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /\b\d+vh\b|\b\d+dvh\b|100vh|100dvh/);
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_TRACK_CLASS, /\b\d+vh\b|\b\d+dvh\b|100vh|100dvh/);
    assert.doesNotMatch(trackerSrc, /min-h-\[50vh\]/);
  });

  it("F: existing page remains sole vertical scroller", () => {
    assert.match(trackerSrc, /ref=\{releaseScrollRef\}/);
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_VIEWPORT_CLASS, /overflow-y-auto|overflow-y-scroll/);
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /overflow-y-auto|overflow-y-scroll/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_CLASS, /data-\[state=active\]:overflow-y-visible/);
  });

  it("G: empty state still fills/centres via EMPTY_REGION flex-1", () => {
    assert.match(trackerSrc, /RELEASE_TRACKER_EMPTY_REGION_CLASS/);
    assert.doesNotMatch(trackerSrc, /RELEASE_TRACKER_EMPTY_REGION_CLASS,\s*"min-h-\[50vh\]"/);
    assert.match(trackerSrc, /data-testid="release-feed-empty"/);
  });

  it("H: artwork mode does not enable pager", () => {
    assert.match(
      trackerSrc,
      /listPagerEnabled = !!currentUser\?\.id && effectiveLayout === "list"/,
    );
    assert.match(trackerSrc, /enabled: listPagerEnabled/);
  });

  it("I: gesture thresholds/classes unchanged", () => {
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_EDGE_START_PX, 24);
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX, 12);
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(RELEASE_TRACKER_TAB_PAGER_COMMIT_PROGRESS, 0.48);
    assert.match(swipeSrc, /viewport\.addEventListener\("touchstart"/);
  });
});

describe("RELEASES-PRESENTATION-2 — transform resync + empty centring", () => {
  it("A: pager sync reacts to enabled via useLayoutEffect", () => {
    assert.match(swipeSrc, /useLayoutEffect\(/);
    assert.match(
      swipeSrc,
      /}, \[enabled, activeView, views, trackRef, viewportRef\]\)/,
    );
    assert.match(swipeSrc, /if \(!enabled \|\| typeof window === "undefined"\) return/);
  });

  it("B: Artwork → List rest transforms for Upcoming / Collaborations / Past", () => {
    const my = getReleaseTrackerSecondaryViews("my");
    assert.equal(releaseTrackerViewIndex(my, "upcoming"), 0);
    assert.equal(releaseTrackerViewIndex(my, "collaborations"), 1);
    assert.equal(releaseTrackerViewIndex(my, "past"), 2);
    assert.equal(releaseTrackerPagerRestTranslatePx(0, WIDTH), 0);
    assert.equal(releaseTrackerPagerRestTranslatePx(1, WIDTH), -WIDTH);
    assert.equal(releaseTrackerPagerRestTranslatePx(2, WIDTH), -WIDTH * 2);
    assert.match(swipeSrc, /releaseTrackerPagerRestTranslatePx\(index, width\)/);
  });

  it("C: sync uses current live refs inside the layout effect", () => {
    assert.match(swipeSrc, /const track = trackRef\.current/);
    assert.match(swipeSrc, /const viewport = viewportRef\.current/);
    // Must not close over track/viewport captured outside sync when enabled flips.
    const layoutBlock = swipeSrc.slice(
      swipeSrc.indexOf("Align track transform"),
      swipeSrc.indexOf("useEffect(() => {\n    const viewport = viewportRef.current"),
    );
    assert.match(layoutBlock, /const sync = \(\) => \{[\s\S]*trackRef\.current/);
    assert.match(layoutBlock, /const sync = \(\) => \{[\s\S]*viewportRef\.current/);
  });

  it("D: sync measures current viewport width", () => {
    assert.match(
      swipeSrc,
      /viewport\.getBoundingClientRect\(\)\.width \|\| window\.innerWidth/,
    );
  });

  it("E: no query invalidation introduced", () => {
    assert.doesNotMatch(swipeSrc, /invalidateQueries|refetchQueries/);
    assert.doesNotMatch(
      trackerSrc,
      /listPagerEnabled[\s\S]{0,200}invalidateQueries/,
    );
  });

  it("F: list empty active panel becomes flex column", () => {
    assert.equal(RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS, "flex flex-col");
    assert.match(trackerSrc, /RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS/);
    assert.match(trackerSrc, /panelEmpty/);
    assert.match(
      trackerSrc,
      /isActivePanel &&\s*panelEmpty &&\s*RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS/,
    );
  });

  it("G: empty region flex-1 can stretch/centre", () => {
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /flex-1/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /justify-center/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /items-center/);
    assert.match(trackerSrc, /RELEASE_TRACKER_EMPTY_REGION_CLASS/);
  });

  it("H: no new vh magic number introduced", () => {
    assert.doesNotMatch(trackerSrc, /min-h-\[50vh\]/);
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS, /\b\d+vh\b|100dvh/);
  });

  it("I: Artwork empty / List empty share EMPTY_REGION centering contract", () => {
    assert.match(presentationSrc, /RELEASE_TRACKER_EMPTY_REGION_CLASS/);
    assert.match(trackerSrc, /isEmptyContentRegion && !listPagerEnabled && RELEASE_TRACKER_EMPTY_REGION_CLASS/);
    assert.match(trackerSrc, /className=\{RELEASE_TRACKER_EMPTY_REGION_CLASS\}/);
  });

  it("J/K/L: Artwork loop threshold unchanged (1/2 finite, 3+ loop)", () => {
    assert.equal(ARTWORK_LOOP_MIN_COUNT, 3);
    assert.equal(shouldEnableArtworkLoop(1), false);
    assert.equal(shouldEnableArtworkLoop(2), false);
    assert.equal(shouldEnableArtworkLoop(3), true);
    assert.equal(shouldEnableArtworkLoop(8), true);
  });

  it("resets transient gesture + click suppress on enable sync", () => {
    assert.match(swipeSrc, /gestureRef\.current = createIdleGesture\(\)/);
    assert.match(swipeSrc, /clearReleaseTrackerPagerCardClickSuppression\(\)/);
    assert.match(
      swipeSrc,
      /viewportRef\.current\?\.removeAttribute\(RELEASE_TRACKER_TAB_PAGER_DRAGGING_ATTR\)/,
    );
  });
});

describe("RELEASES-SWIPE-TABS-6 — haptic on secondary change", () => {
  it("A/B/G: swipe commit + secondary tap share setFeedView haptic", () => {
    assert.match(trackerSrc, /onCommitView: setFeedView/);
    assert.match(trackerSrc, /onClick=\{\(\) => setFeedView\(v\)\}/);
    assert.match(trackerSrc, /if \(v !== feedView\) \{\s*playInteractionLight\(\);/);
  });

  it("C: cancelled swipe never reaches setFeedView", () => {
    assert.match(
      swipeSrc,
      /finishSnap\(releaseTrackerPagerRestTranslatePx\(index, width\), null\)/,
    );
    assert.match(
      swipeSrc,
      /if \(commitView && commitView !== viewRef\.current\) \{\s*onCommitRef\.current\(commitView\);/,
    );
  });

  it("D: same-tab selection skips haptic", () => {
    assert.match(trackerSrc, /if \(v !== feedView\) \{\s*playInteractionLight\(\);/);
  });

  it("E: swipe module does not also fire haptic (no duplicate)", () => {
    assert.doesNotMatch(swipeSrc, /playInteractionLight|Haptics\.impact/i);
  });

  it("F: primary My/Saved setScope remains silent", () => {
    const scopeBlock = trackerSrc.slice(
      trackerSrc.indexOf("const setScope = "),
      trackerSrc.indexOf("const setFeedView = "),
    );
    assert.doesNotMatch(scopeBlock, /playInteractionLight/);
  });
});

describe("RELEASES-SWIPE-TABS-6 — visual tab emphasis", () => {
  it("A: aria-selected stays on committed feedView", () => {
    assert.match(trackerSrc, /aria-selected=\{feedView === v\}/);
    assert.doesNotMatch(trackerSrc, /aria-selected=\{[^}]*progress/);
  });

  it("B/C: emphasis crossfades with pager progress", () => {
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      1,
    );
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      0,
    );
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0.5,
      }),
      0.5,
    );
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0.5,
      }),
      0.5,
    );
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 1,
      }),
      0,
    );
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 1,
      }),
      1,
    );
  });

  it("D: cancel progress 0 restores committed emphasis", () => {
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      1,
    );
    assert.equal(
      resolveReleaseTrackerSecondaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      0,
    );
  });

  it("E: color endpoints match inactive alpha → opaque", () => {
    assert.equal(RELEASE_TRACKER_SECONDARY_TAB_INACTIVE_ALPHA, 0.55);
    assert.equal(
      releaseTrackerSecondaryTabEmphasisColor(0),
      "rgba(255, 255, 255, 0.55)",
    );
    assert.equal(
      releaseTrackerSecondaryTabEmphasisColor(1),
      "rgba(255, 255, 255, 1)",
    );
  });

  it("F: wiring interpolates color only (no font-weight style)", () => {
    assert.match(trackerSrc, /applySecondaryTabVisualEmphasis/);
    assert.match(trackerSrc, /releaseTrackerSecondaryTabEmphasisColor\(emphasis\)/);
    assert.doesNotMatch(trackerSrc, /style\.fontWeight|fontWeight:/);
  });

  it("Artwork mode does not invent drag progress for labels", () => {
    assert.match(trackerSrc, /if \(!listPagerEnabled\) return;/);
    assert.match(trackerSrc, /applySecondaryTabVisualEmphasis/);
  });
});

describe("RELEASES-SWIPE-TABS-7 — stable secondary label typography", () => {
  it("active and inactive secondary labels share font-semibold", () => {
    assert.equal(RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS, "font-semibold text-foreground");
    assert.equal(
      RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS,
      "font-semibold text-white/55 hover:text-white/80",
    );
    assert.match(RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS, /font-semibold/);
    assert.match(RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS, /font-semibold/);
    assert.doesNotMatch(RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS, /font-medium/);
  });

  it("no font-medium ↔ font-semibold switch remains on secondary tabs", () => {
    assert.match(trackerSrc, /RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS/);
    assert.doesNotMatch(
      trackerSrc,
      /RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS[\s\S]{0,120}font-medium text-white\/55/,
    );
    assert.doesNotMatch(
      trackerSrc,
      /feedView === v[\s\S]{0,200}font-medium text-white\/55/,
    );
  });

  it("pager progress changes visual colour only", () => {
    assert.match(trackerSrc, /el\.style\.color = releaseTrackerSecondaryTabEmphasisColor/);
    assert.doesNotMatch(trackerSrc, /el\.style\.fontWeight/);
  });

  it("aria-selected remains committed-only", () => {
    assert.match(trackerSrc, /aria-selected=\{feedView === v\}/);
  });

  it("cancelled swipe / tap commit keep typography tokens stable", () => {
    // Weight tokens are constants — progress/cancel/tap only touch colour.
    assert.match(presentationSrc, /RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS/);
    assert.match(
      presentationSrc,
      /Active \+ inactive share `font-semibold`/,
    );
  });

  it("primary My/Saved typography is untouched", () => {
    assert.equal(RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS, "font-semibold text-foreground");
    assert.equal(
      RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
      "font-medium text-white/55 hover:text-white/80",
    );
  });
});

describe("RELEASES-SWIPE-TABS-6 — first-arm smoothness", () => {
  it("A: prepare unlocks before arm; drag covers skip React unlock", () => {
    assert.match(swipeSrc, /onGesturePrepare/);
    assert.match(swipeSrc, /onPrepareRef\.current\?\.\(\)/);
    assert.match(trackerSrc, /handlePagerGesturePrepare/);
    assert.match(trackerSrc, /releaseTrackerPagerUnlockCovers/);
    assert.match(
      trackerSrc,
      /releaseTrackerPagerUnlockCovers\(pagerVertUnlockIndicesRef\.current, unlock\)/,
    );
  });

  it("B: prepare caches panel heights + warms nav metrics", () => {
    assert.match(trackerSrc, /cachePagerPanelHeights\(prepareUnlock\)/);
    assert.match(trackerSrc, /measureSecondaryNavTriggers\(\)/);
    assert.deepEqual(resolveReleaseTrackerPagerPrepareUnlockIndices(1, 3), [0, 1, 2]);
    assert.deepEqual(resolveReleaseTrackerPagerPrepareUnlockIndices(0, 3), [0, 1]);
    assert.deepEqual(resolveReleaseTrackerPagerPrepareUnlockIndices(2, 3), [1, 2]);
  });

  it("C: unlock covers helper treats prepare as superset of drag need", () => {
    assert.equal(
      releaseTrackerPagerUnlockCovers([0, 1, 2], [1, 2]),
      true,
    );
    assert.equal(
      releaseTrackerPagerUnlockCovers([1], [1, 2]),
      false,
    );
    assert.equal(
      releaseTrackerPagerUnlockCovers(null, [0]),
      false,
    );
  });

  it("D: geometry cache invalidates on resize / view key", () => {
    assert.match(trackerSrc, /pagerPanelHeightCacheRef\.current = \{ key: "", heights: \{\} \}/);
    assert.match(trackerSrc, /pagerGeometryCacheKey/);
    assert.match(trackerSrc, /window\.addEventListener\("resize", onResize\)/);
  });

  it("E: gesture thresholds unchanged", () => {
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_DRAG_START_PX, 12);
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(RELEASE_TRACKER_TAB_SWIPE_EDGE_START_PX, 24);
    assert.equal(RELEASE_TRACKER_TAB_PAGER_COMMIT_PROGRESS, 0.48);
  });

  it("F: current ±1 mount strategy unchanged", () => {
    assert.match(trackerSrc, /mountContent = isActivePanel \|\| isAdjacentPanel/);
    assert.match(trackerSrc, /getReleaseTrackerPagerAdjacentViews/);
    assert.deepEqual(getReleaseTrackerPagerAdjacentViews(["upcoming", "collaborations", "past"], "upcoming"), [
      "collaborations",
    ]);
  });

  it("abort clears prepare unlock when gesture never arms", () => {
    assert.match(swipeSrc, /onAbortRef\.current\?\.\(\)/);
    assert.match(trackerSrc, /handlePagerGestureAbort/);
  });

  it("vert unlock still uses existing panel class token", () => {
    assert.equal(
      resolveReleaseTrackerPagerVertUnlockIndices({
        phase: "dragging",
        currentIndex: 0,
        adjacentIndex: 1,
      })?.join(","),
      "0,1",
    );
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS, /!h-auto/);
  });
});
