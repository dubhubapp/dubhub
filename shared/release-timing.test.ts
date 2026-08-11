/**
 * Slice 2 release timing transport + draft helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXACT_RELEASE_TIME_REQUIRED_CODE,
  INVALID_RELEASE_TIME_LOCAL_FORMAT_CODE,
  INVALID_RELEASE_TIMEZONE_CODE,
  RELEASE_AT_CLIENT_NOT_ACCEPTED_CODE,
  RELEASE_TIMING_HYBRID_REJECTED_CODE,
  RELEASE_TIMING_MODE_EXACT,
  RELEASE_TIMING_MODE_INVALID_CODE,
  RELEASE_TIMING_MODE_MIDNIGHT,
  calendarDateToUtcMidnight,
  evaluateReleaseTimingWriteRequest,
  extractCalendarYmdFromReleaseDate,
  formatWallTimeInTimezone,
  mapReleaseTimingFields,
  midnightTimingWrite,
  normalizeReleaseTimingMode,
  parseReleaseCalendarDate,
  parseReleaseTimeLocal,
  parseReleaseTimingWriteBody,
} from "./release-timing";

describe("release timing domain (Slice 2)", () => {
  it("accepts midnight as timing mode", () => {
    assert.equal(normalizeReleaseTimingMode("midnight"), RELEASE_TIMING_MODE_MIDNIGHT);
  });

  it("recognizes exact at type level and accepts exact write body", () => {
    assert.equal(normalizeReleaseTimingMode("exact"), RELEASE_TIMING_MODE_EXACT);
    const parsed = parseReleaseTimingWriteBody({
      release_timing_mode: "exact",
      release_date: "2026-10-31",
      release_time_local: "18:00",
      release_timezone: "Europe/London",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok && parsed.kind === "exact") {
      assert.equal(parsed.calendarDate, "2026-10-31");
      assert.equal(parsed.timeLocal, "18:00");
      assert.equal(parsed.timezone, "Europe/London");
    }
  });

  it("rejects invalid timing mode", () => {
    const rejected = parseReleaseTimingWriteBody({
      release_timing_mode: "sunrise",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, RELEASE_TIMING_MODE_INVALID_CODE);
    }
  });

  it("maps existing dated shape to Midnight with null exact fields", () => {
    const mapped = mapReleaseTimingFields({
      release_date: "2026-10-31T00:00:00.000Z",
    });
    assert.equal(mapped.releaseTimingMode, RELEASE_TIMING_MODE_MIDNIGHT);
    assert.equal(mapped.releaseAt, null);
  });

  it("maps Coming Soon / null date safely to Midnight clears", () => {
    const mapped = mapReleaseTimingFields({
      release_timing_mode: "midnight",
      release_at: null,
      release_timezone: null,
    });
    assert.equal(mapped.releaseTimingMode, RELEASE_TIMING_MODE_MIDNIGHT);
  });

  it("legacy create body without timing fields is accepted as omit", () => {
    const result = parseReleaseTimingWriteBody({});
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.kind, "omit");
    const legacy = evaluateReleaseTimingWriteRequest({});
    assert.equal(legacy.ok, true);
  });

  it("explicit midnight create clears exact field intent", () => {
    const result = parseReleaseTimingWriteBody({
      release_timing_mode: "midnight",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.kind, "midnight");
    assert.deepEqual(midnightTimingWrite(), {
      releaseTimingMode: "midnight",
      releaseAt: null,
      releaseTimezone: null,
    });
  });

  it("rejects hybrid release_at on midnight body", () => {
    const rejected = parseReleaseTimingWriteBody({
      release_timing_mode: "midnight",
      release_at: "2026-10-31T00:00:00.000Z",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, RELEASE_AT_CLIENT_NOT_ACCEPTED_CODE);
    }
  });

  it("rejects client release_at on exact body", () => {
    const rejected = parseReleaseTimingWriteBody({
      release_timing_mode: "exact",
      release_date: "2026-10-31",
      release_time_local: "18:00",
      release_timezone: "Europe/London",
      release_at: "2026-10-31T17:00:00.000Z",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, RELEASE_AT_CLIENT_NOT_ACCEPTED_CODE);
    }
  });

  it("rejects midnight body with timezone", () => {
    const rejected = parseReleaseTimingWriteBody({
      release_timing_mode: "midnight",
      release_timezone: "Europe/London",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, RELEASE_TIMING_HYBRID_REJECTED_CODE);
    }
  });

  it("rejects exact missing time/timezone", () => {
    const rejected = parseReleaseTimingWriteBody({
      release_timing_mode: "exact",
      release_date: "2026-10-31",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, EXACT_RELEASE_TIME_REQUIRED_CODE);
    }
  });

  it("rejects invalid local time format", () => {
    const rejected = parseReleaseTimingWriteBody({
      release_timing_mode: "exact",
      release_date: "2026-10-31",
      release_time_local: "6pm",
      release_timezone: "Europe/London",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, INVALID_RELEASE_TIME_LOCAL_FORMAT_CODE);
    }
  });

  it("rejects non-IANA timezone shape", () => {
    const rejected = parseReleaseTimingWriteBody({
      release_timing_mode: "exact",
      release_date: "2026-10-31",
      release_time_local: "18:00",
      release_timezone: "EST",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, INVALID_RELEASE_TIMEZONE_CODE);
    }
  });

  it("parses calendar dates and rejects impossible days", () => {
    assert.equal(parseReleaseCalendarDate("2026-10-31").ok, true);
    assert.equal(parseReleaseCalendarDate("2026-02-31").ok, false);
  });

  it("parses HH:mm local times", () => {
    assert.equal(parseReleaseTimeLocal("00:00").ok, true);
    assert.equal(parseReleaseTimeLocal("23:59").ok, true);
    assert.equal(parseReleaseTimeLocal("24:00").ok, false);
  });

  it("UTC midnight calendar carrier preserves YYYY-MM-DD", () => {
    const d = calendarDateToUtcMidnight("2026-10-31");
    assert.equal(d.toISOString(), "2026-10-31T00:00:00.000Z");
    assert.equal(extractCalendarYmdFromReleaseDate(d), "2026-10-31");
  });

  it("formats wall time in stored timezone not device zone", () => {
    // 2026-07-15 18:00 Europe/London = BST (UTC+1) → 17:00Z
    const wall = formatWallTimeInTimezone(
      "2026-07-15T17:00:00.000Z",
      "Europe/London",
    );
    assert.equal(wall, "18:00");
  });

  it("00:00Z release_date alone never implies exact mode", () => {
    const mapped = mapReleaseTimingFields({
      release_date: "2026-03-05T00:00:00+00",
    });
    assert.equal(mapped.releaseTimingMode, RELEASE_TIMING_MODE_MIDNIGHT);
  });

  it("maps DB snake_case timing columns for read serialization", () => {
    const mapped = mapReleaseTimingFields({
      release_timing_mode: "exact",
      release_at: "2026-10-31T17:00:00.000Z",
      release_timezone: "Europe/London",
      release_announced_at: null,
    });
    assert.equal(mapped.releaseTimingMode, "exact");
    assert.equal(mapped.releaseTimezone, "Europe/London");
  });
});
