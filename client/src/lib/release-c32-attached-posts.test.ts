import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTACH_CLIPS_CTA_REMOVED,
  ATTACH_CLIPS_DONE_REMOVED,
  ATTACH_POSTS_NO_ELIGIBLE_COPY,
  ATTACH_POSTS_POLICY_DISCLOSURE_LABEL,
  ATTACH_POSTS_WARNING_COPY,
  ATTACHED_POSTS_DIVIDER_BEFORE_ROW,
  ATTACHED_POSTS_EMPTY_SUMMARY,
  ATTACHED_POSTS_ROW_LABEL,
  ATTACHED_POSTS_USES_RELEASE_TOOLS_ROW,
  ATTACHED_POSTS_USES_VAUL_SHEET,
  ATTACHED_POSTS_VIEWER_PAGE_LEVEL,
  attachedPostsRowChevronRotationDeg,
  formatAttachedPostsRowSummary,
  ATTACHED_POSTS_DISCLOSURE_BUTTON_TYPE,
  attachedClipShowsAttachedChrome,
  attachedPostsDisclosureChangesSelection,
  isPostSelectedForRelease,
  nextAttachedPostsManagementOpen,
  selectAttachedPostsForOverview,
  shouldKeepAttachedPostsBodyOpen,
  shouldShowAttachDetachAllRow,
  shouldShowAttachSelectedCountRow,
  shouldShowAttachedPostsManagement,
  shouldShowAttachedPostsOverviewCarousel,
} from "./release-attach-clips-overview";
import { ReleaseAttachedPostsIcon } from "./release-attached-clips-icon";
import { Film, Link as LinkIcon, UserPlus, Users } from "lucide-react";
import {
  maxSelectableAttachments,
  resolveAttachmentCapacityHeader,
} from "./release-attachment-limit";
import { resolveAttachmentLimitNoticeProminence } from "./release-form-limit-prominence";
import {
  resolveAttachClipToggleKind,
  shouldShowDetachAllControl,
} from "./release-attach-post-release";
import {
  CREATE_WITHOUT_POSTS_BACK,
  CREATE_WITHOUT_POSTS_BODY,
  CREATE_WITHOUT_POSTS_CONFIRM,
  CREATE_WITHOUT_POSTS_TITLE,
  createWithoutPostsConfirmChoice,
  nextReleaseCreateSubmitStep,
  shouldConfirmCreateWithoutAttachedPosts,
  shouldConfirmEditWithoutAttachedPosts,
} from "./release-create-zero-posts";

describe("C3.2 Attached posts terminology + row", () => {
  it("UI label is Attached posts", () => {
    assert.equal(ATTACHED_POSTS_ROW_LABEL, "Attached posts");
    assert.notEqual(ATTACHED_POSTS_ROW_LABEL, "Attached clips");
  });

  it("zero state subtitle", () => {
    assert.equal(formatAttachedPostsRowSummary(0), "No posts attached");
    assert.equal(formatAttachedPostsRowSummary(0), ATTACHED_POSTS_EMPTY_SUMMARY);
  });

  it("singular subtitle", () => {
    assert.equal(formatAttachedPostsRowSummary(1), "1 post attached");
  });

  it("plural subtitle", () => {
    assert.equal(formatAttachedPostsRowSummary(2), "2 posts attached");
    assert.equal(formatAttachedPostsRowSummary(3), "3 posts attached");
  });

  it("uses Release Tools row pattern with divider before it", () => {
    assert.equal(ATTACHED_POSTS_USES_RELEASE_TOOLS_ROW, true);
    assert.equal(ATTACHED_POSTS_DIVIDER_BEFORE_ROW, true);
  });

  it("keeps unique film/media icon", () => {
    assert.equal(ReleaseAttachedPostsIcon, Film);
    assert.notEqual(ReleaseAttachedPostsIcon, LinkIcon);
    assert.notEqual(ReleaseAttachedPostsIcon, UserPlus);
    assert.notEqual(ReleaseAttachedPostsIcon, Users);
  });

  it("collapsed chevron is 0deg", () => {
    assert.equal(attachedPostsRowChevronRotationDeg(false), 0);
  });

  it("expanded chevron is 90deg", () => {
    assert.equal(attachedPostsRowChevronRotationDeg(true), 90);
  });

  it("row toggles inline management", () => {
    assert.equal(nextAttachedPostsManagementOpen(false), true);
    assert.equal(nextAttachedPostsManagementOpen(true), false);
  });

  it("removes Attach clips / Done buttons", () => {
    assert.equal(ATTACH_CLIPS_CTA_REMOVED, true);
    assert.equal(ATTACH_CLIPS_DONE_REMOVED, true);
  });
});

