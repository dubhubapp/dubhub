/**
 * Release display polish — attached username, saved row width,
 * remove-saved menu shell, activity icons, status pill contrast.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RELEASE_ACTIVITY_ICON_CLASS,
  RELEASE_ACTIVITY_KEY_STATS,
  RELEASE_ACTIVITY_VALUE_CLASS,
} from "@/components/release-activity-section";
import {
  RELEASE_FEED_ARTWORK_PX,
  RELEASE_FEED_ARTWORK_SIZE_CLASS,
  RELEASE_FEED_ACTIONS_ROW_CLASS,
  RELEASE_FEED_BYLINE_CLASS,
  RELEASE_FEED_CTA_LIST_BYLINE_CLASS,
  RELEASE_FEED_CTA_LIST_SOLO_CLASS,
  RELEASE_FEED_META_COLUMN_CLASS,
  RELEASE_FEED_META_TOP_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_STATUS_ROW_CLASS,
  RELEASE_FEED_TITLE_CLASS,
  RELEASE_FEED_TITLE_SOLO_CLASS,
  resolveReleaseFeedCardRhythm,
  shouldShowReleaseFeedByline,
} from "@/lib/release-tracker-presentation";
import {
  RELEASE_COMING_SOON_PILL_CLASS,
  RELEASE_PAUSED_PILL_CLASS,
  RELEASE_RELEASED_PILL_CLASS,
  RELEASE_UPCOMING_PILL_CLASS,
} from "@/lib/release-status-pill";
import { formatReleaseFeedPrimaryLine } from "@/lib/release-display";
import { formatUsernameDisplay } from "@/lib/utils";

const here = dirname(fileURLToPath(import.meta.url));
const clipsSrc = readFileSync(
  join(here, "../components/release-attached-clips.tsx"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const activitySrc = readFileSync(
  join(here, "../components/release-activity-section.tsx"),
  "utf8",
);
const feedCardSrc = readFileSync(
  join(here, "../components/release-feed-card.tsx"),
  "utf8",
);

describe("attached post uploader username display", () => {
  it("Artist → @Artist and @Artist → @Artist (no double @)", () => {
    assert.equal(formatUsernameDisplay("Artist"), "@Artist");
    assert.equal(formatUsernameDisplay("@Artist"), "@Artist");
    assert.equal(formatUsernameDisplay("  @Artist  "), "@Artist");
  });

  it("attached clip card uses helper without a second @ prefix", () => {
    assert.match(clipsSrc, /formatUsernameDisplay\(clip\.uploaderUsername\)/);
    assert.doesNotMatch(clipsSrc, /@\{formatUsernameDisplay/);
    assert.match(clipsSrc, /goldTextClass/);
    assert.match(clipsSrc, /GoldVerifiedTick/);
  });
});

describe("saved release row width", () => {
  it("row and metadata column use available width; no narrow max-width", () => {
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /(?:^|\s)w-full(?:\s|$)/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /flex-1/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /min-w-0/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /min-h-\[7.5rem\]/);
    assert.doesNotMatch(RELEASE_FEED_META_COLUMN_CLASS, /max-w-/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /max-w-/);
    assert.match(RELEASE_FEED_META_TOP_CLASS, /(?:^|\s)w-full(?:\s|$)/);
    assert.match(RELEASE_FEED_ACTIONS_ROW_CLASS, /(?:^|\s)w-full(?:\s|$)/);
    assert.match(RELEASE_FEED_TITLE_CLASS, /(?:^|\s)w-full(?:\s|$)/);
    assert.match(RELEASE_FEED_TITLE_CLASS, /min-w-0/);
    assert.match(RELEASE_FEED_TITLE_CLASS, /truncate/);
    assert.match(RELEASE_FEED_TITLE_SOLO_CLASS, /(?:^|\s)w-full(?:\s|$)/);
    assert.match(feedCardSrc, /RELEASE_FEED_META_COLUMN_CLASS/);
  });

  it("streaming actions anchor to artwork bottom; status on its own row", () => {
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /flex-1/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /flex-col/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /min-h-\[7\.5rem\]/);
    assert.match(RELEASE_FEED_ACTIONS_ROW_CLASS, /mt-auto/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_BYLINE_CLASS, /mt-auto/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_SOLO_CLASS, /mt-auto/);
    assert.match(feedCardSrc, /release-feed-status-row/);
    assert.doesNotMatch(feedCardSrc, /release-feed-schedule-row/);
    assert.match(feedCardSrc, /splitReleaseFeedLinkActions|hasLinkActions/);
    assert.ok(
      feedCardSrc.indexOf("release-feed-meta-top") <
        feedCardSrc.indexOf("release-feed-link-actions"),
    );
    assert.ok(
      feedCardSrc.indexOf("release-feed-status-row") <
        feedCardSrc.indexOf("release-feed-link-actions"),
    );
  });
});

describe("community vs artist release row layout", () => {
  it("community stacks title then @artist; no · separator; no double @", () => {
    assert.match(feedCardSrc, /release-feed-title/);
    assert.match(feedCardSrc, /release-feed-byline/);
    assert.match(feedCardSrc, /RELEASE_FEED_META_TOP_CLASS/);
    assert.doesNotMatch(feedCardSrc, /formatReleaseFeedPrimaryLine|release-feed-primary-line| · /);
    assert.match(RELEASE_FEED_TITLE_CLASS, /font-semibold/);
    assert.match(RELEASE_FEED_BYLINE_CLASS, /text-muted-foreground/);
    assert.doesNotMatch(RELEASE_FEED_TITLE_CLASS, /·/);
    assert.doesNotMatch(RELEASE_FEED_BYLINE_CLASS, /·/);
    // Helper kept for non-list use; separator is " - " if ever combined.
    assert.equal(
      formatReleaseFeedPrimaryLine("@Artist", "Night Drive"),
      "@Artist - Night Drive",
    );
    assert.doesNotMatch(formatReleaseFeedPrimaryLine("@Artist", "Night Drive"), /@@|·/);
    assert.equal(formatUsernameDisplay("Artist"), "@Artist");
    assert.equal(formatUsernameDisplay("@Artist"), "@Artist");
  });

  it("artist own row keeps title-only top; shared flex-1 meta + bottom group", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "upcoming",
        currentUserId: "u1",
        artistId: "u1",
        collaborators: [],
      }),
      false,
    );
    const solo = resolveReleaseFeedCardRhythm({ showByline: false });
    assert.equal(solo.bylineVisible, false);
    assert.equal(solo.titleClass, RELEASE_FEED_TITLE_SOLO_CLASS);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /flex-1/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /min-w-0/);
    assert.match(RELEASE_FEED_ACTIONS_ROW_CLASS, /mt-auto/);
    assert.match(RELEASE_FEED_STATUS_ROW_CLASS, /w-full/);
    assert.equal(RELEASE_FEED_ARTWORK_PX, 120);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /h-\[7\.5rem\]/);
  });
});

describe("remove saved — single menu shell", () => {
  it("destructive item has no nested destructive surface card", () => {
    const idx = detailSrc.indexOf("menu-remove-saved-release");
    assert.ok(idx > 0);
    const block = detailSrc.slice(idx - 550, idx + 300);
    assert.match(detailSrc, /rounded-\[15px\] border-white\/10 bg-\[#141a30\]\/95/);
    assert.doesNotMatch(block, /APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS/);
    assert.doesNotMatch(block, /dubhub-app-destructive-action-surface/);
    assert.match(block, /text-red-400/);
    assert.match(block, /BookmarkMinus/);
    assert.match(detailSrc, /setRemoveSavedDialogOpen\(true\)/);
  });
});

describe("release activity icons", () => {
  it("icons and values use foreground/white; labels stay muted", () => {
    assert.equal(RELEASE_ACTIVITY_ICON_CLASS, "text-foreground");
    assert.equal(RELEASE_ACTIVITY_VALUE_CLASS, "text-foreground");
    assert.match(activitySrc, /RELEASE_ACTIVITY_ICON_CLASS/);
    assert.match(activitySrc, /RELEASE_ACTIVITY_VALUE_CLASS/);
    assert.doesNotMatch(activitySrc, /valueTone|text-purple-400|text-pink-400|text-cyan-400|text-blue-400/);
    assert.match(activitySrc, /text-muted-foreground/);
    assert.equal(RELEASE_ACTIVITY_KEY_STATS.length, 4);
  });
});

describe("status pill contrast on artwork atmospheres", () => {
  it("Upcoming / Released use opaque color-mix of the canonical /25-on-navy look", () => {
    assert.match(RELEASE_UPCOMING_PILL_CLASS, /color-mix\(in_srgb,#6366f1_25%,#0f1324\)/);
    assert.match(RELEASE_RELEASED_PILL_CLASS, /color-mix\(in_srgb,#22c55e_25%,#0f1324\)/);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /color-mix\(in_srgb,#f59e0b_25%,#0f1324\)/);
    assert.match(RELEASE_PAUSED_PILL_CLASS, /color-mix\(in_srgb,#64748b_25%,#0f1324\)/);
    for (const tone of [
      RELEASE_UPCOMING_PILL_CLASS,
      RELEASE_RELEASED_PILL_CLASS,
      RELEASE_COMING_SOON_PILL_CLASS,
      RELEASE_PAUSED_PILL_CLASS,
    ]) {
      assert.doesNotMatch(tone, /bg-(amber|green|indigo|slate)-500\/25/);
      assert.match(tone, /text-white/);
      assert.match(tone, /ring-1 ring-inset/);
    }
  });
});

describe("countdown UI audit (no implementation)", () => {
  it("detail still hosts HomeWidgetSelectionButton; list hosts CountdownStatusBadge only", () => {
    assert.match(detailSrc, /HomeWidgetSelectionButton/);
    assert.match(detailSrc, /isHomeReleaseWidgetSelectionEnabled/);
    assert.match(feedCardSrc, /CountdownStatusBadge/);
    assert.doesNotMatch(feedCardSrc, /HomeWidgetSelectionButton/);
  });
});
