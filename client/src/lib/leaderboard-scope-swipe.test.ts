import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARD_SCOPES,
  LEADERBOARD_SCOPE_COMMIT_PROGRESS,
  LEADERBOARD_SCOPE_DRAG_START_PX,
  LEADERBOARD_SCOPE_EDGE_RUBBER,
  LEADERBOARD_SCOPE_EDGE_START_PX,
  LEADERBOARD_SCOPE_FLICK_MIN_DX_PX,
  LEADERBOARD_SCOPE_FLICK_PX_PER_MS,
  LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO,
  LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX,
  LEADERBOARD_SCOPE_PROJECTION_MS,
  LEADERBOARD_SCOPE_SNAP_EASING,
  LEADERBOARD_SCOPE_SNAP_MS,
  LEADERBOARD_SCOPE_SNAP_MS_MIN,
  LEADERBOARD_SCOPE_VELOCITY_WINDOW_MS,
  LEADERBOARD_PRIMARY_TAB_INACTIVE_ALPHA,
  LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
  LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS,
  LEADERBOARD_SCOPE_PAGER_ROW_ATTR,
  LEADERBOARD_SCOPE_PAGER_TRACK_CLASS,
  LEADERBOARD_SCOPE_PAGER_VIEWPORT_CLASS,
  LEADERBOARD_SCOPE_HERO_PANEL_CLASS,
  LEADERBOARD_SCOPE_HERO_TRACK_CLASS,
  LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS,
  applyLeaderboardPagerEdgeRubber,
  applyLeaderboardPagerPanelImperativeUnlock,
  armLeaderboardPagerClickSuppression,
  clearLeaderboardPagerClickSuppression,
  clearLeaderboardPagerPanelImperativeUnlock,
  consumeLeaderboardPagerClickSuppression,
  evaluateLeaderboardScopeSwipe,
  interpolateLeaderboardNavIndicator,
  isLeaderboardPagerClickSuppressionArmed,
  isLeaderboardScopeSwipeInteractiveTarget,
  leaderboardHeroTranslateFromPagerPx,
  leaderboardPagerDragProgress,
  leaderboardPagerRestTranslatePx,
  leaderboardPagerVertUnlockClassTokens,
  leaderboardPrimaryTabEmphasisColor,
  planLeaderboardScopeChange,
  resolveLeaderboardPrimaryTabEmphasis,
  resolveLeaderboardScopeFromDelta,
} from "@/lib/leaderboard-scope-swipe";
import {
  LEADERBOARD_PRIMARY_ACTIVE_CLASS,
  LEADERBOARD_PRIMARY_INACTIVE_CLASS,
  LEADERBOARD_PRIMARY_INDICATOR_CLASS,
  LEADERBOARD_PAGE_SCROLL_CLASS,
  LEADERBOARD_PRIZE_SECTION_CLASS,
  LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS,
  LEADERBOARD_REWARD_HERO_META_CLASS,
  LEADERBOARD_REWARD_HERO_META_WRAP_CLASS,
  LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
  LEADERBOARD_REWARD_HERO_IMAGE_CLASS,
  LEADERBOARD_SECONDARY_ACTIVE_CLASS,
  LEADERBOARD_SECONDARY_INACTIVE_CLASS,
  LEADERBOARD_STICKY_CHROME_CLASS,
  leaderboardArtistsQueryKey,
  leaderboardUsersQueryKey,
} from "@/lib/leaderboard-presentation";
import { APP_PAGE_SCROLL_CLASS } from "@/lib/app-shell-layout";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const swipeSrc = readFileSync(join(here, "./leaderboard-scope-swipe.ts"), "utf8");
const presentationSrc = readFileSync(join(here, "./leaderboard-presentation.ts"), "utf8");
const WIDTH = 390;

describe("resolveLeaderboardScopeFromDelta — no wrap", () => {
  it("Community + left → Artists", () => {
    assert.equal(resolveLeaderboardScopeFromDelta("users", -40), "artists");
  });

  it("Artists + right → Community", () => {
    assert.equal(resolveLeaderboardScopeFromDelta("artists", 40), "users");
  });

  it("Community + right → no-op boundary", () => {
    assert.equal(resolveLeaderboardScopeFromDelta("users", 40), null);
  });

  it("Artists + left → no-op boundary", () => {
    assert.equal(resolveLeaderboardScopeFromDelta("artists", -40), null);
  });
});

describe("A — swipe left from Community finger-follows toward Artists", () => {
  it("rest translate and drag progress move toward Artists", () => {
    assert.deepEqual([...LEADERBOARD_SCOPES], ["users", "artists"]);
    assert.equal(leaderboardPagerRestTranslatePx(0, WIDTH), 0);
    assert.equal(leaderboardPagerRestTranslatePx(1, WIDTH), -WIDTH);
    const progress = leaderboardPagerDragProgress({
      deltaX: -WIDTH * 0.4,
      rubberDx: -WIDTH * 0.4,
      viewportWidth: WIDTH,
      hasAdjacent: true,
    });
    assert.ok(progress > 0.3 && progress <= 1);
    assert.match(swipeSrc, /translate3d/);
    assert.match(leaderboardSrc, /leaderboard-pager-track/);
    assert.match(leaderboardSrc, /leaderboard-pager-panel-\$\{scope\}/);
    assert.match(leaderboardSrc, /LEADERBOARD_SCOPES\.map/);
  });
});

