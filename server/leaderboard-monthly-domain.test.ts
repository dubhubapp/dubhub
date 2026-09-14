import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  accountTypeFromLeaderboardScope,
  assignLeaderboardPeriodRanks,
  assertCompletedUtcMonth,
  assertFreezableUtcMonth,
  compareLeaderboardPeriodEntries,
  countMonthlyTop100Finishes,
  eventInPeriodHalfOpen,
  eventInUtcMonthByDateTrunc,
  formatUtcDateOnly,
  hasMonthlyTop100FromFinishes,
  isAtOrAfterLeaderboardSnapshotStart,
  isCompletedUtcMonth,
  isUtcMonthStart,
  LEADERBOARD_MONTHLY_SNAPSHOT_START,
  leaderboardScopeFromUserType,
  qualifyingFinishesForSnapshot,
  selectBestMonthlyFinish,
  utcCalendarMonthWindow,
  utcMonthWindowFromYearMonth,
  type MonthlyFinishRecord,
  type RankablePeriodEntry,
} from "./leaderboard-monthly-domain";

const here = dirname(fileURLToPath(import.meta.url));
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const migrationSrc = readFileSync(
  join(
    here,
    "../supabase/migrations/20260914120000_leaderboard_monthly_finishes.sql",
  ),
  "utf8",
);

