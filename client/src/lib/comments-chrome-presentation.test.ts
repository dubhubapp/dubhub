/**
 * COMMENTS-CHROME-1 / COMMENTS-CHROME-2 — Comments sheet header + composer + like chrome.
 * Source-only: does not exercise open/close lifecycle, sort mutation behaviour,
 * or comment submission / like API behaviour.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

const headerIconConst = commentsSrc.slice(
  commentsSrc.indexOf("const COMMENTS_HEADER_ICON_BUTTON_CLASS"),
  commentsSrc.indexOf("const COMMENTS_COMPOSER_SEND_BUTTON_CLASS"),
);

const sendButtonConst = commentsSrc.slice(
  commentsSrc.indexOf("const COMMENTS_COMPOSER_SEND_BUTTON_CLASS"),
  commentsSrc.indexOf("const COMMENTS_COMPOSER_SEND_ICON_CLASS"),
);

const sendIconConst = commentsSrc.slice(
  commentsSrc.indexOf("const COMMENTS_COMPOSER_SEND_ICON_CLASS"),
  commentsSrc.indexOf("const COMMENTS_LIKE_BUTTON_CLASS"),
);

const likeButtonConst = commentsSrc.slice(
  commentsSrc.indexOf("const COMMENTS_LIKE_BUTTON_CLASS"),
  commentsSrc.indexOf("const COMMENTS_LIKE_BUTTON_LIKED_CLASS"),
);

const likeLikedConst = commentsSrc.slice(
  commentsSrc.indexOf("const COMMENTS_LIKE_BUTTON_LIKED_CLASS"),
  commentsSrc.indexOf("const COMMENTS_LIKE_BUTTON_UNLIKED_CLASS"),
);

const likeUnlikedConst = commentsSrc.slice(
  commentsSrc.indexOf("const COMMENTS_LIKE_BUTTON_UNLIKED_CLASS"),
  commentsSrc.indexOf("/** Canonical Home Identified pill"),
);

const headerBlock = commentsSrc.slice(
  commentsSrc.indexOf("{/* Header — title absolutely centered"),
  commentsSrc.indexOf("{/* Comments List */}"),
);

const composerFormBlock = commentsSrc.slice(
  commentsSrc.indexOf('<form onSubmit={handleSubmit}>'),
  commentsSrc.indexOf("{newComment.length > INPUT_LIMITS.commentBody &&"),
);

