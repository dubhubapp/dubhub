/**
 * TypeScript mirrors of native UTC countdown / timeline contracts for Phase 3.
 * Native source of truth remains ios/App/Shared/HomeWidgetUtcCountdown.swift
 * mirroring server/home-widget-domain.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getHomeWidgetCountdown,
  wholeUtcCalendarDayDifference,
} from "../../../server/home-widget-domain";

describe("Phase 3 UTC countdown contract (shared with Swift helper)", () => {
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

  it("same UTC day → Out now", () => {
    assert.equal(
      getHomeWidgetCountdown("2026-08-06T23:00:00.000Z", NOW)?.countdownLabel,
      "Out now",
    );
  });

  it("past listener date → Out now", () => {
    assert.equal(
      getHomeWidgetCountdown("2026-08-01T00:00:00.000Z", NOW)?.countdownLabel,
      "Out now",
    );
  });

  it("device-local wall clock must not change UTC day difference", () => {
    // Same UTC instants regardless of interpretation — helper uses UTC calendar days.
    const a = wholeUtcCalendarDayDifference("2026-08-11T00:00:00.000Z", NOW);
    const b = wholeUtcCalendarDayDifference("2026-08-11T23:59:59.000Z", NOW);
    assert.equal(a, 5);
    assert.equal(b, 5);
  });

  it("labels never include hours/minutes/seconds", () => {
    for (const offset of [0, 1, 2, 10]) {
      const d = new Date(Date.UTC(2026, 7, 6 + offset, 0, 0, 0));
      const label = getHomeWidgetCountdown(d, NOW)?.countdownLabel ?? "";
      assert.doesNotMatch(label, /hour|min|sec/i);
    }
  });
});
