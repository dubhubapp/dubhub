import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_PRIMARY_NAV_GROUP_CLASS,
  PROFILE_PRIMARY_NAV_ICON_CLASS,
  PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS,
  PROFILE_PRIMARY_NAV_INDICATOR_CLASS,
  PROFILE_PRIMARY_NAV_INDICATOR_TAP_MS,
  PROFILE_PRIMARY_NAV_LABEL_CLASS,
  PROFILE_PRIMARY_NAV_LIST_CLASS,
  PROFILE_PRIMARY_NAV_SHELL_CLASS,
  PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS,
} from "./profile-primary-nav-presentation";
import { PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS } from "./profile-posts-filter-presentation";
import {
  PROFILE_TAB_PAGER_SNAP_EASING,
  PROFILE_TAB_PAGER_SNAP_MS,
  interpolateProfileNavIndicator,
  lerpProfileNav,
  profilePagerDragProgress,
} from "./profile-tab-swipe";

const root = join(dirname(fileURLToPath(import.meta.url)), "../pages/user-profile.tsx");
const userProfileSrc = readFileSync(root, "utf8");
const bannerPresentationSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "./profile-banner-presentation.tsx"),
  "utf8",
);
const primaryNavSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "./profile-primary-nav-presentation.ts"),
  "utf8",
);
const swipeSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "./profile-tab-swipe.ts"),
  "utf8",
);

describe("profile-primary-nav-presentation", () => {
  it("uses a non-sticky document shell without sticky chrome (C5B.2)", () => {
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /sticky/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /safe-area-inset-top/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /backdrop-blur/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /dubhub-app-releases-sticky/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /z-30/);
    assert.match(PROFILE_PRIMARY_NAV_SHELL_CLASS, /relative/);
    assert.match(PROFILE_PRIMARY_NAV_SHELL_CLASS, /z-10/);
    assert.match(PROFILE_PRIMARY_NAV_SHELL_CLASS, /-mx-6/);
    assert.match(PROFILE_PRIMARY_NAV_SHELL_CLASS, /mb-3/);
  });

  it("keeps >=44pt equal-width triggers without segment fill", () => {
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /min-h-11/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /flex-1/);
    assert.match(PROFILE_PRIMARY_NAV_LIST_CLASS, /flex/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /bg-accent|border-white\/10|rounded-xl/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /data-\[state=active\]:bg-transparent/);
  });

  it("uses shared indicator chrome instead of per-trigger ::after (PROFILE-TABS-3B)", () => {
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_GROUP_CLASS, /after:/);
    assert.match(PROFILE_PRIMARY_NAV_GROUP_CLASS, /pb-\[5px\]/);
    assert.match(PROFILE_PRIMARY_NAV_INDICATOR_CLASS, /h-\[3px\]/);
    assert.match(PROFILE_PRIMARY_NAV_INDICATOR_CLASS, /bg-\[#0a83ff\]/);
    assert.match(PROFILE_PRIMARY_NAV_INDICATOR_CLASS, /pointer-events-none/);
    assert.match(PROFILE_PRIMARY_NAV_INDICATOR_CLASS, /rounded-full/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:h-0\.5/);
    assert.match(PROFILE_PRIMARY_NAV_ICON_CLASS, /h-3\.5 w-3\.5/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_LABEL_CLASS, /after:/);
  });

  it("uses one 14px centred icon slot and leading-none labels", () => {
    assert.match(PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS, /h-3\.5 w-3\.5/);
    assert.match(PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS, /items-center/);
    assert.match(PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS, /justify-center/);
    assert.match(PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS, /-translate-y-px/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS, /-translate-y-0\.5|-translate-y-px-/);
    assert.match(PROFILE_PRIMARY_NAV_GROUP_CLASS, /items-center/);
    assert.match(PROFILE_PRIMARY_NAV_LABEL_CLASS, /leading-none/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_LABEL_CLASS, /translate-y/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_ICON_CLASS, /translate-y/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS, /-m[tblrxy]?-/);
  });

  it("removes painted nav fade overlay (PROFILE-TABS-2A-FIX-3)", () => {
    assert.doesNotMatch(primaryNavSrc, /PROFILE_PRIMARY_NAV_FADE_CLASS|PROFILE_PRIMARY_NAV_FADE_STYLE/);
    assert.doesNotMatch(primaryNavSrc, /rgba\(15,19,36/);
    assert.doesNotMatch(primaryNavSrc, /bg-background\/50|bg-background\/35|backdrop-blur/);
    assert.doesNotMatch(userProfileSrc, /PROFILE_PRIMARY_NAV_FADE_|profile-primary-nav-fade/);
    assert.doesNotMatch(userProfileSrc, /PROFILE_PRIMARY_NAV_STICKY_FADE_CLASS/);
  });
});