describe("evaluateLeaderboardScopeSwipe / B–H", () => {
  it("B: release beyond commit threshold commits Artists", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -(WIDTH * LEADERBOARD_SCOPE_COMMIT_PROGRESS),
      deltaY: 4,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.nextScope, "artists");
      assert.equal(d.reason, "distance");
    }
  });

  it("C: swipe right from Artists commits Community", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "artists",
      deltaX: WIDTH * LEADERBOARD_SCOPE_COMMIT_PROGRESS,
      deltaY: 2,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") assert.equal(d.nextScope, "users");
  });

  it("D: cancelled swipe (insufficient) returns cancel — track snaps to source", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -LEADERBOARD_SCOPE_DRAG_START_PX - 2,
      deltaY: 0,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "cancel");
    if (d.action === "cancel") assert.equal(d.reason, "insufficient");
    assert.match(swipeSrc, /finishSnap\(leaderboardPagerRestTranslatePx\(index/);
  });

  it("E: edge overdrag rubber-bands and does not change tab", () => {
    assert.equal(LEADERBOARD_SCOPE_EDGE_RUBBER, 0.28);
    const rubber = applyLeaderboardPagerEdgeRubber(100, 0);
    assert.equal(rubber, 100 * LEADERBOARD_SCOPE_EDGE_RUBBER);
    const endRubber = applyLeaderboardPagerEdgeRubber(-100, 1);
    assert.equal(endRubber, -100 * LEADERBOARD_SCOPE_EDGE_RUBBER);
    const mid = applyLeaderboardPagerEdgeRubber(-80, 0);
    assert.equal(mid, -80);
    const boundary = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: WIDTH * 0.5,
      deltaY: 0,
      velocityX: 1,
      viewportWidth: WIDTH,
    });
    assert.deepEqual(boundary, { action: "cancel", reason: "boundary", nextScope: null });
  });

  it("F: vertical-dominant gesture does not arm horizontal pager", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -20,
      deltaY: 80,
      velocityX: -1,
      viewportWidth: WIDTH,
    });
    assert.deepEqual(d, { action: "cancel", reason: "vertical", nextScope: null });
  });

  it("G: excessive vertical drift cancels horizontal intent", () => {
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
    const dx = -30;
    const dy = Math.abs(dx) * LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO + 1;
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "artists",
      deltaX: dx,
      deltaY: dy,
      velocityX: -2,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "cancel");
    if (d.action === "cancel") assert.equal(d.reason, "vertical");
  });

  it("H: successful flick commits using audited velocity rules", () => {
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
    assert.equal(LEADERBOARD_SCOPE_PROJECTION_MS, 150);
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX + 4),
      deltaY: 2,
      velocityX: -LEADERBOARD_SCOPE_FLICK_PX_PER_MS,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.reason, "velocity");
      assert.equal(d.nextScope, "artists");
    }
  });
});

describe("I/J — click suppression", () => {
  it("I: post-drag click is suppressed once", () => {
    clearLeaderboardPagerClickSuppression();
    armLeaderboardPagerClickSuppression();
    assert.equal(isLeaderboardPagerClickSuppressionArmed(), true);
    assert.equal(consumeLeaderboardPagerClickSuppression(), true);
    assert.equal(consumeLeaderboardPagerClickSuppression(), false);
  });

  it("J: normal row/avatar tap is not suppressed", () => {
    clearLeaderboardPagerClickSuppression();
    assert.equal(consumeLeaderboardPagerClickSuppression(), false);
    assert.match(leaderboardSrc, /consumeLeaderboardPagerClickSuppression/);
    assert.match(leaderboardSrc, /handleOpenProfile/);
  });
});

describe("LEADERBOARD-SWIPE-5 — row hit area carve-out", () => {
  it("marks result rows with pager-row attr", () => {
    assert.equal(LEADERBOARD_SCOPE_PAGER_ROW_ATTR, "data-leaderboard-pager-row");
    assert.match(leaderboardSrc, /LEADERBOARD_SCOPE_PAGER_ROW_ATTR/);
    assert.match(leaderboardSrc, /data-testid=\{`leaderboard-entry-\$\{entry\.user_id\}`\}/);
  });

  it("A/B: username/avatar buttons inside a marked row can seed swipe", () => {
    assert.match(
      swipeSrc,
      /row\.contains\(interactive\)|row && row\.contains/,
    );
    assert.match(swipeSrc, /LEADERBOARD_SCOPE_PAGER_ROW_ATTR/);
    // Carve-out: interactive inside row → not blocked
    assert.match(
      swipeSrc,
      /closest\(`\[\$\{LEADERBOARD_SCOPE_PAGER_ROW_ATTR\}\]`\)/,
    );
  });

  it("C: noninteractive rank/score areas remain seedable (no interactive closest)", () => {
    assert.equal(isLeaderboardScopeSwipeInteractiveTarget(null), false);
  });

  it("D/E/F: taps still go through handleOpenProfile + one-shot suppress after arm", () => {
    assert.match(leaderboardSrc, /onClick=\{handleOpenProfile\}/);
    assert.match(
      leaderboardSrc,
      /if \(consumeLeaderboardPagerClickSuppression\(\)\) return;/,
    );
    clearLeaderboardPagerClickSuppression();
    armLeaderboardPagerClickSuppression();
    assert.equal(consumeLeaderboardPagerClickSuppression(), true);
  });

  it("G/H: empty-state CTA and timeframe tabs stay excluded (outside row)", () => {
    assert.match(leaderboardSrc, /data-testid="view-all-time"/);
    assert.doesNotMatch(
      leaderboardSrc,
      /view-all-time[\s\S]{0,120}LEADERBOARD_SCOPE_PAGER_ROW_ATTR/,
    );
    assert.match(leaderboardSrc, /data-testid="time-filters"/);
    assert.doesNotMatch(
      leaderboardSrc,
      /time-filters[\s\S]{0,200}LEADERBOARD_SCOPE_PAGER_ROW_ATTR/,
    );
  });

  it("I: left 24px edge remains excluded", () => {
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.match(
      swipeSrc,
      /touch\.clientX <= LEADERBOARD_SCOPE_EDGE_START_PX/,
    );
  });
});

