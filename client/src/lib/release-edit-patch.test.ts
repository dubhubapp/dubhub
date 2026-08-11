import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOwnerReleaseEditPatchBody } from "./release-edit-patch";
import { requestBodyAttemptsReleaseTimingMutation } from "@shared/release-timing";

describe("buildOwnerReleaseEditPatchBody", () => {
  it("pre-live includes timing and status fields", () => {
    const body = buildOwnerReleaseEditPatchBody({
      liveLocked: false,
      title: "Night Bus",
      artworkUrl: "path/art.jpg",
      comingSoon: false,
      releaseDateYmd: "2026-08-10",
      timingFields: {
        release_timing_mode: "exact",
        release_time_local: "18:00",
        release_timezone: "Europe/London",
      },
    });
    assert.equal(body.title, "Night Bus");
    assert.equal(body.release_date, "2026-08-10");
    assert.equal(body.is_coming_soon, false);
    assert.equal(body.release_timing_mode, "exact");
    assert.equal(body.release_time_local, "18:00");
    assert.equal(body.release_timezone, "Europe/London");
    assert.equal(body.artwork_url, "path/art.jpg");
    assert.equal(requestBodyAttemptsReleaseTimingMutation(body), true);
  });

  it("post-live omits timing/status and title (G)", () => {
    const body = buildOwnerReleaseEditPatchBody({
      liveLocked: true,
      title: "Night Bus Fixed",
      artworkUrl: "path/new.jpg",
      comingSoon: false,
      releaseDateYmd: "2026-08-10",
      timingFields: {
        release_timing_mode: "exact",
        release_time_local: "18:00",
        release_timezone: "Europe/London",
      },
    });
    assert.deepEqual(body, {
      artwork_url: "path/new.jpg",
    });
    assert.equal("title" in body, false);
    assert.equal(requestBodyAttemptsReleaseTimingMutation(body), false);
  });

  it("pre-live includes title (H)", () => {
    const body = buildOwnerReleaseEditPatchBody({
      liveLocked: false,
      title: "Night Bus",
      artworkUrl: "path/art.jpg",
      comingSoon: false,
      releaseDateYmd: "2026-08-10",
      timingFields: {
        release_timing_mode: "midnight",
      },
    });
    assert.equal(body.title, "Night Bus");
    assert.equal("artwork_url" in body, true);
  });
});

describe("requestBodyAttemptsReleaseTimingMutation", () => {
  it("detects snake and camel timing aliases", () => {
    assert.equal(
      requestBodyAttemptsReleaseTimingMutation({ releaseTimingMode: "midnight" }),
      true,
    );
    assert.equal(
      requestBodyAttemptsReleaseTimingMutation({ release_time_local: "12:00" }),
      true,
    );
    assert.equal(
      requestBodyAttemptsReleaseTimingMutation({ title: "x", artwork_url: "y" }),
      false,
    );
  });
});
