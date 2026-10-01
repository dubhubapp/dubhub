/**
 * Phase 3D — secondary authenticated surfaces.
 * Presentation only. Comments, ID, submit, and moderator behaviour stay put.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ID_MARKING_DIALOG_CONTENT_CLASS,
  ID_MARKING_PICKER_FIRST_PILL_CLASS,
  ID_MARKING_PICKER_OLDEST_PILL_CLASS,
  ID_MARKING_PICKER_ROW_CLASS,
} from "../components/id-marking-dialog-styles";
import {
  MODERATOR_CLAIM_FILTER_INACTIVE_CLASS,
  MODERATOR_TAB_TRIGGER_INACTIVE_CLASS,
} from "./moderator-presentation";
import { PAYWALL_PACKAGE_IDLE_CLASS } from "./verified-artist-tools-paywall-lifecycle";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const artistSrc = readFileSync(join(here, "../components/artist-verification-dialog.tsx"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");
const metadataSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const moderatorSrc = readFileSync(join(here, "../pages/moderator.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const bannerSrc = readFileSync(join(here, "../components/in-app-notification-banner.tsx"), "utf8");
const trimSrc = readFileSync(join(here, "../pages/trim-video.tsx"), "utf8");
const authCss = readFileSync(join(here, "../index.css"), "utf8");

describe("Phase 3D secondary Light surfaces", () => {
  it("keeps Comments lifecycle and themes the reply chip", () => {
    assert.match(commentsSrc, /const handleClose = useCallback\(\(\) => \{/);
    assert.match(commentsSrc, /if \(!open\) handleClose\(\);/);
    assert.match(commentsSrc, /data-testid="cancel-reply"/);
    assert.match(commentsSrc, /text-muted-foreground dark:text-white\/55">Replying to/);
    assert.match(commentsSrc, /border-\[#DCE3EC\] bg-\[#F6F8FC\].*dark:border-white\/10 dark:bg-white\/\[0\.05\]/);
    assert.match(commentsSrc, /dark:bg-\[#141a2e\]/);
    assert.doesNotMatch(commentsSrc, /setTimeout\(\s*\(\)\s*=>\s*setReplyingTo/);
  });

  it("themes ID dialog chrome and keeps status pills and handlers", () => {
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /text-foreground dark:text-white/);
    assert.match(ID_MARKING_PICKER_ROW_CLASS, /border-\[#DCE3EC\]/);
    assert.match(ID_MARKING_PICKER_ROW_CLASS, /dark:border-white\/12/);
    assert.match(ID_MARKING_PICKER_OLDEST_PILL_CLASS, /bg-\[#3B82F6\]/);
    assert.match(ID_MARKING_PICKER_FIRST_PILL_CLASS, /#FFD700/);
    assert.match(artistSrc, /data-testid="button-artist-deny"/);
    assert.match(artistSrc, /handleIdentifyAnonymously/);
    assert.doesNotMatch(artistSrc, /DialogTitle className="text-lg font-semibold tracking-tight text-white"/);
  });

  it("themes the submit drawer and metadata page chrome without touching trim media", () => {
    assert.match(drawerSrc, /text-foreground dark:text-white">Add your clip/);
    assert.match(drawerSrc, /dark:bg-gray-900\/60/);
    assert.match(drawerSrc, /setLocation\("\/trim-video"\)/);
    assert.match(metadataSrc, /APP_MATERIAL_PAGE_BACK_BUTTON_CLASS/);
    assert.match(metadataSrc, /onClick=\{handleBack\}/);
    assert.match(metadataSrc, /rounded-2xl overflow-hidden border border-gray-800\/90 bg-black/);
    assert.match(metadataSrc, /\[color-scheme:light\] dark:text-white dark:\[color-scheme:dark\]/);
    assert.match(trimSrc, /bg-black/);
    assert.doesNotMatch(trimSrc, /border-\[#DCE3EC\] bg-white/);
  });

  it("themes moderator inactive chrome and leaves queue actions in place", () => {
    assert.match(MODERATOR_TAB_TRIGGER_INACTIVE_CLASS, /text-muted-foreground/);
    assert.match(MODERATOR_TAB_TRIGGER_INACTIVE_CLASS, /dark:text-white\/55/);
    assert.match(MODERATOR_CLAIM_FILTER_INACTIVE_CLASS, /dark:bg-white\/\[0\.06\]/);
    assert.match(moderatorSrc, /text-foreground dark:text-white">/);
    assert.match(moderatorSrc, /setSelectedPost\(null\)/);
    assert.match(PAYWALL_PACKAGE_IDLE_CLASS, /dark:bg-black\/20/);
    assert.match(PAYWALL_PACKAGE_IDLE_CLASS, /border-\[#DCE3EC\] bg-white/);
  });

  it("leaves Home, video, the notification capsule, and auth Dark", () => {
    assert.match(videoCardSrc, /from-black\/80/);
    assert.match(homeSrc, /data-home-video-feed/);
    assert.match(bannerSrc, /text-white/);
    assert.doesNotMatch(bannerSrc, /dubhub-app-toast-surface/);
    assert.match(authCss, /\.dubhub-auth-surface/);
    assert.doesNotMatch(homeSrc, /ID_MARKING_DIALOG_CONTENT_CLASS/);
    assert.doesNotMatch(videoCardSrc, /border-\[#DCE3EC\] bg-\[#F6F8FC\]/);
  });
});
