import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReleasePublicSchedule,
  isReleaseUpcomingFromTiming,
} from "./release-status";

describe("attached release preview timing (Exact)", () => {
  const releaseDate = "2026-08-09T00:00:00.000Z";
  const releaseAt = new Date("2026-08-09T22:00:00.000Z"); // 23:00 London BST
  const afternoonSameDay = new Date("2026-08-09T15:00:00.000Z");

  it("Exact future today → NOT Released (unlike date-only Midnight)", () => {
    assert.equal(
      isReleaseUpcomingFromTiming(
        {
          releaseDate,
          releaseTimingMode: "exact",
          releaseAt: releaseAt.toISOString(),
        },
        afternoonSameDay,
      ),
      true,
    );
    // Date-only Midnight on the same calendar day would already be Released:
    assert.equal(
      isReleaseUpcomingFromTiming(
        {
          releaseDate,
          releaseTimingMode: "midnight",
        },
        afternoonSameDay,
      ),
      false,
    );
  });

  it("Exact one minute before releaseAt → upcoming", () => {
    assert.equal(
      isReleaseUpcomingFromTiming(
        {
          releaseDate,
          releaseTimingMode: "exact",
          releaseAt: releaseAt.toISOString(),
        },
        new Date(releaseAt.getTime() - 60_000),
      ),
      true,
    );
  });

  it("Exact at/after releaseAt → Released", () => {
    assert.equal(
      isReleaseUpcomingFromTiming(
        {
          releaseDate,
          releaseTimingMode: "exact",
          releaseAt: releaseAt.toISOString(),
        },
        releaseAt,
      ),
      false,
    );
  });

  it("Exact schedule line includes viewer-local time", () => {
    const text = formatReleasePublicSchedule(
      {
        releaseDate,
        releaseTimingMode: "exact",
        releaseAt: releaseAt.toISOString(),
      },
      { locale: "en-GB" },
    );
    assert.match(text, /·/);
    assert.ok(!text.includes("Europe/London"));
  });

  it("Midnight schedule is date-only", () => {
    const text = formatReleasePublicSchedule(
      {
        releaseDate,
        releaseTimingMode: "midnight",
      },
      { locale: "en-GB" },
    );
    assert.ok(!text.includes("·"));
  });
});
