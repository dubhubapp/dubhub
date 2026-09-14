/**
 * HINTS-PREMIUM-2 — contextual coachmark placement + Like → Releases migration contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LIKE_HINT_SETTLE_MS,
  LIKE_RELEASE_COACHMARK_COPY,
  ARTIST_SELF_TAG_COACHMARK_COPY,
  COMMENTS_SHEET_COACHMARK_GAP_PX,
  armContextualCoachmarkGestureSuppress,
  canShowHomeContextualCoachmark,
  isCoachmarkTargetRectUsable,
  isContextualCoachmarkGestureSuppressArmed,
  placeCommentsSheetCoachmark,
  placeContextualCoachmark,
  resetContextualCoachmarkGestureSuppressForTests,
} from "./contextual-coachmark";
import { getHintLikeReleaseSeenKey, persistHintSeen } from "./onboarding";

const here = dirname(fileURLToPath(import.meta.url));
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const coachmarkSrc = readFileSync(join(here, "../components/contextual-coachmark.tsx"), "utf8");
const coachmarkLibSrc = readFileSync(join(here, "./contextual-coachmark.ts"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");

// jsdom-ish EventTarget for gesture-suppress unit checks (node:test has no DOM by default).
if (typeof document === "undefined") {
  const listeners = new Map<string, Set<EventListener>>();
  (globalThis as { document: Document }).document = {
    addEventListener(type: string, listener: EventListener, _opts?: unknown) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener, _opts?: unknown) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      const set = listeners.get(event.type);
      if (!set) return true;
      for (const listener of [...set]) listener.call(document, event);
      return !event.defaultPrevented;
    },
  } as Document;
}
if (typeof Event === "undefined") {
  (globalThis as { Event: typeof Event }).Event = class Event {
    type: string;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented = false;
    constructor(type: string, init?: EventInit) {
      this.type = type;
      this.bubbles = !!init?.bubbles;
      this.cancelable = !!init?.cancelable;
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
    stopPropagation() {}
  } as typeof Event;
}
describe("HINTS-PREMIUM-2 placement math", () => {
  it("prefers left of target when there is room", () => {
    const placed = placeContextualCoachmark({
      target: { left: 300, top: 400, width: 44, height: 44, right: 344, bottom: 444 },
      cardWidth: 240,
      cardHeight: 72,
      viewportWidth: 390,
      viewportHeight: 844,
      gap: 12,
      margin: 10,
    });
    assert.equal(placed.placement, "left");
    assert.equal(placed.left, 300 - 12 - 240);
    assert.ok(placed.top >= 10);
  });

  it("falls back above when left cannot fit", () => {
    const placed = placeContextualCoachmark({
      target: { left: 20, top: 200, width: 44, height: 44, right: 64, bottom: 244 },
      cardWidth: 240,
      cardHeight: 72,
      viewportWidth: 320,
      viewportHeight: 568,
      gap: 12,
      margin: 10,
    });
    assert.equal(placed.placement, "above");
    assert.ok(placed.left >= 10);
    assert.ok(placed.left + 240 <= 320 - 10);
  });

  it("falls back below when left and above cannot fit", () => {
    const placed = placeContextualCoachmark({
      target: { left: 20, top: 12, width: 44, height: 44, right: 64, bottom: 56 },
      cardWidth: 240,
      cardHeight: 72,
      viewportWidth: 320,
      viewportHeight: 568,
      gap: 12,
      margin: 10,
    });
    assert.equal(placed.placement, "below");
    assert.ok(placed.top >= 10);
  });

  it("clamps into the viewport on narrow widths", () => {
    const placed = placeContextualCoachmark({
      target: { left: 8, top: 400, width: 44, height: 44, right: 52, bottom: 444 },
      cardWidth: 240,
      cardHeight: 72,
      viewportWidth: 320,
      viewportHeight: 568,
      margin: 10,
    });
    assert.ok(placed.left >= 10);
    assert.ok(placed.left + 240 <= 310);
  });

  it("prefers below when requested and it fits", () => {
    const placed = placeContextualCoachmark({
      target: { left: 80, top: 120, width: 200, height: 80, right: 280, bottom: 200 },
      cardWidth: 240,
      cardHeight: 72,
      viewportWidth: 390,
      viewportHeight: 844,
      preferred: "below",
    });
    assert.equal(placed.placement, "below");
    assert.ok(placed.top >= 200);
  });

  it("treats zero-size rects as unusable", () => {
    assert.equal(isCoachmarkTargetRectUsable({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }), false);
    assert.equal(
      isCoachmarkTargetRectUsable({ left: 10, top: 10, width: 44, height: 44, right: 54, bottom: 54 }),
      true,
    );
  });
});

describe("HINTS-PREMIUM-2 session mutex foundation", () => {
  it("allows a Home coachmark only when none is active", () => {
    assert.equal(canShowHomeContextualCoachmark(null), true);
    assert.equal(canShowHomeContextualCoachmark(undefined), true);
    assert.equal(canShowHomeContextualCoachmark("genre"), false);
    assert.equal(canShowHomeContextualCoachmark("like"), false);
  });
});

describe("HINTS-PREMIUM-2 Like trigger + settle", () => {
  it("keeps mutation-success gate and settles ~350ms before show", () => {
    assert.match(videoCardSrc, /if \(!wasPreviouslyLiked && data\.isLiked\)/);
    assert.match(videoCardSrc, /onPostLiked\?\.\(likeHitTargetRef\.current\)/);
    assert.equal(LIKE_HINT_SETTLE_MS, 350);
    assert.match(homeSrc, /LIKE_HINT_SETTLE_MS/);
    assert.match(homeSrc, /setTimeout\([\s\S]*?LIKE_HINT_SETTLE_MS/);
  });

  it("does not show Like tip without a live HTMLElement target", () => {
    assert.match(homeSrc, /if \(!\(target instanceof HTMLElement\)\) return/);
    assert.match(homeSrc, /if \(!target\.isConnected\) return/);
  });

  it("skips settle show when Discover or comments conflict", () => {
    assert.match(homeSrc, /if \(genreMenuOpenRef\.current \|\| commentsOpenRef\.current\) return/);
  });

  it("preserves existing like persistence key helper", () => {
    assert.equal(getHintLikeReleaseSeenKey("user-1"), "dubhub_hint_like_release_seen_user-1");
    assert.match(homeSrc, /getHintLikeReleaseSeenKey\(userId\)/);
  });
});

describe("HINTS-PREMIUM-2 Like geometry + Heart target", () => {
  it("anchors to data-video-like-hit-target / likeHitTargetRef, not rem bottoms", () => {
    assert.match(videoCardSrc, /likeHitTargetRef/);
    assert.match(videoCardSrc, /data-video-like-hit-target/);
    assert.match(homeSrc, /detail:\s*\{\s*target:\s*likeHitTarget/);
    assert.match(coachmarkSrc, /getBoundingClientRect/);
    assert.doesNotMatch(homeSrc, /bottom:\s*"max\(9\.5rem/);
    assert.doesNotMatch(
      homeSrc,
      /Liked posts can appear in your Releases tab once they’re identified/,
    );
  });

  it("leaves Random rem coaching gone; Comments rem path removed", () => {
    assert.doesNotMatch(
      homeSrc,
      /bottom:\s*"max\(7\.5rem, calc\(env\(safe-area-inset-bottom,0px\) \+ 6\.5rem\)\)"/,
    );
    assert.doesNotMatch(
      homeSrc,
      /bottom:\s*"max\(15rem, calc\(env\(safe-area-inset-bottom,0px\) \+ 13\.5rem\)\)"/,
    );
    assert.doesNotMatch(homeSrc, /Tap the dice to jump into random/);
  });
});

describe("HINTS-PREMIUM-2 visual + copy contracts", () => {
  it("uses final Like copy without Quick tip / turquoise chrome", () => {
    assert.equal(
      LIKE_RELEASE_COACHMARK_COPY,
      "Likes can show up in Releases once a track gets an ID and a release.",
    );
    assert.match(homeSrc, /LIKE_RELEASE_COACHMARK_COPY/);
    assert.match(coachmarkSrc, /CONTEXTUAL_COACHMARK_CARD_CLASS/);
    assert.doesNotMatch(coachmarkSrc, /Quick tip/);
    assert.doesNotMatch(coachmarkSrc, /mb-1 text-xs font-semibold text-\[#4ae9df\]/);
    assert.doesNotMatch(coachmarkSrc, /#4ae9df/);
    assert.doesNotMatch(coachmarkSrc, /border-\[#4ae9df/);
    assert.doesNotMatch(coachmarkLibSrc, /Got it/);
    assert.match(homeSrc, /premiumCoachmark/);
    assert.doesNotMatch(homeSrc, /hintOverlay/);
    assert.doesNotMatch(homeSrc, /activeHint\?\.type === "random"/);
  });

  it("soft halo has no 1px circular border and respects reduced motion", () => {
    assert.match(coachmarkSrc, /radial-gradient/);
    assert.doesNotMatch(coachmarkSrc, /border:\s*["']?1px/);
    assert.doesNotMatch(coachmarkSrc, /border border-\[#4ae9df/);
    assert.match(coachmarkSrc, /prefers-reduced-motion/);
    assert.match(coachmarkSrc, /reducedMotion/);
  });
});

describe("HINTS-PREMIUM-2 dismissal + haptics", () => {
  it("persists on intentional dismiss and skips persist on target loss", () => {
    assert.match(homeSrc, /handlePremiumCoachmarkDismiss/);
    assert.match(homeSrc, /handlePremiumCoachmarkTargetLost/);
    assert.match(homeSrc, /persistHintOnClearRef/);
    assert.match(homeSrc, /persistHintOnClearRef\.current = false/);
    assert.match(homeSrc, /suppressOccurrence\(type\)/);
    assert.match(homeSrc, /onTargetLost=\{\(\) => handlePremiumCoachmarkTargetLost\(activeHint\.type\)\}/);
  });

  it("outside dismiss does not stopPropagation on Heart path", () => {
    assert.match(coachmarkSrc, /dismissOnTargetInteract/);
    assert.match(coachmarkSrc, /Like heart: dismiss without consuming/);
    assert.match(
      coachmarkSrc,
      /Outside: dismiss and arm post-unmount suppress/,
    );
    assert.match(coachmarkSrc, /armContextualCoachmarkGestureSuppress/);
    assert.match(coachmarkSrc, /document\.addEventListener\("pointerdown"/);
  });

  it("HINTS-PREMIUM-3C outside dismiss arms pointerup/click suppress that survives unmount", () => {
    assert.match(coachmarkLibSrc, /armContextualCoachmarkGestureSuppress/);
    assert.match(coachmarkLibSrc, /addEventListener\("pointerup"/);
    assert.match(coachmarkLibSrc, /addEventListener\("click"/);
    assert.match(coachmarkLibSrc, /Video play\/pause listens to `pointerup`/);
    // Home video stage uses pointerup for play/pause — not pointerdown alone.
    assert.match(videoCardSrc, /onPointerUp=\{enableDoubleTapLike \? onVideoStagePointerUp/);
    assert.match(videoCardSrc, /toggleVideoPlayPause/);
  });

  it("gesture suppress consumes matching pointerup then clears so next tap works", () => {
    resetContextualCoachmarkGestureSuppressForTests();
    assert.equal(isContextualCoachmarkGestureSuppressArmed(), false);

    const consumed: string[] = [];
    const makeEvent = (type: string, pointerId = 7) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      const origStop = event.stopPropagation.bind(event);
      event.stopPropagation = () => {
        consumed.push(type);
        origStop();
      };
      return event;
    };

    armContextualCoachmarkGestureSuppress(7);
    assert.equal(isContextualCoachmarkGestureSuppressArmed(), true);

    document.dispatchEvent(makeEvent("pointerup", 7));
    assert.ok(consumed.includes("pointerup"));

    document.dispatchEvent(makeEvent("click", 7));
    assert.ok(consumed.includes("click"));
    assert.equal(isContextualCoachmarkGestureSuppressArmed(), false);

    consumed.length = 0;
    document.dispatchEvent(makeEvent("pointerup", 7));
    document.dispatchEvent(makeEvent("click", 7));
    assert.deepEqual(consumed, []);
  });

  it("Heart exception still dismisses without arming outside suppress on target path", () => {
    const heartBranch = coachmarkSrc.slice(
      coachmarkSrc.indexOf("Like heart: dismiss without consuming"),
      coachmarkSrc.indexOf("Outside: dismiss and arm post-unmount suppress"),
    );
    assert.match(heartBranch, /onDismiss\(\)/);
    assert.doesNotMatch(heartBranch, /armContextualCoachmarkGestureSuppress/);
  });

  it("Like coachmark show/dismiss does not call playInteractionLight", () => {
    const likeHandler = homeSrc.slice(
      homeSrc.indexOf("const onLikedPost"),
      homeSrc.indexOf("const onArtistSelfTagReady"),
    );
    assert.doesNotMatch(likeHandler, /playInteractionLight/);
    assert.doesNotMatch(homeSrc, /if \(payload\.type === "random"\)/);
    const dismissBlock = homeSrc.slice(
      homeSrc.indexOf("handlePremiumCoachmarkDismiss"),
      homeSrc.indexOf("handlePremiumCoachmarkTargetLost"),
    );
    assert.doesNotMatch(dismissBlock, /playInteractionLight/);
    assert.doesNotMatch(coachmarkSrc, /playInteractionLight/);
  });

  it("persistHintSeen still writes localStorage for the like key", () => {
    const key = getHintLikeReleaseSeenKey("qa-user");
    const store: Record<string, string> = {};
    const prev = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    });
    try {
      persistHintSeen(key);
      assert.equal(store[key], "1");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: prev,
      });
    }
  });
});

describe("HINTS-PREMIUM-4 Random removed; artist self-tag on ContextualCoachmark", () => {
  it("removes proactive Random coaching while keeping dice functionality", () => {
    assert.doesNotMatch(homeSrc, /HINT_RANDOM_USED_EVENT/);
    assert.doesNotMatch(homeSrc, /getHintRandomSeenKey/);
    assert.doesNotMatch(homeSrc, /Tap the dice to jump into random/);
    assert.doesNotMatch(homeSrc, /hintOverlay/);
    assert.doesNotMatch(homeSrc, /Quick tip/);
    assert.doesNotMatch(homeSrc, /Got it/);
    assert.match(homeSrc, /RandomDiceButton/);
    assert.match(homeSrc, /loadNextRandom/);
    assert.match(homeSrc, /handleFeedSortChange\("random"\)/);
  });

  it("migrates artist self-tag to shared premium coachmark", () => {
    assert.match(coachmarkLibSrc, /ARTIST_SELF_TAG_COACHMARK_COPY/);
    assert.equal(
      ARTIST_SELF_TAG_COACHMARK_COPY,
      "Your track? Tag yourself in comments, then tap Mark ID.",
    );
    assert.match(homeSrc, /ARTIST_SELF_TAG_COACHMARK_COPY/);
    assert.match(homeSrc, /HINT_ARTIST_SELF_TAG_READY_EVENT/);
    assert.match(homeSrc, /type: "artist"/);
    assert.match(homeSrc, /activeHint\?\.type === "artist"/);
    assert.match(videoCardSrc, /data-video-comments-hit-target/);
    assert.match(videoCardSrc, /HINT_ARTIST_SELF_TAG_READY_EVENT/);
    assert.match(videoCardSrc, /artistSelfTagIntentRef/);
    // Artist-only structural gate on Comments open.
    assert.match(videoCardSrc, /userType === "artist" && verifiedArtist/);
    // No legacy teal ring / Got it / long paragraph / hint haptic for self-tag.
    assert.doesNotMatch(videoCardSrc, /Is this your ID\?/);
    assert.doesNotMatch(videoCardSrc, /button-dismiss-artist-self-tag-hint/);
    assert.doesNotMatch(videoCardSrc, /border border-\[#4ae9df\]\/80/);
    assert.doesNotMatch(videoCardSrc, /Got it/);
    const artistReady = videoCardSrc.slice(
      videoCardSrc.indexOf("HINT_ARTIST_SELF_TAG_READY_EVENT"),
      videoCardSrc.indexOf("HINT_ARTIST_SELF_TAG_READY_EVENT") + 800,
    );
    assert.doesNotMatch(artistReady, /playInteractionLight/);
  });

  it("artist hint joins shared mutex/pacing and debug-safe persist", () => {
    assert.match(homeSrc, /beginArtistSelfTagOccurrence/);
    assert.match(homeSrc, /getHintArtistSelfTagSeenKey/);
    assert.match(homeSrc, /suppressOccurrence\("artist"\)/);
    assert.match(homeSrc, /handlePremiumCoachmarkDismiss/);
    assert.match(homeSrc, /maybePersistHintSeen/);
    assert.match(homeSrc, /maybePersistHintSeen/);
    assert.match(homeSrc, /persistHintSeen/);
    assert.doesNotMatch(videoCardSrc, /localStorage\.setItem\(artistSelfTag/);
  });
});

describe("HINTS-PREMIUM-3 Discover + Comments premium paths", () => {
  it("uses premium copy and settle timings", () => {
    assert.match(coachmarkLibSrc, /DISCOVER_COACHMARK_COPY/);
    assert.match(coachmarkLibSrc, /COMMENTS_COACHMARK_COPY/);
    assert.match(homeSrc, /DISCOVER_HINT_SETTLE_MS/);
    assert.match(homeSrc, /DISCOVER_COACHMARK_COPY/);
    assert.match(homeSrc, /COMMENTS_COACHMARK_COPY/);
    assert.match(homeSrc, /HINT_COMMENTS_READY_EVENT/);
    assert.doesNotMatch(
      homeSrc,
      /Open Discover to change feed mode, genre, or ID status/,
    );
    assert.doesNotMatch(
      homeSrc,
      /Think you know the track\? Drop the ID in the comments/,
    );
  });

  it("does not keep Discover/Comments on legacy Quick tip overlay", () => {
    assert.match(homeSrc, /premiumCoachmark/);
    assert.match(
      homeSrc,
      /activeHint\?\.type === "like" \|\|[\s\S]*activeHint\?\.type === "genre" \|\|[\s\S]*activeHint\?\.type === "comments"/,
    );
    assert.doesNotMatch(homeSrc, /bottom:\s*"max\(7\.5rem/);
    assert.doesNotMatch(homeSrc, /Open Discover to change feed mode/);
  });

  it("Discover/Comments show paths do not call playInteractionLight", () => {
    const genreHandler = homeSrc.slice(
      homeSrc.indexOf("const onGenreOpened"),
      homeSrc.indexOf("const clearSurfaceHint"),
    );
    const commentsReady = homeSrc.slice(
      homeSrc.indexOf("const onCommentsReady"),
      homeSrc.indexOf("const onCommentsCompleted"),
    );
    assert.doesNotMatch(genreHandler, /playInteractionLight/);
    assert.doesNotMatch(commentsReady, /playInteractionLight/);
  });

  it("Comments settles then dispatches READY with measured sheet target above drawer", () => {
    assert.match(commentsSrc, /data-comments-sheet/);
    assert.match(commentsSrc, /data-comments-composer/);
    assert.match(commentsSrc, /HINT_COMMENTS_READY_EVENT/);
    assert.match(commentsSrc, /COMMENTS_HINT_SETTLE_MS/);
    assert.match(commentsSrc, /HINT_COMMENTS_COMPLETED_EVENT/);
    assert.match(commentsSrc, /placementVariant:\s*"comments-sheet-above"/);
    assert.match(commentsSrc, /positionMode:\s*"fixed"/);
    assert.match(commentsSrc, /target:\s*drawer/);
    assert.doesNotMatch(commentsSrc, /data-comments-coachmark-slot/);
    assert.doesNotMatch(commentsSrc, /positionMode:\s*"flow"/);
    assert.match(homeSrc, /placementVariant === "comments-sheet-above"/);
    assert.match(homeSrc, /stackZIndex=\{activeHint\.type === "comments" \? 115 : 62\}/);
    assert.match(homeSrc, /className=\{activeHint\.type === "comments" \? "text-center"/);
    assert.match(coachmarkSrc, /placeCommentsSheetCoachmark/);
    assert.match(coachmarkSrc, /comments-sheet-above/);
    // iOS KeyboardResize.None sets nativeKeyboardLayoutActive — must NOT block READY.
    assert.doesNotMatch(
      commentsSrc,
      /if \(nativeKeyboardLayoutActive \|\| nativeKeyboardInsetPx > 0\) return/,
    );
    assert.match(commentsSrc, /if \(nativeKeyboardInsetPx > 0\) return/);
  });

  it("Comments coachmark is centered above sheet — not legacy rem, not composer-attached", () => {
    assert.doesNotMatch(homeSrc, /bottom:\s*"max\(7\.5rem/);
    assert.doesNotMatch(homeSrc, /z-\[61\].*bottom/);
    assert.match(coachmarkLibSrc, /placeCommentsSheetCoachmark/);
    assert.equal(COMMENTS_SHEET_COACHMARK_GAP_PX, 12);
    assert.doesNotMatch(coachmarkSrc, /playInteractionLight/);
    assert.match(homeSrc, /dismissOnTargetInteract=\{activeHint\.type !== "comments"\}/);
    // Sheet stays interactive while tip is open (no consume on sheet taps).
    assert.match(coachmarkSrc, /dismissOnTargetInteract/);
  });

  it("placeCommentsSheetCoachmark centers above sheet and clamps when room is tight", () => {
    const sheet = {
      left: 0,
      top: 400,
      width: 390,
      height: 444,
      right: 390,
      bottom: 844,
    };
    const placed = placeCommentsSheetCoachmark({
      sheet,
      cardWidth: 240,
      cardHeight: 56,
      viewportWidth: 390,
      viewportHeight: 844,
      gap: 12,
      margin: 10,
    });
    assert.equal(placed.placement, "above");
    assert.equal(placed.top, 400 - 12 - 56);
    assert.equal(placed.left, Math.round((390 - 240) / 2));

    const tight = placeCommentsSheetCoachmark({
      sheet: { left: 0, top: 40, width: 320, height: 500, right: 320, bottom: 540 },
      cardWidth: 240,
      cardHeight: 56,
      viewportWidth: 320,
      viewportHeight: 568,
      gap: 12,
      margin: 10,
    });
    // Not enough room above → clamp to viewport margin (slight downward shift).
    assert.equal(tight.top, 10);
    assert.ok(tight.left >= 10);
    assert.ok(tight.left + 240 <= 310);
    // Card bottom stays well above composer region of a typical tall sheet.
    assert.ok(tight.top + 56 < 40 + 500 * 0.5);
  });

  it("skips Discover when measurement fails (no rem fallback)", () => {
    assert.match(homeSrc, /data-discover-panel/);
    assert.match(homeSrc, /if \(rect\.width < 1 \|\| rect\.height < 1\) return/);
    assert.doesNotMatch(homeSrc, /top:\s*140/);
  });

  it("Discover settle delay is a comfortable beat (~520ms), not immediate", () => {
    assert.match(coachmarkLibSrc, /DISCOVER_HINT_SETTLE_MS = 520/);
    assert.match(homeSrc, /DISCOVER_HINT_SETTLE_MS/);
    assert.match(homeSrc, /if \(!genreMenuOpenRef\.current\) return/);
  });
});
