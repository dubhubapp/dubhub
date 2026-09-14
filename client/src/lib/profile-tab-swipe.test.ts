/**
 * PROFILE-TABS-3A — Profile finger-follow pager helpers + wiring contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_SWIPE_TAB_IDS,
  PROFILE_TAB_PAGER_CARD_ATTR,
  PROFILE_TAB_PAGER_COMMIT_PROGRESS,
  PROFILE_TAB_PAGER_DRAGGING_ATTR,
  PROFILE_TAB_PAGER_EDGE_RUBBER,
  PROFILE_TAB_PAGER_FLICK_MIN_DX_PX,
  PROFILE_TAB_PAGER_FLICK_PX_PER_MS,
  PROFILE_TAB_PAGER_PANEL_CLASS,
  PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS,
  PROFILE_TAB_PAGER_PROJECTION_MS,
  PROFILE_TAB_PAGER_SNAP_EASING,
  PROFILE_TAB_PAGER_SNAP_MS,
  PROFILE_TAB_PAGER_SNAP_MS_MIN,
  PROFILE_TAB_PAGER_SNAP_MS_SPAN,
  PROFILE_TAB_PAGER_TRACK_CLASS,
  PROFILE_TAB_PAGER_VELOCITY_WINDOW_MS,
  PROFILE_TAB_PAGER_VIEWPORT_CLASS,
  PROFILE_TAB_SWIPE_COMMIT_PROGRESS,
  PROFILE_TAB_SWIPE_DRAG_START_PX,
  PROFILE_TAB_SWIPE_EDGE_START_PX,
  PROFILE_TAB_SWIPE_FAST_SWIPE_PX_PER_MS,
  PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO,
  PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX,
  applyProfilePagerEdgeRubber,
  armProfilePagerCardClickSuppression,
  clearProfilePagerCardClickSuppression,
  clampScrollTopToContentMax,
  computeProfilePagerReleaseVelocity,
  consumeProfilePagerCardClickSuppression,
  evaluateProfilePagerRelease,
  evaluateProfileTabSwipe,
  isProfilePagerCardClickSuppressionArmed,
  isProfileTabSwipeInteractiveTarget,
  profilePagerDragProgress,
  profilePagerRestTranslatePx,
  profilePagerSnapDurationMs,
  profilePagerUnlockCovers,
  profilePagerViewportXPx,
  profilePagerVertUnlockClassTokens,
  profilePrimaryTabEmphasisColor,
  profileTabIndex,
  resolveProfilePagerHostHeightPx,
  resolveProfilePagerPrepareUnlockIndices,
  resolveProfilePagerVertUnlockIndices,
  resolveProfilePrimaryTabEmphasis,
  resolveProfileTabFromDelta,
  PROFILE_PRIMARY_TAB_INACTIVE_ALPHA,
} from "./profile-tab-swipe";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const swipeSrc = readFileSync(join(here, "./profile-tab-swipe.ts"), "utf8");
const indexCssSrc = readFileSync(join(here, "../index.css"), "utf8");
const WIDTH = 390;

describe("resolveProfileTabFromDelta — ordered no wrap", () => {
  it("swipe left advances one tab (reveals next)", () => {
    assert.equal(resolveProfileTabFromDelta("profile", -40), "posts");
    assert.equal(resolveProfileTabFromDelta("posts", -40), "liked");
    assert.equal(resolveProfileTabFromDelta("liked", -40), "notifications");
  });

  it("swipe right moves back one tab (reveals previous)", () => {
    assert.equal(resolveProfileTabFromDelta("notifications", 40), "liked");
    assert.equal(resolveProfileTabFromDelta("liked", 40), "posts");
    assert.equal(resolveProfileTabFromDelta("posts", 40), "profile");
  });

  it("does not wrap at Overview or Notifications", () => {
    assert.equal(resolveProfileTabFromDelta("profile", 40), null);
    assert.equal(resolveProfileTabFromDelta("notifications", -40), null);
  });

  it("uses canonical Profile tab order", () => {
    assert.deepEqual([...PROFILE_SWIPE_TAB_IDS], ["profile", "posts", "liked", "notifications"]);
  });
});

describe("profilePagerRestTranslatePx + edge rubber", () => {
  it("resting translate is -index * viewportWidth", () => {
    assert.equal(profilePagerRestTranslatePx(0, WIDTH), 0);
    assert.equal(profilePagerRestTranslatePx(1, WIDTH), -WIDTH);
    assert.equal(profilePagerRestTranslatePx(2, WIDTH), -WIDTH * 2);
    assert.equal(profilePagerRestTranslatePx(3, WIDTH), -WIDTH * 3);
  });

  it("applies rubber at Overview right and Notifications left only", () => {
    assert.equal(applyProfilePagerEdgeRubber(100, 0), 100 * PROFILE_TAB_PAGER_EDGE_RUBBER);
    assert.equal(applyProfilePagerEdgeRubber(-100, 3), -100 * PROFILE_TAB_PAGER_EDGE_RUBBER);
    assert.equal(applyProfilePagerEdgeRubber(-100, 0), -100);
    assert.equal(applyProfilePagerEdgeRubber(100, 3), 100);
    assert.equal(applyProfilePagerEdgeRubber(-80, 1), -80);
  });

  it("edge resistance factor is mild and deterministic", () => {
    assert.equal(PROFILE_TAB_PAGER_EDGE_RUBBER, 0.28);
  });
});

describe("evaluateProfilePagerRelease — PROFILE-TABS-GESTURE-4A", () => {
  const W = 440;

  it("45% + low velocity → cancel", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -(W * 0.45),
      deltaY: 0,
      velocityX: 0,
      viewportWidth: W,
    });
    assert.equal(d.action, "cancel");
    if (d.action === "cancel") assert.equal(d.reason, "insufficient");
  });

  it("51% + low velocity → commit distance", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "profile",
      deltaX: -(W * 0.51),
      deltaY: 4,
      velocityX: 0,
      viewportWidth: W,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.nextTab, "posts");
      assert.equal(d.reason, "distance");
    }
  });

  it(">=48% release commits adjacent (distance)", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "profile",
      deltaX: -(W * PROFILE_TAB_PAGER_COMMIT_PROGRESS),
      deltaY: 4,
      velocityX: 0,
      viewportWidth: W,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.nextTab, "posts");
      assert.equal(d.reason, "distance");
    }
  });

  it("100px + 0.50 velocity → commit flick", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -100,
      deltaY: 2,
      velocityX: -0.5,
      viewportWidth: W,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.reason, "velocity");
      assert.equal(d.nextTab, "liked");
    }
  });

  it("30px + 0.75 velocity → commit flick", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -30,
      deltaY: 0,
      velocityX: -0.75,
      viewportWidth: W,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") assert.equal(d.reason, "velocity");
  });

  it("20px + 1.0 velocity → cancel (min travel)", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -20,
      deltaY: 0,
      velocityX: -1,
      viewportWidth: W,
    });
    assert.equal(d.action, "cancel");
  });

  it("valid >=28px flick at threshold commits", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -PROFILE_TAB_PAGER_FLICK_MIN_DX_PX,
      deltaY: 2,
      velocityX: -PROFILE_TAB_PAGER_FLICK_PX_PER_MS,
      viewportWidth: W,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") {
      assert.equal(d.reason, "velocity");
      assert.equal(d.nextTab, "liked");
    }
  });

  it("wrong-direction velocity → cancel", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -100,
      deltaY: 0,
      velocityX: 0.75,
      viewportWidth: W,
    });
    assert.equal(d.action, "cancel");
  });

  it("projected position commits when same-sign velocity clears 48%", () => {
    // absX=160 (36.4%), v=-0.4 → projected = 160 + 60 = 220 → 220/440=0.5 >= 0.48
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -160,
      deltaY: 0,
      velocityX: -0.35,
      viewportWidth: W,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") assert.equal(d.reason, "velocity");
    assert.ok(160 + 0.35 * PROFILE_TAB_PAGER_PROJECTION_MS >= W * PROFILE_TAB_PAGER_COMMIT_PROGRESS);
  });

  it("projection does not commit near-zero travel", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "posts",
      deltaX: -20,
      deltaY: 0,
      velocityX: -2,
      viewportWidth: W,
    });
    assert.equal(d.action, "cancel");
  });

  it("notifications + qualifying right distance → liked", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "notifications",
      deltaX: W * PROFILE_TAB_PAGER_COMMIT_PROGRESS,
      deltaY: 2,
      velocityX: 0,
      viewportWidth: W,
    });
    assert.equal(d.action, "commit");
    if (d.action === "commit") assert.equal(d.nextTab, "liked");
  });

  it("boundary cancels at ends (no wraparound)", () => {
    assert.deepEqual(
      evaluateProfilePagerRelease({
        currentTab: "profile",
        deltaX: W * 0.5,
        deltaY: 0,
        velocityX: 1,
        viewportWidth: W,
      }),
      { action: "cancel", reason: "boundary", nextTab: null },
    );
    assert.deepEqual(
      evaluateProfilePagerRelease({
        currentTab: "notifications",
        deltaX: -W * 0.5,
        deltaY: 0,
        velocityX: -1,
        viewportWidth: W,
      }),
      { action: "cancel", reason: "boundary", nextTab: null },
    );
  });

  it("vertical gesture does not move / commit pager", () => {
    const d = evaluateProfilePagerRelease({
      currentTab: "profile",
      deltaX: -20,
      deltaY: 80,
      velocityX: -1,
      viewportWidth: W,
    });
    assert.deepEqual(d, { action: "cancel", reason: "vertical", nextTab: null });
  });

  it("diagonal vertical-dominant gesture cancels", () => {
    const dx = -30;
    const dy = Math.abs(dx) * PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO + 1;
    const d = evaluateProfilePagerRelease({
      currentTab: "liked",
      deltaX: dx,
      deltaY: dy,
      velocityX: -2,
      viewportWidth: W,
    });
    assert.equal(d.action, "cancel");
    if (d.action === "cancel") assert.equal(d.reason, "vertical");
  });

  it("legacy evaluateProfileTabSwipe maps cancel → noop", () => {
    const d = evaluateProfileTabSwipe({
      currentTab: "liked",
      deltaX: -8,
      deltaY: 0,
      velocityX: 0,
      viewportWidth: W,
    });
    assert.equal(d.action, "noop");
    assert.equal(d.nextTab, null);
  });
});

describe("PROFILE-TABS-GESTURE-4A release-window velocity + snap duration", () => {
  it("release-window retains fast flick despite slight final slowdown", () => {
    const t0 = 1000;
    const samples = [
      { x: 200, t: t0 },
      { x: 160, t: t0 + 40 }, // -1.0 px/ms
      { x: 120, t: t0 + 80 }, // -1.0 px/ms
      { x: 115, t: t0 + 100 }, // -0.25 px/ms final slowdown
    ];
    const v = computeProfilePagerReleaseVelocity(samples, t0 + 100);
    // Weighted window should stay clearly leftward and above flick threshold.
    assert.ok(v <= -PROFILE_TAB_PAGER_FLICK_PX_PER_MS, `expected flick-worthy v, got ${v}`);
    // Last-segment-only would be -0.25 and fail; window must beat that.
    assert.ok(v < -0.25);
  });

  it("does not use whole-gesture average (ignores early slow crawl outside window)", () => {
    const t0 = 0;
    const samples = [
      { x: 400, t: t0 },
      { x: 380, t: t0 + 200 }, // slow early crawl outside 100ms window
      { x: 300, t: t0 + 240 },
      { x: 220, t: t0 + 280 },
    ];
    const v = computeProfilePagerReleaseVelocity(samples, t0 + 280);
    // Last ~100ms is roughly -2 px/ms; whole-gesture would be much slower.
    assert.ok(v <= -0.8, `expected recent-window velocity, got ${v}`);
  });

  it("unified settle duration scales only with remaining travel (commit ≡ cancel)", () => {
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS_MIN, 220);
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS_SPAN, 180);
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS, 400);
    assert.doesNotMatch(swipeSrc, /PROFILE_TAB_PAGER_SNAP_COMMIT_MS/);
    assert.doesNotMatch(swipeSrc, /PROFILE_TAB_PAGER_SNAP_CANCEL_MS/);

    assert.equal(profilePagerSnapDurationMs(0, WIDTH), 220);
    assert.equal(profilePagerSnapDurationMs(WIDTH * 0.1, WIDTH), 238);
    assert.equal(profilePagerSnapDurationMs(WIDTH * 0.25, WIDTH), 265);
    assert.equal(profilePagerSnapDurationMs(WIDTH * 0.5, WIDTH), 310);
    assert.equal(profilePagerSnapDurationMs(WIDTH * 0.75, WIDTH), 355);
    assert.equal(profilePagerSnapDurationMs(WIDTH, WIDTH), 400);

    // Same helper / formula regardless of commit vs cancel — no mode argument.
    assert.equal(profilePagerSnapDurationMs.length, 2);
  });

  it("release velocity does not shorten settle duration", () => {
    assert.doesNotMatch(swipeSrc, /velocityTrim|absVelocityX/);
    const a = profilePagerSnapDurationMs(WIDTH * 0.5, WIDTH);
    const b = profilePagerSnapDurationMs(WIDTH * 0.5, WIDTH);
    assert.equal(a, b);
    assert.equal(a, 310);
  });

  it("underline drag progress helper unchanged (rubberDx / width)", () => {
    assert.equal(
      profilePagerDragProgress({
        deltaX: -100,
        rubberDx: -100,
        viewportWidth: WIDTH,
        hasAdjacent: true,
      }),
      100 / WIDTH,
    );
    assert.equal(
      profilePagerDragProgress({
        deltaX: -100,
        rubberDx: -100,
        viewportWidth: WIDTH,
        hasAdjacent: false,
      }),
      0,
    );
  });

  it("snap settle passes durationMs for underline sync; starts from current translate", () => {
    assert.match(swipeSrc, /durationMs: snapMs/);
    assert.match(swipeSrc, /fromTranslate/);
    assert.match(swipeSrc, /setTrackTransform\(track, fromTranslate/);
    assert.match(swipeSrc, /void track\.offsetWidth/);
    assert.match(userProfileSrc, /event\.durationMs \?\? PROFILE_TAB_PAGER_SNAP_MS/);
    assert.match(userProfileSrc, /PROFILE_TAB_PAGER_SNAP_EASING/);
  });

  it("height unlock survives through snapping until settle completion", () => {
    assert.deepEqual(
      resolveProfilePagerVertUnlockIndices({
        phase: "snapping",
        currentIndex: 1,
        adjacentIndex: 2,
      }),
      [1, 2],
    );
    assert.match(swipeSrc, /phase: "snapping"/);
    assert.match(swipeSrc, /onCommitRef\.current\(commitTab\)/);
  });
});

describe("Profile pager thresholds + exclusions", () => {
  it("uses 48% commit, 0.40 flick, 28px flick min, 100ms velocity window", () => {
    assert.equal(PROFILE_TAB_SWIPE_EDGE_START_PX, 24);
    assert.equal(PROFILE_TAB_SWIPE_DRAG_START_PX, 12);
    assert.equal(PROFILE_TAB_PAGER_COMMIT_PROGRESS, 0.48);
    assert.equal(PROFILE_TAB_SWIPE_COMMIT_PROGRESS, 0.48);
    assert.equal(PROFILE_TAB_PAGER_FLICK_PX_PER_MS, 0.4);
    assert.equal(PROFILE_TAB_SWIPE_FAST_SWIPE_PX_PER_MS, 0.4);
    assert.equal(PROFILE_TAB_PAGER_FLICK_MIN_DX_PX, 28);
    assert.equal(PROFILE_TAB_PAGER_VELOCITY_WINDOW_MS, 100);
    assert.equal(PROFILE_TAB_PAGER_PROJECTION_MS, 150);
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS_MIN, 220);
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS, 400);
    assert.equal(PROFILE_TAB_PAGER_SNAP_EASING, "cubic-bezier(0.32, 0.45, 0.42, 1)");
    assert.equal(PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
  });

  it("excludes interactive targets; left-edge ignore in source", () => {
    assert.match(swipeSrc, /role='tab'/);
    assert.match(swipeSrc, /role='dialog'/);
    assert.match(swipeSrc, /PROFILE_TAB_SWIPE_EDGE_START_PX/);
    assert.match(swipeSrc, /clientX <= PROFILE_TAB_SWIPE_EDGE_START_PX/);
    assert.equal(typeof isProfileTabSwipeInteractiveTarget, "function");
  });

  it("finger-follow uses transform-only translate3d + will-change while armed", () => {
    assert.match(swipeSrc, /translate3d/);
    assert.match(swipeSrc, /willChange/);
    assert.match(swipeSrc, /prefersProfilePagerReducedMotion/);
    assert.match(swipeSrc, /computeProfilePagerReleaseVelocity/);
    assert.match(swipeSrc, /profilePagerSnapDurationMs/);
    assert.doesNotMatch(swipeSrc, /embla|framer-motion/i);
  });

  it("snap completes before onCommitTab; cancel skips handler", () => {
    assert.match(swipeSrc, /onCommitRef\.current\(commitTab\)/);
    assert.match(swipeSrc, /if \(commitTab && commitTab !== tabRef\.current\)/);
    assert.match(swipeSrc, /finishSnap\(profilePagerRestTranslatePx\(index, width\), null\)/);
  });
});

describe("PROFILE-TABS-GESTURE-4B — Posts/Likes card swipe arbitration", () => {
  it("marks Posts and Likes thumbnails as pager cards with click suppress", () => {
    assert.equal(PROFILE_TAB_PAGER_CARD_ATTR, "data-profile-pager-card");
    assert.equal(PROFILE_TAB_PAGER_DRAGGING_ATTR, "data-profile-pager-dragging");
    assert.match(userProfileSrc, /data-profile-pager-card="true"/);
    assert.match(userProfileSrc, /posts-thumbnail-\$\{post\.id\}[\s\S]*?data-profile-pager-card="true"/);
    assert.match(userProfileSrc, /liked-thumbnail-\$\{post\.id\}[\s\S]*?data-profile-pager-card="true"/);
    assert.match(userProfileSrc, /consumeProfilePagerCardClickSuppression/);
    assert.match(userProfileSrc, /openPostsPostViewer\((index|absoluteIndex)\)/);
    assert.match(userProfileSrc, /openLikedPostViewer\((index|absoluteIndex)\)/);
  });

  it("carves out pager-card buttons; keeps nested/generic interactive excluded", () => {
    assert.match(swipeSrc, /PROFILE_TAB_PAGER_CARD_ATTR/);
    assert.match(
      swipeSrc,
      /if \(card && interactive === card\) return false/,
    );
    // Generic button exclusion still present via INTERACTIVE_SELECTOR.
    assert.match(swipeSrc, /input, textarea, select, button, a/);
  });

  it("arms claimCardGesture on horizontal arm and vertical cancel", () => {
    assert.match(swipeSrc, /claimCardGesture/);
    assert.match(swipeSrc, /armProfilePagerCardClickSuppression/);
    assert.match(swipeSrc, /setPagerDraggingVisual\(true\)/);
    assert.match(
      swipeSrc,
      /absY > PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX && absY > absX[\s\S]*?claimCardGesture/,
    );
    assert.match(
      swipeSrc,
      /absX >= PROFILE_TAB_SWIPE_DRAG_START_PX[\s\S]*?claimCardGesture/,
    );
    // Vertical path must not preventDefault before return.
    assert.match(
      swipeSrc,
      /claimCardGesture\(\);\s*state\.cancelled = true;\s*state\.active = false;\s*state\.phase = "idle";\s*onAbortRef\.current\?\.\(\);\s*return;/,
    );
  });

  it("click suppression is one-shot and cleared on next gesture start", () => {
    clearProfilePagerCardClickSuppression();
    assert.equal(isProfilePagerCardClickSuppressionArmed(), false);
    assert.equal(consumeProfilePagerCardClickSuppression(), false);

    armProfilePagerCardClickSuppression();
    assert.equal(isProfilePagerCardClickSuppressionArmed(), true);
    assert.equal(consumeProfilePagerCardClickSuppression(), true);
    assert.equal(isProfilePagerCardClickSuppressionArmed(), false);
    assert.equal(consumeProfilePagerCardClickSuppression(), false);

    armProfilePagerCardClickSuppression();
    clearProfilePagerCardClickSuppression();
    assert.equal(consumeProfilePagerCardClickSuppression(), false);

    assert.match(swipeSrc, /clearProfilePagerCardClickSuppression\(\)/);
  });

  it("CSS suppresses ios-press only on pager cards while dragging", () => {
    assert.match(
      indexCssSrc,
      /\[data-profile-pager-dragging="true"\] \[data-profile-pager-card="true"\]\.ios-press:active/,
    );
    assert.match(indexCssSrc, /\.ios-press:active \{[\s\S]*?scale\(0\.9825\)/);
    // Home / global press recipe remains.
    assert.doesNotMatch(indexCssSrc, /\[data-home[\s\S]{0,40}\]\.ios-press:active/);
  });

  it("does not change commit thresholds or unified settle", () => {
    assert.equal(PROFILE_TAB_PAGER_COMMIT_PROGRESS, 0.48);
    assert.equal(PROFILE_TAB_PAGER_FLICK_PX_PER_MS, 0.4);
    assert.equal(PROFILE_TAB_PAGER_FLICK_MIN_DX_PX, 28);
    assert.equal(PROFILE_TAB_SWIPE_DRAG_START_PX, 12);
    assert.equal(PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS_MIN, 220);
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS, 400);
    assert.equal(PROFILE_TAB_PAGER_SNAP_EASING, "cubic-bezier(0.32, 0.45, 0.42, 1)");
  });
});

describe("user-profile pager wiring", () => {
  it("wires four-panel track + useProfileTabPager to handleProfileTabChange", () => {
    assert.match(userProfileSrc, /useProfileTabPager/);
    assert.match(userProfileSrc, /onCommitTab: handleProfileTabChange/);
    assert.match(userProfileSrc, /data-testid="profile-tab-swipe-region"/);
    assert.match(userProfileSrc, /data-testid="profile-tab-pager-track"/);
    assert.match(userProfileSrc, /PROFILE_TAB_PAGER_VIEWPORT_CLASS/);
    assert.match(userProfileSrc, /PROFILE_TAB_PAGER_TRACK_CLASS/);
    assert.match(userProfileSrc, /PROFILE_TAB_PAGER_PANEL_CLASS/);
    assert.match(userProfileSrc, /onValueChange=\{handleProfileTabChange\}/);
  });

  it("forceMounts all four panels in swipe order", () => {
    const trackIdx = userProfileSrc.indexOf('data-testid="profile-tab-pager-track"');
    const profileIdx = userProfileSrc.indexOf('value="profile"', trackIdx);
    const postsIdx = userProfileSrc.indexOf('value="posts"', trackIdx);
    const likedIdx = userProfileSrc.indexOf('value="liked"', trackIdx);
    const notifIdx = userProfileSrc.indexOf('value="notifications"', trackIdx);
    assert.ok(trackIdx >= 0);
    assert.ok(profileIdx > trackIdx && postsIdx > profileIdx && likedIdx > postsIdx && notifIdx > likedIdx);
    assert.match(userProfileSrc, /value="profile"[\s\S]*?forceMount/);
    assert.match(userProfileSrc, /value="posts"[\s\S]*?forceMount/);
    assert.match(userProfileSrc, /value="liked"[\s\S]*?forceMount/);
    assert.match(userProfileSrc, /value="notifications"[\s\S]*?forceMount/);
  });

  it("disables pager while Posts or Likes viewer is open", () => {
    assert.match(
      userProfileSrc,
      /enabled:\s*postsViewerStartIndex === null && likesViewerStartIndex === null/,
    );
  });

  it("Notifications preview does not change activeTab / committed side effects", () => {
    assert.match(
      userProfileSrc,
      /if \(activeTab !== "notifications"\)[\s\S]*?markAllReadOnNotificationsTabRef/,
    );
    assert.doesNotMatch(userProfileSrc, /previewTab|pendingTab|swipePreview/);
    assert.match(swipeSrc, /Calls onCommitTab only after a successful snap/);
    assert.equal(profileTabIndex("notifications"), 3);
  });

  it("Profile notifications mask stays inside Notifications panel", () => {
    assert.match(userProfileSrc, /profile-notifications-top-mask|PROFILE_NOTIFICATIONS_MASK/);
    assert.match(indexCssSrc, /\.profile-notifications-top-mask/);
    const maskInPagerTrack = /profile-tab-pager-track[\s\S]*profile-notifications-top-mask/;
    // Mask class may be via PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS constant — ensure not on track alone
    assert.doesNotMatch(
      userProfileSrc,
      /data-testid="profile-tab-pager-track"[\s\S]{0,120}profile-notifications-top-mask/,
    );
    void maskInPagerTrack;
  });

  it("shared underline follows pager progress (PROFILE-TABS-3B)", () => {
    assert.match(userProfileSrc, /data-testid="profile-primary-nav-indicator"/);
    assert.match(userProfileSrc, /onPagerProgress/);
    assert.match(swipeSrc, /ProfilePagerProgressEvent/);
    assert.match(swipeSrc, /interpolateProfileNavIndicator|profilePagerDragProgress/);
    assert.doesNotMatch(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "./profile-primary-nav-presentation.ts"),
        "utf8",
      ),
      /group-data-\[state=active\]:after/,
    );
    assert.match(userProfileSrc, /TabsTrigger/);
  });

  it("tap navigation still uses immediate handleProfileTabChange", () => {
    assert.match(userProfileSrc, /onValueChange=\{handleProfileTabChange\}/);
    assert.match(userProfileSrc, /const handleProfileTabChange = \(value: string\)/);
  });

  it("keeps gesture under tabs, not on banner or tab shell", () => {
    const bannerIdx = userProfileSrc.indexOf('data-testid="profile-banner"');
    const tabsIdx = userProfileSrc.indexOf('data-testid="profile-tabs"');
    const swipeIdx = userProfileSrc.indexOf('data-testid="profile-tab-swipe-region"');
    assert.ok(bannerIdx >= 0 && tabsIdx > bannerIdx && swipeIdx > tabsIdx);
  });

  it("panel presentation classes export expected layout contracts", () => {
    assert.match(PROFILE_TAB_PAGER_VIEWPORT_CLASS, /-mx-6/);
    assert.match(PROFILE_TAB_PAGER_VIEWPORT_CLASS, /overflow-x-hidden/);
    assert.doesNotMatch(PROFILE_TAB_PAGER_VIEWPORT_CLASS, /overflow-y-hidden/);
    assert.doesNotMatch(PROFILE_TAB_PAGER_VIEWPORT_CLASS, /\bw-full\b/);
    assert.equal(PROFILE_TAB_PAGER_TRACK_CLASS, "flex");
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /min-w-full/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /basis-full/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /shrink-0/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /\bpx-6\b/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /data-\[state=inactive\]:!block/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /data-\[state=inactive\]:h-0/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /data-\[state=inactive\]:overflow-y-hidden/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /data-\[state=active\]:h-auto/);
    assert.doesNotMatch(PROFILE_TAB_PAGER_PANEL_CLASS, /absolute/);
    assert.match(PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS, /!h-auto/);
  });

  it("pager viewport is full-bleed like banner/nav; padding stays on panels", () => {
    assert.match(userProfileSrc, /className="px-6 pb-8"/);
    assert.match(userProfileSrc, /max-w-md mx-auto/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_SHELL_CLASS/);
    assert.match(PROFILE_TAB_PAGER_VIEWPORT_CLASS, /-mx-6/);
    assert.match(PROFILE_TAB_PAGER_PANEL_CLASS, /\bpx-6\b/);
    // Drag/snap width source is the full-bleed viewport rect — not inner content.
    assert.match(swipeSrc, /viewport\.getBoundingClientRect\(\)\.width/);
    assert.doesNotMatch(swipeSrc, /TabsContent.*getBoundingClientRect|contentWidth|innerWidth\s*\*\s*0\./);
  });

  it("snap commit uses same pageWidth source as drag", () => {
    assert.match(swipeSrc, /const widthOf = \(\) =>/);
    assert.match(swipeSrc, /profilePagerRestTranslatePx\(nextIndex, width\)/);
    assert.match(swipeSrc, /evaluateProfilePagerRelease\(\{[\s\S]*viewportWidth: width/);
  });
});

describe("PROFILE-GRID-VIEWER-2A-FIX — flex slots + vertical collapse", () => {
  it("fixed flex slots: viewportX = (i - active) * W (no absolute left)", () => {
    assert.equal(profilePagerViewportXPx(0, 0, WIDTH), 0);
    assert.equal(profilePagerViewportXPx(1, 1, WIDTH), 0);
    assert.equal(profilePagerViewportXPx(2, 2, WIDTH), 0);
    assert.equal(profilePagerViewportXPx(3, 3, WIDTH), 0);
    assert.equal(profilePagerViewportXPx(2, 1, WIDTH), WIDTH);
    assert.equal(profilePagerViewportXPx(1, 2, WIDTH), -WIDTH);
    assert.equal(
      profilePagerViewportXPx(1, 1, WIDTH),
      1 * WIDTH + profilePagerRestTranslatePx(1, WIDTH),
    );
  });

  it("idle host height follows current panel only (Posts shorter than Likes)", () => {
    const postsH = 400;
    const likesH = 1200;
    assert.equal(
      resolveProfilePagerHostHeightPx({
        phase: "idle",
        currentHeight: postsH,
        adjacentHeight: likesH,
      }),
      postsH,
    );
    assert.equal(
      resolveProfilePagerHostHeightPx({
        phase: "idle",
        currentHeight: likesH,
        adjacentHeight: null,
      }),
      likesH,
    );
  });

  it("dragging/snapping uses discrete max(current, adjacent)", () => {
    assert.equal(
      resolveProfilePagerHostHeightPx({
        phase: "dragging",
        currentHeight: 400,
        adjacentHeight: 1200,
      }),
      1200,
    );
    assert.equal(
      resolveProfilePagerHostHeightPx({
        phase: "snapping",
        currentHeight: 1200,
        adjacentHeight: 400,
      }),
      1200,
    );
    assert.equal(
      resolveProfilePagerHostHeightPx({
        phase: "dragging",
        currentHeight: 500,
        adjacentHeight: null,
      }),
      500,
    );
  });

  it("vert unlock is current+adjacent during gesture; null when idle", () => {
    assert.equal(
      resolveProfilePagerVertUnlockIndices({
        phase: "idle",
        currentIndex: 1,
        adjacentIndex: 2,
      }),
      null,
    );
    assert.deepEqual(
      resolveProfilePagerVertUnlockIndices({
        phase: "dragging",
        currentIndex: 1,
        adjacentIndex: 2,
      }),
      [1, 2],
    );
    assert.deepEqual(
      resolveProfilePagerVertUnlockIndices({
        phase: "snapping",
        currentIndex: 2,
        adjacentIndex: 1,
      }),
      [2, 1],
    );
  });

  it("commit settle returns to active-only height", () => {
    const during = resolveProfilePagerHostHeightPx({
      phase: "snapping",
      currentHeight: 400,
      adjacentHeight: 1200,
    });
    assert.equal(during, 1200);
    const settled = resolveProfilePagerHostHeightPx({
      phase: "idle",
      currentHeight: 1200,
      adjacentHeight: null,
    });
    assert.equal(settled, 1200);
    const postsAfter = resolveProfilePagerHostHeightPx({
      phase: "idle",
      currentHeight: 400,
      adjacentHeight: null,
    });
    assert.equal(postsAfter, 400);
  });

  it("deep Likes → shorter Posts clamps invalid scrollTop only", () => {
    const clientHeight = 700;
    const likesScrollHeight = 2000;
    const postsScrollHeight = 900;
    const deepTop = 1200;
    assert.equal(
      clampScrollTopToContentMax(deepTop, likesScrollHeight, clientHeight),
      deepTop,
    );
    const postsMax = postsScrollHeight - clientHeight;
    assert.equal(
      clampScrollTopToContentMax(deepTop, postsScrollHeight, clientHeight),
      postsMax,
    );
    assert.equal(clampScrollTopToContentMax(100, postsScrollHeight, clientHeight), 100);
  });

  it("wires flex-slot collapse + unlock + host height; no absolute left", () => {
    assert.match(userProfileSrc, /applyProfilePagerHostHeight/);
    assert.match(userProfileSrc, /applyProfilePagerPanelImperativeUnlock/);
    assert.match(userProfileSrc, /resolveProfilePagerPrepareUnlockIndices/);
    assert.match(userProfileSrc, /resolveProfilePagerVertUnlockIndices/);
    assert.match(userProfileSrc, /PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS/);
    assert.match(userProfileSrc, /clampElementScrollTopIfNeeded/);
    assert.match(userProfileSrc, /profilePageScrollRef/);
    assert.match(userProfileSrc, /imperativeUnlockIndicesRef/);
    assert.match(userProfileSrc, /data-profile-pager-index=\{0\}/);
    assert.match(userProfileSrc, /data-profile-pager-index=\{1\}/);
    assert.match(userProfileSrc, /data-profile-pager-index=\{2\}/);
    assert.match(userProfileSrc, /data-profile-pager-index=\{3\}/);
    assert.match(userProfileSrc, /viewport\.style\.minHeight/);
    assert.match(userProfileSrc, /profilePagerHostHeightKeyRef/);
    assert.doesNotMatch(userProfileSrc, /profilePagerPanelLeftStyle/);
    assert.doesNotMatch(userProfileSrc, /profilePagerInactivePanelLeftPercent/);
    assert.doesNotMatch(PROFILE_TAB_PAGER_PANEL_CLASS, /absolute/);
  });

  it("keeps horizontal pager, underline, filters, notifications, full-screen viewer contracts", () => {
    assert.match(swipeSrc, /translate3d/);
    assert.match(userProfileSrc, /onPagerProgress: handleProfilePagerProgress/);
    assert.match(userProfileSrc, /interpolateProfileNavIndicator/);
    assert.match(userProfileSrc, /ProfileStatusFilterRow/);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATIONS_VIEWPORT_CLASS/);
    assert.match(userProfileSrc, /forceMount/);
    assert.match(userProfileSrc, /FullScreenPostSequenceViewer/);
    assert.doesNotMatch(
      userProfileSrc,
      /h-\[min\(88dvh,calc\(100dvh-var\(--app-bottom-nav-block\)-10rem\)\)\]/,
    );
  });
});

describe("PROFILE-SWIPE-POLISH-4 — imperative prepare + stable drag geometry", () => {
  it("A: touchstart synchronously unlocks current±1 via live panel refs", () => {
    assert.match(swipeSrc, /onPrepareRef\.current\?\.\(\)/);
    assert.match(userProfileSrc, /applyProfilePagerPanelImperativeUnlock\(profilePagerPanelRefs\.current\[index\]\)/);
    assert.match(userProfileSrc, /imperativeUnlockIndicesRef\.current = prepareUnlock/);
    assert.deepEqual(resolveProfilePagerPrepareUnlockIndices(0), [0, 1]);
    assert.deepEqual(resolveProfilePagerPrepareUnlockIndices(1), [0, 1, 2]);
    assert.deepEqual(resolveProfilePagerPrepareUnlockIndices(2), [1, 2, 3]);
    assert.deepEqual(resolveProfilePagerPrepareUnlockIndices(3), [2, 3]);
  });

  it("B/C: height measurement occurs AFTER imperative unlock (expanded panels)", () => {
    const prepareFn = userProfileSrc.slice(
      userProfileSrc.indexOf("const handleProfilePagerGesturePrepare"),
      userProfileSrc.indexOf("const handleProfilePagerGestureAbort"),
    );
    const unlockAt = prepareFn.indexOf("applyProfilePagerPanelImperativeUnlock");
    const measureAt = prepareFn.indexOf("measureProfilePagerPanelHeight");
    assert.ok(unlockAt >= 0 && measureAt > unlockAt);
    assert.match(prepareFn, /for \(const index of prepareUnlock\) \{\s*const h = measureProfilePagerPanelHeight/);
  });

  it("D: host minHeight is written during prepare", () => {
    assert.match(
      userProfileSrc,
      /viewport\.style\.minHeight = `\$\{maxH\}px`/,
    );
    assert.match(userProfileSrc, /profilePagerGestureGeometryLockedRef\.current = true/);
  });

  it("E: first armed progress does NOT call React unlock state on normal path", () => {
    assert.doesNotMatch(userProfileSrc, /setPagerVertUnlockIndices\(/);
    assert.doesNotMatch(userProfileSrc, /setPagerVertUnlock\(/);
    assert.match(
      userProfileSrc,
      /profilePagerUnlockCovers\(imperativeUnlockIndicesRef\.current, unlock\)/,
    );
    assert.match(
      userProfileSrc,
      /Intentionally no setPagerVertUnlockIndices/,
    );
  });

  it("F: React layout-effect does NOT rewrite minHeight during armed drag", () => {
    assert.doesNotMatch(
      userProfileSrc,
      /useLayoutEffect\(\(\) => \{[\s\S]*?applyProfileHostMinHeightFromCache/,
    );
    assert.match(
      userProfileSrc,
      /no React unlock layout-effect remasure during drag/,
    );
  });

  it("G/H: imperative unlock classes cleaned after commit and cancel", () => {
    assert.match(userProfileSrc, /clearProfilePagerPanelImperativeUnlock/);
    assert.match(userProfileSrc, /settleProfilePagerGestureGeometry/);
    assert.match(userProfileSrc, /handleProfilePagerGestureAbort/);
    assert.match(
      userProfileSrc,
      /event\.phase === "idle"[\s\S]*?settleProfilePagerGestureGeometry/,
    );
  });

  it("width cache: measured once at prepare; armed move uses cache", () => {
    assert.match(swipeSrc, /cacheGestureWidth\(\)/);
    assert.match(swipeSrc, /let gestureWidthPx = 0/);
    assert.match(swipeSrc, /if \(gestureWidthPx > 0\) return gestureWidthPx/);
    assert.match(swipeSrc, /const viewportWidth = widthOf\(\)/);
    assert.doesNotMatch(
      swipeSrc,
      /progress: profilePagerDragProgress\(\{[\s\S]*?viewportWidth: widthOf\(\)/,
    );
  });

  it("width cache invalidates on resize / gesture reset", () => {
    assert.match(swipeSrc, /gestureWidthPx = 0/);
    assert.match(swipeSrc, /window\.addEventListener\("resize", onGestureResize\)/);
  });

  it("transform path remains continuous; thresholds unchanged", () => {
    assert.match(swipeSrc, /state\.baseTranslate \+ rubberDx/);
    assert.equal(PROFILE_TAB_SWIPE_DRAG_START_PX, 12);
    assert.equal(PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(PROFILE_TAB_SWIPE_EDGE_START_PX, 24);
    assert.equal(PROFILE_TAB_PAGER_COMMIT_PROGRESS, 0.48);
  });

  it("Notifications nested-scroll + unlock helpers unchanged", () => {
    assert.match(userProfileSrc, /PROFILE_NOTIFICATIONS_VIEWPORT_CLASS/);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS/);
    assert.deepEqual(profilePagerVertUnlockClassTokens(), [
      "!h-auto",
      "!min-h-0",
      "!overflow-y-visible",
    ]);
    assert.equal(
      PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS,
      "!h-auto !min-h-0 !overflow-y-visible",
    );
  });

  it("abort clears prepare unlock when gesture never arms", () => {
    assert.match(swipeSrc, /onAbortRef\.current\?\.\(\)/);
    assert.match(userProfileSrc, /onGestureAbort: handleProfilePagerGestureAbort/);
  });
});

describe("PROFILE-SWIPE-POLISH-2 — visual tab emphasis", () => {
  it("C/D: source = 1-progress, destination = progress", () => {
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      1,
    );
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      0,
    );
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0.5,
      }),
      0.5,
    );
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0.5,
      }),
      0.5,
    );
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 1,
      }),
      0,
    );
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 1,
      }),
      1,
    );
  });

  it("E: label emphasis uses same pager progress as indicator", () => {
    assert.match(userProfileSrc, /applyProfilePrimaryTabVisualEmphasis\(event\)/);
    assert.match(userProfileSrc, /interpolateProfileNavIndicator\(from, to, event\.progress\)/);
    assert.match(userProfileSrc, /resolveProfilePrimaryTabEmphasis\(\{[\s\S]*progress: event\.progress/);
  });

  it("F: cancel restores committed label visually", () => {
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 0,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      1,
    );
    assert.equal(
      resolveProfilePrimaryTabEmphasis({
        tabIndex: 1,
        currentIndex: 0,
        adjacentIndex: 1,
        progress: 0,
      }),
      0,
    );
    assert.match(userProfileSrc, /clearProfilePrimaryTabVisualEmphasis/);
    assert.match(userProfileSrc, /event\.phase === "idle"/);
  });

  it("color endpoints match white\/55 → opaque white", () => {
    assert.equal(PROFILE_PRIMARY_TAB_INACTIVE_ALPHA, 0.55);
    assert.equal(profilePrimaryTabEmphasisColor(0), "rgba(255, 255, 255, 0.55)");
    assert.equal(profilePrimaryTabEmphasisColor(1), "rgba(255, 255, 255, 1)");
  });

  it("H: aria-selected remains committed-only during drag", () => {
    assert.match(userProfileSrc, /Tabs value=\{tabsValue\} onValueChange=\{handleProfileTabChange\}/);
    assert.doesNotMatch(userProfileSrc, /aria-selected=\{[^}]*progress/);
    assert.match(userProfileSrc, /onCommitTab: handleProfileTabChange/);
    assert.doesNotMatch(swipeSrc, /onCommitRef\.current\(.*\)[\s\S]{0,40}phase: "dragging"/);
  });

  it("does not add haptic in this slice", () => {
    assert.doesNotMatch(userProfileSrc, /playInteractionLight/);
    assert.doesNotMatch(swipeSrc, /playInteractionLight|Haptics\.impact/i);
  });
});
