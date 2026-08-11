/**
 * Slice 4 widget countdown contract tests.
 * Mirrors ios/App/Shared/HomeWidgetCountdown.swift rules.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeHomeWidgetCountdown,
  formatFinalHourCountdownLabel,
  formatMinuteUnit,
  formatSubDayCountdownLabel,
  HOME_WIDGET_TIMELINE_MAX_LABEL_ENTRIES,
  presentHomeWidgetCountdownLabel,
  startOfCalendarDateInTimeZoneMs,
} from "./home-widget-countdown";

describe("home widget countdown — Midnight", () => {
  const tz = "Europe/London";

  it("far future → N days", () => {
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-09-11",
      now: "2026-06-20T12:00:00.000Z",
      timeZone: tz,
    });
    assert.ok(r);
    assert.match(r!.countdownLabel, /^\d+ days$/);
    assert.equal(r!.isOutNow, false);
  });

  it("two calendar days away → 2 days", () => {
    // London: Jun 10 15:00 → Jun 12 local midnight is 2 calendar days away.
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-12",
      now: "2026-06-10T14:00:00.000Z",
      timeZone: tz,
    });
    assert.equal(r?.countdownLabel, "2 days");
  });

  it("Tomorrow while remaining >= 24h", () => {
    // Jun 10 10:00 London → Jun 11 midnight is ~14h → hours, not Tomorrow.
    // Use Jun 9 12:00 London for Jun 11 midnight → remaining >24h, dayDiff=2 → 2 days.
    // For Tomorrow: Jun 10 00:30 London, release Jun 11 — remaining ~23.5h → hours.
    // True Tomorrow with >=24h: Jun 9 evening for Jun 11? dayDiff=2.
    // dayDiff=1 and >=24h: at Jun 10 00:00 London release Jun 11 = exactly 24h → Tomorrow.
    const boundary = startOfCalendarDateInTimeZoneMs("2026-06-11", tz)!;
    const now = new Date(boundary - 24 * 3_600_000);
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now,
      timeZone: tz,
    });
    assert.equal(r?.countdownLabel, "Tomorrow");
  });

  it("final 23h → hours + minutes bucket", () => {
    const boundary = startOfCalendarDateInTimeZoneMs("2026-06-11", tz)!;
    const now = new Date(boundary - 23 * 3_600_000);
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now,
      timeZone: tz,
    });
    assert.equal(r?.countdownLabel, "23 hours");
  });

  it("2h → 2 hours", () => {
    const boundary = startOfCalendarDateInTimeZoneMs("2026-06-11", tz)!;
    const now = new Date(boundary - 2 * 3_600_000);
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now,
      timeZone: tz,
    });
    assert.equal(r?.countdownLabel, "2 hours");
  });

  it("final-hour 5-minute buckets", () => {
    assert.equal(formatFinalHourCountdownLabel(59 * 60_000), "55 mins");
    assert.equal(formatFinalHourCountdownLabel(55 * 60_000), "55 mins");
    assert.equal(formatFinalHourCountdownLabel(51 * 60_000), "50 mins");
    assert.equal(formatFinalHourCountdownLabel(6 * 60_000), "5 mins");
    assert.equal(formatFinalHourCountdownLabel(1 * 60_000), "5 mins");
  });

  it("sub-day hours+minutes contract vectors", () => {
    assert.equal(formatSubDayCountdownLabel((23 * 60 + 59) * 60_000), "23 hours 55 mins");
    assert.equal(formatSubDayCountdownLabel((12 * 60 + 36) * 60_000), "12 hours 35 mins");
    assert.equal(formatSubDayCountdownLabel((12 * 60 + 4) * 60_000), "12 hours");
    assert.equal(formatSubDayCountdownLabel((2 * 60 + 9) * 60_000), "2 hours 5 mins");
    assert.equal(formatSubDayCountdownLabel((1 * 60 + 59) * 60_000), "1 hour 55 mins");
    assert.equal(formatSubDayCountdownLabel(59 * 60_000), "55 mins");
    assert.equal(formatSubDayCountdownLabel(0), "Out now");
    assert.ok(!formatSubDayCountdownLabel((12 * 60 + 36) * 60_000).includes("0 mins"));
    assert.ok(!formatSubDayCountdownLabel((12 * 60 + 36) * 60_000).includes("sec"));
  });

  it("timeline max entry constant is 96 (rolling)", () => {
    assert.equal(HOME_WIDGET_TIMELINE_MAX_LABEL_ENTRIES, 96);
  });

  it("59m → 55 min via full helper", () => {
    const boundary = startOfCalendarDateInTimeZoneMs("2026-06-11", tz)!;
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now: new Date(boundary - 59 * 60_000),
      timeZone: tz,
    });
    assert.equal(r?.countdownLabel, "55 mins");
  });

  it("boundary and past → Out now within retention", () => {
    const boundary = startOfCalendarDateInTimeZoneMs("2026-06-11", tz)!;
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "midnight",
        releaseCalendarDate: "2026-06-11",
        now: new Date(boundary),
        timeZone: tz,
      })?.countdownLabel,
      "Out now",
    );
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "midnight",
        releaseCalendarDate: "2026-06-11",
        now: new Date(boundary + 60_000),
        timeZone: tz,
      })?.isOutNow,
      true,
    );
    const almost = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now: new Date(boundary + 24 * 3_600_000 - 1),
      timeZone: tz,
    });
    assert.equal(almost?.isOutNow, true);
    assert.equal(almost?.isRetentionExpired, false);
    const expired = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now: new Date(boundary + 24 * 3_600_000),
      timeZone: tz,
    });
    assert.equal(expired?.isOutNow, false);
    assert.equal(expired?.isRetentionExpired, true);
  });

  it("stored 00:00Z is not a global Midnight boundary", () => {
    // Carrier 2026-06-11T00:00:00.000Z → calendar 2026-06-11.
    // In America/New_York, local start of Jun 11 is hours after that UTC instant.
    const r = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now: "2026-06-11T00:30:00.000Z",
      timeZone: "America/New_York",
    });
    assert.equal(r?.isOutNow, false);
    assert.match(r!.countdownLabel, /hour|min|Tomorrow|days/);
  });

  it("Tokyo local midnight independent of London", () => {
    const london = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now: "2026-06-10T15:00:00.000Z",
      timeZone: "Europe/London",
    });
    const tokyo = computeHomeWidgetCountdown({
      timingMode: "midnight",
      releaseCalendarDate: "2026-06-11",
      now: "2026-06-10T15:00:00.000Z",
      timeZone: "Asia/Tokyo",
    });
    assert.notEqual(london?.boundaryMs, tokyo?.boundaryMs);
  });
});

describe("home widget countdown — Exact", () => {
  const releaseAt = "2026-09-11T17:00:00.000Z"; // 18:00 London BST

  it("far future → N days", () => {
    const r = computeHomeWidgetCountdown({
      timingMode: "exact",
      releaseAt,
      releaseCalendarDate: "2026-09-11",
      now: "2026-06-01T12:00:00.000Z",
      timeZone: "America/New_York",
    });
    assert.match(r!.countdownLabel, /^\d+ days$/);
  });

  it("Slice 4.1 hours+minutes buckets", () => {
    const at = new Date(releaseAt).getTime();
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "exact",
        releaseAt,
        now: new Date(at - (12 * 60 + 36) * 60_000),
        timeZone: "UTC",
      })?.countdownLabel,
      "12 hours 35 mins",
    );
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "exact",
        releaseAt,
        now: new Date(at - (12 * 60 + 4) * 60_000),
        timeZone: "UTC",
      })?.countdownLabel,
      "12 hours",
    );
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "exact",
        releaseAt,
        now: new Date(at - (2 * 60 + 9) * 60_000),
        timeZone: "UTC",
      })?.countdownLabel,
      "2 hours 5 mins",
    );
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "exact",
        releaseAt,
        now: new Date(at - (1 * 60 + 59) * 60_000),
        timeZone: "UTC",
      })?.countdownLabel,
      "1 hour 55 mins",
    );
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "exact",
        releaseAt,
        now: new Date(at - 23 * 60 * 60_000 - 59 * 60_000),
        timeZone: "UTC",
      })?.countdownLabel,
      "23 hours 55 mins",
    );
  });

  it("<24h uses hours+minutes not UTC day Out now", () => {
    const r = computeHomeWidgetCountdown({
      timingMode: "exact",
      releaseAt: "2026-08-06T20:00:00.000Z",
      now: "2026-08-06T15:30:00.000Z",
      timeZone: "UTC",
    });
    assert.equal(r?.countdownLabel, "4 hours 30 mins");
    assert.equal(r?.isOutNow, false);
  });

  it("viewer timezone does not change Exact instant / Out now", () => {
    const at = new Date(releaseAt);
    for (const timeZone of ["Europe/London", "America/New_York", "Asia/Tokyo"]) {
      assert.equal(
        computeHomeWidgetCountdown({
          timingMode: "exact",
          releaseAt,
          now: at,
          timeZone,
        })?.isOutNow,
        true,
      );
      assert.equal(
        computeHomeWidgetCountdown({
          timingMode: "exact",
          releaseAt,
          now: new Date(at.getTime() - 60_000),
          timeZone,
        })?.isOutNow,
        false,
      );
    }
  });

  it("2h and final-hour buckets", () => {
    const at = new Date(releaseAt).getTime();
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "exact",
        releaseAt,
        now: new Date(at - 2 * 3_600_000),
        timeZone: "UTC",
      })?.countdownLabel,
      "2 hours",
    );
    assert.equal(
      computeHomeWidgetCountdown({
        timingMode: "exact",
        releaseAt,
        now: new Date(at - 55 * 60_000),
        timeZone: "UTC",
      })?.countdownLabel,
      "55 mins",
    );
  });

  it("Tomorrow can transition to hours when Exact remaining <24h", () => {
    const rFar = computeHomeWidgetCountdown({
      timingMode: "exact",
      releaseAt: "2026-06-11T17:00:00.000Z",
      now: "2026-06-10T10:00:00.000Z",
      timeZone: "UTC",
    });
    assert.ok(
      rFar?.countdownLabel === "Tomorrow" ||
        /^\d+ days$/.test(rFar?.countdownLabel ?? ""),
    );
    const rNear = computeHomeWidgetCountdown({
      timingMode: "exact",
      releaseAt: "2026-06-11T17:00:00.000Z",
      now: "2026-06-10T18:00:00.000Z",
      timeZone: "UTC",
    });
    assert.match(rNear!.countdownLabel, /hour/);
  });
});

describe("home widget countdown presentation by family", () => {
  it("medium keeps mins with hours; small drops mins only when hours present", () => {
    assert.equal(formatSubDayCountdownLabel((7 * 60 + 55) * 60_000), "7 hours 55 mins");
    assert.equal(
      presentHomeWidgetCountdownLabel("7 hours 55 mins"),
      "7 hours 55 mins",
    );
    assert.equal(
      presentHomeWidgetCountdownLabel("7 hours 55 mins", {
        compactMinutesWithHours: true,
      }),
      "7 hours 55",
    );

    assert.equal(formatSubDayCountdownLabel((1 * 60 + 5) * 60_000), "1 hour 5 mins");
    assert.equal(
      presentHomeWidgetCountdownLabel("1 hour 5 mins", {
        compactMinutesWithHours: true,
      }),
      "1 hour 5",
    );
  });

  it("minutes-only and exact-hour labels stay unit-safe on both families", () => {
    assert.equal(formatMinuteUnit(1), "1 min");
    assert.equal(formatMinuteUnit(55), "55 mins");
    assert.equal(formatSubDayCountdownLabel(59 * 60_000), "55 mins");
    assert.equal(
      presentHomeWidgetCountdownLabel("55 mins", {
        compactMinutesWithHours: true,
      }),
      "55 mins",
    );
    assert.equal(
      presentHomeWidgetCountdownLabel("1 min", {
        compactMinutesWithHours: true,
      }),
      "1 min",
    );
    assert.equal(formatSubDayCountdownLabel(7 * 60 * 60_000), "7 hours");
    assert.equal(
      presentHomeWidgetCountdownLabel("7 hours", {
        compactMinutesWithHours: true,
      }),
      "7 hours",
    );
    assert.equal(
      presentHomeWidgetCountdownLabel("Out now", {
        compactMinutesWithHours: true,
      }),
      "Out now",
    );
  });
});
