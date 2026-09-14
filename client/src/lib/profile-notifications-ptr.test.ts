/**
 * PROFILE-NOTIFICATIONS-PTR-2 — Notifications pull-to-refresh feel contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_NOTIFICATIONS_PTR_GAIN,
  PROFILE_NOTIFICATIONS_PTR_MAX_VISUAL_PX,
  PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS,
  PROFILE_NOTIFICATIONS_PTR_PULL_ROTATE_DEG_PER_PX,
  PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_CLASS,
  PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_MS,
  PROFILE_NOTIFICATIONS_PTR_SNAP_EASING,
  PROFILE_NOTIFICATIONS_PTR_SNAP_MS,
  PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX,
  PROFILE_NOTIFICATIONS_PTR_TOP_EPSILON_PX,
  PROFILE_NOTIFICATIONS_VIEWPORT_CLASS,
  profileNotificationsPtrHoldHeightPx,
  profileNotificationsPtrIndicatorOpacity,
  profileNotificationsPtrPostFetchHoldMs,
  profileNotificationsPtrPullRotateDeg,
  profileNotificationsRubberBandPull,
} from "./profile-notifications-presentation";
import { playNotificationsPtrRefreshCommitHaptic } from "./profile-notifications-ptr-haptics";
import {
  PROFILE_TAB_SWIPE_DRAG_START_PX,
  PROFILE_TAB_SWIPE_EDGE_START_PX,
  PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO,
  PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX,
} from "./profile-tab-swipe";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const presentationSrc = readFileSync(join(here, "./profile-notifications-presentation.ts"), "utf8");
const ptrHapticsSrc = readFileSync(join(here, "./profile-notifications-ptr-haptics.ts"), "utf8");
const pullRefreshHapticsSrc = readFileSync(join(here, "./pull-refresh-haptics.ts"), "utf8");
const swipeSrc = readFileSync(join(here, "./profile-tab-swipe.ts"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const homePullSrc = readFileSync(join(here, "../hooks/use-pull-to-refresh.ts"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");

function notificationsTabSrc(src: string): string {
  const start = src.indexOf('{/* Notifications Tab */}');
  assert.ok(start >= 0, "Notifications Tab marker missing");
  const end = src.indexOf("</TabsContent>", start);
  assert.ok(end > start, "Notifications TabsContent close missing");
  return src.slice(start, end);
}

const notifTabSrc = notificationsTabSrc(userProfileSrc);

describe("PROFILE-NOTIFICATIONS-PTR-2 rubber-band math", () => {
  it("uses progressive resistance with Profile constants (no hard 96 clamp)", () => {
    assert.equal(PROFILE_NOTIFICATIONS_PTR_MAX_VISUAL_PX, 108);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_GAIN, 0.6);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX, 56);
    assert.doesNotMatch(presentationSrc, /delta \* 0\.45/);
    assert.doesNotMatch(userProfileSrc, /Math\.min\(96,\s*delta \* 0\.45\)/);
    assert.doesNotMatch(userProfileSrc, /const threshold = 52/);

    const at20 = profileNotificationsRubberBandPull(20);
    const at60 = profileNotificationsRubberBandPull(60);
    const at200 = profileNotificationsRubberBandPull(200);
    assert.ok(at20 > 10 && at20 < 20, `initial gain near 0.6: got ${at20}`);
    assert.ok(at60 > at20, "increases with finger travel");
    assert.ok(at60 / 60 < at20 / 20, "gain ratio falls as travel grows (progressive resistance)");
    assert.ok(at200 < PROFILE_NOTIFICATIONS_PTR_MAX_VISUAL_PX, "asymptotic toward max, never hard wall");
    assert.ok(at200 > 70, "can approach large visual pulls");
  });

  it("threshold and hold are visual-distance based", () => {
    assert.equal(profileNotificationsPtrHoldHeightPx(40), 56);
    assert.equal(profileNotificationsPtrHoldHeightPx(70), 70);
    assert.equal(profileNotificationsPtrHoldHeightPx(200), 108);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX/);
    assert.match(userProfileSrc, /profileNotificationsPtrHoldHeightPx/);
    assert.doesNotMatch(notifTabSrc, /isRefreshingNotifications \? 44/);
  });

  it("indicator opacity ramps with visual pull; full while refreshing", () => {
    assert.equal(profileNotificationsPtrIndicatorOpacity(0, false), 0);
    assert.ok(profileNotificationsPtrIndicatorOpacity(28, false) > 0.4);
    assert.equal(profileNotificationsPtrIndicatorOpacity(56, false), 1);
    assert.equal(profileNotificationsPtrIndicatorOpacity(0, true), 1);
    assert.doesNotMatch(notifTabSrc, /pullDistance > 8/);
  });
});

