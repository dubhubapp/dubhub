import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultMidnightDraft, enableExactDraft } from "./release-timing-draft";
import {
  buildDraftScheduleHeroSummary,
  buildReleasedScheduleHeroSummary,
} from "./release-form-hero-schedule";
import { RELEASE_COMING_SOON_LABEL } from "./release-status-pill";
import {
  RELEASE_TITLE_LOCKED_CODE,
  RELEASE_TITLE_LOCKED_MESSAGE,
} from "@shared/release-timing";

describe("buildDraftScheduleHeroSummary", () => {
  it("21/J. uses the same timing draft fields (not a second model)", () => {
    const draft = enableExactDraft(defaultMidnightDraft());
    draft.timeLocal = "18:00";
    draft.timezone = "Europe/London";

    const summary = buildDraftScheduleHeroSummary({
      comingSoon: false,
      releaseDateYmd: "2026-10-31",
      timingDraft: draft,
      locale: "en-GB",
    });

    assert.equal(summary.readOnly, false);
    assert.equal(summary.statusLabel, "Scheduled");
    assert.match(summary.primaryLine, /31/);
    assert.match(summary.primaryLine, /Oct/);
    assert.match(summary.primaryLine, /18:00|6:00/);
    assert.ok(summary.secondaryLine);
    assert.match(summary.secondaryLine!, /London|Europe/);
  });

  it("Coming Soon uses draft comingSoon flag", () => {
    const summary = buildDraftScheduleHeroSummary({
      comingSoon: true,
      releaseDateYmd: "",
      timingDraft: defaultMidnightDraft(),
    });
    assert.equal(summary.statusLabel, RELEASE_COMING_SOON_LABEL);
    assert.match(summary.primaryLine, /not announced/i);
  });

  it("23. post-release Edit hero remains Released read-only", () => {
    const summary = buildReleasedScheduleHeroSummary({
      isComingSoon: false,
      releaseDate: "2026-08-09T00:00:00.000Z",
      releaseTimingMode: "exact",
      releaseAt: "2026-08-09T22:00:00.000Z",
      releaseTimezone: "Europe/London",
    });
    assert.equal(summary.readOnly, true);
    assert.equal(summary.incomplete, false);
    assert.match(summary.statusLabel, /Released/i);
  });
});

describe("title lock regression", () => {
  it("24. title lock contract unchanged", () => {
    assert.equal(RELEASE_TITLE_LOCKED_CODE, "RELEASE_TITLE_LOCKED");
    assert.equal(
      RELEASE_TITLE_LOCKED_MESSAGE,
      "The release title can't be changed after the release is live.",
    );
  });
});
