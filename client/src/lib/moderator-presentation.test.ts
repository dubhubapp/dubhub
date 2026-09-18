import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MODERATOR_ACCESS_BADGE_CLASS,
  MODERATOR_ACTION_CLAIM_CLASS,
  MODERATOR_ACTION_DESTRUCTIVE_CLASS,
  MODERATOR_ACTION_FOLLOWUP_DESTRUCTIVE_CLASS,
  MODERATOR_ACTION_FOLLOWUP_SECONDARY_CLASS,
  MODERATOR_ACTION_PRIMARY_CLASS,
  MODERATOR_ACTION_SECONDARY_CLASS,
  MODERATOR_CLAIM_FILTER_ACTIVE_CLASS,
  MODERATOR_CLAIM_FILTER_INACTIVE_CLASS,
  MODERATOR_FILTER_BLOCK_CLASS,
  MODERATOR_HELPER_KEEP_HINT_CLASS,
  MODERATOR_HELPER_STACK_CLASS,
  MODERATOR_PAGE_SCROLL_CLASS,
  MODERATOR_PANEL_CLAIM_LOCK_CLASS,
  MODERATOR_PANEL_COMMUNITY_REPORT_CLASS,
  MODERATOR_PANEL_ID_CLASS,
  MODERATOR_PANEL_REPORT_REASON_CLASS,
  MODERATOR_QUEUE_ITEM_CLASS,
  MODERATOR_QUEUE_LIST_CLASS,
  MODERATOR_SELECTED_COMMENT_CHIP_CLASS,
  MODERATOR_SHELL_ATMOSPHERE_CLASS,
  MODERATOR_TAB_TRIGGER_ACTIVE_CLASS,
  MODERATOR_TABLIST_CLASS,
} from "./moderator-presentation";
import { APP_PAGE_SCROLL_CLASS } from "./app-shell-layout";
import { MODERATOR_QUEUE_FILTER_DEFAULTS } from "./moderator-queue-filters";

