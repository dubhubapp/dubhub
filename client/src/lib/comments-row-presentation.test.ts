/**
 * COMMENTS-DENSITY-2 — Comments sheet row presentation contract.
 * Source-only: does not exercise fetch, like mutations, or sheet lifecycle.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");

const normalRowConst = commentsSrc.slice(
  commentsSrc.indexOf("const COMMENTS_NORMAL_ROW_CLASS"),
  commentsSrc.indexOf("const COMMENTS_PIN_ICON_CLASS"),
);

describe("COMMENTS-DENSITY-2 row chrome", () => {
  it("COMMENTS_NORMAL_ROW_CLASS no longer draws a bottom divider or pb-2", () => {
    assert.doesNotMatch(normalRowConst, /border-b/);
    assert.doesNotMatch(normalRowConst, /pb-2/);
    assert.doesNotMatch(normalRowConst, /border-black\/\[0\.05\]/);
    assert.doesNotMatch(normalRowConst, /border-white\/\[0\.06\]/);
  });

  it("does not keep a duplicate divider fallback on the top-level row", () => {
    assert.doesNotMatch(commentsSrc, /highlightClass \|\| "border-b/);
    assert.doesNotMatch(
      commentsSrc,
      /highlightClass \|\| "border-b border-black\/\[0\.05\] pb-2 dark:border-white\/\[0\.06\]"/,
    );
    assert.match(commentsSrc, /className=\{cn\("flex items-start space-x-2", highlightClass\)\}/);
  });

  it("keeps header, composer, thread, and tagged-card chrome", () => {
    assert.match(
      commentsSrc,
      /border-b border-black\/5 px-4 py-3 dark:border-white\/\[0\.08\]/,
    );
    assert.match(
      commentsSrc,
      /relative z-20 px-3\.5 pb-\[calc\(0\.5rem\+env\(safe-area-inset-bottom,0px\)\)\] pt-2/,
    );
    assert.doesNotMatch(commentsSrc, /border-t border-black\/5 px-3\.5/);
    assert.match(
      commentsSrc,
      /ml-7 mt-2 space-y-2\.5 border-l-2 border-gray-100 pl-2\.5/,
    );
    assert.match(
      commentsSrc,
      /const COMMENTS_TAGGED_ROW_CLASS =\s*"rounded-lg border border-amber-400\/25/,
    );
  });

  it("uses whitespace-only list separation and keeps Identified glow inset", () => {
    assert.match(commentsSrc, /space-y-2 pt-4/);
    assert.doesNotMatch(commentsSrc, /space-y-3 pt-4/);
    assert.doesNotMatch(commentsSrc, /space-y-2 pt-4[\s\S]{0,80}pb-2/);
  });

  it("places action rows in the text column with shared mt-0.5, not under the heart flex", () => {
    assert.match(commentsSrc, /mt-0\.5 flex items-center gap-2/);
    assert.equal(
      (commentsSrc.match(/mt-0\.5 flex items-center gap-2/g) ?? []).length,
      2,
    );
    assert.doesNotMatch(commentsSrc, /-mt-1 flex items-center gap-2/);
    assert.match(commentsSrc, /-my-1\.5 inline-flex h-7 w-7 shrink-0 touch-manipulation/);
    assert.match(commentsSrc, /sm:h-8 sm:w-8/);

    const topLevelBlock = commentsSrc.slice(
      commentsSrc.indexOf("data-comment-id={comment.id}"),
      commentsSrc.indexOf("ml-7 mt-2 space-y-2.5 border-l-2"),
    );
    const topActionAt = topLevelBlock.indexOf("mt-0.5 flex items-center gap-2");
    const topHeartAt = topLevelBlock.indexOf("mt-0.5 flex w-8 shrink-0 flex-col items-center");
    assert.ok(topActionAt >= 0 && topHeartAt > topActionAt);

    const replyBlock = commentsSrc.slice(
      commentsSrc.indexOf("data-comment-id={reply.id}"),
      commentsSrc.indexOf("show-more-replies"),
    );
    const replyActionAt = replyBlock.indexOf("mt-0.5 flex items-center gap-2");
    const replyHeartAt = replyBlock.indexOf("mt-0.5 flex w-8 shrink-0 flex-col items-center");
    assert.ok(replyActionAt >= 0 && replyHeartAt > replyActionAt);
  });
});

describe("COMMENTS-DENSITY-2 heart column + actions", () => {
  it("places like controls in a right-side column with a 32px hit target", () => {
    assert.match(commentsSrc, /flex w-8 shrink-0 flex-col items-center/);
    assert.match(commentsSrc, /const COMMENTS_LIKE_BUTTON_CLASS =\s*"flex h-8 w-8/);
    assert.equal(
      (commentsSrc.match(/flex w-8 shrink-0 flex-col items-center/g) ?? []).length,
      2,
    );
  });

  it("keeps like, reply, and overflow test ids plus existing aria-labels", () => {
    assert.match(commentsSrc, /data-testid=\{`button-like-\$\{comment\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`button-like-\$\{reply\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`reply-button-\$\{comment\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`reply-button-\$\{reply\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`comment-actions-trigger-\$\{comment\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`comment-actions-trigger-\$\{reply\.id\}`\}/);
    assert.match(commentsSrc, /aria-label="Comment actions"/);
    assert.match(commentsSrc, /aria-label="Reply actions"/);
  });

  it("keeps overflow hit targets and scroll targeting attributes", () => {
    assert.match(commentsSrc, /-my-1\.5 inline-flex h-7 w-7 shrink-0 touch-manipulation/);
    assert.match(commentsSrc, /-my-1 inline-flex h-6 w-6 shrink-0 items-center justify-center/);
    assert.match(commentsSrc, /data-comment-id=\{comment\.id\}/);
    assert.match(commentsSrc, /data-comment-id=\{reply\.id\}/);
  });

  it("does not change like mutation wiring", () => {
    assert.match(commentsSrc, /handleToggleCommentLike\(comment\.id\)/);
    assert.match(commentsSrc, /handleToggleCommentLike\(reply\.id\)/);
    assert.match(commentsSrc, /userVote === "upvote"/);
    assert.match(commentsSrc, /voteScore \?\? 0/);
  });
});

describe("COMMENTS-POLISH-2 pin metadata + composer fade", () => {
  const pinToken = commentsSrc.slice(
    commentsSrc.indexOf("const COMMENTS_PIN_ICON_CLASS"),
    commentsSrc.indexOf("function getAppViewportHostEl"),
  );

  it("pin token is in-flow metadata, not absolutely parked on the right edge", () => {
    assert.match(pinToken, /pointer-events-none/);
    assert.match(pinToken, /h-3\.5 w-3\.5 shrink-0/);
    assert.doesNotMatch(pinToken, /\babsolute\b/);
    assert.doesNotMatch(pinToken, /\bright-0\b/);
    assert.doesNotMatch(pinToken, /\btop-0\.5\b/);
  });

  it("renders the pin after the timestamp at all three audited sites", () => {
    const pinnedCard = commentsSrc.slice(
      commentsSrc.indexOf('data-testid="pinned-verified-reply"'),
      commentsSrc.indexOf("renderTopLevelComment ="),
    );
    const topLevel = commentsSrc.slice(
      commentsSrc.indexOf("data-comment-id={comment.id}"),
      commentsSrc.indexOf("ml-7 mt-2 space-y-2.5 border-l-2"),
    );
    const reply = commentsSrc.slice(
      commentsSrc.indexOf("data-comment-id={reply.id}"),
      commentsSrc.indexOf("show-more-replies"),
    );

    for (const block of [pinnedCard, topLevel, reply]) {
      const timeAt = block.lastIndexOf("formatTimeAgo(");
      const pinAt = block.lastIndexOf("<Pin className={COMMENTS_PIN_ICON_CLASS}");
      assert.ok(timeAt >= 0 && pinAt > timeAt);
    }
  });

  it("lets nested reply metadata wrap and drops pin-only pr-5", () => {
    const replyMeta = commentsSrc.slice(
      commentsSrc.indexOf("data-comment-id={reply.id}"),
      commentsSrc.indexOf("{formatTimeAgo(reply.createdAt)}"),
    );
    assert.match(replyMeta, /flex flex-wrap items-center gap-x-1\.5 gap-y-0\.5/);
    assert.doesNotMatch(commentsSrc, /isPinnedIdentificationComment && "pr-5"/);
    assert.doesNotMatch(commentsSrc, /gap-y-0\.5 pr-5/);
    assert.doesNotMatch(
      commentsSrc,
      /\(isVerifiedReply \|\| isArtistConfirmationReply\) && "pr-5"/,
    );
  });

  it("adds a 20px pointer-events-none list-edge fade without blur or composer border-t", () => {
    const fadeOpen = commentsSrc.indexOf(
      'pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent dark:from-[#141a2e]',
    );
    assert.ok(fadeOpen >= 0);
    const fadeClass = commentsSrc.slice(fadeOpen, fadeOpen + 160);
    assert.match(fadeClass, /pointer-events-none/);
    assert.match(fadeClass, /\bh-5\b/);
    assert.doesNotMatch(fadeClass, /backdrop-blur/);
    assert.doesNotMatch(fadeClass, /backdrop-filter/);
    assert.doesNotMatch(fadeClass, /mask-image/);
    assert.match(commentsSrc, /className="relative min-h-0 flex-1"/);
    assert.match(commentsSrc, /h-full overflow-y-auto px-3\.5 pb-6 sm:px-4/);
    assert.doesNotMatch(commentsSrc, /overflow-y-auto px-3\.5 pb-2\.5/);
    assert.doesNotMatch(commentsSrc, /border-t border-black\/5 px-3\.5/);
  });

  it("does not change heart or Reply presentation contracts", () => {
    assert.match(commentsSrc, /flex w-8 shrink-0 flex-col items-center/);
    assert.match(commentsSrc, /COMMENTS_LIKE_BUTTON_CLASS/);
    assert.match(commentsSrc, /data-testid=\{`reply-button-\$\{comment\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`reply-button-\$\{reply\.id\}`\}/);
  });
});
