import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { COMMENTS_PROFILE_PUSH_FROM, isInteractiveStackPair } from "./interactive-page-transitions";
import {
  consumeProfileReturnReopenComments,
  peekProfileReturnReopenComments,
  resolveOwnProfileViewerCommentsRestore,
  stashProfileReturnReopenComments,
} from "./profile-navigation-return";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const gallerySrc = readFileSync(join(here, "../components/post-clip-viewer-overlay.tsx"), "utf8");
const attachedGallerySrc = readFileSync(
  join(here, "../components/release-attached-posts-gallery.tsx"),
  "utf8",
);
const viewerSrc = readFileSync(join(here, "../components/full-screen-post-sequence-viewer.tsx"), "utf8");

const openFullProfile = popupSrc.slice(
  popupSrc.indexOf("const openFullProfile"),
  popupSrc.indexOf("const popup =", popupSrc.indexOf("const openFullProfile")),
);
const commentsBranch = openFullProfile.slice(
  openFullProfile.indexOf("const commentsOrigin"),
  openFullProfile.indexOf("const poster ="),
);
const restoreEffect = videoCardSrc.slice(
  videoCardSrc.indexOf("ownProfileCommentsLocationRef.current"),
  videoCardSrc.indexOf("if (!requestOpenComments || !isActive) return;"),
);
const profileViewers = profileSrc.slice(
  profileSrc.indexOf("<OwnProfileViewerCommentsHost"),
  profileSrc.indexOf("</OwnProfileViewerCommentsHost>"),
);

const markedProfile = `/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`;

function withSessionStorage(run: (storage: Map<string, string>) => void): void {
  const storage = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.sessionStorage;
  globalThis.window = { sessionStorage } as unknown as Window & typeof globalThis;
  globalThis.sessionStorage = sessionStorage as unknown as Storage;
  try {
    run(storage);
  } finally {
    globalThis.window = previousWindow;
    globalThis.sessionStorage = previousStorage;
  }
}

function restore(overrides: Partial<Parameters<typeof resolveOwnProfileViewerCommentsRestore>[0]> = {}) {
  return resolveOwnProfileViewerCommentsRestore({
    previousLocation: markedProfile,
    location: "/profile",
    hostActive: true,
    viewerCardActive: true,
    postId: "post-1",
    stashedPostId: "post-1",
    ...overrides,
  });
}

