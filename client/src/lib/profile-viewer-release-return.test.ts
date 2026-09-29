import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isInteractiveStackPair,
  reduceSettingsTransitionStack,
  shouldUseHomeFeedReleaseStaticPop,
  shouldUseProfileViewerReleaseStaticPop,
  shouldUseReleaseDetailStaticPop,
} from "./interactive-page-transitions";
import { RELEASE_DETAIL_FROM_PROFILE_VIEWER_VALUE } from "./release-detail-navigation";
import {
  armProfileViewerReleaseVisit,
  dismissProfileViewerReleaseReturnVisit,
  getProfileViewerReleaseReturnVisit,
  hideProfileViewerReleaseReturnVisit,
  profileViewerReleaseRestoreIndex,
  profileViewerReleaseSnapIndex,
  rebuildProfileViewerReleaseSequence,
  revealProfileViewerReleaseReturnVisit,
} from "./profile-viewer-release-return";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const stackSrc = readFileSync(join(here, "../components/interactive-settings-stack.tsx"), "utf8");
const visitSrc = readFileSync(join(here, "./profile-viewer-release-return.ts"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const commentsReturnSrc = readFileSync(join(here, "./profile-viewer-comments-return.test.ts"), "utf8");

const releaseNav = videoCardSrc.slice(
  videoCardSrc.indexOf("const navigateToReleasePreview"),
  videoCardSrc.indexOf("const [showComments, setShowComments]"),
);
const viewerBranch = releaseNav.slice(
  releaseNav.indexOf("profileViewerReleaseSource"),
  releaseNav.indexOf("const base = `/releases/${releaseId}`"),
);
const restoreEffect = profileSrc.slice(
  profileSrc.indexOf("const visit = getProfileViewerReleaseReturnVisit()"),
  profileSrc.indexOf("}, [likedLoading, likedPosts, postsLoading, profileLocation, userPosts]);") +
    "}, [likedLoading, likedPosts, postsLoading, profileLocation, userPosts]);".length,
);
const commitBack = detailSrc.slice(detailSrc.indexOf("const commitBack"), detailSrc.indexOf("const handleBack"));
const marked = `/releases/abc?from=${RELEASE_DETAIL_FROM_PROFILE_VIEWER_VALUE}`;

function armVisit(releasePath = marked) {
  return armProfileViewerReleaseVisit({
    tab: "likes",
    filter: "identified",
    sequenceIds: ["a", "b", "c"],
    activePostId: "c",
    activeIndex: 2,
    releasePath,
    profilePath: "/profile",
  });
}

describe("Own Profile viewer → Release Detail return", () => {
  it("A/B. Posts and Likes capture the active post, not a separate card", () => {
    assert.match(viewerBranch, /profileViewerReleaseSnapIndex/);
    assert.match(viewerBranch, /activePostId: post\.id/);
    assert.match(viewerBranch, /tab: profileViewerReleaseSource\.tab/);
    assert.match(profileSrc, /tab: "posts"/);
    assert.match(profileSrc, /tab: "likes"/);
    assert.match(profileSrc, /filter: postFilter/);
    assert.match(profileSrc, /filter: likesFilter/);
  });

  it("C. swiped post id wins over the viewer-open start index", () => {
    assert.equal(profileViewerReleaseSnapIndex(["a", "b", "c"], "c"), 2);
    assert.equal(profileViewerReleaseSnapIndex(["a", "b", "c"], "a"), 0);
    assert.doesNotMatch(viewerBranch, /postsViewerStartIndex|likesViewerStartIndex/);
  });

  it("D. frozen viewer surface is inert and has no live video or audio", () => {
    assert.match(visitSrc, /querySelectorAll\(\s*"video, audio/);
    assert.match(visitSrc, /clone\.setAttribute\("inert", ""\)/);
    assert.match(visitSrc, /data-profile-viewer-release-frame/);
    assert.doesNotMatch(visitSrc, /<video|new VideoCard|video\.play\(/);
  });

  it("E. forward Detail push uses the viewer visit and is not a live pair", () => {
    assert.match(viewerBranch, /appendReleaseDetailFromProfileViewerParam/);
    assert.match(viewerBranch, /armProfileViewerReleaseVisit/);
    assert.ok(viewerBranch.indexOf("armProfileViewerReleaseVisit") < viewerBranch.indexOf("navigate(viewerDestination)"));
    assert.equal(isInteractiveStackPair("/profile", marked), false);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], marked), ["/releases/abc"]);
    assert.match(stackSrc, /profile-viewer-release:/);
    assert.match(stackSrc, /translate3d\(100%,0,0\)/);
  });

  it("F. Detail Back uses the viewer visit, not /releases", () => {
    dismissProfileViewerReleaseReturnVisit();
    const visit = armVisit();
    assert.equal(shouldUseProfileViewerReleaseStaticPop(marked, visit), true);
    assert.match(commitBack, /shouldUseProfileViewerReleaseStaticPop/);
    assert.match(commitBack, /window\.history\.back\(\)/);
    const viewerBack = commitBack.slice(commitBack.indexOf("shouldUseProfileViewerReleaseStaticPop"));
    assert.doesNotMatch(viewerBack.slice(0, viewerBack.indexOf("return;")), /navigate\(releasesBackUrl\)/);
  });

  it("G/H. Back restores Posts or Likes", () => {
    assert.match(restoreEffect, /setActiveTab\("posts"\)/);
    assert.match(restoreEffect, /setActiveTab\("liked"\)/);
    assert.match(restoreEffect, /visit\.tab === "posts"/);
  });

  it("I. filter is restored", () => {
    assert.match(restoreEffect, /setPostFilter\(visit\.filter\)/);
    assert.match(restoreEffect, /setLikesFilter\(visit\.filter\)/);
  });

  it("J. exact active post is restored by id", () => {
    const sequence = [
      { id: "a" },
      { id: "c" },
      { id: "b" },
    ];
    assert.equal(profileViewerReleaseRestoreIndex(sequence, "c"), 1);
    assert.match(restoreEffect, /profileViewerReleaseRestoreIndex\(sequence, visit\.activePostId\)/);
    assert.match(restoreEffect, /setPostsViewerStartIndex\(index\)/);
    assert.match(restoreEffect, /setLikesViewerStartIndex\(index\)/);
  });

  it("K. sequence keeps surviving stored ids", () => {
    const posts = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    assert.deepEqual(
      rebuildProfileViewerReleaseSequence(posts, ["c", "a", "missing"], "all").map((post) => post.id),
      ["c", "a"],
    );
    assert.deepEqual(
      rebuildProfileViewerReleaseSequence(posts, ["a", "b", "c"], "all").map((post) => post.id),
      ["a", "b", "c"],
    );
  });

  it("L. cancelled Back keeps the visit and does not mount the viewer", () => {
    dismissProfileViewerReleaseReturnVisit();
    const visit = armVisit();
    revealProfileViewerReleaseReturnVisit();
    hideProfileViewerReleaseReturnVisit();
    const kept = getProfileViewerReleaseReturnVisit();
    assert.equal(kept?.id, visit.id);
    assert.equal(kept?.presentation, "stored");
    assert.match(stackSrc, /hideProfileViewerReleaseReturnVisit\(\)/);
    assert.doesNotMatch(visitSrc, /setPostsViewerStartIndex|setLikesViewerStartIndex/);
  });

  it("M/N. committed Back opens one viewer and does not keep a second active video", () => {
    const postsBranch = restoreEffect.slice(
      restoreEffect.indexOf('if (visit.tab === "posts")'),
      restoreEffect.indexOf("setPostsViewerStartIndex(null);"),
    );
    assert.match(postsBranch, /setLikesViewerStartIndex\(null\)/);
    assert.match(postsBranch, /setPostsViewerStartIndex\(index\)/);
    assert.doesNotMatch(postsBranch, /setLikesViewerStartIndex\(index\)/);
    assert.match(visitSrc, /"video, audio/);
    assert.doesNotMatch(homeSrc, /armProfileViewerReleaseVisit|profile-viewer/);
  });

  it("O. a missing post falls back to the Profile grid", () => {
    assert.equal(profileViewerReleaseRestoreIndex([{ id: "a" }], "gone"), -1);
    assert.match(restoreEffect, /if \(index < 0\)/);
    assert.match(restoreEffect, /dismissProfileViewerReleaseReturnVisit\(visit\.id\)/);
    assert.doesNotMatch(restoreEffect, /navigate\("\/releases"\)/);
  });

  it("P. a direct Detail does not qualify", () => {
    dismissProfileViewerReleaseReturnVisit();
    const visit = armVisit();
    assert.equal(shouldUseProfileViewerReleaseStaticPop("/releases/abc", visit), false);
    assert.equal(shouldUseProfileViewerReleaseStaticPop("/releases/abc?from=notification", visit), false);
    assert.equal(
      shouldUseProfileViewerReleaseStaticPop("/releases/other?from=profile-viewer", visit),
      false,
    );
    assert.equal(shouldUseProfileViewerReleaseStaticPop(marked, null), false);
  });

  it("Q. Releases, Home, and public-profile Detail returns stay on their own checks", () => {
    assert.match(commitBack, /shouldUseHomeFeedReleaseStaticPop/);
    assert.match(commitBack, /navigate\(releasesBackUrl\)/);
    assert.match(publicProfileSrc, /shouldUseHomeFeedReleaseStaticPop/);
    assert.doesNotMatch(publicProfileSrc, /shouldUseProfileViewerReleaseStaticPop|profile-viewer/);
    assert.doesNotMatch(homeSrc, /shouldUseProfileViewerReleaseStaticPop/);
    assert.equal(shouldUseHomeFeedReleaseStaticPop("/releases/abc?from=feed", true), true);
    assert.equal(shouldUseHomeFeedReleaseStaticPop(marked, true), false);
    assert.equal(
      shouldUseReleaseDetailStaticPop("/profile/ada?from=release-detail", true),
      true,
    );
    assert.equal(shouldUseReleaseDetailStaticPop(marked, true), false);
  });

  it("R. Comments → Profile return stays unchanged", () => {
    assert.match(commentsReturnSrc, /resolveOwnProfileViewerCommentsRestore/);
    assert.doesNotMatch(viewerBranch, /stashProfileReturnReopenComments|setShowComments/);
    assert.doesNotMatch(restoreEffect, /consumeProfileReturnReopenComments|setShowComments/);
  });
});
