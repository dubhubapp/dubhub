import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isForbiddenLiveTitleMutation } from "./release-title-lock";
import { isServerReleaseLiveForMutation } from "./release-timing-live";
import {
  RELEASE_TITLE_LOCKED_CODE,
  RELEASE_TIMING_LOCKED_CODE,
} from "@shared/release-timing";

const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("isForbiddenLiveTitleMutation", () => {
  it("A. rejects released title mutation", () => {
    assert.equal(
      isForbiddenLiveTitleMutation({
        live: true,
        requestedTitle: "New Name",
        currentTitle: "Old Name",
      }),
      true,
    );
  });

  it("B. same-title PATCH is not a title mutation", () => {
    assert.equal(
      isForbiddenLiveTitleMutation({
        live: true,
        requestedTitle: "  Same Title  ",
        currentTitle: "Same Title",
      }),
      false,
    );
  });

  it("C. pre-release title mutation allowed", () => {
    assert.equal(
      isForbiddenLiveTitleMutation({
        live: false,
        requestedTitle: "Brand New Banger",
        currentTitle: "Working Title",
      }),
      false,
    );
  });

  it("D. Coming Soon title mutation allowed (never live)", () => {
    const live = isServerReleaseLiveForMutation(
      {
        isComingSoon: true,
        releaseTimingMode: "midnight",
        releaseDate: null,
        releaseAt: null,
      },
      NOW,
    );
    assert.equal(live, false);
    assert.equal(
      isForbiddenLiveTitleMutation({
        live,
        requestedTitle: "Soon Title",
        currentTitle: "Draft",
      }),
      false,
    );
  });

  it("E. Exact boundary title lock (now >= release_at)", () => {
    const live = isServerReleaseLiveForMutation(
      {
        isComingSoon: false,
        releaseTimingMode: "exact",
        releaseDate: "2026-08-10T00:00:00.000Z",
        releaseAt: "2026-08-10T12:00:00.000Z",
      },
      NOW,
    );
    assert.equal(live, true);
    assert.equal(
      isForbiddenLiveTitleMutation({
        live,
        requestedTitle: "After Live",
        currentTitle: "Before Live",
      }),
      true,
    );
  });

  it("F. mixed forbidden title + allowed artwork still forbidden (atomic reject signal)", () => {
    // Route rejects before updateRelease when this is true — artwork in same body is not applied.
    const forbidden = isForbiddenLiveTitleMutation({
      live: true,
      requestedTitle: "Renamed",
      currentTitle: "Original",
    });
    assert.equal(forbidden, true);
    // Artwork-only (no title key) is not a title mutation:
    assert.equal(
      isForbiddenLiveTitleMutation({
        live: true,
        requestedTitle: undefined,
        currentTitle: "Original",
      }),
      false,
    );
  });

  it("omitting title is never a mutation", () => {
    assert.equal(
      isForbiddenLiveTitleMutation({
        live: true,
        requestedTitle: undefined,
        currentTitle: "Keep",
      }),
      false,
    );
  });

  it("title lock code is distinct from timing lock", () => {
    assert.equal(RELEASE_TITLE_LOCKED_CODE, "RELEASE_TITLE_LOCKED");
    assert.notEqual(RELEASE_TITLE_LOCKED_CODE, RELEASE_TIMING_LOCKED_CODE);
  });
});
