import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_PRIMARY_NAV_ICON_CLASS,
  PROFILE_PRIMARY_NAV_LABEL_CLASS,
  PROFILE_PRIMARY_NAV_LIST_CLASS,
  PROFILE_PRIMARY_NAV_STICKY_FADE_CLASS,
  PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS,
  PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS,
} from "./profile-primary-nav-presentation";
import { PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS } from "./profile-posts-filter-presentation";
import { STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS } from "./sticky-tab-chrome";

const root = join(dirname(fileURLToPath(import.meta.url)), "../pages/user-profile.tsx");
const userProfileSrc = readFileSync(root, "utf8");

describe("profile-primary-nav-presentation", () => {
  it("uses Profile safe-area sticky top offset (not Leaderboard top-0 padding model)", () => {
    assert.match(
      PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS,
      /sticky top-\[calc\(env\(safe-area-inset-top,0px\)\+0\.5rem\)\]/,
    );
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS, /top-0/);
    assert.doesNotMatch(
      PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS,
      /pt-\[calc\(env\(safe-area-inset-top/,
    );
  });

  it("frosted shell without capsule border or radius", () => {
    assert.match(PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS, /backdrop-blur-md/);
    assert.match(PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS, /bg-\[var\(--dark\)\]\/80/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS, /rounded-2xl|border-white\/10/);
  });

  it("reuses proven sticky dissolve fade utility", () => {
    assert.equal(PROFILE_PRIMARY_NAV_STICKY_FADE_CLASS, STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS);
  });

  it("keeps >=44pt equal-width triggers without segment fill", () => {
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /min-h-11/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /flex-1/);
    assert.match(PROFILE_PRIMARY_NAV_LIST_CLASS, /flex/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /bg-accent|border-white\/10|rounded-xl/);
    assert.match(PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS, /data-\[state=active\]:bg-transparent/);
  });

  it("uses stronger primary underline than Posts secondary", () => {
    assert.match(PROFILE_PRIMARY_NAV_LABEL_CLASS, /after:h-\[3px\]/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:h-\[2px\]/);
    assert.match(PROFILE_PRIMARY_NAV_ICON_CLASS, /h-3\.5 w-3\.5/);
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

  it("removes old segmented fill chrome from primary triggers", () => {
    assert.doesNotMatch(
      userProfileSrc,
      /data-\[state=active\]:bg-accent data-\[state=active\]:font-semibold data-\[state=active\]:text-accent-foreground data-\[state=active\]:shadow-\[0_0_0_1px_rgba\(34,211,238/,
    );
    assert.doesNotMatch(
      userProfileSrc,
      /rounded-2xl border border-white\/10 bg-black\/35 backdrop-blur-md p-1/,
    );
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS/);
  });

  it("leaves Posts secondary filter and hero identity markers intact", () => {
    assert.match(userProfileSrc, /profile-posts-filter-presentation/);
    assert.match(userProfileSrc, /data-testid="profile-posts-filter"/);
    assert.match(userProfileSrc, /data-testid="profile-banner"/);
    assert.match(userProfileSrc, /data-testid="profile-key-stats"/);
    assert.match(userProfileSrc, /data-testid="artist-profile-actions"/);
    assert.match(userProfileSrc, /shareLabel="Share Profile"/);
  });
});