describe("PROFILE-NOTIFICATIONS-PTR-2 viewport + live drag", () => {
  it("nested viewport owns PTR and suppresses native overscroll", () => {
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /max-h-\[70dvh\]/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /overflow-y-auto/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /overscroll-y-none/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /\[overscroll-behavior-y:none\]/);
    assert.match(notifTabSrc, /data-testid="profile-notifications-viewport"/);
    assert.match(notifTabSrc, /onTouchStart=\{handleNotificationsTouchStart\}/);
    assert.match(notifTabSrc, /onTouchMove=\{handleNotificationsTouchMove\}/);
    assert.match(notifTabSrc, /onTouchEnd=\{handleNotificationsTouchEnd\}/);
    assert.match(notifTabSrc, /onTouchCancel=\{handleNotificationsTouchCancel\}/);
    assert.doesNotMatch(userProfileSrc, /usePullToRefresh/);
  });

  it("does not CSS-transition spacer height while pulling", () => {
    assert.doesNotMatch(notifTabSrc, /transition-all duration-150/);
    assert.match(notifTabSrc, /data-testid="profile-notifications-ptr-spacer"/);
    assert.match(userProfileSrc, /!isPulling &&/);
    assert.match(userProfileSrc, /notificationsPullSnapBack \|\| isCompletingNotificationsPull/);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_SNAP_MS, 240);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_SNAP_EASING, "cubic-bezier(0.2, 0.8, 0.2, 1)");
    assert.match(
      userProfileSrc,
      /height \$\{PROFILE_NOTIFICATIONS_PTR_SNAP_MS\}ms \$\{PROFILE_NOTIFICATIONS_PTR_SNAP_EASING\}/,
    );
  });

  it("rAF-coalesces pull distance updates", () => {
    assert.match(userProfileSrc, /rafNotificationsPullFlushRef/);
    assert.match(userProfileSrc, /requestAnimationFrame\(flushNotificationsPullDistance\)/);
    assert.match(userProfileSrc, /scheduleNotificationsPullDistanceFlush/);
    assert.match(userProfileSrc, /pullDistanceRef\.current = profileNotificationsRubberBandPull/);
  });

  it("arms only near scrollTop 0 and cancels when scrolled away", () => {
    assert.equal(PROFILE_NOTIFICATIONS_PTR_TOP_EPSILON_PX, 1);
    assert.match(userProfileSrc, /el\.scrollTop > PROFILE_NOTIFICATIONS_PTR_TOP_EPSILON_PX/);
    assert.match(userProfileSrc, /resetNotificationsPullVisual\(\{ animate: false \}\)/);
  });
});

