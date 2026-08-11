import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatReleaseLinksRowSummary } from "./release-tools-links-summary";
import {
  formatReleaseCollaboratorsRowSummary,
  isCollaboratorInviteSetLocked,
} from "./release-tools-collaborators-summary";
import { hasUnsavedReleaseDraft } from "./release-create-dirty";
import { defaultMidnightDraft } from "./release-timing-draft";
import { buildOwnerReleaseEditPatchBody } from "./release-edit-patch";
import { resolveFreeQuotaNoticeProminence } from "./release-form-limit-prominence";

describe("formatReleaseLinksRowSummary", () => {
  it("A. 0 / 1 / multiple", () => {
    assert.equal(formatReleaseLinksRowSummary([]), "Add streaming & music links");
    assert.match(formatReleaseLinksRowSummary([{ platform: "spotify" }]), /Spotify/i);
    assert.equal(
      formatReleaseLinksRowSummary([
        { platform: "spotify" },
        { platform: "soundcloud" },
      ]),
      "2 added",
    );
  });
});

describe("formatReleaseCollaboratorsRowSummary", () => {
  it("B. 0 / accepted / pending / multiple", () => {
    assert.equal(
      formatReleaseCollaboratorsRowSummary({ existing: [], staged: [] }),
      "Add verified artists",
    );
    assert.match(
      formatReleaseCollaboratorsRowSummary({
        existing: [{ username: "artist1", status: "ACCEPTED" }],
        staged: [],
      }),
      /artist1/i,
    );
    assert.match(
      formatReleaseCollaboratorsRowSummary({
        existing: [{ username: "artist1", status: "PENDING" }],
        staged: [],
      }),
      /pending/i,
    );
    assert.match(
      formatReleaseCollaboratorsRowSummary({
        existing: [
          { username: "artist1", status: "ACCEPTED" },
          { username: "artist2", status: "ACCEPTED" },
        ],
        staged: [],
      }),
      /\+ 1 more/i,
    );
    assert.match(
      formatReleaseCollaboratorsRowSummary({
        existing: [
          { username: "a", status: "ACCEPTED" },
          { username: "b", status: "PENDING" },
        ],
        staged: [],
      }),
      /2 artists · 1 pending/,
    );
  });

  it("C. collaborator invite set lock unchanged", () => {
    assert.equal(isCollaboratorInviteSetLocked(0), false);
    assert.equal(isCollaboratorInviteSetLocked(1), true);
  });
});

describe("C2 regressions", () => {
  it("D. link limit prominence unchanged", () => {
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: true, used: 0, limit: 1 }),
      "hidden",
    );
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: false, used: 0, limit: 1 }),
      "quiet",
    );
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: false, used: 1, limit: 1 }),
      "prominent",
    );
  });

  it("E. post-live patch still omits title and timing", () => {
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

  it("F. unsaved draft includes links and collaborators", () => {
    const base = {
      title: "",
      artworkPath: null,
      comingSoon: false,
      releaseDate: "",
      timingDraft: defaultMidnightDraft(),
      draftLinksCount: 0,
      stagedCollaboratorsCount: 0,
      selectedPostIdsCount: 0,
    };
    assert.equal(hasUnsavedReleaseDraft(base), false);
    assert.equal(hasUnsavedReleaseDraft({ ...base, draftLinksCount: 1 }), true);
    assert.equal(
      hasUnsavedReleaseDraft({ ...base, stagedCollaboratorsCount: 1 }),
      true,
    );
  });
});
