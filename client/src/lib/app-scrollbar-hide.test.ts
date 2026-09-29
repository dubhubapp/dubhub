/**
 * APP-SCROLLBAR-1 — app-owned vertical scrollers keep overflow and hide the bar.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_PAGE_SCROLL_CLASS } from "./app-shell-layout";
import { LEADERBOARD_PAGE_SCROLL_CLASS } from "./leaderboard-presentation";
import { MODERATOR_PAGE_SCROLL_CLASS } from "./moderator-presentation";
import { PROFILE_PAGE_SCROLL_CLASS } from "./profile-grid-window";
import { PROFILE_NOTIFICATIONS_VIEWPORT_CLASS } from "./profile-notifications-presentation";
import { RELEASE_TRACKER_PAGE_CLASS } from "./release-tracker-presentation";
import { SETTINGS_PAGE_SCROLL_CLASS } from "./settings-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const diagnosticsSrc = readFileSync(join(here, "../pages/settings-developer-diagnostics.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const moderatorSrc = readFileSync(join(here, "../pages/moderator.tsx"), "utf8");
const submitSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const formDrawerSrc = readFileSync(join(here, "../components/release-form-drawer.tsx"), "utf8");

const createScroll =
  "flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-none scrollbar-hide dubhub-app-form-canvas";
const detailScroll =
  "flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-none scrollbar-hide";
const commentsList = "h-full overflow-y-auto px-3.5 pb-6 sm:px-4 scrollbar-hide";

describe("app scrollbar hide", () => {
  it("uses the shared scrollbar-hide rule", () => {
    assert.match(cssSrc, /\.scrollbar-hide[\s\S]*scrollbar-width:\s*none/);
    assert.match(cssSrc, /\.scrollbar-hide::-webkit-scrollbar[\s\S]*display:\s*none/);
    assert.match(APP_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(APP_PAGE_SCROLL_CLASS, /overscroll-y-none/);
    assert.match(APP_PAGE_SCROLL_CLASS, /scrollbar-hide/);
  });

  it("hides Release Create, Edit, and Detail scrollbars on the same overflow owner", () => {
    assert.match(createSrc, new RegExp(createScroll.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(editSrc, new RegExp(createScroll.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(detailSrc, new RegExp(detailScroll.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(createSrc, /overflow-y-auto overscroll-x-none overscroll-y-none/);
    assert.match(editSrc, /overflow-y-auto overscroll-x-none overscroll-y-none/);
    assert.match(detailSrc, /overflow-y-auto overscroll-y-none/);
  });

  it("hides Releases, Own Profile, Settings, Leaderboard, Moderator, and Submit metadata", () => {
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /overflow-y-auto/);
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /overscroll-y-none/);
    assert.match(RELEASE_TRACKER_PAGE_CLASS, /scrollbar-hide/);
    assert.match(PROFILE_PAGE_SCROLL_CLASS, /scrollbar-hide/);
    assert.match(PROFILE_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(profileSrc, /PROFILE_PAGE_SCROLL_CLASS/);
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /scrollbar-hide/);
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(settingsSrc, /SETTINGS_PAGE_SCROLL_CLASS/);
    assert.match(diagnosticsSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(LEADERBOARD_PAGE_SCROLL_CLASS, /scrollbar-hide/);
    assert.match(LEADERBOARD_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(leaderboardSrc, /LEADERBOARD_PAGE_SCROLL_CLASS/);
    assert.match(MODERATOR_PAGE_SCROLL_CLASS, /scrollbar-hide/);
    assert.match(MODERATOR_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(moderatorSrc, /MODERATOR_PAGE_SCROLL_CLASS/);
    assert.match(submitSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(APP_PAGE_SCROLL_CLASS, /overflow-y-auto/);
  });

  it("hides the portaled comments thread list without taking page scroll ownership", () => {
    assert.match(commentsSrc, new RegExp(commentsList.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(commentsSrc, /overflow-y-auto/);
    assert.doesNotMatch(commentsSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(formDrawerSrc, /overflow-y-auto overscroll-contain scrollbar-hide/);
  });

  it("keeps Public Profile, Home PTR, and Notifications PTR ownership", () => {
    const scrollFn = publicProfileSrc.slice(
      publicProfileSrc.indexOf("function publicProfilePageScrollClass"),
      publicProfileSrc.indexOf("const PUBLIC_PROFILE_GENRE_VALUE_PILL_CLASS"),
    );
    assert.match(scrollFn, /APP_PAGE_SCROLL_CLASS/);
    assert.match(scrollFn, /scrollbar-hide/);
    assert.match(scrollFn, /overflow-x-hidden/);
    assert.match(
      homeSrc,
      /overflow-y-auto overscroll-y-none bg-black scrollbar-hide \[overscroll-behavior-y:none\]/,
    );
    assert.doesNotMatch(homeSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /overflow-y-auto/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /overscroll-y-none/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /\[overscroll-behavior-y:none\]/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /scrollbar-hide/);
    assert.match(profileSrc, /PROFILE_NOTIFICATIONS_VIEWPORT_CLASS/);
  });
});