describe("LEADERBOARD-SWIPE-5 — snap re-grab", () => {
  it("A/B: partial cancel snaps; touchstart during snap is accepted (no early return)", () => {
    assert.match(swipeSrc, /phase = "snapping"/);
    assert.doesNotMatch(
      swipeSrc,
      /onTouchStart[\s\S]{0,120}if \(gestureRef\.current\.phase === "snapping"\) return/,
    );
    assert.match(swipeSrc, /Interrupt in-flight snap/);
  });

  it("C/D/E: cancels transition and rebases baseTranslate from live matrix", () => {
    assert.match(swipeSrc, /track\.style\.transition = "none"/);
    assert.match(swipeSrc, /baseTranslate = readCurrentTranslateX\(\)/);
    assert.match(swipeSrc, /readCurrentTranslateX/);
    assert.match(swipeSrc, /DOMMatrixReadOnly/);
  });

  it("F: stale snap callback cannot reset the new gesture; stranded snapping cleans up", () => {
    assert.match(swipeSrc, /snapGeneration/);
    assert.match(swipeSrc, /if \(gen !== snapGeneration\)/);
    assert.match(
      swipeSrc,
      /gen !== snapGeneration[\s\S]*?phase === "snapping" && !g\.active/,
    );
    assert.match(
      swipeSrc,
      /phase === "snapping" && !g\.active[\s\S]*?reset\(/,
    );
  });

  it("G/H/I/J: re-grab replaces pointer id; suppress cleared at touchstart; thresholds unchanged", () => {
    assert.match(swipeSrc, /pointerId: touch\.identifier/);
    assert.match(swipeSrc, /clearLeaderboardPagerClickSuppression\(\)/);
    assert.match(
      swipeSrc,
      /clearLeaderboardPagerClickSuppression\(\);\s*if \(isLeaderboardScopeSwipeInteractiveTarget/,
    );
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(LEADERBOARD_SCOPE_EDGE_RUBBER, 0.28);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
    assert.equal(LEADERBOARD_SCOPE_PROJECTION_MS, 150);
    assert.equal(LEADERBOARD_SCOPE_SNAP_MS_MIN, 220);
    assert.equal(LEADERBOARD_SCOPE_SNAP_MS, 400);
  });
});

describe("planLeaderboardScopeChange — shared tap/swipe path", () => {
  it("plans a real change", () => {
    assert.deepEqual(planLeaderboardScopeChange("users", "artists"), {
      changed: true,
      nextScope: "artists",
    });
  });

  it("bails when already active (no haptic path)", () => {
    assert.deepEqual(planLeaderboardScopeChange("artists", "artists"), {
      changed: false,
      nextScope: "artists",
    });
  });
});

describe("Leaderboard page wiring — haptic + shared owner", () => {
  it("imports useLayoutEffect when page uses layout effects", () => {
    assert.match(
      leaderboardSrc,
      /import \{[^}]*\buseLayoutEffect\b[^}]*\} from "react"/,
    );
    assert.match(leaderboardSrc, /useLayoutEffect\(/);
  });

  it("tap and swipe share setLeaderboardScope + one light haptic on change", () => {
    assert.match(leaderboardSrc, /setLeaderboardScope/);
    assert.match(leaderboardSrc, /planLeaderboardScopeChange/);
    assert.match(leaderboardSrc, /playInteractionLight/);
    assert.match(leaderboardSrc, /handleLeaderboardTabChange/);
    assert.match(leaderboardSrc, /onValueChange=\{handleLeaderboardTabChange\}/);
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
    assert.match(leaderboardSrc, /onCommitScope: setLeaderboardScope/);
    assert.match(
      leaderboardSrc,
      /planLeaderboardScopeChange[\s\S]*?if \(!plan\.changed\) return;[\s\S]*?playInteractionLight\(\)/,
    );
    assert.doesNotMatch(swipeSrc, /playInteractionLight|Haptics/);
  });

  it("preserves scroll-to-top on scope change", () => {
    assert.match(
      leaderboardSrc,
      /if \(!plan\.changed\) return;[\s\S]*?scrollTo\(\{ top: 0 \}\)/,
    );
    // Finalization after height teardown (imperative prepare clear + scrollTop).
    assert.match(
      leaderboardSrc,
      /clearLeaderboardPagerImperativePrepare\(\);[\s\S]*?\/\/ Finalization[\s\S]*?scrollTop = 0/,
    );
  });

  it("gesture lives on content region, not sticky chrome", () => {
    assert.match(leaderboardSrc, /data-testid="leaderboard-gesture-host"/);
    assert.match(leaderboardSrc, /data-testid="leaderboard-swipe-region"/);
    assert.match(leaderboardSrc, /ref=\{gestureHostRef\}/);
    assert.match(leaderboardSrc, /ref=\{pagerViewportRef\}/);
    const stickyIdx = leaderboardSrc.indexOf("LEADERBOARD_STICKY_CHROME_CLASS");
    const gestureIdx = leaderboardSrc.indexOf("leaderboard-gesture-host");
    assert.ok(gestureIdx > stickyIdx);
  });

  it("does not reset timeframe on scope switch; list queries stay warm for both scopes", () => {
    const scopeOwner = leaderboardSrc.match(
      /const setLeaderboardScope = useCallback\(\(nextScope: LeaderboardScope\) => \{([\s\S]*?)\}, \[\]\);/,
    );
    assert.ok(scopeOwner, "setLeaderboardScope owner present");
    assert.doesNotMatch(scopeOwner![1]!, /setTimeFilter/);
    assert.deepEqual(leaderboardUsersQueryKey("year"), ["/api/leaderboard/users", "year"]);
    assert.deepEqual(leaderboardArtistsQueryKey("year"), ["/api/leaderboard/artists", "year"]);
    // LEADERBOARD-SWIPE-11B — both lists enabled while page mounted.
    assert.match(
      leaderboardSrc,
      /leaderboardUsersQueryKey\(timeFilter\),[\s\S]*?enabled: true/,
    );
    assert.match(
      leaderboardSrc,
      /leaderboardArtistsQueryKey\(timeFilter\),[\s\S]*?enabled: true/,
    );
    assert.match(
      leaderboardSrc,
      /enabled: !!currentUserId && activeTab === "users"/,
    );
    assert.match(
      leaderboardSrc,
      /enabled: !!currentUserId && activeTab === "artists"/,
    );
    assert.doesNotMatch(leaderboardSrc, /enabled:.*pagerVertUnlock|mid-drag/);
  });

  it("uses finger-follow translate3d pager (not Embla)", () => {
    assert.match(swipeSrc, /translate3d/);
    assert.doesNotMatch(leaderboardSrc, /useEmblaCarousel|scroll-snap/);
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(LEADERBOARD_SCOPE_SNAP_MS_MIN, 220);
    assert.equal(LEADERBOARD_SCOPE_SNAP_MS, 400);
    assert.equal(LEADERBOARD_SCOPE_SNAP_EASING, "cubic-bezier(0.32, 0.45, 0.42, 1)");
  });

  it("excludes interactive targets and reserves left edge", () => {
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.match(swipeSrc, /role='tab'/);
    assert.match(swipeSrc, /LEADERBOARD_SCOPE_EDGE_START_PX/);
    assert.equal(typeof isLeaderboardScopeSwipeInteractiveTarget, "function");
  });

  it("does not touch Releases / ranking; prizes live in reward-hero config", () => {
    assert.doesNotMatch(leaderboardSrc, /release-tracker|ArtworkReleaseBrowser/);
    assert.match(leaderboardSrc, /getLeaderboardRewardHeroConfig/);
    assert.doesNotMatch(leaderboardSrc, /2 x VIP Music Festival Tickets|4 hours studio time/);
  });
});

describe("Presentation — fixed metrics + shared underline + emphasis", () => {
  it("A/B: both primary labels use font-semibold; no font-medium flip", () => {
    assert.match(LEADERBOARD_PRIMARY_ACTIVE_CLASS, /font-semibold/);
    assert.match(LEADERBOARD_PRIMARY_INACTIVE_CLASS, /font-semibold/);
    assert.doesNotMatch(LEADERBOARD_PRIMARY_ACTIVE_CLASS, /font-medium/);
    assert.doesNotMatch(LEADERBOARD_PRIMARY_INACTIVE_CLASS, /font-medium/);
    assert.doesNotMatch(
      presentationSrc,
      /LEADERBOARD_PRIMARY_INACTIVE_CLASS[\s\S]{0,80}font-medium/,
    );
  });

  it("C/D: shared indicator once; old per-label after: removed", () => {
    assert.match(LEADERBOARD_PRIMARY_INDICATOR_CLASS, /bg-\[#0a83ff\]/);
    assert.match(LEADERBOARD_PRIMARY_INDICATOR_CLASS, /h-\[3px\]/);
    assert.doesNotMatch(LEADERBOARD_PRIMARY_INDICATOR_CLASS, /after:/);
    assert.match(leaderboardSrc, /data-testid="leaderboard-primary-indicator"/);
    assert.equal(
      (leaderboardSrc.match(/leaderboard-primary-indicator/g) || []).length,
      1,
    );
    assert.doesNotMatch(
      leaderboardSrc,
      /LEADERBOARD_PRIMARY_LABEL_CLASS[\s\S]{0,80}LEADERBOARD_PRIMARY_INDICATOR_CLASS/,
    );
  });

  it("E/F: source emphasis decreases; destination increases with progress", () => {
    const mid = resolveLeaderboardPrimaryTabEmphasis({
      tabIndex: 0,
      currentIndex: 0,
      adjacentIndex: 1,
      progress: 0.4,
    });
    const dest = resolveLeaderboardPrimaryTabEmphasis({
      tabIndex: 1,
      currentIndex: 0,
      adjacentIndex: 1,
      progress: 0.4,
    });
    assert.equal(mid, 0.6);
    assert.equal(dest, 0.4);
  });

  it("G: underline left/width interpolates with same progress", () => {
    const lerped = interpolateLeaderboardNavIndicator(
      { left: 10, width: 80 },
      { left: 110, width: 60 },
      0.5,
    );
    assert.equal(lerped.left, 60);
    assert.equal(lerped.width, 70);
  });

  it("H: committed Radix value does not change mid-drag", () => {
    assert.match(leaderboardSrc, /Tabs value=\{activeTab\}/);
    assert.match(swipeSrc, /Calls onCommitScope only after a successful snap/);
    assert.match(leaderboardSrc, /onCommitScope: setLeaderboardScope/);
  });

  it("I: tap moves shared underline correctly", () => {
    assert.match(leaderboardSrc, /syncPrimaryNavIndicatorToScope/);
    assert.match(leaderboardSrc, /LEADERBOARD_PRIMARY_INDICATOR_TAP_MS/);
  });

  it("J: timeframe tabs remain unchanged", () => {
    assert.match(LEADERBOARD_SECONDARY_ACTIVE_CLASS, /after:absolute/);
    assert.match(LEADERBOARD_SECONDARY_ACTIVE_CLASS, /font-semibold/);
    assert.match(LEADERBOARD_SECONDARY_INACTIVE_CLASS, /font-medium/);
    assert.match(leaderboardSrc, /data-testid="time-filters"/);
    assert.match(leaderboardSrc, /onClick=\{\(\) => setTimeFilter\(filter\.value\)\}/);
    assert.doesNotMatch(leaderboardSrc, /timeFilter.*onPagerProgress|onCommitScope.*setTimeFilter/);
  });

  it("emphasis color uses inactive alpha → opaque", () => {
    assert.equal(LEADERBOARD_PRIMARY_TAB_INACTIVE_ALPHA, 0.72);
    assert.equal(leaderboardPrimaryTabEmphasisColor(0), "rgba(255, 255, 255, 0.72)");
    assert.equal(leaderboardPrimaryTabEmphasisColor(1), "rgba(255, 255, 255, 1)");
  });
});

describe("LEADERBOARD-SWIPE-7 — armed release + post-collapse scroll", () => {
  it("A: armed release ignores cumulative vertical ratio (does not reclassify vertical)", () => {
    const dx = -(WIDTH * LEADERBOARD_SCOPE_COMMIT_PROGRESS);
    const dy = Math.abs(dx) * 2; // would fail unarmed ratio check
    const unarmed = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: dx,
      deltaY: dy,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(unarmed.action, "cancel");
    if (unarmed.action === "cancel") assert.equal(unarmed.reason, "vertical");

    const armed = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: dx,
      deltaY: dy,
      velocityX: 0,
      viewportWidth: WIDTH,
      armed: true,
    });
    assert.equal(armed.action, "commit");
    if (armed.action === "commit") {
      assert.equal(armed.nextScope, "artists");
      assert.equal(armed.reason, "distance");
    }
    assert.match(swipeSrc, /armed: true/);
    assert.match(swipeSrc, /Pre-arm only: vertical-intent rejection/);
  });

  it("B/C: one deliberate swipe either direction commits when armed", () => {
    const toArtists = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -(WIDTH * LEADERBOARD_SCOPE_COMMIT_PROGRESS),
      deltaY: 120,
      velocityX: 0,
      viewportWidth: WIDTH,
      armed: true,
    });
    assert.equal(toArtists.action, "commit");
    if (toArtists.action === "commit") assert.equal(toArtists.nextScope, "artists");

    const toCommunity = evaluateLeaderboardScopeSwipe({
      currentScope: "artists",
      deltaX: WIDTH * LEADERBOARD_SCOPE_COMMIT_PROGRESS,
      deltaY: 90,
      velocityX: 0,
      viewportWidth: WIDTH,
      armed: true,
    });
    assert.equal(toCommunity.action, "commit");
    if (toCommunity.action === "commit") assert.equal(toCommunity.nextScope, "users");
  });

  it("D/E: pre-arm vertical-dominant still cancels; drift threshold unchanged", () => {
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    const vertical = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -8,
      deltaY: 40,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.deepEqual(vertical, { action: "cancel", reason: "vertical", nextScope: null });

    const ratio = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -20,
      deltaY: 20 * LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO + 1,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(ratio.action, "cancel");
    if (ratio.action === "cancel") assert.equal(ratio.reason, "vertical");

    assert.match(
      swipeSrc,
      /absY > LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX && absY > absX/,
    );
  });

  it("F/G: commit threshold and flick constants unchanged", () => {
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
    assert.equal(LEADERBOARD_SCOPE_PROJECTION_MS, 150);
    assert.equal(LEADERBOARD_SCOPE_VELOCITY_WINDOW_MS, 100);
  });

  it("H/I: touchend evaluates with armed:true; phase returns idle via reset on settle", () => {
    assert.match(
      swipeSrc,
      /evaluateLeaderboardScopeSwipe\(\{[\s\S]*?armed: true/,
    );
    assert.match(
      swipeSrc,
      /reset\("after-commit", \{ clearPrepare: false \}\);\s*onCommitRef\.current\(commitScope\)/,
    );
    assert.match(swipeSrc, /createIdleGesture/);
  });

  it("J: snapGeneration mismatch clears stranded snapping when idle", () => {
    assert.match(
      swipeSrc,
      /if \(gen !== snapGeneration\) \{[\s\S]*?if \(g\.phase === "snapping" && !g\.active\) \{[\s\S]*?reset\("stranded-snapping-after-gen-mismatch"\)/,
    );
    // Abort/cancel reset invokes onAbort → prepare cleanup (default clearPrepare).
    assert.match(swipeSrc, /if \(clearPrepare\) onAbortRef\.current\?\.\(\)/);
  });

  it("height/scroll A–C: setter scrollTo retained; layout finalizes scrollTop=0 for tap+swipe", () => {
    assert.match(
      leaderboardSrc,
      /pageScrollRef\.current\?\.scrollTo\(\{ top: 0 \}\)/,
    );
    assert.match(leaderboardSrc, /onCommitScope: setLeaderboardScope/);
    assert.match(leaderboardSrc, /handleLeaderboardTabChange/);
    assert.match(
      leaderboardSrc,
      /clearLeaderboardPagerImperativePrepare\(\);[\s\S]*?scrollTop = 0/,
    );
    assert.doesNotMatch(leaderboardSrc, /savedScroll|scrollByScope|scopeScrollMap/);
  });

  it("height/scroll D–F: minHeight clears on idle/abort/activeTab; no per-scope restore", () => {
    assert.match(leaderboardSrc, /handleGestureAbort/);
    assert.match(
      leaderboardSrc,
      /const handleGestureAbort = useCallback\(\(\) => \{[\s\S]*?clearLeaderboardPagerImperativePrepare/,
    );
    assert.match(
      leaderboardSrc,
      /if \(event\.phase === "idle"\) \{[\s\S]{0,160}clearLeaderboardPagerImperativePrepare/,
    );
    assert.match(
      leaderboardSrc,
      /\/\/ Finalization after inactive collapse \+ minHeight clear[\s\S]{0,120}scrollTop = 0/,
    );
  });

  it("height/scroll G/H: Leaderboard-only overflow-anchor:none; Home untouched", () => {
    assert.match(LEADERBOARD_PAGE_SCROLL_CLASS, /overflow-anchor:none/);
    assert.match(
      LEADERBOARD_PAGE_SCROLL_CLASS,
      new RegExp(APP_PAGE_SCROLL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(leaderboardSrc, /LEADERBOARD_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /\$\{APP_PAGE_SCROLL_CLASS\}/);
    assert.equal(
      LEADERBOARD_PAGE_SCROLL_CLASS,
      `${APP_PAGE_SCROLL_CLASS} [overflow-anchor:none]`,
    );
    // Global scroll class string itself is not rewritten — only composed here.
    assert.doesNotMatch(
      presentationSrc,
      /export const APP_PAGE_SCROLL_CLASS/,
    );
  });
});

describe("LEADERBOARD-SWIPE-9A — inactive panel zero-height contract", () => {
  it("track uses items-start so panel heights stay independent", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /\bflex\b/);
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /\bitems-start\b/);
    assert.doesNotMatch(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /items-stretch/);
  });

  it("idle inactive panel forces height/min/max 0 + overflow hidden (non-important)", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:min-h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:max-h-0/);
    assert.match(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:overflow-hidden/,
    );
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:!h-0/,
    );
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:!max-h-0/,
    );
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:!overflow-hidden/,
    );
  });

  it("active panel keeps natural height; unlock tokens reopen adjacent during drag", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=active\]:h-auto/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=active\]:max-h-none/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=active\]:min-h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /!h-auto/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /!max-h-none/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /!overflow-visible/);
    assert.match(swipeSrc, /applyLeaderboardPagerPanelImperativeUnlock/);
  });

  it("does not change gesture thresholds or arm logic", () => {
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
  });
});