describe("PROFILE-REFINEMENT-C1 — period window equivalence", () => {
  it("half-open inclusive start / exclusive end matches DATE_TRUNC month equality (UTC)", () => {
    const now = new Date("2026-09-14T21:00:00.000Z");
    const { periodStart, periodEnd } = utcCalendarMonthWindow(now);

    const samples = [
      new Date("2026-08-31T23:59:59.999Z"),
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-14T12:00:00.000Z"),
      new Date("2026-09-30T23:59:59.999Z"),
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-10-01T00:00:00.001Z"),
    ];

    for (const createdAt of samples) {
      assert.equal(
        eventInPeriodHalfOpen(createdAt, periodStart, periodEnd),
        eventInUtcMonthByDateTrunc(createdAt, now),
        `mismatch for ${createdAt.toISOString()}`,
      );
    }
  });

  it("historical month window is inclusive start / exclusive end", () => {
    const { periodStart, periodEnd, yearMonth } =
      utcMonthWindowFromYearMonth("2026-08-01");
    assert.equal(yearMonth, "2026-08-01");
    assert.equal(periodStart.toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(periodEnd.toISOString(), "2026-09-01T00:00:00.000Z");

    assert.equal(
      eventInPeriodHalfOpen(new Date("2026-08-01T00:00:00.000Z"), periodStart, periodEnd),
      true,
    );
    assert.equal(
      eventInPeriodHalfOpen(new Date("2026-08-31T23:59:59.999Z"), periodStart, periodEnd),
      true,
    );
    assert.equal(
      eventInPeriodHalfOpen(new Date("2026-09-01T00:00:00.000Z"), periodStart, periodEnd),
      false,
    );
  });
});

describe("PROFILE-REFINEMENT-C1 — ranking order + zero-score filter", () => {
  it("preserves score → correct_ids → username → user_id ordering", () => {
    const entries: RankablePeriodEntry[] = [
      { userId: "b", username: "bob", periodScore: 10, periodCorrectIds: 1 },
      { userId: "a", username: "ann", periodScore: 10, periodCorrectIds: 2 },
      { userId: "c", username: "ann", periodScore: 10, periodCorrectIds: 2 },
      { userId: "d", username: "zoe", periodScore: 50, periodCorrectIds: 0 },
      { userId: "e", username: "zero", periodScore: 0, periodCorrectIds: 0 },
    ];
    const ranked = assignLeaderboardPeriodRanks(entries);
    assert.deepEqual(
      ranked.map((r) => ({ id: r.userId, rank: r.rank })),
      [
        { id: "d", rank: 1 },
        { id: "a", rank: 2 },
        { id: "c", rank: 3 },
        { id: "b", rank: 4 },
        { id: "e", rank: 5 },
      ],
    );
    assert.ok(compareLeaderboardPeriodEntries(ranked[0], ranked[1]) < 0);
  });

  it("zero-score rows are not persisted; ranks for scorers unchanged", () => {
    const ranked = assignLeaderboardPeriodRanks([
      { userId: "1", username: "a", periodScore: 20, periodCorrectIds: 2 },
      { userId: "2", username: "b", periodScore: 0, periodCorrectIds: 0 },
      { userId: "3", username: "c", periodScore: 5, periodCorrectIds: 1 },
    ]);
    const qualifying = qualifyingFinishesForSnapshot(ranked);
    assert.deepEqual(
      qualifying.map((q) => ({ id: q.userId, rank: q.rank, score: q.periodScore })),
      [
        { id: "1", rank: 1, score: 20 },
        { id: "3", rank: 2, score: 5 },
      ],
    );
    assert.ok(qualifying.every((q) => q.periodScore > 0));
  });

  it("#1 and #100 qualify for Top 100; #101 does not", () => {
    const finishes: MonthlyFinishRecord[] = [
      {
        userId: "u1",
        rank: 1,
        yearMonth: "2026-07-01",
        periodScore: 100,
        periodCorrectIds: 10,
      },
      {
        userId: "u100",
        rank: 100,
        yearMonth: "2026-07-01",
        periodScore: 1,
        periodCorrectIds: 0,
      },
      {
        userId: "u101",
        rank: 101,
        yearMonth: "2026-07-01",
        periodScore: 1,
        periodCorrectIds: 0,
      },
    ];
    assert.equal(hasMonthlyTop100FromFinishes([finishes[0]]), true);
    assert.equal(hasMonthlyTop100FromFinishes([finishes[1]]), true);
    assert.equal(hasMonthlyTop100FromFinishes([finishes[2]]), false);
    assert.equal(countMonthlyTop100Finishes(finishes), 2);
  });
});

describe("PROFILE-REFINEMENT-C1 — best finish + completed month guard", () => {
  it("best rank chooses lowest numeric rank", () => {
    const best = selectBestMonthlyFinish([
      {
        userId: "u",
        rank: 12,
        yearMonth: "2026-06-01",
        periodScore: 10,
        periodCorrectIds: 1,
      },
      {
        userId: "u",
        rank: 3,
        yearMonth: "2026-05-01",
        periodScore: 40,
        periodCorrectIds: 4,
      },
      {
        userId: "u",
        rank: 7,
        yearMonth: "2026-07-01",
        periodScore: 20,
        periodCorrectIds: 2,
      },
    ]);
    assert.equal(best?.rank, 3);
    assert.equal(best?.yearMonth, "2026-05-01");
  });

  it("tied best rank chooses most recent month", () => {
    const best = selectBestMonthlyFinish([
      {
        userId: "u",
        rank: 3,
        yearMonth: "2026-05-01",
        periodScore: 10,
        periodCorrectIds: 1,
      },
      {
        userId: "u",
        rank: 3,
        yearMonth: "2026-08-01",
        periodScore: 12,
        periodCorrectIds: 1,
      },
      {
        userId: "u",
        rank: 3,
        yearMonth: "2026-06-01",
        periodScore: 11,
        periodCorrectIds: 1,
      },
    ]);
    assert.equal(best?.rank, 3);
    assert.equal(best?.yearMonth, "2026-08-01");
  });

  it("current month cannot be treated as completed snapshot input", () => {
    const now = new Date("2026-09-14T21:15:00.000Z");
    const current = utcCalendarMonthWindow(now).yearMonth;
    assert.equal(isCompletedUtcMonth(current, now), false);
    assert.throws(() => assertCompletedUtcMonth(current, now), /completed/);

    assert.equal(isCompletedUtcMonth("2026-08-01", now), true);
    assert.doesNotThrow(() => assertCompletedUtcMonth("2026-08-01", now));
    assert.equal(isUtcMonthStart("2026-08-15"), false);
  });

  it("freeze authority starts at 2026-09; earlier months are rejected", () => {
    const now = new Date("2026-10-14T12:00:00.000Z");
    assert.equal(LEADERBOARD_MONTHLY_SNAPSHOT_START, "2026-09");
    assert.equal(isAtOrAfterLeaderboardSnapshotStart("2026-08-01"), false);
    assert.equal(isAtOrAfterLeaderboardSnapshotStart("2026-09"), true);
    assert.throws(() => assertFreezableUtcMonth("2026-08-01", now), /before 2026-09|not reconstructed/);
    assert.doesNotThrow(() => assertFreezableUtcMonth("2026-09-01", now));
    assert.throws(
      () => assertFreezableUtcMonth("2026-09-01", new Date("2026-09-14T12:00:00.000Z")),
      /completed|current or future/,
    );
  });

  it("Community and Artist scopes remain isolated", () => {
    assert.equal(leaderboardScopeFromUserType("user"), "community");
    assert.equal(leaderboardScopeFromUserType("artist"), "artist");
    assert.equal(accountTypeFromLeaderboardScope("community"), "user");
    assert.equal(accountTypeFromLeaderboardScope("artist"), "artist");

    const community = selectBestMonthlyFinish([
      {
        userId: "u",
        rank: 2,
        yearMonth: "2026-08-01",
        periodScore: 5,
        periodCorrectIds: 1,
      },
    ]);
    const artistOnly = selectBestMonthlyFinish([]);
    assert.equal(community?.rank, 2);
    assert.equal(artistOnly, null);
  });
});

describe("PROFILE-REFINEMENT-C1 — storage contract + migration", () => {
  it("shared ranking path accepts periodStart/periodEnd (no duplicated NOW trunc filter)", () => {
    assert.match(storageSrc, /rankLeaderboardPeriod/);
    assert.match(storageSrc, /periodStart/);
    assert.match(storageSrc, /periodEnd/);
    assert.match(
      storageSrc,
      /e\.created_at >= \$\{periodStart\}[\s\S]*e\.created_at < \$\{periodEnd\}/,
    );
    // Live month/year resolve through shared explicit window, not a second scoring fork.
    assert.match(storageSrc, /resolveLiveLeaderboardPeriodWindow/);
    assert.doesNotMatch(
      storageSrc,
      /DATE_TRUNC\('month', e\.created_at\) = DATE_TRUNC\('month', NOW\(\)\)/,
    );
  });

  it("helpers for freeze marker, best finish, and Top 100 exist", () => {
    assert.match(storageSrc, /isLeaderboardMonthFrozen/);
    assert.match(storageSrc, /replaceLeaderboardMonthlyFinishes/);
    assert.match(storageSrc, /getBestMonthlyFinish/);
    assert.match(storageSrc, /hasMonthlyTop100/);
    assert.match(storageSrc, /assertFreezableUtcMonth/);
    assert.match(storageSrc, /ORDER BY\s+rank ASC,\s*year_month DESC/i);
  });

  it("migration defines finishes + freeze_runs with uniqueness and checks", () => {
    assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS public\.leaderboard_monthly_finishes/);
    assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS public\.leaderboard_monthly_freeze_runs/);
    assert.match(migrationSrc, /UNIQUE \(scope, year_month, user_id\)/);
    assert.match(migrationSrc, /UNIQUE \(scope, year_month\)/);
    assert.match(migrationSrc, /period_score integer NOT NULL CHECK \(period_score > 0\)/);
    assert.match(migrationSrc, /CHECK \(scope IN \('community', 'artist'\)\)/);
    assert.match(
      migrationSrc,
      /leaderboard_monthly_finishes_user_scope_rank_idx/,
    );
    assert.match(
      migrationSrc,
      /leaderboard_monthly_finishes_month_scope_rank_idx/,
    );
    assert.match(migrationSrc, /ENABLE ROW LEVEL SECURITY/);
  });

  it("year_month month-start integrity is enforced", () => {
    assert.match(
      migrationSrc,
      /year_month = \(date_trunc\('month', year_month::timestamp\)\)::date/,
    );
    assert.equal(formatUtcDateOnly(utcMonthWindowFromYearMonth("2026-08-01").periodStart), "2026-08-01");
    assert.throws(() => utcMonthWindowFromYearMonth("2026-08-15"), /month start/);
  });
});