describe("Own Profile viewer Comments → Public Profile", () => {
  it("A. View Profile from viewer Comments stashes the current post id", () => {
    assert.match(commentsSrc, /reopenCommentsPostId:\s*post\.id/);
    assert.match(openFullProfile, /stashProfileReturnReopenComments\(reopenPostId\)/);
    withSessionStorage(() => {
      stashProfileReturnReopenComments("post-1");
      assert.equal(peekProfileReturnReopenComments(), "post-1");
    });
  });

  it("B. Comments closes before navigation", () => {
    const stashAt = openFullProfile.indexOf("stashProfileReturnReopenComments(reopenPostId)");
    const dismissAt = openFullProfile.indexOf("beforeOpenFullProfileRef.current?.()");
    const navigateAt = openFullProfile.indexOf("setTimeout(navigateAfterClose, POPUP_CLOSE_MS)");
    assert.ok(stashAt >= 0 && dismissAt > stashAt && navigateAt > dismissAt);
    assert.match(commentsSrc, /setOwnProfileCommentsPushHidden\(true\)/);
    assert.match(commentsSrc, /dismissOwnProfileViewerCommentsForProfilePush/);
    assert.match(
      commentsSrc,
      /beforeOpenFullProfile: ownProfileViewerComments\s*\?\s*dismissOwnProfileViewerCommentsForProfilePush/,
    );
    assert.match(commentsSrc, /concealCommentsForProfilePush && "hidden"/);
  });

  it("C. viewer remains mounted", () => {
    assert.match(profileViewers, /<FullScreenPostSequenceViewer/);
    assert.match(profileViewers, /testId="profile-posts-viewer"/);
    assert.match(profileViewers, /testId="profile-likes-viewer"/);
    assert.doesNotMatch(commentsSrc, /closePostsViewer|closeLikesViewer|setPostsViewerStartIndex\(null\)|setLikesViewerStartIndex\(null\)/);
    assert.doesNotMatch(restoreEffect, /closePostsViewer|closeLikesViewer/);
  });

  it("D. Own Profile remains the live parent", () => {
    assert.equal(isInteractiveStackPair("/profile", markedProfile), true);
    assert.match(commentsBranch, /isInteractiveStackPair\(location, marked\)/);
    assert.match(commentsBranch, /navigate\(marked\)/);
    assert.doesNotMatch(profileViewers, /navigate\(/);
  });

  it("E. Public Profile mounts without an open Comments portal", () => {
    assert.match(commentsSrc, /data-own-profile-comments-concealed/);
    assert.match(commentsSrc, /concealCommentsForProfilePush && "hidden"/);
    assert.doesNotMatch(publicProfileSrc, /setShowComments|handleClose|ownProfileCommentsPushHidden/);
  });

  it("F. cancelled Back does not reopen Comments", () => {
    assert.equal(
      restore({ previousLocation: markedProfile, location: markedProfile }),
      false,
    );
    assert.equal(
      restore({ previousLocation: "/profile/ada", location: "/profile/ada?from=comments-popup" }),
      false,
    );
    assert.match(restoreEffect, /if \(!reopen\) return/);
    assert.doesNotMatch(publicProfileSrc, /consumeProfileReturnReopenComments|resolveOwnProfileViewerCommentsRestore/);
  });

  it("G. committed edge Back reopens Comments on the same post", () => {
    assert.equal(restore(), true);
    assert.match(restoreEffect, /openCommentsDrawer\(\)/);
    assert.match(restoreEffect, /resolveOwnProfileViewerCommentsRestore/);
    assert.match(publicProfileSrc, /window\.history\.back\(\)/);
  });

  it("H. Back button reopens Comments on the same post", () => {
    assert.equal(restore(), true);
    assert.equal(videoCardSrc.split("resolveOwnProfileViewerCommentsRestore(").length - 1, 1);
    assert.doesNotMatch(restoreEffect, /button|requestPop/);
  });

  it("I. wrong post id does not reopen", () => {
    assert.equal(restore({ postId: "post-2", stashedPostId: "post-1" }), false);
    assert.equal(restore({ stashedPostId: null }), false);
    assert.match(restoreEffect, /if \(consumed !== post\.id\) return/);
  });

  it("J. closed viewer does not reopen", () => {
    assert.equal(restore({ hostActive: false }), false);
    assert.equal(restore({ viewerCardActive: false }), false);
    assert.match(profileViewers, /postsViewerStartIndex !== null && !!postsViewerSequence\?\.length/);
    assert.match(profileViewers, /likesViewerStartIndex !== null && !!likesViewerSequence\?\.length/);
  });

  it("K. stash is cleared after successful restore", () => {
    withSessionStorage(() => {
      stashProfileReturnReopenComments("post-1");
      assert.equal(consumeProfileReturnReopenComments(), "post-1");
      assert.equal(peekProfileReturnReopenComments(), null);
    });
    const consumeAt = restoreEffect.indexOf("consumeProfileReturnReopenComments()");
    const reopenGuard = restoreEffect.indexOf("if (!reopen) return");
    assert.ok(reopenGuard >= 0 && consumeAt > reopenGuard);
  });

  it("L. Home Comments return behavior remains unchanged", () => {
    assert.match(homeSrc, /consumeProfileReturnReopenComments\(\)/);
    assert.doesNotMatch(homeSrc, /resolveOwnProfileViewerCommentsRestore|OwnProfileViewerCommentsHost/);
    assert.doesNotMatch(commentsBranch, /handleClose|setShowComments\(false\)|beforeOpenFullProfile/);
    assert.doesNotMatch(gallerySrc, /OwnProfileViewerCommentsHost/);
    assert.doesNotMatch(attachedGallerySrc, /OwnProfileViewerCommentsHost/);
    assert.doesNotMatch(viewerSrc, /OwnProfileViewerCommentsHost|beforeOpenFullProfile/);
    assert.match(commentsSrc, /open=\{isOpen\}/);
    assert.match(homeSrc, /setOpenCommentsTargetPostId\(reopenPostId\)/);
  });
});
