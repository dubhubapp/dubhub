import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReleaseAfterFirstPostCopy } from "./release-activity-copy";
import {
  RELEASE_DETAIL_ARTWORK_SIZE_CLASS,
  RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS,
  RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS,
  RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS,
  RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS,
  RELEASE_DETAIL_SHARE_ACTION_CLASS,
} from "./release-detail-secondary-action";

describe("release after first post tense copy", () => {
  it("uses Releasing for confirmed future dates (not Releasing in)", () => {
    const line = buildReleaseAfterFirstPostCopy({
      durationLabel: "85 days",
      isUpcoming: true,
    });
    assert.equal(line, "Releasing 85 days after first post");
    assert.doesNotMatch(line!, /Releasing in/i);
  });

  it("uses Released for today/past dates", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "85 days",
        isUpcoming: false,
      }),
      "Released 85 days after first post",
    );
  });

  it("omits the line when duration is missing or blank", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({ durationLabel: null, isUpcoming: true }),
      null,
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({ durationLabel: undefined, isUpcoming: false }),
      null,
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({ durationLabel: "   ", isUpcoming: true }),
      null,
    );
  });

  it("preserves the supplied duration string unchanged", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "1 day",
        isUpcoming: false,
      }),
      "Released 1 day after first post",
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "3 hours 12 mins",
        isUpcoming: true,
      }),
      "Releasing 3 hours 12 mins after first post",
    );
  });
});

describe("release detail header action chrome", () => {
  it("keeps Share compact and unfilled", () => {
    assert.match(RELEASE_DETAIL_SHARE_ACTION_CLASS, /min-h-\[1\.375rem\]/);
    assert.match(RELEASE_DETAIL_SHARE_ACTION_CLASS, /bg-transparent/);
    assert.doesNotMatch(RELEASE_DETAIL_SHARE_ACTION_CLASS, /bg-muted\/80/);
    assert.doesNotMatch(RELEASE_DETAIL_SHARE_ACTION_CLASS, /min-h-11/);
  });

  it("keeps Countdown as a 44pt hit target with visible content on the bottom edge", () => {
    assert.match(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /min-h-11/);
    assert.match(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /items-end/);
    assert.match(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /bg-transparent/);
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /bg-muted\/80/);
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /border/);
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /items-center/);
    assert.equal(RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS, "h-3 w-3 shrink-0");
  });

  it("uses a compact flow slot so Countdown sits under Coming Soon without overflowing artwork", () => {
    assert.match(RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS, /h-\[1\.375rem\]/);
    assert.match(RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS, /relative/);
    assert.equal(RELEASE_DETAIL_ARTWORK_SIZE_CLASS, "h-32 w-32");
    assert.equal(RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS, "min-h-32");
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /-mt-/);
    assert.doesNotMatch(RELEASE_DETAIL_SHARE_ACTION_CLASS, /-mt-/);
  });
});
