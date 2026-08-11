import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLLABORATOR_SEARCH_AUTOFOCUS_MS,
  shouldAutofocusCollaboratorSearch,
} from "./release-collaborator-autofocus";
import {
  ReleaseCollaboratorsRowIcon,
  isCollaboratorsRowInviteIcon,
} from "./release-collaborators-row-icon";
import { isCollaboratorInviteSetLocked } from "./release-tools-collaborators-summary";
import {
  ATTACH_CLIPS_CTA_REMOVED,
  ATTACH_CLIPS_DONE_REMOVED,
  ATTACH_POSTS_POLICY_DISCLOSURE_LABEL,
  ATTACH_POSTS_WARNING_COPY,
  ATTACHED_POSTS_EMPTY_SUMMARY,
  ATTACHED_POSTS_ROW_LABEL,
  ATTACHED_POSTS_USES_RELEASE_TOOLS_ROW,
  ATTACHED_POSTS_USES_VAUL_SHEET,
  ATTACHED_POSTS_VIEWER_PAGE_LEVEL,
  attachClipsManagementOpenDirtiesDraft,
  attachClipsSheetOpenDirtiesDraft,
  attachedPostsRowChevronRotationDeg,
  filterEligiblePostsForAttachSearch,
  formatAttachedClipsCountLabel,
  formatAttachedPostsRowSummary,
  nextAttachedPostsManagementOpen,
  selectAttachedPostsForOverview,
  shouldShowAttachDetachAllRow,
  shouldShowAttachSelectedCountRow,
} from "./release-attach-clips-overview";
import { RELEASE_TOOLS_SECTION_TITLE } from "./release-tools-section-title";
import {
  ReleaseAttachedPostsIcon,
  isAttachedClipsMediaIcon,
} from "./release-attached-clips-icon";
import { Film, Link as LinkIcon, UserPlus, Users } from "lucide-react";
import {
  ATTACHMENT_CAPACITY_UPGRADE_HINT,
  maxSelectableAttachments,
  resolveAttachmentCapacityHeader,
} from "./release-attachment-limit";
import {
  RELEASE_LIVE_ATTACH_NOTICE,
  resolveAttachClipToggleKind,
  shouldShowDetachAllControl,
} from "./release-attach-post-release";
import { hasUnsavedReleaseDraft } from "./release-create-dirty";
import { defaultMidnightDraft } from "./release-timing-draft";
import { buildOwnerReleaseEditPatchBody } from "./release-edit-patch";
import { formatReleaseLinksRowSummary } from "./release-tools-links-summary";

const emptyDraft = {
  title: "",
  artworkPath: null,
  comingSoon: false,
  releaseDate: "",
  timingDraft: defaultMidnightDraft(),
  draftLinksCount: 0,
  stagedCollaboratorsCount: 0,
  selectedPostIdsCount: 0,
};

describe("C3 collaborator autofocus", () => {
  it("unlocked sheet requests search autofocus", () => {
    assert.equal(
      shouldAutofocusCollaboratorSearch({
        sheetOpen: true,
        invitesLocked: false,
      }),
      true,
    );
    assert.equal(COLLABORATOR_SEARCH_AUTOFOCUS_MS, 50);
  });

  it("locked or closed sheet does not autofocus", () => {
    assert.equal(
      shouldAutofocusCollaboratorSearch({
        sheetOpen: true,
        invitesLocked: true,
      }),
      false,
    );
    assert.equal(
      shouldAutofocusCollaboratorSearch({
        sheetOpen: false,
        invitesLocked: false,
      }),
      false,
    );
    assert.equal(
      shouldAutofocusCollaboratorSearch({
        sheetOpen: true,
        invitesLocked: false,
        searchDisabled: true,
      }),
      false,
    );
  });
});

describe("C3 collaborator row icon", () => {
  it("maps to Invite person-plus, not Users/community", () => {
    assert.equal(ReleaseCollaboratorsRowIcon, UserPlus);
    assert.equal(isCollaboratorsRowInviteIcon(UserPlus), true);
    assert.equal(isCollaboratorsRowInviteIcon(Users), false);
  });

  it("collaborator invite lock rules unchanged", () => {
    assert.equal(isCollaboratorInviteSetLocked(0), false);
    assert.equal(isCollaboratorInviteSetLocked(1), true);
  });
});

describe("C3 attached posts overview", () => {
  const posts = [
    { id: "a", title: "One", dj_name: "Ada", verified_comment_body: "banger" },
    { id: "b", title: "Two", dj_name: "Ben", verified_comment_body: "" },
    { id: "c", title: "Three", dj_name: "Cara", verified_comment_body: "mix" },
  ];

  it("zero attached → empty row subtitle", () => {
    assert.equal(formatAttachedClipsCountLabel(0), null);
    assert.equal(formatAttachedPostsRowSummary(0), ATTACHED_POSTS_EMPTY_SUMMARY);
    assert.equal(ATTACHED_POSTS_ROW_LABEL, "Attached posts");
    assert.deepEqual(selectAttachedPostsForOverview(posts, []), []);
  });

  it("one attached → singular subtitle", () => {
    assert.equal(formatAttachedClipsCountLabel(1), "1");
    assert.equal(formatAttachedPostsRowSummary(1), "1 post attached");
    assert.deepEqual(
      selectAttachedPostsForOverview(posts, ["b"]).map((p) => p.id),
      ["b"],
    );
  });

  it("multiple attached → plural subtitle", () => {
    assert.equal(formatAttachedClipsCountLabel(3), "3");
    assert.equal(formatAttachedPostsRowSummary(3), "3 posts attached");
    assert.deepEqual(
      selectAttachedPostsForOverview(posts, ["c", "a"]).map((p) => p.id),
      ["c", "a"],
    );
  });

  it("search still matches DJ, title, verified comment", () => {
    assert.equal(filterEligiblePostsForAttachSearch(posts, "ada").length, 1);
    assert.equal(filterEligiblePostsForAttachSearch(posts, "Two").length, 1);
    assert.equal(filterEligiblePostsForAttachSearch(posts, "mix").length, 1);
    assert.equal(filterEligiblePostsForAttachSearch(posts, "").length, 3);
  });
});

