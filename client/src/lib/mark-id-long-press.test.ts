/**
 * MARK-ID-UX-1 / 1B — owner long-press → preselect CommunityVerificationDialog.
 * Pure helpers + source wiring contracts. Does not hit network.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DELETED_COMMENT_BODY } from "@shared/deleted-comment";
import {
  MARK_ID_LONG_PRESS_ARMED_CLASS,
  MARK_ID_LONG_PRESS_MS,
  MARK_ID_LONG_PRESS_MOVE_SLOP_PX,
  MARK_ID_LONG_PRESS_OPEN_DELAY_MS,
  isCommentEligibleForOwnerMarkAsId,
  isMarkIdLongPressInteractiveTarget,
  isOwnerCommunityMarkEligible,
  runAcceptedMarkIdLongPress,
  shouldCancelMarkIdLongPressForMove,
} from "./mark-id-long-press";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const communityDialogSrc = readFileSync(
  join(here, "../components/community-verification-dialog.tsx"),
  "utf8",
);
const markIdSrc = readFileSync(join(here, "./mark-id-long-press.ts"), "utf8");
const idMarkingStylesSrc = readFileSync(
  join(here, "../components/id-marking-dialog-styles.ts"),
  "utf8",
);
const indexCssSrc = readFileSync(join(here, "../index.css"), "utf8");

const unidentifiedOwnerPost = {
  userId: "owner-1",
  comments: 2,
  verificationStatus: "unverified",
  isVerifiedCommunity: false,
  isVerifiedArtist: false,
  artistVerifiedBy: null,
};

describe("MARK-ID-UX-1 eligibility helpers", () => {
  it("owner of unidentified post with comments is eligible", () => {
    assert.equal(isOwnerCommunityMarkEligible(unidentifiedOwnerPost, "owner-1"), true);
  });

  it("non-owner gets no action", () => {
    assert.equal(isOwnerCommunityMarkEligible(unidentifiedOwnerPost, "other-user"), false);
    assert.equal(isOwnerCommunityMarkEligible(unidentifiedOwnerPost, null), false);
  });

  it("already-identified / community post gets no action", () => {
    assert.equal(
      isOwnerCommunityMarkEligible(
        { ...unidentifiedOwnerPost, verificationStatus: "community" },
        "owner-1",
      ),
      false,
    );
    assert.equal(
      isOwnerCommunityMarkEligible(
        { ...unidentifiedOwnerPost, verificationStatus: "identified" },
        "owner-1",
      ),
      false,
    );
    assert.equal(
      isOwnerCommunityMarkEligible(
        { ...unidentifiedOwnerPost, isVerifiedArtist: true, artistVerifiedBy: "artist-9" },
        "owner-1",
      ),
      false,
    );
  });

  it("owner's own comment body remains eligible; deleted does not", () => {
    assert.equal(isCommentEligibleForOwnerMarkAsId("this is my ID guess"), true);
    assert.equal(isCommentEligibleForOwnerMarkAsId(DELETED_COMMENT_BODY), false);
  });

  it("uses a deliberate long-press interval and sensible move slop", () => {
    assert.ok(MARK_ID_LONG_PRESS_MS >= 450);
    assert.ok(MARK_ID_LONG_PRESS_MS <= 600);
    assert.ok(MARK_ID_LONG_PRESS_MOVE_SLOP_PX >= 8);
    assert.equal(shouldCancelMarkIdLongPressForMove(0, 0, 3, 3), false);
    assert.equal(shouldCancelMarkIdLongPressForMove(0, 0, 0, 12), true);
  });

  it("interactive child controls are ignored for parent Mark long-press", () => {
    assert.equal(isMarkIdLongPressInteractiveTarget(null), false);
    assert.match(
      markIdSrc,
      /button, a, input, textarea, select, \[role="button"\], \[role="menuitem"\], \[data-mark-id-long-press-ignore="true"\]/,
    );
  });
});

describe("MARK-ID-UX-1B haptic → dialog rhythm", () => {
  it("fires haptic before dialog-open and does not open synchronously", () => {
    const order: string[] = [];
    let scheduled: Array<() => void> = [];
    const { cancelOpen } = runAcceptedMarkIdLongPress({
      suppressNativeSelection: () => order.push("suppress"),
      playHaptic: () => order.push("haptic"),
      openDialog: () => order.push("open"),
      delayMs: 72,
      setTimeoutFn: ((fn: () => void) => {
        scheduled.push(fn);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeoutFn: (() => {}) as typeof clearTimeout,
    });

    assert.deepEqual(order, ["suppress", "haptic"]);
    assert.equal(scheduled.length, 1);
    scheduled[0]!();
    assert.deepEqual(order, ["suppress", "haptic", "open"]);
    cancelOpen();
  });

  it("delayed open fires once and cancel prevents open", () => {
    let openCount = 0;
    let scheduled: Array<() => void> = [];
    let cleared = 0;
    const { cancelOpen } = runAcceptedMarkIdLongPress({
      suppressNativeSelection: () => {},
      playHaptic: () => {},
      openDialog: () => {
        openCount += 1;
      },
      delayMs: 50,
      setTimeoutFn: ((fn: () => void) => {
        scheduled.push(fn);
        return 7 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeoutFn: (() => {
        cleared += 1;
      }) as typeof clearTimeout,
    });

    cancelOpen();
    assert.equal(cleared, 1);
    scheduled[0]!();
    assert.equal(openCount, 0, "cancelled open must not run");

    scheduled = [];
    runAcceptedMarkIdLongPress({
      suppressNativeSelection: () => {},
      playHaptic: () => {},
      openDialog: () => {
        openCount += 1;
      },
      delayMs: 50,
      setTimeoutFn: ((fn: () => void) => {
        scheduled.push(fn);
        return 8 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeoutFn: (() => {}) as typeof clearTimeout,
    });
    assert.equal(scheduled.length, 1);
    scheduled[0]!();
    assert.equal(openCount, 1);
  });

  it("open delay is short (50–100ms) and wired in Comments after haptic helper", () => {
    assert.ok(MARK_ID_LONG_PRESS_OPEN_DELAY_MS >= 50);
    assert.ok(MARK_ID_LONG_PRESS_OPEN_DELAY_MS <= 100);
    assert.match(commentsSrc, /runAcceptedMarkIdLongPress/);
    assert.match(commentsSrc, /playInteractionLight/);
    assert.doesNotMatch(
      commentsSrc,
      /playInteractionLight\(\);\s*\n\s*onRequestOwnerCommunityVerify/,
    );
  });

  it("cleanup cancels hold + open timers on unmount / sheet close", () => {
    assert.match(commentsSrc, /openTimerCancel/);
    assert.match(commentsSrc, /return \(\) => clearMarkIdLongPress\(\)/);
    assert.match(commentsSrc, /if \(!isOpen\) clearMarkIdLongPress\(\)/);
  });
});

describe("MARK-ID-UX-1B text-selection suppression", () => {
  it("applies gesture-scoped armed class + selectstart prevent, not permanent Comments select-none", () => {
    assert.equal(MARK_ID_LONG_PRESS_ARMED_CLASS, "mark-id-long-press-armed");
    assert.match(indexCssSrc, /\.mark-id-long-press-armed/);
    assert.match(indexCssSrc, /-webkit-touch-callout:\s*none/);
    assert.match(markIdSrc, /selectstart/);
    assert.match(commentsSrc, /armMarkIdLongPressSelectionGuard/);
    assert.match(commentsSrc, /disarmMarkIdLongPressSelectionGuard/);
    assert.doesNotMatch(commentsSrc, /COMMENTS_SHEET_SURFACE_CLASS[\s\S]{0,80}select-none/);
  });
});

describe("MARK-ID-UX-1 CommunityVerificationDialog initial selection", () => {
  it("accepts optional initialCommentId and does not auto-submit", () => {
    assert.match(communityDialogSrc, /initialCommentId\?:/);
    assert.match(communityDialogSrc, /setSelectedCommentId\(trimmed\)/);
    assert.match(communityDialogSrc, /button-submit-verification/);
    assert.doesNotMatch(
      communityDialogSrc,
      /useEffect\([\s\S]{0,200}verifyMutation\.mutate/,
    );
    assert.match(communityDialogSrc, /\/api\/posts\/\$\{postId\}\/community-verify/);
  });
});

describe("MARK-ID-UX-1 VideoCard / Comments wiring", () => {
  it("rail Mark opens dialog without forced selection", () => {
    assert.match(
      videoCardSrc,
      /setCommunityVerifyInitialCommentId\(null\)[\s\S]{0,80}setShowVerificationDialog\(true\)/,
    );
    assert.match(videoCardSrc, /data-testid=\{isOwner \? "button-community-verify"/);
  });

  it("Comments can request open with exact commentId; long-press does not submit", () => {
    assert.match(videoCardSrc, /onRequestOwnerCommunityVerify=/);
    assert.match(
      videoCardSrc,
      /setCommunityVerifyInitialCommentId\(commentId\)[\s\S]{0,120}setShowVerificationDialog\(true\)/,
    );
    assert.match(commentsSrc, /onRequestOwnerCommunityVerify/);
    assert.match(commentsSrc, /MARK_ID_LONG_PRESS_MS/);
    assert.match(commentsSrc, /playInteractionLight/);
    assert.doesNotMatch(commentsSrc, /community-verify/);
    assert.doesNotMatch(commentsSrc, /verifyMutation/);
  });

  it("gates long-press on owner eligibility + non-deleted comments; replies eligible", () => {
    assert.match(videoCardSrc, /isOwnerCommunityMarkEligible\(/);
    assert.match(commentsSrc, /ownerCommunityMarkEnabled/);
    assert.match(commentsSrc, /isCommentEligibleForOwnerMarkAsId/);
    assert.match(commentsSrc, /isMarkIdLongPressInteractiveTarget/);
    assert.match(commentsSrc, /bindMarkIdLongPressHandlers\(comment\.id/);
    assert.match(commentsSrc, /bindMarkIdLongPressHandlers\(reply\.id/);
  });

  it("normal tap path does not open ID dialog from Comments (no click→verify)", () => {
    assert.doesNotMatch(commentsSrc, /onClick=\{[^}]*onRequestOwnerCommunityVerify/);
    assert.match(commentsSrc, /MARK_ID_LONG_PRESS_MS/);
  });

  it("scroll cancellation still uses move slop before accept", () => {
    assert.match(commentsSrc, /shouldCancelMarkIdLongPressForMove/);
    assert.match(commentsSrc, /if \(!session\.accepted/);
  });

  it("reuses existing light haptic; no new native haptic dependency in this module", () => {
    assert.match(markIdSrc, /MARK_ID_LONG_PRESS_MS/);
    assert.doesNotMatch(markIdSrc, /@capacitor\/haptics|Haptics\.impact/);
    assert.match(commentsSrc, /from "@\/lib\/haptic"/);
  });

  it("ID dialog stacks above Comments and reuses fade/zoom entrance animation", () => {
    assert.match(idMarkingStylesSrc, /z-\[120\]/);
    assert.match(idMarkingStylesSrc, /data-\[state=open\]:animate-in/);
    assert.match(idMarkingStylesSrc, /data-\[state=open\]:zoom-in-95/);
    assert.match(idMarkingStylesSrc, /motion-reduce:animate-none/);
  });
});