describe("C3.2 expanded management chrome", () => {
  it("hides Detach all when nothing is detachable", () => {
    assert.equal(
      shouldShowAttachDetachAllRow({
        detachAllDisabled: false,
        detachableSelectedCount: 0,
      }),
      false,
    );
  });

  it("hides Selected (0 / N) row", () => {
    assert.equal(shouldShowAttachSelectedCountRow(0), false);
  });

  it("capacity limits unchanged; early usage hidden", () => {
    assert.equal(maxSelectableAttachments({ unlimited: false, limit: 3 }), 3);
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 0,
        limit: 3,
      }),
      "hidden",
    );
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 2,
        limit: 3,
      }),
      "quiet",
    );
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 3,
        limit: 3,
      }),
      "prominent",
    );
    assert.equal(
      resolveAttachmentCapacityHeader({
        unlimited: true,
        used: 5,
        limit: null,
      }),
      null,
    );
  });

  it("policy wording remains accessible", () => {
    assert.equal(ATTACH_POSTS_POLICY_DISCLOSURE_LABEL, "About attaching posts");
    assert.match(ATTACH_POSTS_WARNING_COPY, /genuinely feature this release/i);
    assert.match(ATTACH_POSTS_WARNING_COPY, /revoked|suspended/i);
    assert.match(ATTACH_POSTS_NO_ELIGIBLE_COPY, /artist-verified/i);
  });

  it("pre-release attach/detach preserved", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: false, isDetachLocked: false }),
      "attach",
    );
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: false }),
      "detach",
    );
    assert.equal(shouldShowDetachAllControl(false), true);
  });

  it("post-release detach blocked; attach-more allowed", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: true }),
      "attached-readonly",
    );
    assert.equal(shouldShowDetachAllControl(true), false);
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: false, isDetachLocked: false }),
      "attach",
    );
  });

  it("viewer remains page-level", () => {
    assert.equal(ATTACHED_POSTS_VIEWER_PAGE_LEVEL, true);
    assert.equal(ATTACHED_POSTS_USES_VAUL_SHEET, false);
  });
});

describe("C3.2 zero-post Create safeguard", () => {
  it("valid Create with zero posts shows confirmation", () => {
    assert.equal(
      shouldConfirmCreateWithoutAttachedPosts({
        isCreate: true,
        formValid: true,
        selectedPostIdsCount: 0,
      }),
      true,
    );
    assert.equal(
      nextReleaseCreateSubmitStep({
        isCreate: true,
        formValid: true,
        selectedPostIdsCount: 0,
      }),
      "confirm-zero-posts",
    );
  });

  it("invalid Create runs validation first and skips confirmation", () => {
    assert.equal(
      nextReleaseCreateSubmitStep({
        isCreate: true,
        formValid: false,
        selectedPostIdsCount: 0,
      }),
      "toast-validation",
    );
    assert.equal(
      shouldConfirmCreateWithoutAttachedPosts({
        isCreate: true,
        formValid: false,
        selectedPostIdsCount: 0,
      }),
      false,
    );
  });

  it("confirm continues to mutate; Go back dismisses", () => {
    assert.equal(createWithoutPostsConfirmChoice("confirm"), "mutate");
    assert.equal(createWithoutPostsConfirmChoice("back"), "dismiss");
    assert.match(CREATE_WITHOUT_POSTS_TITLE, /without attached posts/i);
    assert.match(CREATE_WITHOUT_POSTS_BODY, /attach posts later/i);
    assert.equal(CREATE_WITHOUT_POSTS_CONFIRM, "Create release");
    assert.equal(CREATE_WITHOUT_POSTS_BACK, "Go back");
  });

  it("Create with attached posts skips warning", () => {
    assert.equal(
      nextReleaseCreateSubmitStep({
        isCreate: true,
        formValid: true,
        selectedPostIdsCount: 1,
      }),
      "mutate",
    );
  });

  it("Edit Save with zero posts does not warn", () => {
    assert.equal(shouldConfirmEditWithoutAttachedPosts(), false);
    assert.equal(
      nextReleaseCreateSubmitStep({
        isCreate: false,
        formValid: true,
        selectedPostIdsCount: 0,
      }),
      "mutate",
    );
  });
});