describe("LEADERBOARD-SWIPE-10C — imperative prepare + 2-panel width", () => {
  it("A: touchstart prepare does not call React unlock state", () => {
    assert.doesNotMatch(leaderboardSrc, /setPagerVertUnlockIndices/);
    assert.doesNotMatch(leaderboardSrc, /useState<number\[\] \| null>/);
    assert.doesNotMatch(
      leaderboardSrc,
      /handleGesturePrepare[\s\S]{0,400}setPagerVertUnlock/,
    );
    assert.match(
      leaderboardSrc,
      /Intentionally no React unlock state/,
    );
  });

  it("B: temporary unlock is imperative classList helpers", () => {
    const tokens = leaderboardPagerVertUnlockClassTokens();
    assert.ok(tokens.includes("!h-auto"));
    assert.ok(tokens.includes("!max-h-none"));
    assert.equal(typeof applyLeaderboardPagerPanelImperativeUnlock, "function");
    assert.equal(typeof clearLeaderboardPagerPanelImperativeUnlock, "function");
    assert.match(leaderboardSrc, /applyLeaderboardPagerPanelImperativeUnlock/);
    assert.match(leaderboardSrc, /clearLeaderboardPagerPanelImperativeUnlock/);
    assert.match(swipeSrc, /classList\.add\(token\)/);
    assert.match(swipeSrc, /classList\.remove\(token\)/);
  });

  it("C: listener effect dependencies remain stable (no prepare state)", () => {
    assert.match(
      swipeSrc,
      /\}, \[enabled, gestureHostRef, heroTrackRef, scopeRef, trackRef, viewportRef\]\);/,
    );
    assert.doesNotMatch(
      swipeSrc,
      /\}, \[enabled, gestureHostRef, heroTrackRef, scopeRef, trackRef, viewportRef, .+\]\);/,
    );
  });

  it("D/E: idle panel shells retain half-track width; track is 200%", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /w-\[200%\]/);
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /items-start/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /\bw-1\/2\b/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /basis-1\/2/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /min-w-\[50%\]/);
  });

  it("F: inactive panel remains height 0 vertically (9A preserved, 12C non-important)", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:max-h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:overflow-hidden/);
    assert.doesNotMatch(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:!h-0/);
  });

  it("G: prepare runs before gesture seed; first gesture can arm without prior swipe", () => {
    assert.match(
      swipeSrc,
      /onPrepareRef\.current\?\.\(\);[\s\S]*?gestureRef\.current = \{/,
    );
    assert.match(leaderboardSrc, /onGesturePrepare: handleGesturePrepare/);
  });

  it("H–K: unarmed/cancel/touchcancel clear via reset → onAbort; commit skips prepare clear", () => {
    assert.match(leaderboardSrc, /clearLeaderboardPagerImperativePrepare/);
    assert.match(
      leaderboardSrc,
      /const handleGestureAbort = useCallback\(\(\) => \{[\s\S]*?clearLeaderboardPagerImperativePrepare\(\)/,
    );
    assert.match(swipeSrc, /reset\("touchend-early"\)/);
    assert.match(swipeSrc, /reset\("touchcancel"\)/);
    assert.match(swipeSrc, /reset\("after-commit", \{ clearPrepare: false \}\)/);
    assert.match(swipeSrc, /reset\("after-cancel-snap"\)/);
    assert.match(
      swipeSrc,
      /const reset = \(note\?: string, opts\?: \{ clearPrepare\?: boolean \}\) => \{[\s\S]*?if \(clearPrepare\) onAbortRef\.current\?\.\(\)/,
    );
  });

  it("L: generation mismatch cannot leak prepare (reset invokes onAbort)", () => {
    assert.match(
      swipeSrc,
      /reset\("stranded-snapping-after-gen-mismatch"\)/,
    );
    assert.match(
      leaderboardSrc,
      /viewport\.style\.minHeight = ""/,
    );
  });

  it("gesture thresholds unchanged", () => {
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
  });
});

describe("LEADERBOARD-SWIPE-11B — dual list query warmth", () => {
  it("A/B: Community and Artists list queries enabled on Leaderboard mount", () => {
    assert.match(
      leaderboardSrc,
      /leaderboardUsersQueryKey\(timeFilter\),[\s\S]{0,120}enabled: true/,
    );
    assert.match(
      leaderboardSrc,
      /leaderboardArtistsQueryKey\(timeFilter\),[\s\S]{0,120}enabled: true/,
    );
  });

  it("C: both list queries key off current timeFilter", () => {
    assert.deepEqual(leaderboardUsersQueryKey("month"), ["/api/leaderboard/users", "month"]);
    assert.deepEqual(leaderboardArtistsQueryKey("all"), ["/api/leaderboard/artists", "all"]);
    assert.match(leaderboardSrc, /leaderboardUsersQueryKey\(timeFilter\)/);
    assert.match(leaderboardSrc, /leaderboardArtistsQueryKey\(timeFilter\)/);
  });

  it("D/E: my-rank queries remain committed-scope gated", () => {
    assert.match(
      leaderboardSrc,
      /leaderboardUsersMyRankQueryKey[\s\S]{0,200}enabled: !!currentUserId && activeTab === "users"/,
    );
    assert.match(
      leaderboardSrc,
      /leaderboardArtistsMyRankQueryKey[\s\S]{0,200}enabled: !!currentUserId && activeTab === "artists"/,
    );
  });

  it("F: both panel LeaderboardLists remain mounted", () => {
    assert.match(leaderboardSrc, /LEADERBOARD_SCOPES\.map/);
    assert.match(leaderboardSrc, /leaderboard-pager-panel-\$\{scope\}/);
    assert.match(
      leaderboardSrc,
      /scope === "users" \? paintedUserEntries : paintedArtistEntries/,
    );
  });

  it("G/H: inactive collapse + gesture constants unchanged", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:max-h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /w-\[200%\]/);
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
  });
});

