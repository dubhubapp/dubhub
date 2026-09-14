/**
 * NOTIFICATIONS-PREMIUM-2 — Profile Notifications presentation contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_MATERIAL_INTERACTIVE_BLUE } from "./app-material";
import {
  PROFILE_NOTIFICATION_BODY_CLASS,
  PROFILE_NOTIFICATION_BODY_UNREAD_CLASS,
  PROFILE_NOTIFICATION_GROUP_COUNT_CLASS,
  PROFILE_NOTIFICATION_INTERACTIVE_BLUE,
  PROFILE_NOTIFICATION_MEDIA_FALLBACK_ICON_CLASS,
  PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS,
  PROFILE_NOTIFICATION_ROW_SURFACE_CLASS,
  PROFILE_NOTIFICATION_SKELETON_MEDIA_CIRCLE_CLASS,
  PROFILE_NOTIFICATION_SKELETON_MEDIA_SQUARE_CLASS,
  PROFILE_NOTIFICATION_SKELETON_ROW_CLASS,
  PROFILE_NOTIFICATION_UNREAD_DOT_CLASS,
  PROFILE_NOTIFICATION_UNREAD_SURFACE_CLASS,
  PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS,
  PROFILE_NOTIFICATIONS_TAB_CONTENT_CLASS,
  PROFILE_NOTIFICATIONS_VIEWPORT_CLASS,
  getProfileNotificationBodyClass,
  getProfileNotificationUnreadSurfaceClass,
} from "./profile-notifications-presentation";
import { PROFILE_PRIMARY_NAV_SHELL_CLASS } from "./profile-primary-nav-presentation";
import { getReleaseAlertEnabledThumbnailPresentation } from "./release-alert-enabled-thumbnail";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const presentationSrc = readFileSync(join(here, "./profile-notifications-presentation.ts"), "utf8");
const personThumbSrc = readFileSync(join(here, "./release-alert-enabled-thumbnail.ts"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

/** Notifications tab JSX region only — avoids matching Overview/Posts chrome. */
function notificationsTabSrc(src: string): string {
  const start = src.indexOf('{/* Notifications Tab */}');
  assert.ok(start >= 0, "Notifications Tab marker missing");
  const end = src.indexOf("</TabsContent>", start);
  assert.ok(end > start, "Notifications TabsContent close missing");
  return src.slice(start, end);
}

const notifTabSrc = notificationsTabSrc(userProfileSrc);

