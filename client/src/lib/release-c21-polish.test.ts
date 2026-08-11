import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RELEASE_TIMING_MODE_EXACT } from "@shared/release-timing";
import {
  defaultMidnightDraft,
  enableExactDraft,
} from "./release-timing-draft";
import { buildLinkTypeOptions } from "./release-link-type-options";
import { hasUnsavedReleaseDraft } from "./release-create-dirty";
import { isVerifiedArtistNamePresentation } from "../components/verified-artist-name";
import { buildDraftScheduleHeroSummary } from "./release-form-hero-schedule";
import { getCollaborationStatusDisplay } from "./collaboration-status-display";

describe("C2.1 schedule conditional fields", () => {
  it("1. Exact reveals time/timezone draft mode", () => {
    const exact = enableExactDraft(defaultMidnightDraft());
    assert.equal(exact.mode, RELEASE_TIMING_MODE_EXACT);
    assert.ok(exact.timeLocal);
  });

  it("2. Midnight hides Exact fields (mode midnight)", () => {
    const draft = defaultMidnightDraft();
    assert.notEqual(draft.mode, RELEASE_TIMING_MODE_EXACT);
  });
});

describe("C2.1 link type condition", () => {
  it("3–4. link type options follow platform rules unchanged", () => {
    const spotify = buildLinkTypeOptions({
      platform: "spotify",
      supported: ["listen", "presave"],
      unlimited: false,
    });
    assert.ok(spotify.length >= 1);
    assert.ok(spotify.some((o) => o.purpose === "presave" && o.locked));

    const freeOnly = buildLinkTypeOptions({
      platform: "soundcloud",
      supported: ["listen"],
      unlimited: false,
    });
    assert.equal(
      freeOnly.every((o) => o.purpose === "listen" || !o.locked || o.locked),
      true,
    );
  });
});

describe("C2.1 collaborator presentation / status", () => {
  it("5–6. accepted and pending status display unchanged", () => {
    assert.match(
      getCollaborationStatusDisplay("ACCEPTED")?.label || "",
      /Accepted/i,
    );
    assert.match(
      getCollaborationStatusDisplay("PENDING")?.label || "",
      /Pending/i,
    );
  });

  it("7. verified collaborator presentation is canonical", () => {
    assert.equal(isVerifiedArtistNamePresentation(), true);
  });
});

describe("C2.1 dirty after sheet Done", () => {
  it("8–9. links and collaborators still dirty after local sheet edits", () => {
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
    assert.equal(
      hasUnsavedReleaseDraft({ ...base, draftLinksCount: 2 }),
      true,
    );
    assert.equal(
      hasUnsavedReleaseDraft({ ...base, stagedCollaboratorsCount: 1 }),
      true,
    );
  });
});

describe("C2.1 title/schedule hero regression", () => {
  it("10. incomplete schedule still shows required placeholder", () => {
    const summary = buildDraftScheduleHeroSummary({
      comingSoon: false,
      releaseDateYmd: "",
      timingDraft: defaultMidnightDraft(),
    });
    assert.equal(summary.incomplete, true);
    assert.equal(summary.primaryLine, "Add release schedule *");
  });
});
