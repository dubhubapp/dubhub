import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_PRIMARY_NAV_GROUP_CLASS,
  PROFILE_PRIMARY_NAV_ICON_CLASS,
  PROFILE_PRIMARY_NAV_LABEL_CLASS,
  PROFILE_PRIMARY_NAV_LIST_CLASS,
  PROFILE_PRIMARY_NAV_SHELL_CLASS,
  PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS,
} from "./profile-primary-nav-presentation";
import { PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS } from "./profile-posts-filter-presentation";

const root = join(dirname(fileURLToPath(import.meta.url)), "../pages/user-profile.tsx");
const userProfileSrc = readFileSync(root, "utf8");

describe("profile-primary-nav-presentation", () => {
  it("uses a non-sticky document shell without sticky chrome (C5B.2)", () => {
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /sticky/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /safe-area-inset-top/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /backdrop-blur/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /dubhub-app-releases-sticky/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_SHELL_CLASS, /z-30/);
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

  it("uses brighter primary underline than Posts secondary with interactive blue", () => {
    assert.match(PROFILE_PRIMARY_NAV_GROUP_CLASS, /after:h-\[3px\]/);
    assert.match(PROFILE_PRIMARY_NAV_GROUP_CLASS, /after:bg-\[#0a83ff\]/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:h-\[2px\]/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:bg-\[#0a83ff\]/);
    assert.match(PROFILE_PRIMARY_NAV_ICON_CLASS, /h-3\.5 w-3\.5/);
    assert.doesNotMatch(PROFILE_PRIMARY_NAV_LABEL_CLASS, /after:/);
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

  it("wires non-sticky shell and drops sticky fade artefact", () => {
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_SHELL_CLASS/);
    assert.match(userProfileSrc, /PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS/);
    assert.doesNotMatch(userProfileSrc, /PROFILE_PRIMARY_NAV_STICKY_FADE_CLASS/);
    assert.doesNotMatch(userProfileSrc, /leaderboard-sticky-blur-dissolve/);
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
