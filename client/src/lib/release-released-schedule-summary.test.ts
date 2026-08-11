import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReleasedScheduleSummary } from "./release-released-schedule-summary";
import { formatReleasePublicSchedule } from "./release-status";
import { formatExactReleaseTimeDisplay } from "./release-timezone-label";
import { formatReleaseTimezoneLocation, findReleaseTimezoneOption } from "./release-timezone-options";
import { RELEASE_RELEASED_LABEL } from "./release-status-pill";
import {
  RELEASE_LIVE_ATTACH_NOTICE,
  nextSelectedPostIds,
  resolveAttachClipToggleKind,
  shouldShowDetachAllControl,
} from "./release-attach-post-release";

describe("buildReleasedScheduleSummary", () => {
  it("Midnight post-release summary is date-only with Released label", () => {
    const input = {
      isComingSoon: false,
      releaseDate: "2026-08-09T00:00:00.000Z",
      releaseTimingMode: "midnight" as const,
    };
    const summary = buildReleasedScheduleSummary(input, { locale: "en-GB" });
    assert.equal(summary.label, RELEASE_RELEASED_LABEL);
    assert.equal(
      summary.primaryLine,
      formatReleasePublicSchedule(input, { locale: "en-GB" }),
    );
    assert.equal(summary.secondaryLine, null);
    assert.doesNotMatch(summary.primaryLine, /\d{1,2}:\d{2}/);
  });

  it("Exact post-release summary includes date, wall time, and timezone line", () => {
    const input = {
      isComingSoon: false,
      releaseDate: "2026-08-09T00:00:00.000Z",
      releaseTimingMode: "exact" as const,
      releaseAt: "2026-08-09T22:00:00.000Z",
      releaseTimezone: "Europe/London",
    };
    const summary = buildReleasedScheduleSummary(input, { locale: "en-GB" });
    assert.equal(summary.label, RELEASE_RELEASED_LABEL);
    assert.match(summary.primaryLine, /9 Aug 2026|Aug 9, 2026/);
    const exactDisplay = formatExactReleaseTimeDisplay({
      timeLocalHhmm: "23:00",
      timeZone: "Europe/London",
      releaseDateYmd: "2026-08-09",
      locale: "en-GB",
    });
    const timeLabel = exactDisplay.split(" · ")[0];
    assert.match(summary.primaryLine, new RegExp(timeLabel.replace(":", "\\:")));
    assert.ok(summary.secondaryLine);
    const option = findReleaseTimezoneOption("Europe/London");
    assert.ok(option);
    assert.match(
      summary.secondaryLine!,
      new RegExp(formatReleaseTimezoneLocation(option).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(summary.secondaryLine!, /UTC\+1/);
  });

  it("Exact timezone presentation uses existing helpers (city/region · offset)", () => {
    const summary = buildReleasedScheduleSummary(
      {
        isComingSoon: false,
        releaseDate: "2026-07-15T00:00:00.000Z",
        releaseTimingMode: "exact",
        releaseAt: "2026-07-15T17:00:00.000Z",
        releaseTimezone: "Europe/London",
      },
      { locale: "en-GB" },
    );
    assert.equal(summary.secondaryLine, "London, England · UTC+1");
  });
});

describe("post-release attach presentation", () => {
  it("pre-release selected clip exposes detach kind", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: false }),
      "detach",
    );
  });

  it("post-release attached clip is attached-readonly (no detach action)", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: true, isDetachLocked: true }),
      "attached-readonly",
    );
  });

  it("post-release unattached clip remains attachable", () => {
    assert.equal(
      resolveAttachClipToggleKind({ isSelected: false, isDetachLocked: false }),
      "attach",
    );
  });

  it("hides Detach all when detach is locked", () => {
    assert.equal(shouldShowDetachAllControl(true), false);
    assert.equal(shouldShowDetachAllControl(false), true);
  });

  it("live attach notice covers remove + still-attach rules", () => {
    assert.match(RELEASE_LIVE_ATTACH_NOTICE, /can’t be removed|cannot be removed/i);
    assert.match(RELEASE_LIVE_ATTACH_NOTICE, /still attach|can still/i);
  });

  it("selection toggle respects lock and free max", () => {
    assert.deepEqual(
      nextSelectedPostIds({ prev: ["a"], postId: "b", maxSelectable: 3 }),
      ["a", "b"],
    );
    assert.deepEqual(
      nextSelectedPostIds({ prev: ["a"], postId: "a" }),
      [],
    );
    assert.deepEqual(
      nextSelectedPostIds({ prev: ["a"], postId: "b", locked: true }),
      ["a"],
    );
    assert.deepEqual(
      nextSelectedPostIds({ prev: ["a", "b", "c"], postId: "d", maxSelectable: 3 }),
      ["a", "b", "c"],
    );
  });
});

describe("pre-release schedule lock gate", () => {
  it("Coming Soon is never summarized as Released via live lock helper path", async () => {
    const { isReleaseLiveLockedFromTiming } = await import("./release-status");
    const locked = isReleaseLiveLockedFromTiming(
      {
        isComingSoon: true,
        releaseDate: null,
        releaseTimingMode: "midnight",
      },
      new Date("2026-08-10T12:00:00.000Z"),
    );
    assert.equal(locked, false);
  });

  it("pre-release Midnight remains unlocked so scheduling controls stay editable", async () => {
    const { isReleaseLiveLockedFromTiming } = await import("./release-status");
    const now = new Date(2026, 7, 8, 12, 0, 0); // Aug 8 local
    const locked = isReleaseLiveLockedFromTiming(
      {
        isComingSoon: false,
        releaseDate: "2026-08-09T00:00:00.000Z",
        releaseTimingMode: "midnight",
      },
      now,
    );
    assert.equal(locked, false);
  });
});
