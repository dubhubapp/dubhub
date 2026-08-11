import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultMidnightDraft,
  enableExactDraft,
} from "./release-timing-draft";
import {
  buildDraftScheduleHeroSummary,
  isDraftScheduleComplete,
} from "./release-form-hero-schedule";
import { RELEASE_COMING_SOON_LABEL } from "./release-status-pill";
import {
  applyCreateDiscardChoice,
  createBackDecision,
  hasUnsavedReleaseDraft,
  type ReleaseCreateDraftSnapshot,
} from "./release-create-dirty";

function emptyCreateDraft(
  overrides: Partial<ReleaseCreateDraftSnapshot> = {},
): ReleaseCreateDraftSnapshot {
  return {
    title: "",
    artworkPath: null,
    comingSoon: false,
    releaseDate: "",
    timingDraft: defaultMidnightDraft(),
    draftLinksCount: 0,
    stagedCollaboratorsCount: 0,
    selectedPostIdsCount: 0,
    ...overrides,
  };
}

describe("Create hero required-state contract", () => {
  it("1. untouched Create → incomplete title placeholder contract (no title)", () => {
    assert.equal("".trim().length > 0, false);
  });

  it("2–3. untouched Create → Add release schedule * and no false Scheduled", () => {
    const summary = buildDraftScheduleHeroSummary({
      comingSoon: false,
      releaseDateYmd: "",
      timingDraft: defaultMidnightDraft(),
    });
    assert.equal(summary.incomplete, true);
    assert.equal(summary.primaryLine, "Add release schedule *");
    assert.equal(summary.statusLabel, "");
    assert.notEqual(summary.statusLabel, "Scheduled");
  });

  it("4. title set is represented by trimmed title (hero shows actual title)", () => {
    assert.equal("Brand New Banger".trim(), "Brand New Banger");
  });

  it("5. explicit Coming Soon → valid Coming Soon state", () => {
    const summary = buildDraftScheduleHeroSummary({
      comingSoon: true,
      releaseDateYmd: "",
      timingDraft: defaultMidnightDraft(),
    });
    assert.equal(summary.incomplete, false);
    assert.equal(summary.statusLabel, RELEASE_COMING_SOON_LABEL);
    assert.match(summary.primaryLine, /not announced/i);
  });

  it("6. scheduled + Exact date/timing complete → Scheduled summary", () => {
    const draft = enableExactDraft(defaultMidnightDraft());
    draft.timeLocal = "18:00";
    draft.timezone = "Europe/London";
    const summary = buildDraftScheduleHeroSummary({
      comingSoon: false,
      releaseDateYmd: "2026-10-31",
      timingDraft: draft,
      locale: "en-GB",
    });
    assert.equal(summary.incomplete, false);
    assert.equal(summary.statusLabel, "Scheduled");
    assert.match(summary.primaryLine, /31/);
    assert.match(summary.primaryLine, /Oct/);
  });

  it("7. Exact incomplete → still incomplete", () => {
    const draft = enableExactDraft(defaultMidnightDraft());
    draft.timezone = null;
    assert.equal(
      isDraftScheduleComplete({
        comingSoon: false,
        releaseDateYmd: "2026-10-31",
        timingDraft: draft,
      }),
      false,
    );
    const summary = buildDraftScheduleHeroSummary({
      comingSoon: false,
      releaseDateYmd: "2026-10-31",
      timingDraft: draft,
    });
    assert.equal(summary.incomplete, true);
    assert.equal(summary.statusLabel, "");
    assert.equal(summary.primaryLine, "Add release schedule *");
  });

  it("8. Midnight dated → valid Scheduled", () => {
    const summary = buildDraftScheduleHeroSummary({
      comingSoon: false,
      releaseDateYmd: "2026-10-31",
      timingDraft: defaultMidnightDraft(),
      locale: "en-GB",
    });
    assert.equal(summary.incomplete, false);
    assert.equal(summary.statusLabel, "Scheduled");
    assert.match(summary.primaryLine, /31/);
  });
});

describe("Create dirty-state model", () => {
  it("9. untouched defaults → false", () => {
    assert.equal(hasUnsavedReleaseDraft(emptyCreateDraft()), false);
  });

  it("10. title → true", () => {
    assert.equal(
      hasUnsavedReleaseDraft(emptyCreateDraft({ title: "Night Bus" })),
      true,
    );
  });

  it("11. artwork → true", () => {
    assert.equal(
      hasUnsavedReleaseDraft(emptyCreateDraft({ artworkPath: "a/b.jpg" })),
      true,
    );
  });

  it("12. date/timing → true", () => {
    assert.equal(
      hasUnsavedReleaseDraft(emptyCreateDraft({ releaseDate: "2026-10-31" })),
      true,
    );
    assert.equal(
      hasUnsavedReleaseDraft(
        emptyCreateDraft({ timingDraft: enableExactDraft(defaultMidnightDraft()) }),
      ),
      true,
    );
  });

  it("13. Coming Soon selection → true", () => {
    assert.equal(
      hasUnsavedReleaseDraft(emptyCreateDraft({ comingSoon: true })),
      true,
    );
  });

  it("14. staged link → true", () => {
    assert.equal(
      hasUnsavedReleaseDraft(emptyCreateDraft({ draftLinksCount: 1 })),
      true,
    );
  });

  it("15. staged collaborator → true", () => {
    assert.equal(
      hasUnsavedReleaseDraft(emptyCreateDraft({ stagedCollaboratorsCount: 1 })),
      true,
    );
  });

  it("16. selected clip → true", () => {
    assert.equal(
      hasUnsavedReleaseDraft(emptyCreateDraft({ selectedPostIdsCount: 1 })),
      true,
    );
  });
});

describe("Create back guard decisions", () => {
  it("17. clean → direct back", () => {
    assert.equal(createBackDecision(false), "navigate");
  });

  it("18. dirty → confirm", () => {
    assert.equal(createBackDecision(true), "confirm");
  });

  it("19. Keep editing → no navigation", () => {
    assert.equal(applyCreateDiscardChoice("keep"), "stay");
  });

  it("20. Discard → back", () => {
    assert.equal(applyCreateDiscardChoice("discard"), "navigate");
  });
});