describe("C3 attach/detach + capacity", () => {
  it("pre-live existing clip detachable", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: false }),
      "detach",
    );
  });

  it("post-live existing clip not detachable", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: true }),
      "attached-readonly",
    );
    assert.equal(shouldShowDetachAllControl(true), false);
  });

  it("post-live new eligible clip attachable", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: false, isDetachLocked: false }),
      "attach",
    );
  });

  it("free capacity unchanged", () => {
    assert.equal(maxSelectableAttachments({ unlimited: false, limit: 3 }), 3);
    const header = resolveAttachmentCapacityHeader({
      unlimited: false,
      used: 2,
      limit: 3,
    });
    assert.equal(header?.title, "2 of 3 free attachments used");
    assert.equal(header?.upgradeHint, ATTACHMENT_CAPACITY_UPGRADE_HINT);
  });

  it("paid capacity hides promo", () => {
    assert.equal(maxSelectableAttachments({ unlimited: true, limit: 3 }), null);
    assert.equal(
      resolveAttachmentCapacityHeader({
        unlimited: true,
        used: 5,
        limit: null,
      }),
      null,
    );
  });

  it("policy content preserved", () => {
    assert.equal(ATTACH_POSTS_POLICY_DISCLOSURE_LABEL, "About attaching posts");
    assert.match(ATTACH_POSTS_WARNING_COPY, /genuinely feature this release/i);
    assert.match(ATTACH_POSTS_WARNING_COPY, /revoked|suspended/i);
    assert.match(RELEASE_LIVE_ATTACH_NOTICE, /can’t be removed|cannot be removed/i);
  });
});

describe("C3 dirty + persistence regressions", () => {
  it("attach selection dirty-state unchanged", () => {
    assert.equal(hasUnsavedReleaseDraft(emptyDraft), false);
    assert.equal(
      hasUnsavedReleaseDraft({ ...emptyDraft, selectedPostIdsCount: 1 }),
      true,
    );
  });

  it("opening management with no changes does not dirty", () => {
    assert.equal(attachClipsManagementOpenDirtiesDraft(), false);
    assert.equal(attachClipsSheetOpenDirtiesDraft(), false);
    assert.equal(hasUnsavedReleaseDraft(emptyDraft), false);
  });

  it("Attach clips / Done CTA removed in favour of tools row", () => {
    assert.equal(ATTACH_CLIPS_CTA_REMOVED, true);
    assert.equal(ATTACH_CLIPS_DONE_REMOVED, true);
    assert.equal(ATTACHED_POSTS_USES_RELEASE_TOOLS_ROW, true);
  });

  it("Release Tools title casing", () => {
    assert.equal(RELEASE_TOOLS_SECTION_TITLE, "Release Tools");
    assert.notEqual(RELEASE_TOOLS_SECTION_TITLE, "RELEASE TOOLS");
    assert.notEqual(RELEASE_TOOLS_SECTION_TITLE, "Release tools");
  });

  it("Attached posts icon is film/media, not link or people", () => {
    assert.equal(ReleaseAttachedPostsIcon, Film);
    assert.equal(isAttachedClipsMediaIcon(Film), true);
    assert.equal(isAttachedClipsMediaIcon(LinkIcon), false);
    assert.equal(isAttachedClipsMediaIcon(UserPlus), false);
    assert.equal(isAttachedClipsMediaIcon(Users), false);
  });

  it("row chevron and management toggle", () => {
    assert.equal(attachedPostsRowChevronRotationDeg(false), 0);
    assert.equal(attachedPostsRowChevronRotationDeg(true), 90);
    assert.equal(nextAttachedPostsManagementOpen(false), true);
    assert.equal(nextAttachedPostsManagementOpen(true), false);
  });

  it("hides useless selected/detach chrome at zero", () => {
    assert.equal(shouldShowAttachSelectedCountRow(0), false);
    assert.equal(shouldShowAttachSelectedCountRow(1), true);
    assert.equal(
      shouldShowAttachDetachAllRow({
        detachAllDisabled: false,
        detachableSelectedCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldShowAttachDetachAllRow({
        detachAllDisabled: false,
        detachableSelectedCount: 2,
      }),
      true,
    );
    assert.equal(
      shouldShowAttachDetachAllRow({
        detachAllDisabled: true,
        detachableSelectedCount: 2,
      }),
      false,
    );
  });

  it("viewer stays page-level, not a Vaul sheet", () => {
    assert.equal(ATTACHED_POSTS_VIEWER_PAGE_LEVEL, true);
    assert.equal(ATTACHED_POSTS_USES_VAUL_SHEET, false);
  });

  it("post-live edit patch still omits title and timing", () => {
    const body = buildOwnerReleaseEditPatchBody({
      liveLocked: true,
      title: "Changed",
      artworkUrl: "a.jpg",
      comingSoon: false,
      releaseDateYmd: "2026-08-10",
      timingFields: { release_timing_mode: "exact" },
    });
    assert.deepEqual(body, { artwork_url: "a.jpg" });
  });

  it("Links row helper unchanged", () => {
    assert.equal(formatReleaseLinksRowSummary([]), "Add streaming & music links");
  });
});