describe("LEADERBOARD-SWIPE-12C — collapse/unlock specificity", () => {
  it("A: inactive collapse rules no longer use !important on height/overflow", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0(?!\S)/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:min-h-0(?!\S)/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:max-h-0(?!\S)/);
    assert.match(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:overflow-hidden(?!\S)/,
    );
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:!h-0/,
    );
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:!min-h-0/,
    );
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:!max-h-0/,
    );
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
      /data-\[state=inactive\]:!overflow-hidden/,
    );
  });

  it("B: temporary unlock still uses !important", () => {
    assert.equal(
      LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS,
      "!h-auto !max-h-none !min-h-0 !overflow-visible",
    );
    const tokens = leaderboardPagerVertUnlockClassTokens();
    assert.ok(tokens.every((t) => t.startsWith("!")));
  });

  it("C/D: unlock controls height + both-axis overflow during inactive drag", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /!h-auto/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /!max-h-none/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /!overflow-visible/);
    assert.doesNotMatch(
      LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS,
      /!overflow-y-visible/,
    );
  });

  it("E: cleanup removes unlock so inactive collapse resumes", () => {
    assert.equal(typeof clearLeaderboardPagerPanelImperativeUnlock, "function");
    assert.match(leaderboardSrc, /clearLeaderboardPagerImperativePrepare/);
    assert.match(
      leaderboardSrc,
      /clearLeaderboardPagerPanelImperativeUnlock\(pagerPanelRefs\.current/,
    );
  });

  it("F: horizontal 2-panel geometry unchanged", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /w-\[200%\]/);
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /items-start/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /\bw-1\/2\b/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /basis-1\/2/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /min-w-\[50%\]/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /max-w-\[50%\]/);
  });

  it("G: gesture constants unchanged", () => {
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
  });

  it("H: query enablement unchanged", () => {
    assert.match(
      leaderboardSrc,
      /leaderboardUsersQueryKey\(timeFilter\),[\s\S]{0,120}enabled: true/,
    );
    assert.match(
      leaderboardSrc,
      /leaderboardArtistsQueryKey\(timeFilter\),[\s\S]{0,120}enabled: true/,
    );
  });

  it("matches Releases specificity model (idle non-important; unlock important)", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.doesNotMatch(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:!h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /^!/);
  });
});

