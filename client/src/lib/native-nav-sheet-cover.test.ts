import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  nativeNavSheetCoversBar,
  nativeNavSheetPhaseOnAnimationEnd,
  nativeNavSheetPhaseOnOpenChange,
  nativeNavShouldKeepSheetHostMounted,
} from "./native-nav-sheet-cover";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const submitDrawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");
const hostSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");
const submitCtxSrc = readFileSync(join(here, "./submit-clip-context.tsx"), "utf8");

describe("LG-NAV-5B3 sheet-close native cover", () => {
  it("keeps cover through closing and uncovers only after animation end", () => {
    assert.equal(nativeNavSheetPhaseOnOpenChange(true), "open");
    assert.equal(nativeNavSheetPhaseOnOpenChange(false), "closing");
    assert.equal(nativeNavSheetPhaseOnAnimationEnd(true), "open");
    assert.equal(nativeNavSheetPhaseOnAnimationEnd(false), "closed");
    assert.equal(nativeNavSheetCoversBar("open"), true);
    assert.equal(nativeNavSheetCoversBar("closing"), true);
    assert.equal(nativeNavSheetCoversBar("closed"), false);
    assert.equal(nativeNavShouldKeepSheetHostMounted("closing"), true);
    assert.equal(nativeNavShouldKeepSheetHostMounted("closed"), false);
  });

  it("does not unmount Comments on close request", () => {
    const modalBlock = videoCardSrc.slice(videoCardSrc.indexOf("<CommentsModal"));
    const closeStart = modalBlock.indexOf("onClose={() => {");
    const closedStart = modalBlock.indexOf("onClosed={() => {");
    assert.ok(closeStart >= 0 && closedStart > closeStart);
    const onCloseHandler = modalBlock.slice(closeStart, closedStart);
    const onClosedHandler = modalBlock.slice(closedStart, closedStart + 220);
    assert.match(onCloseHandler, /setShowComments\(false\)/);
    assert.doesNotMatch(onCloseHandler, /setCommentsPost\(null\)/);
    assert.match(onClosedHandler, /setCommentsPost\(null\)/);
    assert.match(commentsSrc, /onAnimationEnd=/);
    assert.match(commentsSrc, /onClosed\?\.\(\)/);
  });

  it("keeps Submit cover until close animation completes while selected tab may return to Home", () => {
    assert.match(submitCtxSrc, /isSubmitClipCovering/);
    assert.match(submitCtxSrc, /completeSubmitClipClose/);
    assert.match(submitDrawerSrc, /onAnimationEnd=/);
    assert.match(submitDrawerSrc, /completeSubmitClipClose/);
    assert.match(hostSrc, /submitOpen: isSubmitClipCovering/);
    assert.match(hostSrc, /isSubmitClipOpen/);
  });

  it("covers native nav while Verified Artist Tools paywall is open or closing", () => {
    assert.match(hostSrc, /paywallOpen:\s*paywallCovering/);
    assert.match(hostSrc, /subscribeVerifiedArtistToolsPaywallNativeNavCover/);
  });
});