describe("profile-notifications-presentation unread", () => {
  it("uses one interactive-blue unread wash (~5–8%)", () => {
    assert.equal(PROFILE_NOTIFICATION_INTERACTIVE_BLUE, APP_MATERIAL_INTERACTIVE_BLUE);
    assert.equal(PROFILE_NOTIFICATION_INTERACTIVE_BLUE, "#0a83ff");
    assert.match(PROFILE_NOTIFICATION_UNREAD_SURFACE_CLASS, /bg-\[#0a83ff\]\/\[0\.07\]/);
    assert.equal(getProfileNotificationUnreadSurfaceClass(true), PROFILE_NOTIFICATION_UNREAD_SURFACE_CLASS);
    assert.equal(getProfileNotificationUnreadSurfaceClass(false), "");
  });

  it("unread disc uses interactive blue, not white/amber/green", () => {
    assert.match(PROFILE_NOTIFICATION_UNREAD_DOT_CLASS, /bg-\[#0a83ff\]/);
    assert.match(PROFILE_NOTIFICATION_UNREAD_DOT_CLASS, /h-2 w-2/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_UNREAD_DOT_CLASS, /bg-primary|bg-amber|bg-green|bg-white/);
  });

  it("presentation module forbids category unread washes", () => {
    assert.doesNotMatch(presentationSrc, /bg-amber-500/);
    assert.doesNotMatch(presentationSrc, /bg-green-500/);
    assert.doesNotMatch(presentationSrc, /#4ae9df/);
  });
});

describe("profile-notifications-presentation media", () => {
  it("square media uses 56px rounded-lg material frame", () => {
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /h-14 w-14/);
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /rounded-lg/);
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /border-white\/10/);
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /bg-black\/25/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /bg-gray-800/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /(?:^|\s)rounded(?:\s|$)/);
  });

  it("fallback icon is muted without glow", () => {
    assert.match(PROFILE_NOTIFICATION_MEDIA_FALLBACK_ICON_CLASS, /text-muted-foreground/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_MEDIA_FALLBACK_ICON_CLASS, /glow|shadow|\[#4ae9df\]/);
  });

  it("person-event avatar remains circular and aligned to 56px", () => {
    const presentation = getReleaseAlertEnabledThumbnailPresentation();
    assert.equal(presentation.shape, "circle");
    assert.match(presentation.listContainerClassName, /rounded-full/);
    assert.match(presentation.listContainerClassName, /h-14 w-14/);
    assert.match(presentation.listContainerClassName, /border-white\/10/);
    assert.doesNotMatch(presentation.listContainerClassName, /rounded-lg/);
    assert.doesNotMatch(presentation.listContainerClassName, /bg-gray-800/);
  });
});

describe("profile-notifications-presentation row chrome", () => {
  it("uses full-lane flat press wash without inset rounded card", () => {
    assert.match(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /min-h-11/);
    assert.match(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /w-full/);
    assert.match(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /gap-3/);
    assert.match(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /py-3/);
    assert.match(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /rounded-none/);
    assert.match(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /active:bg-black\/\[0\.04\]/);
    assert.match(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /dark:active:bg-white\/\[0\.04\]/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /rounded-lg/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /\bmx-2\b|\bmx-/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /shadow-|ring-\[#4ae9df\]|border-\[#4ae9df\]/);
  });

  it("group count pill stays quiet material wash", () => {
    assert.match(PROFILE_NOTIFICATION_GROUP_COUNT_CLASS, /bg-white\/\[0\.08\]/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_GROUP_COUNT_CLASS, /border|glow|shadow|#4ae9df/);
  });

  it("body hierarchy stays compact; unread may be medium", () => {
    assert.match(PROFILE_NOTIFICATION_BODY_CLASS, /text-sm/);
    assert.match(PROFILE_NOTIFICATION_BODY_UNREAD_CLASS, /font-medium/);
    assert.equal(getProfileNotificationBodyClass(true), PROFILE_NOTIFICATION_BODY_UNREAD_CLASS);
    assert.equal(getProfileNotificationBodyClass(false), PROFILE_NOTIFICATION_BODY_CLASS);
  });

  it("keeps unread wash and media rounding separate from row press", () => {
    assert.match(PROFILE_NOTIFICATION_UNREAD_SURFACE_CLASS, /bg-\[#0a83ff\]\/\[0\.07\]/);
    assert.match(PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS, /rounded-lg/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_ROW_SURFACE_CLASS, /rounded-lg/);
  });
});

describe("profile-notifications top content mask (PROFILE-TABS-2A-FIX-6)", () => {
  it("moves always-on mask to an outer shell above the scroller", () => {
    assert.match(PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS, /profile-notifications-top-mask/);
    assert.match(PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS, /-mt-12/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /\bmt-12\b/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /max-h-\[70dvh\]/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /overflow-y-auto/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /overscroll-y-none/);
    assert.doesNotMatch(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /profile-notifications-top-mask/);
    assert.doesNotMatch(PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS, /bg-background|rgba\(15,19,36|backdrop-blur/);
    assert.doesNotMatch(presentationSrc, /PROFILE_NOTIFICATIONS_TOP_SPACER|rgba\(15,19,36/);
  });

  it("CSS mask fades transparent → opaque over ~48px with WKWebView prefix", () => {
    assert.match(cssSrc, /\.profile-notifications-top-mask/);
    const start = cssSrc.indexOf(".profile-notifications-top-mask");
    assert.ok(start >= 0);
    const block = cssSrc.slice(start, start + 900);
    assert.match(block, /-webkit-mask-image/);
    assert.match(block, /mask-image/);
    assert.match(block, /transparent 0/);
    assert.match(block, /rgba\(0, 0, 0, 0\.25\) 12px/);
    assert.match(block, /rgba\(0, 0, 0, 0\.65\) 28px/);
    assert.match(block, /#000 48px/);
    assert.match(block, /#000 100%/);
    assert.doesNotMatch(block, /rgba\(15,19,36|bg-background|backdrop-blur/);
  });
});

describe("profile-notifications tab top spacing (PROFILE-TABS-2A-FIX-6)", () => {
  it("keeps Notifications ~4px under tabs without a content spacer", () => {
    assert.equal(PROFILE_NOTIFICATIONS_TAB_CONTENT_CLASS, "-mt-3");
    assert.match(PROFILE_PRIMARY_NAV_SHELL_CLASS, /mb-3/);
    assert.match(PROFILE_PRIMARY_NAV_SHELL_CLASS, /pb-1/);
    assert.doesNotMatch(presentationSrc, /PROFILE_NOTIFICATIONS_TOP_SPACER/);
    assert.doesNotMatch(userProfileSrc, /profile-notifications-top-spacer|PROFILE_NOTIFICATIONS_TOP_SPACER/);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS/);
    assert.match(userProfileSrc, /data-testid="profile-notifications-mask-shell"/);
    assert.match(
      userProfileSrc,
      /PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS[\s\S]*?PROFILE_NOTIFICATIONS_VIEWPORT_CLASS[\s\S]*?SETTINGS_ROWS_STACK_CLASS/,
    );
    // Other tabs share secondary-row top spacing (PROFILE-SECONDARY-NAV-1).
    assert.match(userProfileSrc, /value="posts"[\s\S]*?PROFILE_SECONDARY_ROW_TOP_CLASS/);
    assert.match(userProfileSrc, /value="liked"[\s\S]*?PROFILE_SECONDARY_ROW_TOP_CLASS/);
    assert.match(userProfileSrc, /PROFILE_OVERVIEW_SECTIONS_CLASS/);
    assert.match(
      userProfileSrc,
      /profilePagerPanelClass\(3,\s*PROFILE_NOTIFICATIONS_TAB_CONTENT_CLASS\)/,
    );
  });

  it("restores content with mt-12 so the list is not pushed down by the mask lift", () => {
    assert.match(PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS, /-mt-12/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /\bmt-12\b/);
    assert.doesNotMatch(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /pt-12|\bh-12\b/);
  });

  it("adds ~5px scrollable top padding so the first row clears the fade at rest (FIX-7)", () => {
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /pt-\[5px\]/);
    assert.match(PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS, /profile-notifications-top-mask/);
    assert.match(PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS, /-mt-12/);
    assert.doesNotMatch(presentationSrc, /PROFILE_NOTIFICATIONS_TOP_SPACER/);
    assert.match(cssSrc, /#000 48px/);
  });
});

describe("profile-notifications-presentation loading skeleton", () => {
  it("exports square + circle skeleton media matching live frames", () => {
    assert.match(PROFILE_NOTIFICATION_SKELETON_ROW_CLASS, /min-h-11/);
    assert.match(PROFILE_NOTIFICATION_SKELETON_ROW_CLASS, /w-full/);
    assert.doesNotMatch(PROFILE_NOTIFICATION_SKELETON_ROW_CLASS, /\bmx-2\b/);
    assert.match(PROFILE_NOTIFICATION_SKELETON_MEDIA_SQUARE_CLASS, /rounded-lg/);
    assert.match(PROFILE_NOTIFICATION_SKELETON_MEDIA_CIRCLE_CLASS, /rounded-full/);
    assert.match(PROFILE_NOTIFICATION_SKELETON_MEDIA_SQUARE_CLASS, /h-14 w-14/);
  });
});

describe("Profile Notifications tab wiring", () => {
  it("wires presentation helpers and skeleton loading", () => {
    assert.match(userProfileSrc, /from "@\/lib\/profile-notifications-presentation"/);
    assert.match(userProfileSrc, /ProfileNotificationsLoadingSkeleton/);
    assert.match(userProfileSrc, /getProfileNotificationUnreadSurfaceClass/);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS/);
    assert.match(userProfileSrc, /PROFILE_NOTIFICATION_UNREAD_DOT_CLASS/);
    assert.match(notifTabSrc, /ProfileNotificationsLoadingSkeleton/);
    assert.match(userProfileSrc, /data-testid="profile-notifications-skeleton"/);
    assert.doesNotMatch(notifTabSrc, /Loading notifications\.\.\./);
    assert.doesNotMatch(
      notifTabSrc,
      /isInitialNotificationsLoading[\s\S]{0,200}InlineSpinner/,
    );
  });

  it("removes amber/green category unread washes from the tab", () => {
    assert.doesNotMatch(notifTabSrc, /bg-amber-500/);
    assert.doesNotMatch(notifTabSrc, /bg-green-500\/\[0\./);
    assert.doesNotMatch(notifTabSrc, /bg-amber-400/);
    assert.doesNotMatch(notifTabSrc, /bg-primary/);
    assert.doesNotMatch(notifTabSrc, /bg-gray-800/);
    assert.doesNotMatch(notifTabSrc, /#4ae9df/);
  });

  it("keeps circular person avatar and collab trailing icons", () => {
    assert.match(notifTabSrc, /release-alert-enabled-avatar/);
    assert.match(notifTabSrc, /getReleaseAlertEnabledThumbnailPresentation/);
    assert.match(notifTabSrc, /CheckCircle/);
    assert.match(notifTabSrc, /text-green-500/);
    assert.match(notifTabSrc, /text-amber-500/);
  });

  it("does not change mark-read, grouping, or tap routing in this slice", () => {
    assert.match(userProfileSrc, /markAllNotificationsAsReadMutation/);
    assert.match(userProfileSrc, /markAllReadOnNotificationsTabRef/);
    assert.match(userProfileSrc, /handleGroupedNotificationClick/);
    assert.match(userProfileSrc, /buildNotificationListGroupKey/);
    assert.match(userProfileSrc, /handleNotificationClick/);
    assert.doesNotMatch(userProfileSrc, /getNotificationTapRoute/);
  });

  it("leaves nested list scroller (pagination + pull-to-refresh bound to it)", () => {
    assert.match(notifTabSrc, /PROFILE_NOTIFICATIONS_VIEWPORT_CLASS/);
    assert.match(notifTabSrc, /data-testid="profile-notifications-viewport"/);
    assert.match(userProfileSrc, /handleNotificationsScroll/);
    assert.match(userProfileSrc, /loadOlderNotifications/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /overscroll-y-none/);
    assert.match(PROFILE_NOTIFICATIONS_VIEWPORT_CLASS, /\[overscroll-behavior-y:none\]/);
  });
});

describe("release_alert_enabled list frame material", () => {
  it("list container no longer uses legacy gray-800 tile", () => {
    assert.doesNotMatch(personThumbSrc, /bg-gray-800/);
    assert.match(personThumbSrc, /border-white\/10/);
    assert.match(personThumbSrc, /bg-black\/25/);
  });
});