describe("LEADERBOARD-SWIPE-13B — stable list components + commit handoff", () => {
  const leaderboardFnStart = leaderboardSrc.indexOf("export default function Leaderboard");
  const moduleBeforeLeaderboard = leaderboardSrc.slice(0, leaderboardFnStart);
  const leaderboardBody = leaderboardSrc.slice(leaderboardFnStart);

  it("A/B/C: EntryRow / List / RewardsBanner are module-level exports", () => {
    assert.ok(leaderboardFnStart > 0);
    assert.match(moduleBeforeLeaderboard, /export function LeaderboardEntryRow\b/);
    assert.match(moduleBeforeLeaderboard, /export function LeaderboardList\b/);
    assert.match(moduleBeforeLeaderboard, /export function RewardsBanner\b/);
  });

  it("D: activeTab change does not redefine list component types inside Leaderboard()", () => {
    assert.doesNotMatch(leaderboardBody, /const LeaderboardEntryRow\s*=/);
    assert.doesNotMatch(leaderboardBody, /const LeaderboardList\s*=/);
    assert.doesNotMatch(leaderboardBody, /const RewardsBanner\s*=/);
    assert.doesNotMatch(leaderboardBody, /function LeaderboardEntryRow\b/);
    assert.doesNotMatch(leaderboardBody, /function LeaderboardList\b/);
    assert.doesNotMatch(leaderboardBody, /function RewardsBanner\b/);
  });

  it("E: stable row keys remain entry.user_id", () => {
    assert.match(moduleBeforeLeaderboard, /key=\{entry\.user_id\}/);
  });

  it("handoff A: successful commit does NOT clear prepare before onCommitScope", () => {
    assert.match(
      swipeSrc,
      /reset\("after-commit", \{ clearPrepare: false \}\);\s*onCommitRef\.current\(commitScope\)/,
    );
    assert.doesNotMatch(
      swipeSrc,
      /reset\("after-commit"\);\s*onCommitRef\.current\(commitScope\)/,
    );
  });

  it("handoff B/C: activeTab layout finalization clears temporary geometry after commit", () => {
    assert.match(
      leaderboardSrc,
      /settle cleanup AFTER React commits destination[\s\S]*?clearLeaderboardPagerImperativePrepare\(\);[\s\S]*?scrollTop = 0/,
    );
    assert.match(leaderboardSrc, /destDataState: destState/);
  });

  it("handoff D/E/F/G: cancel / touchcancel / abort / gen-mismatch still clear immediately", () => {
    assert.match(swipeSrc, /reset\("after-cancel-snap"\)/);
    assert.match(swipeSrc, /reset\("touchcancel"\)/);
    assert.match(swipeSrc, /reset\("touchend-early"\)/);
    assert.match(swipeSrc, /reset\("stranded-snapping-after-gen-mismatch"\)/);
    assert.match(
      leaderboardSrc,
      /const handleGestureAbort = useCallback\(\(\) => \{[\s\S]*?clearLeaderboardPagerImperativePrepare\(\)/,
    );
    assert.match(swipeSrc, /if \(clearPrepare\) onAbortRef\.current\?\.\(\)/);
  });

  it("H: gesture thresholds unchanged", () => {
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
  });

  it("height/geometry contracts unchanged", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:max-h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_VERT_UNLOCK_CLASS, /!overflow-visible/);
    assert.match(LEADERBOARD_SCOPE_PAGER_TRACK_CLASS, /w-\[200%\]/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /basis-1\/2/);
  });
});

