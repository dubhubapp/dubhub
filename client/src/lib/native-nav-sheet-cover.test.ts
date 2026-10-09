import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NATIVE_NAV_SHEET_CLOSE_FALLBACK_MS,
  nativeNavSheetCoversBar,
  nativeNavSheetPhaseAfterUnfiredClose,
  nativeNavSheetPhaseOnAnimationEnd,
  nativeNavSheetPhaseOnOpenChange,
  nativeNavShouldKeepSheetHostMounted,
} from "./native-nav-sheet-cover";
import {
  acquireHomeWidgetSetupGuideNativeNavCover,
  isHomeWidgetSetupGuideCoveringNativeNav,
  resetHomeWidgetSetupGuideNativeNavCoverForTests,
} from "./home-widget-setup-guide-native-cover";

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

  it("forces closed after a direct open=false when Vaul never fires onAnimationEnd", () => {
    assert.equal(NATIVE_NAV_SHEET_CLOSE_FALLBACK_MS, 520);
    assert.equal(nativeNavSheetPhaseAfterUnfiredClose(true, "closing"), "closing");
    assert.equal(nativeNavSheetPhaseAfterUnfiredClose(false, "closing"), "closed");
    assert.equal(nativeNavSheetPhaseAfterUnfiredClose(false, "open"), "closed");
    assert.equal(nativeNavSheetPhaseAfterUnfiredClose(false, "closed"), "closed");
    assert.equal(
      nativeNavSheetCoversBar(nativeNavSheetPhaseAfterUnfiredClose(false, "closing")),
      false,
    );
  });

  it("Got it and Don’t show again release the countdown setup cover; swipe still uses Vaul", () => {
    const setupSrc = readFileSync(
      join(here, "../components/home-widget-setup-guide-host.tsx"),
      "utf8",
    );
    assert.match(setupSrc, /closeSheet\("temporary"\)/);
    assert.match(setupSrc, /closeSheet\("opt-out"\)/);
    assert.match(setupSrc, /setSheetPhase\("closing"\)/);
    assert.match(setupSrc, /setOpen\(false\)/);
    assert.match(setupSrc, /nativeNavSheetPhaseAfterUnfiredClose\(false, phase\)/);
    assert.match(setupSrc, /NATIVE_NAV_SHEET_CLOSE_FALLBACK_MS/);
    assert.match(setupSrc, /nativeNavSheetPhaseOnOpenChange\(next\)/);
    assert.match(setupSrc, /nativeNavSheetPhaseOnAnimationEnd\(animationOpen\)/);
    assert.match(setupSrc, /return acquireHomeWidgetSetupGuideNativeNavCover\(\)/);

    resetHomeWidgetSetupGuideNativeNavCoverForTests();
    assert.equal(isHomeWidgetSetupGuideCoveringNativeNav(), false);
    const release = acquireHomeWidgetSetupGuideNativeNavCover();
    assert.equal(isHomeWidgetSetupGuideCoveringNativeNav(), true);
    assert.equal(nativeNavSheetCoversBar("closing"), true);
    release();
    assert.equal(isHomeWidgetSetupGuideCoveringNativeNav(), false);
    assert.equal(nativeNavSheetCoversBar("closed"), false);
  });

  it("covers native nav while Artist Tools paywall is open or closing", () => {
    assert.match(hostSrc, /paywallOpen:\s*paywallCovering/);
    assert.match(hostSrc, /subscribeVerifiedArtistToolsPaywallNativeNavCover/);
    assert.match(hostSrc, /profilePreviewOpen:\s*profilePreviewCovering/);
    assert.match(hostSrc, /subscribeHomeProfilePreviewNativeNavCover/);
  });
});