describe("PROFILE-NOTIFICATIONS-PTR-2 release / refresh hold", () => {
  it("snap-back and completion animate hold → 0 without 44px snap", () => {
    assert.match(userProfileSrc, /setNotificationsPullSnapBack\(true\)/);
    assert.match(userProfileSrc, /completeNotificationsPullAfterRefresh/);
    assert.match(userProfileSrc, /setIsCompletingNotificationsPull\(true\)/);
    assert.match(userProfileSrc, /setRefreshHoldHeightPx\(heldHeight\)/);
    assert.doesNotMatch(userProfileSrc, /setRefreshHoldHeightPx\(44\)/);
    assert.doesNotMatch(notifTabSrc, /height: `\$\{isRefreshingNotifications \? 44/);
  });

  it("refresh commits once with in-flight guard; touchcancel does not refresh", () => {
    assert.match(userProfileSrc, /refreshNotificationsInFlightRef/);
    assert.match(userProfileSrc, /handleNotificationsTouchCancel/);
    assert.match(userProfileSrc, /resetNotificationsPullVisual\(\{ animate: true \}\)/);
    const cancelFn = userProfileSrc.slice(
      userProfileSrc.indexOf("const handleNotificationsTouchCancel"),
      userProfileSrc.indexOf("const handleFileChange"),
    );
    assert.doesNotMatch(cancelFn, /refreshNewerNotifications/);
  });

  it("keeps fetch semantics: prepend scroll compensation + invalidate", () => {
    assert.match(userProfileSrc, /container\.scrollTop \+= Math\.max\(0, nextHeight - prevHeight\)/);
    assert.match(userProfileSrc, /invalidateQueries\(\{ queryKey: \["\/api\/user", currentUser\.id, "notifications"\]/);
    assert.match(userProfileSrc, /Refresh failed/);
    // Refresh must not swap the loaded list for the initial skeleton.
    assert.match(
      notifTabSrc,
      /isInitialNotificationsLoading && !hasLoadedNotifications && notifications\.length === 0/,
    );
    assert.doesNotMatch(
      notifTabSrc,
      /isRefreshingNotifications[\s\S]{0,80}ProfileNotificationsLoadingSkeleton/,
    );
  });
});

describe("PROFILE-NOTIFICATIONS-PTR-3 minimum visible refresh hold", () => {
  it("holds vinyl spin for 1000ms min in parallel with fetch (not sequenced)", () => {
    assert.equal(PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS, 1000);
    assert.match(presentationSrc, /PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS = 1000/);
    assert.match(userProfileSrc, /Promise\.all\(/);
    assert.match(userProfileSrc, /refreshNewerNotifications\(\)/);
    assert.match(userProfileSrc, /waitNotificationsMinVisibleRefresh\(\)/);
    // Fetch must not await the timer before starting.
    const commitBlock = userProfileSrc.slice(
      userProfileSrc.indexOf("const heldHeight = profileNotificationsPtrHoldHeightPx"),
      userProfileSrc.indexOf("const handleNotificationsTouchCancel"),
    );
    assert.match(
      commitBlock,
      /await Promise\.all\(\[\s*refreshNewerNotifications\(\),\s*waitNotificationsMinVisibleRefresh\(\),\s*\]\)/s,
    );
    assert.doesNotMatch(
      commitBlock,
      /await waitNotificationsMinVisibleRefresh\(\);\s*await refreshNewerNotifications/,
    );
  });

  it("fast fetch pads to min visible; slow fetch adds no extra full delay", () => {
    assert.equal(profileNotificationsPtrPostFetchHoldMs(150), 850);
    assert.equal(profileNotificationsPtrPostFetchHoldMs(1000), 0);
    assert.equal(profileNotificationsPtrPostFetchHoldMs(1800), 0);
    assert.equal(profileNotificationsPtrPostFetchHoldMs(0), 1000);
  });

  it("keeps indicator spinning through refresh hold then completes in 240ms", () => {
    assert.match(notifTabSrc, /PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_CLASS/);
    assert.match(
      notifTabSrc,
      /isRefreshingNotifications \|\| isCompletingNotificationsPull/,
    );
    assert.equal(PROFILE_NOTIFICATIONS_PTR_SNAP_MS, 240);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_SNAP_EASING, "cubic-bezier(0.2, 0.8, 0.2, 1)");
    assert.match(userProfileSrc, /completeNotificationsPullAfterRefresh/);
    // Hold height stays committed until completion (no shrink during min-visible).
    assert.doesNotMatch(userProfileSrc, /setRefreshHoldHeightPx\(44\)/);
    assert.match(userProfileSrc, /setRefreshHoldHeightPx\(heldHeight\)/);
  });

  it("cleans min-visible timer on abort/unmount/tab leave; no stuck refresh UI", () => {
    assert.match(userProfileSrc, /abortNotificationsPtrVisualSession/);
    assert.match(userProfileSrc, /clearNotificationsMinVisibleTimeout/);
    assert.match(userProfileSrc, /notificationsPtrSessionRef/);
    assert.match(userProfileSrc, /notificationsPtrAliveRef/);
    assert.match(userProfileSrc, /activeTab === "notifications"/);
    assert.match(userProfileSrc, /resolvePending\?\.\(\)/);
    assert.match(userProfileSrc, /session !== notificationsPtrSessionRef\.current/);
  });
});

describe("PROFILE-NOTIFICATIONS-PTR-4 faster refresh spin + commit haptic", () => {
  it("pulling uses finger-led rotate; committed refresh uses dedicated 700ms spin", () => {
    assert.equal(PROFILE_NOTIFICATIONS_PTR_PULL_ROTATE_DEG_PER_PX, 2);
    assert.equal(profileNotificationsPtrPullRotateDeg(28), 56);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_MS, 700);
    assert.match(PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_CLASS, /profile-notifications-ptr-refresh-spin/);
    assert.match(notifTabSrc, /profileNotificationsPtrPullRotateDeg\(pullDistance\)/);
    assert.match(notifTabSrc, /PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_CLASS/);
    assert.doesNotMatch(notifTabSrc, /animate-spin/);
    assert.doesNotMatch(notifTabSrc, /animationDuration:\s*"1\.6s"/);

    const spinCssStart = cssSrc.indexOf(".profile-notifications-ptr-refresh-spin");
    assert.ok(spinCssStart >= 0);
    const spinCss = cssSrc.slice(spinCssStart, spinCssStart + 280);
    assert.match(spinCss, /700ms linear infinite/);
    assert.match(cssSrc, /@keyframes profile-notifications-ptr-refresh-spin/);
  });

  it("fires exactly one light commit haptic on threshold release, never on drag cross", () => {
    assert.match(ptrHapticsSrc, /playInteractionLight/);
    assert.doesNotMatch(ptrHapticsSrc, /ImpactStyle\.Heavy|playPullRefreshThresholdHaptic/);
    assert.doesNotThrow(() => playNotificationsPtrRefreshCommitHaptic());

    const commitBlock = userProfileSrc.slice(
      userProfileSrc.indexOf("const heldHeight = profileNotificationsPtrHoldHeightPx"),
      userProfileSrc.indexOf("const handleNotificationsTouchCancel"),
    );
    assert.match(commitBlock, /playNotificationsPtrRefreshCommitHaptic\(\)/);
    assert.equal(
      (commitBlock.match(/playNotificationsPtrRefreshCommitHaptic\(\)/g) ?? []).length,
      1,
    );

    const touchMoveFn = userProfileSrc.slice(
      userProfileSrc.indexOf("const handleNotificationsTouchMove"),
      userProfileSrc.indexOf("const handleNotificationsTouchEnd"),
    );
    assert.doesNotMatch(touchMoveFn, /playNotificationsPtrRefreshCommitHaptic|playInteractionLight/);

    const belowThresholdBlock = userProfileSrc.slice(
      userProfileSrc.indexOf("if (!crossed)"),
      userProfileSrc.indexOf("const heldHeight = profileNotificationsPtrHoldHeightPx"),
    );
    assert.doesNotMatch(belowThresholdBlock, /playNotificationsPtrRefreshCommitHaptic/);

    assert.doesNotMatch(userProfileSrc, /completeNotificationsPullAfterRefresh[\s\S]{0,400}playNotificationsPtrRefreshCommitHaptic/);
    assert.doesNotMatch(
      userProfileSrc,
      /Refresh failed[\s\S]{0,200}playNotificationsPtrRefreshCommitHaptic/,
    );
  });

  it("does not touch Home PTR haptics or spinner ownership", () => {
    assert.match(homeSrc, /triggerPullRefreshCommittedHaptic/);
    assert.match(pullRefreshHapticsSrc, /playPullRefreshThresholdHaptic/);
    assert.doesNotMatch(userProfileSrc, /triggerPullRefreshCommittedHaptic|pull-refresh-haptics/);
    assert.doesNotMatch(homeSrc, /playNotificationsPtrRefreshCommitHaptic|PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN/);
    assert.doesNotMatch(homePullSrc, /profile-notifications-ptr-refresh-spin/);
  });

  it("keeps PTR math / hold / min-visible / pager / mask contracts", () => {
    assert.equal(PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX, 56);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_MAX_VISUAL_PX, 108);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_GAIN, 0.6);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS, 1000);
    assert.equal(PROFILE_NOTIFICATIONS_PTR_SNAP_MS, 240);
    assert.equal(PROFILE_TAB_SWIPE_EDGE_START_PX, 24);
    assert.equal(PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.match(cssSrc, /\.profile-notifications-top-mask/);
  });
});

describe("PROFILE-NOTIFICATIONS-PTR-2 pager + mask isolation", () => {
  it("does not change Profile pager vertical-cancel / arm constants", () => {
    assert.equal(PROFILE_TAB_SWIPE_EDGE_START_PX, 24);
    assert.equal(PROFILE_TAB_SWIPE_DRAG_START_PX, 12);
    assert.equal(PROFILE_TAB_SWIPE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.match(swipeSrc, /event\.preventDefault\(\)/);
    assert.match(swipeSrc, /if \(!state\.armed\)/);
    assert.match(
      swipeSrc,
      /absY > PROFILE_TAB_SWIPE_MAX_VERTICAL_DRIFT_PX && absY > absX/,
    );
  });

  it("leaves notifications top mask CSS unchanged", () => {
    const start = cssSrc.indexOf(".profile-notifications-top-mask");
    assert.ok(start >= 0);
    const block = cssSrc.slice(start, start + 900);
    assert.match(block, /transparent 0/);
    assert.match(block, /rgba\(0, 0, 0, 0\.25\) 12px/);
    assert.match(block, /#000 48px/);
  });

  it("does not reuse Home PTR hook ownership", () => {
    assert.match(homePullSrc, /export function usePullToRefresh/);
    assert.doesNotMatch(userProfileSrc, /from "@\/hooks\/use-pull-to-refresh"/);
  });
});
