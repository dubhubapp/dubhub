import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExactReleaseDayNotifyEligible,
  isMidnightReleaseDueForTimezone,
  midnightReleaseCalendarYmd,
} from "./release-day-notify-eligibility";

describe("release-day Exact eligibility", () => {
  const releaseAt = "2026-08-09T18:00:00.000Z";

  it("before release_at → not eligible", () => {
    assert.equal(
      isExactReleaseDayNotifyEligible({
        releaseTimingMode: "exact",
        releaseAt,
        now: new Date("2026-08-09T10:00:00.000Z"),
      }),
      false,
    );
  });

  it("at/after release_at → eligible (any clock hour)", () => {
    assert.equal(
      isExactReleaseDayNotifyEligible({
        releaseTimingMode: "exact",
        releaseAt: "2026-08-09T05:00:00.000Z",
        now: new Date("2026-08-09T05:00:00.000Z"),
      }),
      true,
    );
  });

  it("Exact does not require listener midnight", () => {
    // 18:00Z is afternoon in NY — still Exact-eligible by absolute instant.
    assert.equal(
      isExactReleaseDayNotifyEligible({
        releaseTimingMode: "exact",
        releaseAt: "2026-08-09T18:00:00.000Z",
        now: new Date("2026-08-09T18:00:00.000Z"),
      }),
      true,
    );
  });
});

describe("release-day Midnight local eligibility", () => {
  const ymd = "2026-09-11";

  it("extracts calendar YMD from 00:00Z carrier (not as instant)", () => {
    assert.equal(
      midnightReleaseCalendarYmd("2026-09-11T00:00:00.000Z"),
      "2026-09-11",
    );
  });

  it("London before local midnight → not due", () => {
    // 2026-09-10 23:30 London = 22:30 UTC (BST)
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "Europe/London",
        now: new Date("2026-09-10T22:30:00.000Z"),
      }),
      false,
    );
  });

  it("London after local midnight → due", () => {
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "Europe/London",
        now: new Date("2026-09-10T23:05:00.000Z"), // 00:05 BST
      }),
      true,
    );
  });

  it("New York still previous date while London is due", () => {
    const whenLondonPastMidnight = new Date("2026-09-10T23:05:00.000Z");
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "Europe/London",
        now: whenLondonPastMidnight,
      }),
      true,
    );
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "America/New_York",
        now: whenLondonPastMidnight,
      }),
      false,
    );
  });

  it("Amsterdam can receive before New York", () => {
    // 2026-09-10 22:05 UTC = 00:05 Amsterdam (CEST), still 18:05 previous day in NY
    const now = new Date("2026-09-10T22:05:00.000Z");
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "Europe/Amsterdam",
        now,
      }),
      true,
    );
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "America/New_York",
        now,
      }),
      false,
    );
  });

  it("New York reaches date → due", () => {
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "America/New_York",
        now: new Date("2026-09-11T04:05:00.000Z"), // 00:05 EDT
      }),
      true,
    );
  });

  it("unknown timezone → fail closed", () => {
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: null,
        now: new Date("2026-09-12T12:00:00.000Z"),
      }),
      false,
    );
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: ymd,
        effectiveTimezone: "GMT",
        now: new Date("2026-09-12T12:00:00.000Z"),
      }),
      false,
    );
  });

  it("DST: spring-forward day still uses IANA local calendar", () => {
    // US DST spring 2026-03-08. Release calendar 2026-03-08.
    // 2026-03-08T07:30Z = 03:30 EDT after spring forward — still due.
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: "2026-03-08",
        effectiveTimezone: "America/New_York",
        now: new Date("2026-03-08T07:30:00.000Z"),
      }),
      true,
    );
    assert.equal(
      isMidnightReleaseDueForTimezone({
        releaseCalendarYmd: "2026-03-08",
        effectiveTimezone: "America/New_York",
        now: new Date("2026-03-08T03:30:00.000Z"), // still 2026-03-07 in NY
      }),
      false,
    );
  });
});
