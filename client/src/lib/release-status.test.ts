import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReleasePublicSchedule,
  getReleaseStatusFromTiming,
  isReleaseDayTodayFromTiming,
  isReleaseLiveLockedFromTiming,
  isReleaseUpcomingFromTiming,
  resolveReleaseBoundary,
  toLocalDateKey,
  viewerLocalStartOfCalendarDateMs,
} from "./release-status";

describe("canonical release boundary", () => {
  it("Midnight tomorrow in viewer TZ is upcoming", () => {
    const now = new Date(2026, 5, 10, 15, 0, 0); // Jun 10 local
    const status = getReleaseStatusFromTiming(
      {
        isComingSoon: false,
        releaseDate: "2026-06-11T00:00:00.000Z",
        releaseTimingMode: "midnight",
      },
      now,
    );
    assert.equal(status, "upcoming");
  });

  it("Midnight local date today after 00:00 is released", () => {
    const now = new Date(2026, 5, 11, 0, 30, 0); // Jun 11 00:30 local
    const status = getReleaseStatusFromTiming(
      {
        isComingSoon: false,
        releaseDate: "2026-06-11T00:00:00.000Z",
        releaseTimingMode: "midnight",
      },
      now,
    );
    assert.equal(status, "released");
  });

  it("same 00:00Z carrier follows viewer local date, not Instant", () => {
    // Carrier is Jun 11 00:00Z. Instant helper would say "released" everywhere after that UTC instant.
    // In a TZ behind UTC, local Jun 10 evening is still before local Jun 11 midnight → upcoming.
    const eveningBefore = new Date(2026, 5, 10, 20, 0, 0); // Jun 10 20:00 local
    const input = {
      isComingSoon: false,
      releaseDate: "2026-06-11T00:00:00.000Z",
      releaseTimingMode: "midnight" as const,
    };
    assert.equal(getReleaseStatusFromTiming(input, eveningBefore), "upcoming");
    const boundary = resolveReleaseBoundary(input);
    assert.equal(boundary.kind, "midnight");
    if (boundary.kind === "midnight") {
      assert.equal(boundary.calendarYmd, "2026-06-11");
      assert.equal(
        boundary.boundaryMs,
        viewerLocalStartOfCalendarDateMs("2026-06-11"),
      );
    }
  });

  it("Exact future is upcoming", () => {
    const now = new Date("2026-06-11T16:00:00.000Z");
    assert.equal(
      getReleaseStatusFromTiming(
        {
          isComingSoon: false,
          releaseDate: "2026-06-11T00:00:00.000Z",
          releaseTimingMode: "exact",
          releaseAt: "2026-06-11T17:00:00.000Z",
          releaseTimezone: "Europe/London",
        },
        now,
      ),
      "upcoming",
    );
  });

  it("Exact at boundary is released", () => {
    const at = "2026-06-11T17:00:00.000Z";
    assert.equal(
      getReleaseStatusFromTiming(
        {
          isComingSoon: false,
          releaseTimingMode: "exact",
          releaseAt: at,
        },
        new Date(at),
      ),
      "released",
    );
  });

  it("Exact past is released", () => {
    assert.equal(
      getReleaseStatusFromTiming(
        {
          isComingSoon: false,
          releaseTimingMode: "exact",
          releaseAt: "2026-06-11T17:00:00.000Z",
        },
        new Date("2026-06-11T18:00:00.000Z"),
      ),
      "released",
    );
  });

  it("Coming Soon is unaffected", () => {
    assert.equal(
      getReleaseStatusFromTiming({
        isComingSoon: true,
        releaseDate: "2026-06-11T00:00:00.000Z",
        releaseTimingMode: "exact",
        releaseAt: "2026-01-01T00:00:00.000Z",
      }),
      "upcoming",
    );
    assert.equal(
      isReleaseDayTodayFromTiming({
        isComingSoon: true,
        releaseDate: "2026-06-11T00:00:00.000Z",
      }),
      false,
    );
  });

  it("Exact release day celebration waits until releaseAt", () => {
    const releaseAt = new Date("2026-06-11T17:00:00.000Z");
    const input = {
      isComingSoon: false,
      releaseTimingMode: "exact" as const,
      releaseAt,
    };
    // Same local calendar day as releaseAt, but before the instant.
    const before = new Date(releaseAt.getTime() - 60_000);
    if (toLocalDateKey(before) === toLocalDateKey(releaseAt)) {
      assert.equal(isReleaseDayTodayFromTiming(input, before), false);
    }
    assert.equal(
      isReleaseDayTodayFromTiming(input, new Date(releaseAt.getTime() + 60_000)),
      toLocalDateKey(releaseAt) === toLocalDateKey(new Date(releaseAt.getTime() + 60_000)),
    );
  });

  it("Exact edit lock uses releaseAt not UTC midnight", () => {
    const input = {
      isComingSoon: false,
      releaseDate: "2026-06-11T00:00:00.000Z",
      releaseTimingMode: "exact" as const,
      releaseAt: "2026-06-11T17:00:00.000Z",
    };
    assert.equal(
      isReleaseLiveLockedFromTiming(input, new Date("2026-06-11T10:00:00.000Z")),
      false,
    );
    assert.equal(
      isReleaseLiveLockedFromTiming(input, new Date("2026-06-11T17:00:00.000Z")),
      true,
    );
  });

  it("Midnight public schedule is date-only", () => {
    const text = formatReleasePublicSchedule({
      isComingSoon: false,
      releaseDate: "2026-09-11T00:00:00.000Z",
      releaseTimingMode: "midnight",
    });
    assert.match(text, /Sep/);
    assert.match(text, /11/);
    assert.match(text, /2026/);
    assert.doesNotMatch(text, /\d{1,2}:\d{2}/);
    assert.doesNotMatch(text, /UTC|AM|PM/i);
  });

  it("Exact public schedule includes viewer-local time", () => {
    const text = formatReleasePublicSchedule(
      {
        isComingSoon: false,
        releaseTimingMode: "exact",
        releaseAt: "2026-09-11T17:00:00.000Z",
        releaseTimezone: "Europe/London",
      },
      { locale: "en-US" },
    );
    assert.match(text, /Sep/);
    assert.match(text, /11/);
    assert.match(text, /2026/);
    assert.match(text, /\d{1,2}:\d{2}|AM|PM/i);
  });

  it("isReleaseUpcomingFromTiming matches getReleaseStatusFromTiming", () => {
    const input = {
      isComingSoon: false,
      releaseTimingMode: "exact" as const,
      releaseAt: "2099-01-01T00:00:00.000Z",
    };
    assert.equal(isReleaseUpcomingFromTiming(input), true);
  });
});
