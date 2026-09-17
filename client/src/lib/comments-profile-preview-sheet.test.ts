import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_PREVIEW_ABOVE_COMMENTS_Z_CLASS,
  PROFILE_PREVIEW_CLOSE_MS,
  PROFILE_PREVIEW_OPEN_MS,
} from "./user-profile-light-preview";
import { nativeNavIsCoveredBySheet } from "./native-nav-contract";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const drawerUiSrc = readFileSync(join(here, "../components/ui/drawer.tsx"), "utf8");

describe("Comments profile preview sheet — presentation", () => {
  it("Comments identity taps use Profile Preview Sheet above Comments", () => {
    assert.match(commentsSrc, /presentation:\s*"sheet"/);
    assert.match(commentsSrc, /sheetStack:\s*"above-comments"/);
    assert.match(commentsSrc, /openCommentAuthorPreview/);
    assert.match(popupSrc, /data-testid=\{aboveComments \? "comments-profile-preview-sheet"/);
    assert.match(popupSrc, /data-comments-profile-preview=\{aboveComments \? "true"/);
  });

  it("comment / reply / pinned / mention open paths seed or use sheet open", () => {
    assert.match(commentsSrc, /openCommentAuthorPreview\(e, pinnedVerifiedReply\.user\)/);
    assert.match(commentsSrc, /openCommentAuthorPreview\(e, comment\.user\)/);
    assert.match(commentsSrc, /openCommentAuthorPreview\(e, reply\.user\)/);
    assert.match(commentsSrc, /onMentionClick:\s*\(username, e\)\s*=>/);
    assert.match(commentsSrc, /reopenCommentsPostId:\s*post\.id/);
    assert.match(commentsSrc, /seed:\s*\{[\s\S]*?avatar_url:\s*author\.avatar_url/);
    assert.match(commentsSrc, /account_type:\s*author\.account_type/);
    assert.match(commentsSrc, /verified_artist:\s*author\.verified_artist/);
    assert.match(commentsSrc, /moderator:\s*author\.moderator/);
  });

  it("Home + Leaderboard remain on default sheet stack; floating PPC code retained", () => {
    assert.match(videoCardSrc, /presentation:\s*"sheet"/);
    assert.doesNotMatch(videoCardSrc, /sheetStack:\s*"above-comments"/);
    assert.match(leaderboardSrc, /presentation:\s*"sheet"/);
    assert.doesNotMatch(leaderboardSrc, /sheetStack:\s*"above-comments"/);
    assert.match(popupSrc, /UserProfileLightPopup/);
    assert.match(popupSrc, /data-testid="user-profile-light-popup-floating"/);
    assert.match(popupSrc, /presentation === "sheet"/);
  });
});

describe("Comments profile preview sheet — stacking / nav / contract", () => {
  it("stacks overlay/content above elevated Comments with z-[130]", () => {
    assert.equal(PROFILE_PREVIEW_ABOVE_COMMENTS_Z_CLASS, "z-[130]");
    assert.match(popupSrc, /PROFILE_PREVIEW_ABOVE_COMMENTS_Z_CLASS/);
    assert.match(popupSrc, /sheetStack === "above-comments"/);
    // Comments elevated stack is z-[110]; Preview must be higher.
    assert.match(commentsSrc, /elevatedStack \? "z-\[110\]"/);
  });

  it("does not introduce NestedRoot or close Comments when opening Preview", () => {
    assert.doesNotMatch(commentsSrc, /NestedRoot|nested=\{true\}/);
    assert.doesNotMatch(popupSrc, /NestedRoot|nested=\{true\}/);
    assert.doesNotMatch(drawerUiSrc, /NestedRoot/);
    assert.doesNotMatch(
      commentsSrc.slice(
        commentsSrc.indexOf("openCommentAuthorPreview"),
        commentsSrc.indexOf("openCommentAuthorPreview") + 800,
      ),
      /handleClose|setOpenCommentsPostId\(null\)/,
    );
  });

  it("keeps Comments mounted; Preview is sibling of Comments Drawer (not NestedRoot)", () => {
    const drawerEnd = commentsSrc.lastIndexOf("</Drawer>");
    const popupIdx = commentsSrc.indexOf("{userProfilePopup}");
    assert.ok(drawerEnd > 0 && popupIdx > drawerEnd, "Preview must render outside Comments Drawer");
    assert.match(commentsSrc, /\{userProfilePopup\}/);
  });

  it("View Profile reuses reopenCommentsPostId stash contract", () => {
    assert.match(popupSrc, /stashProfileReturnReopenComments/);
    assert.match(popupSrc, /reopenCommentsPostId/);
    assert.match(commentsSrc, /reopenCommentsPostId:\s*post\.id/);
  });

  it("native nav stays covered when Comments open even if Preview closes", () => {
    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: true,
        submitOpen: false,
        profilePreviewOpen: false,
      }),
      true,
    );
    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: true,
        submitOpen: false,
        profilePreviewOpen: true,
      }),
      true,
    );
  });

  it("preserves Profile Preview motion / dismiss contract (no retune)", () => {
    assert.equal(PROFILE_PREVIEW_OPEN_MS, 180);
    assert.equal(PROFILE_PREVIEW_CLOSE_MS, 160);
    assert.match(popupSrc, /closeThreshold=\{0\.09\}/);
    assert.doesNotMatch(commentsSrc, /closeThreshold/);
  });

  it("shell opens before network (shared open contract)", () => {
    const openIdx = popupSrc.indexOf("setShowUserPopup(true)");
    const fetchIdx = popupSrc.indexOf('apiRequest("GET", `/api/user/profile/${trimmed}`)');
    assert.ok(openIdx > 0 && fetchIdx > openIdx);
  });
});