describe("LEADERBOARD-HERO-16 — swipe surface host split", () => {
  it("wires gestureHostRef for listeners and pagerViewportRef for width", () => {
    assert.match(leaderboardSrc, /const gestureHostRef = useRef/);
    assert.match(leaderboardSrc, /gestureHostRef,/);
    assert.match(leaderboardSrc, /viewportRef: pagerViewportRef/);
    assert.match(leaderboardSrc, /data-testid="leaderboard-gesture-host"/);
    assert.match(swipeSrc, /gestureHost\.addEventListener\("touchstart"/);
    assert.match(
      swipeSrc,
      /const widthOf = \(\) =>\s*Math\.max\(1, viewport\.getBoundingClientRect\(\)\.width/,
    );
  });

  it("keeps thresholds and interactive exclusion unchanged", () => {
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.match(swipeSrc, /isLeaderboardScopeSwipeInteractiveTarget\(event\.target\)/);
    assert.match(swipeSrc, /\[role='tab'\]/);
  });
});

describe("LEADERBOARD-HERO-18 — synchronized hero track", () => {
  it("A/B: heroTrack mirrors two-panel geometry; banners in scope slots", () => {
    assert.equal(LEADERBOARD_SCOPE_HERO_TRACK_CLASS, LEADERBOARD_SCOPE_PAGER_TRACK_CLASS);
    assert.match(LEADERBOARD_SCOPE_HERO_TRACK_CLASS, /w-\[200%\]/);
    assert.match(LEADERBOARD_SCOPE_HERO_PANEL_CLASS, /basis-1\/2/);
    assert.match(LEADERBOARD_SCOPE_HERO_PANEL_CLASS, /w-1\/2/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-x-hidden/);
    assert.doesNotMatch(LEADERBOARD_SCOPE_HERO_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(leaderboardSrc, /data-testid="leaderboard-hero-track"/);
    assert.match(leaderboardSrc, /leaderboard-hero-panel-\$\{scope\}/);
    assert.match(leaderboardSrc, /<RewardsBanner tab=\{scope\} \/>/);
    assert.doesNotMatch(leaderboardSrc, /<RewardsBanner tab=\{activeTab\} \/>/);
  });

  it("C/D: setSyncedTracksTransform dual-writes; single swipe hook", () => {
    assert.match(swipeSrc, /function setSyncedTracksTransform/);
    assert.match(swipeSrc, /leaderboardHeroTranslateFromPagerPx/);
    assert.match(
      swipeSrc,
      /setTrackTransform\(listTrack, pagerTranslateX, opts\);[\s\S]*?leaderboardHeroTranslateFromPagerPx\(pagerTranslateX, pagerWidth, heroWidth\)/,
    );
    assert.match(swipeSrc, /applyTransform\(/);
    assert.match(leaderboardSrc, /heroTrackRef/);
    assert.match(leaderboardSrc, /heroTrackRef,/);
    const hooks = leaderboardSrc.match(/useLeaderboardScopeSwipe\(/g) ?? [];
    assert.equal(hooks.length, 1);
    assert.equal((swipeSrc.match(/export function useLeaderboardScopeSwipe/g) ?? []).length, 1);
  });

  it("E/F: width from pagerViewport; sticky outside transform", () => {
    assert.match(leaderboardSrc, /viewportRef: pagerViewportRef/);
    assert.match(
      swipeSrc,
      /Always pager viewport width[\s\S]*?viewport\.getBoundingClientRect\(\)\.width/,
    );
    const stickyIdx = leaderboardSrc.indexOf("LEADERBOARD_STICKY_CHROME_CLASS");
    const heroTrackIdx = leaderboardSrc.indexOf("leaderboard-hero-track");
    assert.ok(stickyIdx > -1 && stickyIdx < heroTrackIdx);
  });

  it("G–I: stage contract shorter; list collapse + thresholds unchanged", () => {
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(LEADERBOARD_SCOPE_PAGER_PANEL_CLASS, /data-\[state=inactive\]:max-h-0/);
    assert.match(leaderboardSrc, /viewport\.style\.minHeight/);
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_DRAG_START_PX, 12);
    assert.equal(LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(LEADERBOARD_SCOPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.equal(LEADERBOARD_SCOPE_FLICK_MIN_DX_PX, 28);
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
  });
});

describe("LEADERBOARD-HERO-19 — full-bleed hero viewport", () => {
  it("A/B: heroViewport breaks px-4 gutter; pager stays content width", () => {
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /-mx-4/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /w-\[calc\(100%\+2rem\)\]/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-x-hidden/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-y-hidden/);
    assert.match(
      LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS,
      /-mt-\[calc\(env\(safe-area-inset-top,0px\)\+0\.25rem\+6rem\)\]/,
    );
    assert.doesNotMatch(LEADERBOARD_SCOPE_PAGER_VIEWPORT_CLASS, /-mx-4/);
    assert.match(LEADERBOARD_SCOPE_PAGER_VIEWPORT_CLASS, /\bw-full\b/);
  });

  it("C/D: heroTrack two-panel; progress scaled so hero/list stay synced", () => {
    assert.match(LEADERBOARD_SCOPE_HERO_TRACK_CLASS, /w-\[200%\]/);
    assert.match(LEADERBOARD_SCOPE_HERO_PANEL_CLASS, /basis-1\/2/);
    assert.equal(leaderboardHeroTranslateFromPagerPx(-100, 100, 100), -100);
    assert.equal(leaderboardHeroTranslateFromPagerPx(-100, 100, 120), -120);
    assert.equal(leaderboardHeroTranslateFromPagerPx(-50, 100, 120), -60);
    assert.match(swipeSrc, /leaderboardHeroTranslateFromPagerPx\(pagerTranslateX, pagerWidth, heroWidth\)/);
    assert.match(
      swipeSrc,
      /Always pager viewport width[\s\S]*?viewport\.getBoundingClientRect\(\)\.width/,
    );
  });

  it("E/F: swipe constants unchanged; metadata remains padded", () => {
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.match(LEADERBOARD_REWARD_HERO_META_CLASS, /max-w-\[22rem\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_CLASS, /mx-auto/);
    assert.match(LEADERBOARD_REWARD_HERO_META_CLASS, /px-5/);
  });
});

describe("LEADERBOARD-HERO-20 — pull-under sticky chrome", () => {
  it("heroViewport uses proven sticky pull; prize shell does not double-pull", () => {
    assert.match(
      LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS,
      /-mt-\[calc\(env\(safe-area-inset-top,0px\)\+0\.25rem\+6rem\)\]/,
    );
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /-mx-4/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /w-\[calc\(100%\+2rem\)\]/);
    assert.doesNotMatch(LEADERBOARD_PRIZE_SECTION_CLASS, /-mt-/);
    assert.match(LEADERBOARD_STICKY_CHROME_CLASS, /sticky top-0 z-30/);
  });

  it("stage stays ~34dvh without sticky/safe compensation", () => {
    assert.match(
      LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
      /min-h-\[clamp\(12rem,34dvh,20rem\)\]/,
    );
    assert.doesNotMatch(
      LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
      /\+env\(safe-area-inset-top|\+0\.25rem\+6rem/,
    );
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_META_WRAP_CLASS, /-mt-\[clamp\(4\.5rem,16vw,7\.25rem\)\]/);
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.match(swipeSrc, /leaderboardHeroTranslateFromPagerPx/);
  });
});

describe("LEADERBOARD-HERO-21B — no nested hero vertical scroll", () => {
  it("A–C: heroViewport sets overflow-x and overflow-y hidden; no vertical auto", () => {
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-x-hidden/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-y-hidden/);
    assert.doesNotMatch(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-y-auto/);
    assert.doesNotMatch(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-y-scroll/);
    assert.doesNotMatch(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /\boverflow-auto\b/);
  });

  it("D–G: track sync, thresholds, and top pull-under unchanged", () => {
    assert.match(LEADERBOARD_SCOPE_HERO_TRACK_CLASS, /w-\[200%\]/);
    assert.match(LEADERBOARD_SCOPE_HERO_PANEL_CLASS, /basis-1\/2/);
    assert.match(swipeSrc, /leaderboardHeroTranslateFromPagerPx/);
    assert.match(swipeSrc, /function setSyncedTracksTransform/);
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.match(
      LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS,
      /-mt-\[calc\(env\(safe-area-inset-top,0px\)\+0\.25rem\+6rem\)\]/,
    );
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /-mx-4/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /w-\[calc\(100%\+2rem\)\]/);
  });
});

describe("LEADERBOARD-HERO-22 — true top-third stage without compensation", () => {
  it("A/B: stage is ~34dvh only; no sticky/safe height add-on", () => {
    assert.match(
      LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
      /min-h-\[clamp\(12rem,34dvh,20rem\)\]/,
    );
    assert.doesNotMatch(LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS, /min-h-\[calc\(/);
    assert.doesNotMatch(
      LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
      /\+env\(safe-area-inset-top|\+0\.25rem\+6rem/,
    );
  });

  it("C–G: pull-under, overflow, full-bleed, sync, thresholds retained", () => {
    assert.match(
      LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS,
      /-mt-\[calc\(env\(safe-area-inset-top,0px\)\+0\.25rem\+6rem\)\]/,
    );
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-x-hidden/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /overflow-y-hidden/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /-mx-4/);
    assert.match(LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS, /w-\[calc\(100%\+2rem\)\]/);
    assert.match(swipeSrc, /leaderboardHeroTranslateFromPagerPx/);
    assert.match(swipeSrc, /function setSyncedTracksTransform/);
    assert.equal(LEADERBOARD_SCOPE_COMMIT_PROGRESS, 0.48);
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.equal(LEADERBOARD_SCOPE_FLICK_PX_PER_MS, 0.4);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-cover/);
    assert.match(LEADERBOARD_REWARD_HERO_IMAGE_CLASS, /object-\[center_22%\]/);
    assert.match(LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS, /top-\[58%\]/);
  });
});
