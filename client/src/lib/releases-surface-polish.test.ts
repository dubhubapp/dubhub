/**
 * Releases surface polish — upgrade hint, saved-remove menu, empty states.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getReleaseTrackerEmptyCopy,
  RELEASE_TRACKER_EMPTY_REGION_CLASS,
} from "@/lib/release-tracker-presentation";
import { RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS } from "@/lib/release-tracker-tab-swipe";
import {
  RELEASE_UPGRADE_HINT_CHEVRON_CLASS,
  RELEASE_UPGRADE_HINT_CLASS,
} from "@/lib/release-upgrade-hint";
import { APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS } from "@/lib/app-material";

const here = dirname(fileURLToPath(import.meta.url));
const linksSrc = readFileSync(join(here, "../components/release-links-sheet.tsx"), "utf8");
const attachSrc = readFileSync(
  join(here, "../components/release-attach-clips-management.tsx"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");

describe("release Links upgrade affordance", () => {
  it("is interactive with same text size as helper, semibold, no underline/teal", () => {
    assert.match(linksSrc, /RELEASE_UPGRADE_HINT_CLASS/);
    assert.match(linksSrc, /ChevronRight/);
    assert.match(linksSrc, /release-link-upgrade/);
    assert.match(linksSrc, /limitNotice\.onUpgradeClick/);
    assert.match(RELEASE_UPGRADE_HINT_CLASS, /text-xs/);
    assert.match(RELEASE_UPGRADE_HINT_CLASS, /leading-snug/);
    assert.match(RELEASE_UPGRADE_HINT_CLASS, /font-semibold/);
    assert.doesNotMatch(RELEASE_UPGRADE_HINT_CLASS, /text-sm|underline|text-accent|teal|#4ae9df/);
    assert.doesNotMatch(linksSrc, /hover:underline|underline-offset/);
    assert.doesNotMatch(linksSrc, /text-accent/);
    assert.match(linksSrc, /text-xs leading-snug/);
  });

  it("attach capacity upgrade shares the same affordance contract", () => {
    assert.match(attachSrc, /RELEASE_UPGRADE_HINT_CLASS/);
    assert.match(attachSrc, /ChevronRight/);
    assert.doesNotMatch(attachSrc, /hover:underline|text-accent/);
  });
});

describe("remove saved release destructive menu", () => {
  it("uses one material menu shell with flat destructive row (no nested surface card)", () => {
    assert.match(detailSrc, /menu-remove-saved-release/);
    assert.match(detailSrc, /text-red-400/);
    assert.match(detailSrc, /rounded-\[15px\] border-white\/10 bg-\[#141a30\]\/95/);
    const removeMenuBlock = detailSrc.slice(
      detailSrc.indexOf("menu-remove-saved-release") - 500,
      detailSrc.indexOf("menu-remove-saved-release") + 280,
    );
    assert.doesNotMatch(removeMenuBlock, /APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS/);
    assert.doesNotMatch(removeMenuBlock, /dubhub-app-destructive-action-surface/);
    assert.doesNotMatch(removeMenuBlock, /text-destructive focus:text-destructive/);
    assert.match(removeMenuBlock, /focus:bg-white\/\[0\.08\]/);
    assert.match(editSrc, /APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS/);
    assert.match(APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS, /text-red-400/);
    assert.match(detailSrc, /setRemoveSavedDialogOpen\(true\)/);
  });
});

describe("releases empty states copy + layout", () => {
  it("non-artist upcoming uses identified-by-artists copy", () => {
    const copy = getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "saved" });
    assert.equal(copy.title, "No upcoming releases");
    assert.equal(
      copy.body,
      "Like posts identified by artists to see their releases here.",
    );
    assert.doesNotMatch(copy.body, /verified by artists/);
  });

  it("artist zero-release / upcoming-with-history / past copy are role-specific", () => {
    assert.deepEqual(
      getReleaseTrackerEmptyCopy({
        view: "upcoming",
        scope: "my",
        hasOwnedReleaseHistory: false,
      }),
      {
        title: "No releases yet",
        body:
          "Create your first release to start linking your identified posts and sharing release details.",
      },
    );
    assert.deepEqual(
      getReleaseTrackerEmptyCopy({
        view: "upcoming",
        scope: "my",
        hasOwnedReleaseHistory: true,
      }),
      {
        title: "No upcoming releases",
        body: "Add your next release when you're ready.",
      },
    );
    assert.deepEqual(
      getReleaseTrackerEmptyCopy({ view: "past", scope: "my" }),
      {
        title: "No past releases",
        body: "Your released music will appear here.",
      },
    );
  });

  it("listener and artist empty states share Slice-1 centred layout (no !h-full / USABLE_BAND)", () => {
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /flex-1/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /justify-center/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /items-center/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /w-full/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /min-h-full/);
    assert.doesNotMatch(RELEASE_TRACKER_EMPTY_REGION_CLASS, /min-h-0/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS, /min-h-full/);
    assert.match(RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS, /flex-1/);
    assert.doesNotMatch(RELEASE_TRACKER_TAB_PAGER_PANEL_EMPTY_CLASS, /!h-full|!min-h-full/);
    assert.match(trackerSrc, /panelNeedsStableFill/);
    assert.match(trackerSrc, /isActivePanel \|\| panelUnlocked/);
    assert.match(trackerSrc, /RELEASE_TRACKER_EMPTY_REGION_CLASS/);
    assert.match(trackerSrc, /data-testid="release-feed-loading"/);
    assert.match(trackerSrc, /resolveArtworkViewColumnMinHClass\(isArtist\)/);
    assert.doesNotMatch(trackerSrc, /resolveReleasesContentColumnMinHClass|RELEASES_USABLE_BAND/);
    assert.doesNotMatch(RELEASE_TRACKER_EMPTY_REGION_CLASS, /top-\[|translateY\(|\b\d+vh\b/);
  });
});

describe("attach capacity projected count + hint position", () => {
  it("edit uses selectedPostIds length, not persisted capacity.used", () => {
    assert.match(editSrc, /used:\s*selectedPostIds\.length/);
    assert.doesNotMatch(editSrc, /used:\s*attachmentCapacityQuery\.data\.used/);
  });

  it("capacity notice sits below post cards / selected row, not above search", () => {
    const returnIdx = attachSrc.indexOf("return (");
    const body = attachSrc.slice(returnIdx);
    const searchIdx = body.indexOf('data-testid="release-attach-clips-search"');
    const capacityBlockIdx = body.indexOf("{capacityHeader ?");
    const limitIdx = body.indexOf('data-testid="release-attachment-limit-notice"');
    const policyIdx = body.indexOf('data-testid="release-attach-policy-disclosure"');
    assert.ok(searchIdx > 0);
    assert.ok(capacityBlockIdx > searchIdx, "capacity block must follow search");
    assert.ok(limitIdx > searchIdx, "limit notice must follow search/cards");
    assert.ok(policyIdx > limitIdx, "policy disclosure stays after limit notice");
    assert.match(attachSrc, /resolveProjectedAttachmentCount/);
  });
});
