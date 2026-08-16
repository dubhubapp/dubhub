import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARD_SCOPE_COMMIT_PROGRESS,
  LEADERBOARD_SCOPE_DRAG_START_PX,
  LEADERBOARD_SCOPE_EDGE_START_PX,
  LEADERBOARD_SCOPE_FAST_SWIPE_PX_PER_MS,
  LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO,
  evaluateLeaderboardScopeSwipe,
  isLeaderboardScopeSwipeInteractiveTarget,
  planLeaderboardScopeChange,
  resolveLeaderboardScopeFromDelta,
} from "@/lib/leaderboard-scope-swipe";
import {
  leaderboardArtistsQueryKey,
  leaderboardUsersQueryKey,
} from "@/lib/leaderboard-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const swipeSrc = readFileSync(join(here, "./leaderboard-scope-swipe.ts"), "utf8");
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

describe("evaluateLeaderboardScopeSwipe", () => {
  it("Community + qualifying left distance → Artists", () => {
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

  it("Artists + qualifying right distance → Community", () => {
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

  it("Community + right swipe → boundary no-op", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: WIDTH * 0.5,
      deltaY: 0,
      velocityX: 1,
      viewportWidth: WIDTH,
    });
    assert.deepEqual(d, { action: "noop", reason: "boundary", nextScope: null });
  });

  it("Artists + left swipe → boundary no-op", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "artists",
      deltaX: -WIDTH * 0.5,
      deltaY: 0,
      velocityX: -1,
      viewportWidth: WIDTH,
    });
    assert.deepEqual(d, { action: "noop", reason: "boundary", nextScope: null });
  });

  it("insufficient distance → no-op", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -LEADERBOARD_SCOPE_DRAG_START_PX - 2,
      deltaY: 0,
      velocityX: 0,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "noop");
    if (d.action === "noop") assert.equal(d.reason, "insufficient");
  });

  it("horizontal velocity can commit when intended", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -(LEADERBOARD_SCOPE_DRAG_START_PX + 8),
      deltaY: 2,
      velocityX: -LEADERBOARD_SCOPE_FAST_SWIPE_PX_PER_MS,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.reason, "velocity");
      assert.equal(d.nextScope, "artists");
    }
  });

  it("vertical-dominant gesture → no-op", () => {
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "users",
      deltaX: -20,
      deltaY: 80,
      velocityX: -1,
      viewportWidth: WIDTH,
    });
    assert.deepEqual(d, { action: "noop", reason: "vertical", nextScope: null });
  });

  it("diagonal vertical gesture → no-op", () => {
    // More vertical than horizontal * intent ratio
    const dx = -30;
    const dy = Math.abs(dx) * LEADERBOARD_SCOPE_HORIZONTAL_INTENT_RATIO + 1;
    const d = evaluateLeaderboardScopeSwipe({
      currentScope: "artists",
      deltaX: dx,
      deltaY: dy,
      velocityX: -2,
      viewportWidth: WIDTH,
    });
    assert.equal(d.action, "noop");
    if (d.action === "noop") assert.equal(d.reason, "vertical");
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
  it("tap and swipe share setLeaderboardScope + one light haptic on change", () => {
    assert.match(leaderboardSrc, /setLeaderboardScope/);
    assert.match(leaderboardSrc, /planLeaderboardScopeChange/);
    assert.match(leaderboardSrc, /playInteractionLight/);
    assert.match(leaderboardSrc, /handleLeaderboardTabChange/);
    assert.match(leaderboardSrc, /onValueChange=\{handleLeaderboardTabChange\}/);
    assert.match(leaderboardSrc, /useLeaderboardScopeSwipe/);
    assert.match(leaderboardSrc, /onCommitScope: setLeaderboardScope/);
    // Haptic only after plan.changed — not on drag ticks
    assert.match(
      leaderboardSrc,
      /planLeaderboardScopeChange[\s\S]*?if \(!plan\.changed\) return;[\s\S]*?playInteractionLight\(\)/,
    );
  });

  it("preserves scroll-to-top on scope change", () => {
    assert.match(
      leaderboardSrc,
      /if \(!plan\.changed\) return;[\s\S]*?scrollTo\(\{ top: 0 \}\)/,
    );
  });

  it("gesture lives on content region, not sticky chrome", () => {
    assert.match(leaderboardSrc, /data-testid="leaderboard-swipe-region"/);
    assert.match(leaderboardSrc, /ref=\{swipeContentRef\}/);
    const stickyIdx = leaderboardSrc.indexOf("LEADERBOARD_STICKY_CHROME_CLASS");
    const swipeIdx = leaderboardSrc.indexOf("leaderboard-swipe-region");
    assert.ok(swipeIdx > stickyIdx);
  });

  it("does not reset timeframe on scope switch; query keys unchanged", () => {
    assert.doesNotMatch(
      leaderboardSrc,
      /setLeaderboardScope[\s\S]{0,200}setTimeFilter/,
    );
    assert.deepEqual(leaderboardUsersQueryKey("year"), ["/api/leaderboard/users", "year"]);
    assert.deepEqual(leaderboardArtistsQueryKey("year"), ["/api/leaderboard/artists", "year"]);
  });

  it("does not add finger-follow transforms or dual-list carousel", () => {
    assert.doesNotMatch(swipeSrc, /translate3d|scroll-snap|embla|framer-motion/i);
    assert.doesNotMatch(leaderboardSrc, /useEmblaCarousel|scroll-snap/);
  });

  it("excludes interactive targets and reserves left edge", () => {
    assert.equal(LEADERBOARD_SCOPE_EDGE_START_PX, 24);
    assert.match(swipeSrc, /role='tab'/);
    assert.match(swipeSrc, /LEADERBOARD_SCOPE_EDGE_START_PX/);
    // jsdom-less smoke: Element.closest not available — selector contract is source-checked
    assert.equal(typeof isLeaderboardScopeSwipeInteractiveTarget, "function");
  });

  it("does not touch Releases / ranking / prize redesign", () => {
    assert.doesNotMatch(leaderboardSrc, /release-tracker|ArtworkReleaseBrowser/);
    assert.match(leaderboardSrc, /2 x VIP Music Festival Tickets/);
    assert.match(leaderboardSrc, /4 hours studio time/);
  });
});
