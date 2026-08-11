/**
 * TypeScript mirrors of native Slice 4 countdown (HomeWidgetCountdown.swift).
 * Legacy UTC day-only helper remains for Midnight server stamp compatibility tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getHomeWidgetCountdown,
  wholeUtcCalendarDayDifference,
} from "../../../server/home-widget-domain";
import { computeHomeWidgetCountdown } from "../../../shared/home-widget-countdown";

describe("Slice 4 countdown contract (shared with Swift)", () => {
  it("Exact <24h uses hours+minutes not UTC day Out now", () => {
    const r = computeHomeWidgetCountdown({
      timingMode: "exact",
      releaseAt: "2026-08-06T20:00:00.000Z",
      now: "2026-08-06T15:30:00.000Z",
      timeZone: "UTC",
    });
    assert.equal(r?.countdownLabel, "4 hours 30 mins");
    assert.equal(r?.isOutNow, false);
  });

  it("Midnight far range still day-labelled", () => {
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-08-11",
      now: "2026-08-06T15:30:00.000Z",
      timeZone: "UTC",
    });
    assert.equal(r?.countdownLabel, "5 days");
  });

  it("labels never include seconds", () => {
    const r = computeHomeWidgetCountdown({
      timingMode: "exact",
      releaseAt: "2026-08-06T16:00:00.000Z",
      now: "2026-08-06T15:30:00.000Z",
      timeZone: "UTC",
    });
    assert.doesNotMatch(r?.countdownLabel ?? "", /sec/i);
  });
});

describe("Midnight UTC stamp compatibility (server convenience fields)", () => {
  const NOW = new Date("2026-08-06T15:30:00.000Z");

  it("five UTC days → 5 days", () => {
    assert.equal(
      getHomeWidgetCountdown("2026-08-11T00:00:00.000Z", NOW)?.countdownLabel,
      "5 days",
    );
  });

  it("one UTC day → Tomorrow", () => {
    assert.equal(
      getHomeWidgetCountdown("2026-08-07T12:00:00.000Z", NOW)?.countdownLabel,
      "Tomorrow",
    );
  });

  it("same UTC day → Out now (stamp only)", () => {
    assert.equal(
      getHomeWidgetCountdown("2026-08-06T23:00:00.000Z", NOW)?.countdownLabel,
      "Out now",
    );
  });

  it("UTC day difference ignores wall clock within day", () => {
    const a = wholeUtcCalendarDayDifference("2026-08-11T00:00:00.000Z", NOW);
    const b = wholeUtcCalendarDayDifference("2026-08-11T23:59:59.000Z", NOW);
    assert.equal(a, 5);
    assert.equal(b, 5);
  });
});