describe("profile primary nav indicator (PROFILE-TABS-3B)", () => {
  it("interpolates left/width between unequal triggers", () => {
    assert.equal(lerpProfileNav(10, 30, 0.5), 20);
    const mid = interpolateProfileNavIndicator(
      { left: 0, width: 40 },
      { left: 100, width: 80 },
      0.5,
    );
    assert.equal(mid.left, 50);
    assert.equal(mid.width, 60);
  });

  it("keeps edge drag progress at 0 without adjacent", () => {
    assert.equal(
      profilePagerDragProgress({
        deltaX: 40,
        rubberDx: 11.2,
        viewportWidth: 390,
        hasAdjacent: false,
      }),
      0,
    );
    assert.ok(
      profilePagerDragProgress({
        deltaX: -195,
        rubberDx: -195,
        viewportWidth: 390,
        hasAdjacent: true,
      }) >= 0.5,
    );
  });

  it("wires one shared indicator and removes per-trigger Profile underline", () => {
    assert.match(userProfileSrc, /data-testid="profile-primary-nav-indicator"/);
    assert.equal(
      (userProfileSrc.match(/data-testid="profile-primary-nav-indicator"/g) ?? []).length,
      1,
    );
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_INDICATOR_CLASS/);
    assert.match(userProfileSrc, /data-profile-nav-group/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_GROUP_CLASS, /group-data-\[state=active\]:after/);
    assert.match(userProfileSrc, /onPagerProgress: handleProfilePagerProgress/);
    assert.match(swipeSrc, /onPagerProgress/);
    assert.match(swipeSrc, /ProfilePagerProgressEvent/);
    assert.equal(PROFILE_TAB_PAGER_SNAP_MS, 400);
    assert.equal(PROFILE_TAB_PAGER_SNAP_EASING, "cubic-bezier(0.32, 0.45, 0.42, 1)");
    assert.equal(PROFILE_PRIMARY_NAV_INDICATOR_TAP_MS, 200);
  });

  it("list hosts the indicator; activeTab remains sole authority", () => {
    assert.match(PROFILE_PRIMARY_NAV_LIST_CLASS, /relative/);
    assert.match(userProfileSrc, /handleProfileTabChange/);
    assert.match(userProfileSrc, /onCommitTab: handleProfileTabChange/);
    assert.match(userProfileSrc, /syncProfileNavIndicatorToTab\(tabsValue/);
  });
});

describe("user-profile primary nav wiring", () => {
  it("keeps four tabs, forceMount, and notification deep-link", () => {
    assert.match(userProfileSrc, /data-testid="tab-profile"/);
    assert.match(userProfileSrc, /data-testid="tab-posts"/);
    assert.match(userProfileSrc, /data-testid="tab-liked"/);
    assert.match(userProfileSrc, /data-testid="tab-notifications"/);
    assert.match(userProfileSrc, /value="posts"[\s\S]*forceMount/);
    assert.match(userProfileSrc, /value="liked"[\s\S]*forceMount/);
    assert.match(userProfileSrc, /PROFILE_OPEN_NOTIFICATIONS_TAB_EVENT/);
    assert.match(userProfileSrc, /consumeProfileNotificationsTabIntent/);
  });

  it("exposes full Notifications accessible name and keeps Notif. label", () => {
    assert.match(userProfileSrc, /aria-label=\{/);
    assert.match(userProfileSrc, /"Notifications"/);
    assert.match(userProfileSrc, /Notif\./);
  });

  it("wires non-sticky shell without decorative fade node", () => {
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_SHELL_CLASS/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /sticky/);
    assert.doesNotMatch(userProfileSrc, /data-testid="profile-primary-nav-fade"/);
  });

  it("leaves Posts secondary filter and hero identity markers intact", () => {
    assert.match(userProfileSrc, /profile-posts-filter-presentation/);
    assert.match(userProfileSrc, /testId="profile-posts-filter"/);
    assert.match(userProfileSrc, /data-testid="profile-banner"/);
    assert.match(userProfileSrc, /data-testid="profile-key-stats"/);
    assert.match(userProfileSrc, /data-testid="artist-profile-actions"/);
    assert.match(userProfileSrc, /shareLabel="Share Profile"/);
  });

  it("preserves banner dissolve contract unchanged", () => {
    assert.match(userProfileSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE/);
    assert.match(bannerPresentationSrc, /PROFILE_BANNER_UPLOADED_DISSOLVE/);
    assert.match(bannerPresentationSrc, /#0f1324|0f1324/);
  });

  it("uses shared page-scroll clearance so Settings can sit above native nav", () => {
    assert.match(userProfileSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(userProfileSrc, /data-testid="button-settings"/);
  });

  it("wraps all four tab icons in the same slot with no per-tab nudge", () => {
    assert.equal(
      (userProfileSrc.match(/className=\{PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS\}/g) ?? []).length,
      4,
    );
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS[\s\S]{0,80}<User /);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS[\s\S]{0,80}<Upload /);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS[\s\S]{0,80}<Heart /);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS[\s\S]{0,80}<Bell /);
    assert.doesNotMatch(userProfileSrc, /<(User|Upload|Heart|Bell) className=\{PROFILE_PRIMARY_NAV_ICON_CLASS\}[^>]*translate/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_ICON_CLASS, /translate-y|-mt-/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_GROUP_CLASS/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_GROUP_CLASS, /after:h-\[3px\]/);
  });
});

describe("PROFILE-SWIPE-POLISH-2 — fixed font weight + visual emphasis wiring", () => {
  it("A/B: all Profile labels use fixed font-semibold (no weight switch)", () => {
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /font-semibold/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /text-white\/55/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /data-\[state=active\]:text-foreground/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /font-medium/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /data-\[state=active\]:font-semibold/);
    assert.match(primaryNavSrc, /active \+ inactive share `font-semibold`/);
  });

  it("G: successful commit has no typography shift (fixed weight)", () => {
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /data-\[state=active\]:font-/);
    assert.match(userProfileSrc, /clearProfilePrimaryTabVisualEmphasis/);
  });

  it("wires trigger refs for imperative color lerp", () => {
    assert.match(userProfileSrc, /profileTabTriggerRefs/);
    assert.match(userProfileSrc, /profilePrimaryTabEmphasisColor\(emphasis\)/);
    assert.match(userProfileSrc, /applyProfilePrimaryTabVisualEmphasis/);
  });
});
