/**
 * APP-SCROLL-2 — normal routed pages use overscroll-y-none.
 * Home PTR and nested sheet/modal scrollers stay outside this contract.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_PAGE_SCROLL_CLASS } from "./app-shell-layout";
import { RELEASE_TRACKER_PAGE_CLASS } from "./release-tracker-presentation";
import { SETTINGS_PAGE_SCROLL_CLASS } from "./settings-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const pullSrc = readFileSync(join(here, "../hooks/use-pull-to-refresh.ts"), "utf8");
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const releaseDetailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const releaseCreateSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const releaseEditSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const releaseSkeletonSrc = readFileSync(join(here, "../components/release-detail-skeleton.tsx"), "utf8");
const formDrawerSrc = readFileSync(join(here, "../components/release-form-drawer.tsx"), "utf8");
const linksSheetSrc = readFileSync(join(here, "../components/release-links-sheet.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const appDelegateSrc = readFileSync(join(here, "../../../ios/App/App/AppDelegate.swift"), "utf8");
const sceneSrc = readFileSync(join(here, "../../../ios/App/App/SceneDelegate.swift"), "utf8");

describe("APP-SCROLL-2 shared normal-page overscroll", () => {
  it("APP_PAGE_SCROLL_CLASS uses overscroll-y-none, not contain", () => {
    assert.match(APP_PAGE_SCROLL_CLASS, /overscroll-y-none/);
    assert.doesNotMatch(APP_PAGE_SCROLL_CLASS, /overscroll-y-contain/);
    assert.match(APP_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(APP_PAGE_SCROLL_CLASS, /flex-1/);
    assert.match(APP_PAGE_SCROLL_CLASS, /min-h-0/);
    assert.doesNotMatch(APP_PAGE_SCROLL_CLASS, /(?:^|\s)overscroll-none(?:\s|$)/);
  });

  it("Settings inherits the shared y-none contract", () => {
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /overscroll-y-none/);
    assert.doesNotMatch(SETTINGS_PAGE_SCROLL_CLASS, /overscroll-y-contain/);
  });

  it("does not apply overscroll via descendant selectors", () => {
    assert.doesNotMatch(cssSrc, /main\s+\[overflow-y-auto\]/);
    assert.doesNotMatch(cssSrc, /\[data-app-shell\][^{]*overflow-y-auto[^{]*overscroll/);
  });
});

describe("APP-SCROLL-2 Releases + release form page roots", () => {
  it("RELEASE_TRACKER_PAGE_CLASS uses y-none only", () => {
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /overscroll-y-none/);
    assert.doesNotMatch(RELEASE_TRACKER_PAGE_CLASS, /(?:^|\s)overscroll-none(?:\s|$)/);
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /overflow-y-auto/);
  });

  it("Release Detail / Create / Edit page scrollers use overscroll-y-none", () => {
    assert.match(releaseDetailSrc, /overflow-y-auto overscroll-y-none/);
    assert.match(releaseCreateSrc, /overflow-y-auto overscroll-x-none overscroll-y-none/);
    assert.match(releaseEditSrc, /overflow-y-auto overscroll-x-none overscroll-y-none/);
    assert.match(releaseSkeletonSrc, /overflow-y-auto overscroll-y-none/);
  });

  it("does not put the page token on nested release sheets", () => {
    assert.doesNotMatch(formDrawerSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(linksSheetSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(formDrawerSrc, /overscroll-contain/);
    assert.match(linksSheetSrc, /overscroll-contain/);
  });
});

describe("APP-SCROLL-2 Home PTR isolation", () => {
  it("Home does not use APP_PAGE_SCROLL_CLASS", () => {
    assert.doesNotMatch(homeSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(homeSrc, /app-shell-layout/);
  });

  it("keeps custom Home PTR: 56px threshold, spacer, touch handlers, feed none", () => {
    assert.match(pullSrc, /const DEFAULT_THRESHOLD_PX = 56/);
    assert.match(homeSrc, /usePullToRefresh/);
    assert.match(homeSrc, /data-home-video-feed/);
    assert.match(homeSrc, /homeFeedPullTouchHandlers/);
    assert.match(homeSrc, /homePullSpacerHeightPx/);
    assert.match(
      homeSrc,
      /overflow-y-auto overscroll-y-none bg-black scrollbar-hide \[overscroll-behavior-y:none\]/,
    );
  });
});

describe("APP-SCROLL-2 Profile Notifications inner PTR", () => {
  it("outer Profile uses the shared page token; inner list keeps custom PTR with overscroll none", () => {
    assert.match(profileSrc, /PROFILE_PAGE_SCROLL_CLASS/);
    assert.match(profileSrc, /handleNotificationsTouchStart/);
    assert.match(profileSrc, /handleNotificationsTouchMove/);
    assert.match(profileSrc, /handleNotificationsTouchEnd/);
    assert.match(profileSrc, /handleNotificationsTouchCancel/);
    assert.match(profileSrc, /PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX/);
    assert.match(profileSrc, /refreshNewerNotifications\(\)/);
    assert.match(profileSrc, /pullDistance/);
    assert.match(profileSrc, /profileNotificationsRubberBandPull/);
    assert.doesNotMatch(profileSrc, /Math\.min\(96,\s*delta \* 0\.45\)/);
    assert.doesNotMatch(profileSrc, /const threshold = 52/);
  });
});

describe("APP-SCROLL-2 modal / sheet / native exclusions", () => {
  it("Comments list does not inherit the page token", () => {
    assert.doesNotMatch(commentsSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(commentsSrc, /overscroll-y-none/);
  });

  it("does not set native WKWebView bounce", () => {
    assert.doesNotMatch(appDelegateSrc, /bounces/);
    assert.doesNotMatch(sceneSrc, /bounces/);
  });
});