const here = dirname(fileURLToPath(import.meta.url));
const moderatorSrc = readFileSync(join(here, "../pages/moderator.tsx"), "utf8");
const dialogSrc = readFileSync(join(here, "../components/moderation-actions-dialog.tsx"), "utf8");
const genreFilterSrc = readFileSync(join(here, "../components/moderator-genre-filter.tsx"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const filtersSrc = readFileSync(join(here, "./moderator-queue-filters.ts"), "utf8");

describe("moderator presentation contract", () => {
  it("uses shared auth canvas shell atmosphere and transparent page scroll", () => {
    assert.match(MODERATOR_SHELL_ATMOSPHERE_CLASS, /dubhub-app-releases-canvas/);
    assert.match(MODERATOR_SHELL_ATMOSPHERE_CLASS, /bg-background/);
    assert.match(MODERATOR_PAGE_SCROLL_CLASS, /bg-transparent/);
    assert.match(MODERATOR_PAGE_SCROLL_CLASS, new RegExp(APP_PAGE_SCROLL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appSrc, /MODERATOR_SHELL_ATMOSPHERE_CLASS/);
    assert.match(appSrc, /\/moderator/);
    assert.match(moderatorSrc, /MODERATOR_PAGE_SCROLL_CLASS/);
    assert.doesNotMatch(moderatorSrc, /bg-background`/);
  });

  it("removes legacy teal tabs, filter card, and nested queue Cards", () => {
    assert.match(MODERATOR_TABLIST_CLASS, /bg-transparent/);
    assert.doesNotMatch(MODERATOR_TABLIST_CLASS, /bg-black|backdrop-blur|rounded-2xl/);
    assert.match(MODERATOR_TAB_TRIGGER_ACTIVE_CLASS, /#0a83ff/);
    assert.doesNotMatch(MODERATOR_TAB_TRIGGER_ACTIVE_CLASS, /bg-accent|34,211,238|teal/);
    assert.match(MODERATOR_FILTER_BLOCK_CLASS, /mt-3/);
    assert.doesNotMatch(MODERATOR_FILTER_BLOCK_CLASS, /border|rounded-xl|bg-black/);
    assert.match(MODERATOR_QUEUE_LIST_CLASS, /divide-y/);
    assert.doesNotMatch(MODERATOR_QUEUE_ITEM_CLASS, /border-white\/10|bg-black|Card/);

    assert.match(moderatorSrc, /MODERATOR_TABLIST_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_FILTER_BLOCK_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_QUEUE_LIST_CLASS/);
    assert.doesNotMatch(moderatorSrc, /from "@\/components\/ui\/card"/);
    assert.doesNotMatch(moderatorSrc, /<Card[\s>]/);
    assert.doesNotMatch(moderatorSrc, /bg-accent/);
    assert.doesNotMatch(moderatorSrc, /34,211,238/);
    assert.doesNotMatch(moderatorSrc, /bg-green-600/);
  });

  it("keeps quiet access badge without red glow", () => {
    assert.match(MODERATOR_ACCESS_BADGE_CLASS, /bg-white\/\[0\.03\]/);
    assert.match(MODERATOR_ACCESS_BADGE_CLASS, /text-xs/);
    assert.doesNotMatch(MODERATOR_ACCESS_BADGE_CLASS, /red-500|shadow-\[0_0_20px|py-2|text-sm/);
    assert.match(moderatorSrc, /MODERATOR_ACCESS_BADGE_CLASS/);
    assert.match(moderatorSrc, /data-testid="moderator-badge"/);
  });

  it("keeps semantic panels and claim-lock surfaces", () => {
    assert.match(MODERATOR_PANEL_ID_CLASS, /blue-500/);
    assert.match(MODERATOR_PANEL_CLAIM_LOCK_CLASS, /amber-500/);
    assert.match(MODERATOR_PANEL_REPORT_REASON_CLASS, /red-500/);
    assert.match(MODERATOR_PANEL_COMMUNITY_REPORT_CLASS, /yellow-500/);
    assert.match(moderatorSrc, /MODERATOR_PANEL_ID_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_PANEL_CLAIM_LOCK_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_PANEL_REPORT_REASON_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_PANEL_COMMUNITY_REPORT_CLASS/);
  });

  it("uses material action hierarchy (ceramic primary, glass secondary, destructive)", () => {
    assert.match(MODERATOR_ACTION_PRIMARY_CLASS, /bg-white/);
    assert.match(MODERATOR_ACTION_SECONDARY_CLASS, /bg-white\/\[0\.06\]/);
    assert.match(MODERATOR_ACTION_DESTRUCTIVE_CLASS, /bg-destructive/);
    assert.match(MODERATOR_ACTION_CLAIM_CLASS, /#0a83ff/);
    assert.match(MODERATOR_CLAIM_FILTER_ACTIVE_CLASS, /#0a83ff/);
    assert.doesNotMatch(MODERATOR_CLAIM_FILTER_ACTIVE_CLASS, /bg-accent|bg-primary(?!\/)/);
    assert.match(MODERATOR_CLAIM_FILTER_INACTIVE_CLASS, /bg-white\/\[0\.06\]/);
    assert.match(moderatorSrc, /MODERATOR_ACTION_PRIMARY_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_ACTION_DESTRUCTIVE_CLASS/);
  });

  it("polishes helper rhythm, quieter follow-ups, and softer selected-comment chip", () => {
    assert.match(MODERATOR_HELPER_STACK_CLASS, /space-y-0\.5/);
    assert.match(MODERATOR_HELPER_KEEP_HINT_CLASS, /text-\[10px\]/);
    assert.match(MODERATOR_ACTION_FOLLOWUP_SECONDARY_CLASS, /h-7/);
    assert.match(MODERATOR_ACTION_FOLLOWUP_DESTRUCTIVE_CLASS, /red-500\/10/);
    assert.doesNotMatch(MODERATOR_ACTION_FOLLOWUP_DESTRUCTIVE_CLASS, /bg-destructive/);
    assert.match(MODERATOR_SELECTED_COMMENT_CHIP_CLASS, /text-\[10px\]/);
    assert.match(MODERATOR_SELECTED_COMMENT_CHIP_CLASS, /bg-white\/\[0\.04\]/);
    assert.match(moderatorSrc, /MODERATOR_HELPER_STACK_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_ACTION_FOLLOWUP_SECONDARY_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_ACTION_FOLLOWUP_DESTRUCTIVE_CLASS/);
    assert.match(moderatorSrc, /MODERATOR_SELECTED_COMMENT_CHIP_CLASS/);
    assert.match(moderatorSrc, /Claim this verification to unlock review actions/);
    assert.match(moderatorSrc, /Use Keep as Community Identified when the ID looks credible/);
  });

  it("preserves behavior contracts: testids, filters storage, mutations, dialogs", () => {
    assert.equal(MODERATOR_QUEUE_FILTER_DEFAULTS.claimFilter, "unclaimed");
    assert.match(filtersSrc, /dubhub:moderator-queue-filters:v1/);

    for (const id of [
      'data-testid="tab-pending"',
      'data-testid="tab-reports"',
      "moderator-claim-filter-",
      "button-claim-pending-",
      "button-release-pending-",
      "button-review-confirm-",
      "button-keep-community-",
      "button-reopen-",
      "button-dismiss-",
      "button-correct-genre-",
      "button-remove-moderate-",
      "pending-claimed-by-other-",
      "report-claimed-by-other-",
    ]) {
      assert.match(moderatorSrc, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    assert.match(moderatorSrc, /claimPendingMutation/);
    assert.match(moderatorSrc, /confirmVerificationMutation/);
    assert.match(moderatorSrc, /communityApproveMutation/);
    assert.match(moderatorSrc, /reopenVerificationMutation/);
    assert.match(moderatorSrc, /dismissReportMutation/);
    assert.match(moderatorSrc, /ModerationActionsDialog/);
    assert.match(moderatorSrc, /CorrectGenreDialog/);
    assert.match(moderatorSrc, /ID_MARKING_DIALOG_CONTENT_CLASS/);
    assert.match(moderatorSrc, /PostClipViewerOverlay/);
  });

  it("restyles ModerationActionsDialog with material overlay tokens only", () => {
    assert.match(dialogSrc, /APP_MATERIAL_DIALOG_CONTENT_CLASS/);
    assert.match(dialogSrc, /APP_MATERIAL_OVERLAY_BACKDROP_CLASS/);
    assert.match(dialogSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(dialogSrc, /window\.confirm|!confirm\(/);
    assert.match(dialogSrc, /handleRemoveOnly/);
    assert.match(dialogSrc, /handleWarn/);
    assert.match(dialogSrc, /handleSuspend/);
    assert.match(dialogSrc, /handleBan/);
  });

  it("aligns genre filter clear link to material blue (not teal accent)", () => {
    assert.match(genreFilterSrc, /APP_MATERIAL_LINK_CLASS/);
    assert.doesNotMatch(genreFilterSrc, /text-accent/);
    assert.match(genreFilterSrc, /data-testid="moderator-genre-filter"/);
  });
});
