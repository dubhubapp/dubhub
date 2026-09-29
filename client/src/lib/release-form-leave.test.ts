import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  beginReleaseFormLeave,
  completeReleaseFormDiscard,
  consumeDiscardedFormProfileArrival,
  historyAfterDiscardedFormProfile,
  noteDiscardedFormProfileArrival,
  RELEASE_FORM_DISCARD_DIALOG_LAYER_CLASS,
  releaseFormChildNavigation,
} from "./release-form-leave";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const gallerySrc = readFileSync(join(here, "../components/release-attached-posts-gallery.tsx"), "utf8");
const sectionSrc = readFileSync(join(here, "../components/release-attach-posts-section.tsx"), "utf8");
const alertDialogSrc = readFileSync(join(here, "../components/ui/alert-dialog.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");

function discardDialog(src: string, title: string): string {
  const titleAt = src.indexOf(title);
  const openAt = src.lastIndexOf("<AlertDialog ", titleAt);
  const endAt = src.indexOf("</AlertDialog>", titleAt);
  return src.slice(openAt, endAt);
}

function leaveBlock(src: string): string {
  return src.slice(src.indexOf("const requestViewerLeave"), src.indexOf("const handleDiscardOpenChange"));
}

function discardBlock(src: string): string {
  return src.slice(src.indexOf("const handleDiscardConfirm"), src.indexOf("const linksForSummary") === -1
    ? src.indexOf("useIosKeyboardResizeNone")
    : src.indexOf("const linksForSummary"));
}

describe("release form viewer leave", () => {
  it("clean profile, comments profile, release card, and own profile leave immediately", () => {
    assert.equal(beginReleaseFormLeave(false), "navigate");
    assert.equal(completeReleaseFormDiscard({ choice: "discard", pendingChild: true }), "child");
    assert.equal(completeReleaseFormDiscard({ choice: "discard", pendingChild: false }), "back");
  });

  it("dirty profile, comments profile, release card, and own profile confirm first", () => {
    assert.equal(beginReleaseFormLeave(true), "confirm");
    assert.equal(completeReleaseFormDiscard({ choice: "keep", pendingChild: true }), "stay");
    assert.equal(completeReleaseFormDiscard({ choice: "keep", pendingChild: false }), "stay");
  });

  it("Create stores the child route and still uses the form Back dialog", () => {
    assert.match(createSrc, /enabled=\{false\}/);
    assert.match(createSrc, /createBackDecision\(isDirty\)/);
    assert.match(createSrc, /navigateToExit\(\)/);
    assert.match(createSrc, /ReleaseFormRouteGuardProvider requestLeave=\{requestViewerLeave\}/);
    const leave = leaveBlock(createSrc);
    assert.match(leave, /beginReleaseFormLeave\(isDirty\) === "confirm"/);
    assert.match(leave, /pendingLeaveRef\.current = proceed/);
    const discardStart = createSrc.indexOf("const handleDiscardConfirm");
    const discard = createSrc.slice(discardStart, discardStart + 500);
    assert.ok(
      discard.indexOf("const pending = pendingLeaveRef.current") <
        discard.indexOf('pending(releaseFormChildNavigation("discard"))'),
    );
    assert.ok(discard.indexOf("if (pending)") < discard.indexOf("navigateToExit()"));
    assert.match(createSrc, /pendingLeaveRef\.current = null/);
    assert.match(createSrc, /applyCreateDiscardChoice\("keep"\)/);
  });

  it("Edit stores the child route and still uses the form Back dialog", () => {
    assert.match(editSrc, /enabled=\{false\}/);
    assert.match(editSrc, /editBackDecision\(isDirty\)/);
    assert.match(editSrc, /exitToDetail\(\)/);
    assert.match(editSrc, /ReleaseFormRouteGuardProvider requestLeave=\{requestViewerLeave\}/);
    const leave = leaveBlock(editSrc);
    assert.match(leave, /beginReleaseFormLeave\(isDirty\) === "confirm"/);
    assert.match(leave, /pendingLeaveRef\.current = proceed/);
    const discard = discardBlock(editSrc);
    assert.ok(
      discard.indexOf("const pending = pendingLeaveRef.current") <
        discard.indexOf('pending(releaseFormChildNavigation("discard"))'),
    );
    assert.ok(discard.indexOf("if (pending)") < discard.indexOf("exitToDetail()"));
    assert.match(editSrc, /data-testid="release-edit-discard-keep"/);
    assert.match(editSrc, /pendingLeaveRef\.current = null/);
  });

  it("profile and release-card navigations ask the guard; close and attach do not", () => {
    const afterClose = popupSrc.slice(popupSrc.indexOf("const navigateAfterClose"));
    const goStart = afterClose.indexOf("const go = (navigation");
    const guardAt = afterClose.indexOf("requestFormLeaveRef.current");
    assert.ok(goStart !== -1 && guardAt > goStart);
    const goBody = afterClose.slice(goStart, guardAt);
    assert.match(goBody, /navigate\("\/profile"\)/);
    assert.match(goBody, /commentsOrigin && interactiveHomeTransitionsEnabled/);
    assert.match(afterClose.slice(guardAt), /guard\(go\)/);
    const releaseNav = videoCardSrc.slice(
      videoCardSrc.indexOf("const navigateToReleasePreview"),
      videoCardSrc.indexOf("const [showComments, setShowComments]"),
    );
    assert.ok(releaseNav.indexOf("const run = () =>") < releaseNav.indexOf("navigate(destination)"));
    assert.match(releaseNav, /guard\(run\)/);
    assert.doesNotMatch(gallerySrc, /release-form-route-guard|requestViewerLeave/);
    assert.doesNotMatch(sectionSrc, /release-form-route-guard|requestViewerLeave/);
    assert.match(sectionSrc, /onClose=\{\(\) => setGallery\(null\)\}/);
    assert.match(sectionSrc, /onTogglePost: togglePost/);
  });
});

describe("release form discard dialog layer", () => {
  it("lifts only the Create and Edit discard dialogs above Comments", () => {
    assert.equal(RELEASE_FORM_DISCARD_DIALOG_LAYER_CLASS, "z-[140]");
    for (const src of [createSrc, editSrc]) {
      const dialog = discardDialog(src, src === createSrc ? "Discard release?" : "Discard changes?");
      assert.equal(src.match(/RELEASE_FORM_DISCARD_DIALOG_LAYER_CLASS/g)?.length, 3);
      assert.equal(dialog.match(/RELEASE_FORM_DISCARD_DIALOG_LAYER_CLASS/g)?.length, 2);
      assert.match(dialog, /overlayClassName=\{cn\(\s*RELEASE_FORM_DISCARD_DIALOG_LAYER_CLASS/);
    }
    assert.match(alertDialogSrc, /z-50 bg-black\/80/);
    assert.match(alertDialogSrc, /z-50 grid/);
    assert.doesNotMatch(alertDialogSrc, /z-\[140\]/);
    assert.match(commentsSrc, /elevatedStack \? "z-\[110\]" : "z-\[60\]"/);
  });

  it("opens the dialog without closing Comments, and Keep editing does not navigate", () => {
    for (const src of [createSrc, editSrc]) {
      const leave = leaveBlock(src);
      assert.match(leave, /setDiscardDialogOpen\(true\)/);
      assert.doesNotMatch(leave, /setShowComments|setGallery|commentsModal|onClose\(/);
    }
    const createKeep = createSrc.slice(
      createSrc.lastIndexOf("<AlertDialogCancel", createSrc.indexOf("Keep editing")),
      createSrc.indexOf("Keep editing"),
    );
    assert.match(createKeep, /pendingLeaveRef\.current = null/);
    assert.match(createKeep, /applyCreateDiscardChoice\("keep"\)/);
    assert.doesNotMatch(createKeep, /navigate\(|pending\(\)/);
    const editKeep = editSrc.slice(
      editSrc.lastIndexOf("<AlertDialogCancel", editSrc.indexOf("Keep editing")),
      editSrc.indexOf("Keep editing"),
    );
    assert.match(editKeep, /pendingLeaveRef\.current = null/);
    assert.doesNotMatch(editKeep, /navigate\(|pending\(\)|exitToDetail/);
    assert.match(createSrc, /createBackDecision\(isDirty\)/);
    assert.match(editSrc, /editBackDecision\(isDirty\)/);
    const createConfirm = createSrc.slice(
      createSrc.indexOf("const handleDiscardConfirm"),
      createSrc.indexOf("const handleDiscardConfirm") + 450,
    );
    assert.equal(createConfirm.match(/pending\(releaseFormChildNavigation\("discard"\)\)/g)?.length, 1);
    const editConfirm = editSrc.slice(
      editSrc.indexOf("const handleDiscardConfirm"),
      editSrc.indexOf("const handleDiscardConfirm") + 400,
    );
    assert.equal(editConfirm.match(/pending\(releaseFormChildNavigation\("discard"\)\)/g)?.length, 1);
    assert.ok(editConfirm.indexOf("if (pending)") < editConfirm.indexOf("exitToDetail()"));
  });
});

describe("discarded form profile history", () => {
  const profileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");

  it("replaces the form once and returns to the durable parent", () => {
    assert.equal(releaseFormChildNavigation("clean"), "push");
    assert.equal(releaseFormChildNavigation("discard"), "replace");
    assert.deepEqual(
      historyAfterDiscardedFormProfile({
        parent: "/releases",
        form: "/releases/new",
        profile: "/profile/ada",
      }),
      ["/releases", "/profile/ada"],
    );
    assert.deepEqual(
      historyAfterDiscardedFormProfile({
        parent: "/releases/abc?scope=my&view=upcoming",
        form: "/releases/abc/edit",
        profile: "/profile/ada?from=comments-popup",
      }),
      ["/releases/abc?scope=my&view=upcoming", "/profile/ada?from=comments-popup"],
    );
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /proceed\(releaseFormChildNavigation\("clean"\)\)/);
      assert.equal(src.match(/pending\(releaseFormChildNavigation\("discard"\)\)/g)?.length, 1);
    }
    const go = popupSrc.slice(popupSrc.indexOf("const go = (navigation"), popupSrc.indexOf("const guard ="));
    const ownProfile = go.slice(0, go.indexOf('navigate("/profile");'));
    assert.match(ownProfile, /navigate\("\/profile", \{ replace: true \}\)/);
    assert.doesNotMatch(ownProfile, /noteDiscardedFormProfileArrival/);
    const publicReplace = go.slice(
      go.indexOf("noteDiscardedFormProfileArrival"),
      go.indexOf("if (commentsOrigin && interactiveHomeTransitionsEnabled())"),
    );
    assert.match(publicReplace, /navigate\(profilePath, \{ replace: true \}\)/);
    assert.match(publicReplace, /from=\$\{COMMENTS_PROFILE_PUSH_FROM\}/);
    assert.doesNotMatch(publicReplace, /armCommentsHomeReturnVisit|armCommentsProfilePushUnderlay|armHomeFeedReleasePoster/);
    const pushPath = go.slice(go.indexOf("if (commentsOrigin && interactiveHomeTransitionsEnabled())"));
    assert.match(pushPath, /armCommentsHomeReturnVisit/);
    assert.match(pushPath, /navigate\(marked\)/);
    assert.equal(go.match(/\{ replace: true \}/g)?.length, 3);
    const detailBranch = go.slice(go.indexOf("const detailReturn"), go.indexOf("noteDiscardedFormProfileArrival"));
    assert.match(detailBranch, /armReleaseDetailProfileUnderlay/);
    assert.match(detailBranch, /takeParkedReleaseDetailEditSurface/);
    assert.match(detailBranch, /surface: taken\?\.node \?\? null/);
    assert.match(detailBranch, /scrollTop: taken\?\.scrollTop \?\? 0/);
    assert.match(detailBranch, /navigate\(detailReturn\.profilePath, \{ replace: true \}\)/);
    assert.doesNotMatch(detailBranch, /armCommentsHomeReturnVisit|COMMENTS_PROFILE_PUSH_FROM|noteDiscardedFormProfileArrival/);
    assert.doesNotMatch(ownProfile, /from=release-detail|armReleaseDetailProfileUnderlay/);
    assert.match(profileSrc, /consumeDiscardedFormProfileArrival/);
    assert.match(profileSrc, /enabled=\{!avatarLightboxOpen && !arrivedFromDiscardedReleaseForm\}/);
    noteDiscardedFormProfileArrival();
    assert.equal(consumeDiscardedFormProfileArrival(), true);
    assert.equal(consumeDiscardedFormProfileArrival(), false);
  });
});