describe("COMMENTS-CHROME-1 header", () => {
  it("no longer renders a visible X close control in the Comments header", () => {
    assert.doesNotMatch(headerBlock, /onClick=\{handleClose\}/);
    assert.doesNotMatch(headerBlock, /<X className=/);
    assert.doesNotMatch(headerBlock, /\bh-7 w-7\b/);
  });

  it("keeps sort/filter control on the far right with aria + test id", () => {
    assert.match(headerBlock, /data-testid="comments-filter-menu-trigger"/);
    assert.match(headerBlock, /aria-label="Sort comments"/);
    assert.match(headerBlock, /<ArrowUpDown className="h-4 w-4"/);
    assert.match(headerBlock, /data-testid="comments-filter-all"/);
    assert.match(headerBlock, /data-testid="comments-filter-newest"/);
    assert.match(headerBlock, /data-testid="comments-filter-top"/);
    assert.match(headerBlock, /onSelect=\{\(\) => setCommentFilter\("all"\)\}/);
    assert.match(headerBlock, /onSelect=\{\(\) => setCommentFilter\("newest"\)\}/);
    assert.match(headerBlock, /onSelect=\{\(\) => setCommentFilter\("top"\)\}/);
  });

  it("sort/filter control has no visible circle/container chrome", () => {
    assert.match(headerBlock, /className=\{COMMENTS_HEADER_ICON_BUTTON_CLASS\}/);
    assert.doesNotMatch(headerIconConst, /rounded-full/);
    assert.doesNotMatch(headerIconConst, /border border-black\/5/);
    assert.doesNotMatch(headerIconConst, /bg-black\/\[0\.04\]/);
    assert.doesNotMatch(headerIconConst, /dark:bg-white\/\[0\.06\]/);
    assert.match(headerIconConst, /bg-transparent/);
    assert.match(headerIconConst, /\bh-8 w-8\b/);
  });

  it("keeps Comments title absolutely centered with balanced side slots", () => {
    assert.match(
      headerBlock,
      /absolute left-1\/2 z-20 -translate-x-1\/2 text-base font-semibold/,
    );
    assert.match(headerBlock, />\s*Comments\s*</);
    assert.match(headerBlock, /relative z-20 h-8 w-8" aria-hidden/);
    assert.match(headerBlock, /relative z-20 flex items-center justify-end/);
  });

  it("does not change sheet close wiring outside the removed header X", () => {
    assert.match(commentsSrc, /if \(!open\) handleClose\(\);/);
    assert.match(commentsSrc, /const handleClose = useCallback\(\(\) => \{/);
  });
});

describe("COMMENTS-CHROME-2 composer", () => {
  it("COMMENTS-CHROME-2E: grid row with equal gaps; avatar box unchanged", () => {
    assert.match(commentsSrc, /const COMMENTS_COMPOSER_ROW_CLASS/);
    assert.match(
      commentsSrc,
      /grid w-full grid-cols-\[auto_minmax\(0,1fr\)_auto\] items-center gap-x-2\.5/,
    );
    assert.match(composerFormBlock, /className=\{COMMENTS_COMPOSER_ROW_CLASS\}/);
    assert.match(commentsSrc, /const COMMENTS_COMPOSER_AVATAR_BOX_CLASS = "h-7 w-7 sm:h-8 sm:w-8"/);
    assert.match(
      composerFormBlock,
      /className=\{`flex \$\{COMMENTS_COMPOSER_AVATAR_BOX_CLASS\} flex-shrink-0/,
    );
    assert.match(
      composerFormBlock,
      /avatar-media pointer-events-none \$\{COMMENTS_COMPOSER_AVATAR_BOX_CLASS\} rounded-full border-2/,
    );
    assert.match(
      composerFormBlock,
      /min-h-\[44px\] min-w-0 flex-1 resize-none/,
    );
    assert.doesNotMatch(composerFormBlock, /items-end/);
    assert.doesNotMatch(composerFormBlock, /space-x-2/);
    assert.doesNotMatch(composerFormBlock, /-translate-/);
    assert.doesNotMatch(composerFormBlock, /-m[xyltrb]?-/);
  });

  it("COMMENTS-CHROME-2E: send visible Ø matches avatar outer (+2px optical); circle always visible", () => {
    assert.match(composerFormBlock, /className=\{COMMENTS_COMPOSER_SEND_BUTTON_CLASS\}/);
    assert.match(sendButtonConst, /rounded-full/);
    // Avatar visible outer = 28/32 (h-7/sm:h-8 border-box + border-2).
    // Send filled disc = 30/34 so it reads the same size.
    assert.match(sendButtonConst, /h-\[30px\] w-\[30px\]/);
    assert.match(sendButtonConst, /sm:h-\[34px\] sm:w-\[34px\]/);
    assert.doesNotMatch(sendButtonConst, /\bh-7 w-7\b/);
    assert.doesNotMatch(sendButtonConst, /\bh-5 w-5\b/);
    assert.doesNotMatch(sendButtonConst, /\bh-6 w-6\b/);
    assert.match(sendButtonConst, /bg-\[#0a83ff\]/);
    assert.match(sendButtonConst, /disabled:bg-black\/\[0\.06\]/);
    assert.match(sendButtonConst, /dark:disabled:bg-white\/\[0\.08\]/);
    assert.doesNotMatch(sendButtonConst, /disabled:bg-transparent/);
    assert.doesNotMatch(sendButtonConst, /before:-inset-3/);
  });

  it("COMMENTS-CHROME-2D/2E: disabled muted; enabled lights up with white arrow; size stable", () => {
    assert.match(sendButtonConst, /text-white/);
    assert.match(sendButtonConst, /disabled:text-gray-400/);
    assert.match(sendButtonConst, /dark:disabled:text-white\/35/);
    assert.match(sendButtonConst, /transition-colors/);
    assert.doesNotMatch(sendButtonConst, /animate-|pulse|bounce|scale-\[/);
    assert.doesNotMatch(sendButtonConst, /disabled:h-|enabled:h-|disabled:w-|enabled:w-/);
    assert.match(sendButtonConst, /h-\[30px\] w-\[30px\][\s\S]*sm:h-\[34px\] sm:w-\[34px\]/);
  });

  it("COMMENTS-CHROME-2G: thin symmetrical outlined send arrow; not filled or Lucide ArrowUp", () => {
    assert.match(commentsSrc, /function CommentsComposerSendArrow/);
    // Outlined: no fill, round stroke; single chevron + stem (not two Lucide paths).
    assert.match(
      commentsSrc,
      /d="M6\.5 10\.5L12 5L17\.5 10\.5M12 5V19"/,
    );
    assert.match(commentsSrc, /fill="none"/);
    assert.match(commentsSrc, /stroke="currentColor"/);
    assert.match(commentsSrc, /strokeLinecap="round"/);
    assert.match(commentsSrc, /strokeLinejoin="round"/);
    assert.match(commentsSrc, /strokeWidth="1\.75"/);
    // Filled chunky upload arrow removed.
    assert.doesNotMatch(commentsSrc, /d="M12 4L5 12h4v8h6v-8h4L12 4z"/);
    assert.doesNotMatch(commentsSrc, /c\.2 0 \.39\.08\.53\.22/);
    assert.match(
      composerFormBlock,
      /<CommentsComposerSendArrow className=\{COMMENTS_COMPOSER_SEND_ICON_CLASS\}/,
    );
    assert.doesNotMatch(composerFormBlock, /<ArrowUp\b/);
    assert.doesNotMatch(
      commentsSrc.slice(0, commentsSrc.indexOf("function CommentsModal")),
      /,\s*ArrowUp,/,
    );
    assert.doesNotMatch(sendIconConst, /-translate-x-/);
    assert.match(sendIconConst, /\bh-3\.5 w-3\.5\b/);
    assert.doesNotMatch(composerFormBlock, /<Send\b/);
    assert.match(videoCardSrc, /aria-label="Share video"/);
    assert.match(videoCardSrc, /<Send className="h-7 w-7 text-white"/);
    // Mark ID rail: plain Check + visible ID; descriptive aria (not ShieldCheck).
    assert.match(videoCardSrc, /<Check className="h-6 w-6 text-blue-400"/);
    assert.match(
      videoCardSrc,
      /aria-label=\{isOwner \? "Mark as identified" : "Confirm or deny track"\}/,
    );
    assert.match(
      videoCardSrc,
      /text-blue-400 drop-shadow-\[0_1px_2px_rgba\(0,0,0,0\.75\)\]">\s*ID\s*</,
    );
    assert.doesNotMatch(videoCardSrc, /isOwner \? "Mark" : "ID"/);
    assert.doesNotMatch(
      videoCardSrc,
      /ShieldCheck className="h-6 w-6 text-blue-400"/,
    );
  });

  it("COMMENTS-CHROME-2E: matched left/right outer pad and equal input side gaps", () => {
    assert.match(
      commentsSrc,
      /grid w-full grid-cols-\[auto_minmax\(0,1fr\)_auto\] items-center gap-x-2\.5/,
    );
    assert.doesNotMatch(composerFormBlock, /gap-2[^\.]/);
    assert.doesNotMatch(composerFormBlock, /gap-3/);
    // Same horizontal padding on both sides of the composer strip.
    assert.match(
      commentsSrc,
      /relative z-20 px-3\.5 pb-\[calc\(0\.5rem\+env\(safe-area-inset-bottom,0px\)\)\] pt-2/,
    );
    assert.match(commentsSrc, /sm:px-4/);
    assert.doesNotMatch(composerFormBlock, /pl-|pr-|ml-|mr-/);
  });

  it("preserves submit wiring, disabled gate, and accessible label", () => {
    assert.match(composerFormBlock, /type="submit"/);
    assert.match(composerFormBlock, /data-testid="comment-submit"/);
    assert.match(composerFormBlock, /aria-label="Send comment"/);
    assert.match(composerFormBlock, /!newComment\.trim\(\)/);
    assert.match(composerFormBlock, /addCommentMutation\.isPending/);
    assert.match(commentsSrc, /<form onSubmit=\{handleSubmit\}>/);
  });

  it("keeps keyboard/safe-area composer chrome unchanged", () => {
    assert.match(
      commentsSrc,
      /relative z-20 px-3\.5 pb-\[calc\(0\.5rem\+env\(safe-area-inset-bottom,0px\)\)\] pt-2/,
    );
    assert.match(commentsSrc, /data-comments-composer/);
  });
});

describe("COMMENTS-CHROME-2 comment hearts", () => {
  it("like button has no visible circular chrome in resting or liked state", () => {
    assert.doesNotMatch(likeButtonConst, /rounded-full/);
    assert.doesNotMatch(likeButtonConst, /hover:bg-gray-100/);
    assert.doesNotMatch(likeButtonConst, /dark:hover:bg-muted/);
    assert.match(likeButtonConst, /bg-transparent/);
    assert.match(likeButtonConst, /hover:bg-transparent/);
    assert.match(likeButtonConst, /focus:bg-transparent/);
    assert.match(likeButtonConst, /active:bg-transparent/);
    assert.doesNotMatch(likeLikedConst, /bg-pink/);
    assert.doesNotMatch(likeUnlikedConst, /bg-/);
    assert.match(likeLikedConst, /text-pink-600/);
    assert.match(likeUnlikedConst, /text-gray-500/);
  });

  it("wires shared like classes for top-level and reply hearts", () => {
    assert.equal(
      (commentsSrc.match(/COMMENTS_LIKE_BUTTON_CLASS,/g) ?? []).length,
      2,
    );
    assert.equal(
      (commentsSrc.match(/COMMENTS_LIKE_BUTTON_LIKED_CLASS/g) ?? []).length,
      3, // const + 2 call sites
    );
    assert.equal(
      (commentsSrc.match(/COMMENTS_LIKE_BUTTON_UNLIKED_CLASS/g) ?? []).length,
      3,
    );
  });

  it("does not change like/unlike wiring or hit-target size", () => {
    assert.match(likeButtonConst, /\bh-8 w-8\b/);
    assert.match(commentsSrc, /handleToggleCommentLike\(comment\.id\)/);
    assert.match(commentsSrc, /handleToggleCommentLike\(reply\.id\)/);
    assert.match(commentsSrc, /data-testid=\{`button-like-\$\{comment\.id\}`\}/);
    assert.match(commentsSrc, /data-testid=\{`button-like-\$\{reply\.id\}`\}/);
    assert.match(commentsSrc, /userVote === "upvote"/);
    assert.match(commentsSrc, /fill=\{comment\.userVote === "upvote" \? "currentColor" : "none"\}/);
    assert.match(commentsSrc, /fill=\{reply\.userVote === "upvote" \? "currentColor" : "none"\}/);
  });
});
