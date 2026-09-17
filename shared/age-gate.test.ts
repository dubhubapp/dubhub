import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ageAnniversaryInYear,
  ageGateClientCode,
  evaluateDateOfBirth,
  exactAgeYearsUtc,
  parseStrictCalendarDate,
} from "./age-gate";

/** Fixed "today" for deterministic boundary tests: 2026-09-17 UTC. */
const TODAY = new Date("2026-09-17T15:30:00.000Z");

describe("parseStrictCalendarDate", () => {
  it("accepts a real calendar date", () => {
    const r = parseStrictCalendarDate("2000-06-15");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.ymd, "2000-06-15");
      assert.equal(r.year, 2000);
      assert.equal(r.month, 6);
      assert.equal(r.day, 15);
    }
  });

  it("rejects impossible dates without JS rollover", () => {
    assert.equal(parseStrictCalendarDate("2026-02-30").ok, false);
    assert.equal(parseStrictCalendarDate("2026-13-01").ok, false);
    assert.equal(parseStrictCalendarDate("2025-04-31").ok, false);
  });

  it("rejects malformed strings", () => {
    assert.equal(parseStrictCalendarDate("").ok, false);
    assert.equal(parseStrictCalendarDate("2000/06/15").ok, false);
    assert.equal(parseStrictCalendarDate("2000-6-15").ok, false);
    assert.equal(parseStrictCalendarDate("not-a-date").ok, false);
    assert.equal(parseStrictCalendarDate(null).ok, false);
    assert.equal(parseStrictCalendarDate(20000615).ok, false);
  });

  it("accepts leap-day only in leap years", () => {
    assert.equal(parseStrictCalendarDate("2012-02-29").ok, true);
    assert.equal(parseStrictCalendarDate("2013-02-29").ok, false);
  });
});

describe("leap-day anniversary", () => {
  it("maps Feb 29 → March 1 in non-leap years", () => {
    assert.deepEqual(ageAnniversaryInYear(2, 29, 2025), { month: 3, day: 1 });
  });

  it("keeps Feb 29 in leap years", () => {
    assert.deepEqual(ageAnniversaryInYear(2, 29, 2024), { month: 2, day: 29 });
  });
});

describe("evaluateDateOfBirth — 13+ boundaries (as of 2026-09-17 UTC)", () => {
  it("exactly 13 today: PASS", () => {
    const r = evaluateDateOfBirth("2013-09-17", TODAY);
    assert.equal(r.valid, true);
    assert.equal(r.eligible, true);
    if (r.valid) assert.equal(r.ageYears, 13);
  });

  it("turns 13 tomorrow: FAIL (still 12)", () => {
    const r = evaluateDateOfBirth("2013-09-18", TODAY);
    assert.equal(r.valid, true);
    assert.equal(r.eligible, false);
    if (r.valid && !r.eligible) {
      assert.equal(r.ageYears, 12);
      assert.equal(r.reason, "minimum_age_not_met");
    }
  });

  it("turned 13 yesterday: PASS", () => {
    const r = evaluateDateOfBirth("2013-09-16", TODAY);
    assert.equal(r.valid, true);
    assert.equal(r.eligible, true);
    if (r.valid) assert.equal(r.ageYears, 13);
  });

  it("12 years old: FAIL", () => {
    const r = evaluateDateOfBirth("2014-09-17", TODAY);
    assert.equal(r.valid, true);
    assert.equal(r.eligible, false);
    if (r.valid) assert.equal(r.ageYears, 12);
  });

  it("future date: INVALID", () => {
    const r = evaluateDateOfBirth("2026-09-18", TODAY);
    assert.equal(r.valid, false);
    assert.equal(r.eligible, false);
    if (!r.valid) assert.equal(r.reason, "future_date");
  });

  it("impossible dates: INVALID", () => {
    for (const dob of ["2026-02-30", "2026-13-01", "abc", "2013-9-17"]) {
      const r = evaluateDateOfBirth(dob, TODAY);
      assert.equal(r.valid, false);
      assert.equal(r.eligible, false);
      assert.equal(ageGateClientCode(r), "invalid_date_of_birth");
    }
  });

  it("age > 120: INVALID", () => {
    const r = evaluateDateOfBirth("1900-01-01", TODAY);
    assert.equal(r.valid, false);
    assert.equal(r.eligible, false);
    if (!r.valid) assert.equal(r.reason, "implausible_age");
  });

  it("valid normal adults: PASS", () => {
    for (const dob of ["1990-01-15", "2000-12-31", "1985-06-01"]) {
      const r = evaluateDateOfBirth(dob, TODAY);
      assert.equal(r.valid, true);
      assert.equal(r.eligible, true);
      if (r.valid) assert.ok(r.ageYears >= 13 && r.ageYears <= 120);
    }
  });

  it("client code never exposes age; eligible has null code", () => {
    const pass = evaluateDateOfBirth("2013-09-17", TODAY);
    const fail = evaluateDateOfBirth("2013-09-18", TODAY);
    const bad = evaluateDateOfBirth("2026-02-30", TODAY);
    assert.equal(ageGateClientCode(pass), null);
    assert.equal(ageGateClientCode(fail), "minimum_age_not_met");
    assert.equal(ageGateClientCode(bad), "invalid_date_of_birth");
  });
});

describe("leap-day DOB age around non-leap anniversary", () => {
  // Born 2012-02-29; turns 13 on 2025-03-01 (2025 not leap).
  it("day before March 1 non-leap anniversary: still 12", () => {
    const r = evaluateDateOfBirth(
      "2012-02-29",
      new Date("2025-02-28T12:00:00.000Z"),
    );
    assert.equal(r.valid, true);
    assert.equal(r.eligible, false);
    if (r.valid) assert.equal(r.ageYears, 12);
  });

  it("on March 1 non-leap anniversary: turns 13", () => {
    const r = evaluateDateOfBirth(
      "2012-02-29",
      new Date("2025-03-01T00:00:00.000Z"),
    );
    assert.equal(r.valid, true);
    assert.equal(r.eligible, true);
    if (r.valid) assert.equal(r.ageYears, 13);
  });

  it("on leap-year Feb 29 anniversary: turns age on Feb 29", () => {
    // Born 2008-02-29; on 2024-02-29 (leap) should be exactly 16.
    assert.equal(
      exactAgeYearsUtc(2008, 2, 29, new Date("2024-02-29T12:00:00.000Z")),
      16,
    );
    assert.equal(
      exactAgeYearsUtc(2008, 2, 29, new Date("2024-02-28T12:00:00.000Z")),
      15,
    );
  });
});