describe("C3.3 overview vs management swap", () => {
  const posts = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
  ];

  it("collapsed with attached post shows overview, hides management", () => {
    assert.equal(
      shouldShowAttachedPostsOverviewCarousel({
        managementOpen: false,
        attachedCount: 1,
      }),
      true,
    );
    assert.equal(shouldShowAttachedPostsManagement(false), false);
  });

  it("expanded with attached post hides overview, shows management", () => {
    assert.equal(
      shouldShowAttachedPostsOverviewCarousel({
        managementOpen: true,
        attachedCount: 1,
      }),
      false,
    );
    assert.equal(shouldShowAttachedPostsManagement(true), true);
  });

  it("expanded presentation does not stack overview + management", () => {
    const expanded = true;
    assert.equal(
      shouldShowAttachedPostsOverviewCarousel({
        managementOpen: expanded,
        attachedCount: 1,
      }) && shouldShowAttachedPostsManagement(expanded),
      false,
    );
  });

  it("zero-post collapsed has no overview carousel", () => {
    assert.equal(
      shouldShowAttachedPostsOverviewCarousel({
        managementOpen: false,
        attachedCount: 0,
      }),
      false,
    );
    assert.equal(formatAttachedPostsRowSummary(0), "No posts attached");
  });

  it("multiple attached posts remain in collapsed overview order", () => {
    assert.deepEqual(
      selectAttachedPostsForOverview(posts, ["c", "a"]).map((p) => p.id),
      ["c", "a"],
    );
    assert.equal(
      shouldShowAttachedPostsOverviewCarousel({
        managementOpen: false,
        attachedCount: 2,
      }),
      true,
    );
  });

  it("expanded management still represents selected state", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: false }),
      "detach",
    );
    assert.equal(shouldShowAttachedPostsManagement(true), true);
  });

  it("pre-release detach unchanged", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: false }),
      "detach",
    );
    assert.equal(shouldShowDetachAllControl(false), true);
  });

  it("post-release read-only and attach-more unchanged", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: true }),
      "attached-readonly",
    );
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: false, isDetachLocked: false }),
      "attach",
    );
  });
});

describe("C3.4 attached-state continuity + stable swap", () => {
  const selected = ["a", "c"];

  it("collapsed attached post shows attached chrome", () => {
    assert.equal(isPostSelectedForRelease("a", selected), true);
    assert.equal(attachedClipShowsAttachedChrome(true), true);
    assert.equal(
      shouldShowAttachedPostsOverviewCarousel({
        managementOpen: false,
        attachedCount: 2,
      }),
      true,
    );
  });

  it("expanded attached post shows attached chrome from the same helper", () => {
    assert.equal(isPostSelectedForRelease("a", selected), true);
    assert.equal(attachedClipShowsAttachedChrome(true), true);
    assert.equal(shouldShowAttachedPostsManagement(true), true);
  });

  it("disclosure toggle does not change selectedPostIds", () => {
    assert.equal(attachedPostsDisclosureChangesSelection(), false);
    assert.equal(nextAttachedPostsManagementOpen(false), true);
    assert.equal(nextAttachedPostsManagementOpen(true), false);
    assert.deepEqual(selected, ["a", "c"]);
  });

  it("disclosure control is type=button", () => {
    assert.equal(ATTACHED_POSTS_DISCLOSURE_BUTTON_TYPE, "button");
  });

  it("zero-post collapsed keeps body closed", () => {
    assert.equal(
      shouldKeepAttachedPostsBodyOpen({
        managementOpen: false,
        attachedCount: 0,
      }),
      false,
    );
    assert.equal(formatAttachedPostsRowSummary(0), "No posts attached");
  });

  it("attached collapsed/expanded keeps body height so swap never hits 0fr", () => {
    assert.equal(
      shouldKeepAttachedPostsBodyOpen({
        managementOpen: false,
        attachedCount: 1,
      }),
      true,
    );
    assert.equal(
      shouldKeepAttachedPostsBodyOpen({
        managementOpen: true,
        attachedCount: 1,
      }),
      true,
    );
  });

  it("expanded still hides overview (no duplicate card)", () => {
    assert.equal(
      shouldShowAttachedPostsOverviewCarousel({
        managementOpen: true,
        attachedCount: 1,
      }),
      false,
    );
    assert.equal(shouldShowAttachedPostsManagement(true), true);
  });

  it("pre-release detach unchanged", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: false }),
      "detach",
    );
  });

  it("post-release read-only unchanged", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: true }),
      "attached-readonly",
    );
  });
});


