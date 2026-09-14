import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assignLeaderboardPeriodRanks,
  assertFreezableUtcMonth,
  countMonthlyTop100Finishes,
  hasMonthlyTop100FromFinishes,
  LEADERBOARD_MONTHLY_SNAPSHOT_START,
  qualifyingFinishesForSnapshot,
  selectBestMonthlyFinish,
  type RankedPeriodEntry,
} from "./leaderboard-monthly-domain";
import {
  ensurePreviousLeaderboardMonthFrozen,
  freezeLeaderboardMonth,
  getUserLeaderboardAchievements,
  normalizeYearMonthInput,
  parseFreezeScopes,
  previousUtcCalendarMonth,
  runLeaderboardMonthFreezeEnsureSafe,
  type LeaderboardFreezeStorage,
} from "./leaderboard-monthly-freeze";

const here = dirname(fileURLToPath(import.meta.url));
const freezeSrc = readFileSync(join(here, "leaderboard-monthly-freeze.ts"), "utf8");
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const indexSrc = readFileSync(join(here, "index.ts"), "utf8");
const domainSrc = readFileSync(join(here, "leaderboard-monthly-domain.ts"), "utf8");

/** During September 2026 — previous month is August (pre-authority). */
const NOW_SEP = new Date("2026-09-14T21:30:00.000Z");
/** After September closes — previous month is September (first freezable). */
const NOW_OCT = new Date("2026-10-14T12:00:00.000Z");
const AUTH_MONTH = "2026-09-01";
const PRE_AUTH_MONTH = "2026-08-01";

function rankedFixture(overrides: Partial<RankedPeriodEntry>[] = []): RankedPeriodEntry[] {
  const base: RankedPeriodEntry[] = [
    {
      userId: "u-1",
      username: "alpha",
      periodScore: 50,
      periodCorrectIds: 5,
      rank: 1,
    },
    {
      userId: "u-100",
      username: "centurion",
      periodScore: 2,
      periodCorrectIds: 0,
      rank: 100,
    },
    {
      userId: "u-101",
      username: "justmissed",
      periodScore: 1,
      periodCorrectIds: 0,
      rank: 101,
    },
    {
      userId: "u-zero",
      username: "idle",
      periodScore: 0,
      periodCorrectIds: 0,
      rank: 200,
    },
  ];
  if (overrides.length === 0) return base;
  return assignLeaderboardPeriodRanks(
    overrides.map((o, i) => ({
      userId: o.userId ?? `u-${i}`,
      username: o.username ?? `user-${i}`,
      periodScore: o.periodScore ?? 0,
      periodCorrectIds: o.periodCorrectIds ?? 0,
    })),
  );
}

function createMockStorage(opts?: {
  rankedByType?: Partial<Record<"user" | "artist", RankedPeriodEntry[]>>;
  frozen?: Set<string>;
  /** Clock used by replace guard (defaults to October so Sep is freezable). */
  now?: Date;
}): LeaderboardFreezeStorage & {
  writes: Array<{ scope: string; yearMonth: string; finishes: RankedPeriodEntry[] }>;
  freezeChecks: string[];
} {
  const frozen = opts?.frozen ?? new Set<string>();
  const clock = opts?.now ?? NOW_OCT;
  const writes: Array<{
    scope: string;
    yearMonth: string;
    finishes: RankedPeriodEntry[];
  }> = [];
  const freezeChecks: string[] = [];
  const finishStore = new Map<string, RankedPeriodEntry[]>();

  return {
    writes,
    freezeChecks,
    async rankLeaderboardPeriod(userType) {
      return opts?.rankedByType?.[userType] ?? rankedFixture();
    },
    async replaceLeaderboardMonthlyFinishes(scope, yearMonth, finishes, replaceOpts) {
      assertFreezableUtcMonth(yearMonth, replaceOpts?.now ?? clock);
      const qualifying = qualifyingFinishesForSnapshot(finishes);
      const month =
        yearMonth instanceof Date
          ? yearMonth.toISOString().slice(0, 10)
          : String(yearMonth).slice(0, 10);
      writes.push({ scope, yearMonth: month, finishes: qualifying });
      finishStore.set(`${scope}:${month}`, qualifying);
      frozen.add(`${scope}:${month}`);
      return { finisherCount: qualifying.length };
    },
    async isLeaderboardMonthFrozen(scope, yearMonth) {
      const month =
        yearMonth instanceof Date
          ? yearMonth.toISOString().slice(0, 10)
          : String(yearMonth).slice(0, 10);
      const key = `${scope}:${month}`;
      freezeChecks.push(key);
      return frozen.has(key);
    },
    async getBestMonthlyFinish(userId, scope) {
      const rows: Array<{
        userId: string;
        rank: number;
        yearMonth: string;
        periodScore: number;
        periodCorrectIds: number;
      }> = [];
      for (const [key, list] of finishStore) {
        if (!key.startsWith(`${scope}:`)) continue;
        const yearMonth = key.slice(scope.length + 1);
        for (const row of list) {
          if (row.userId === userId) {
            rows.push({
              userId,
              rank: row.rank,
              yearMonth,
              periodScore: row.periodScore,
              periodCorrectIds: row.periodCorrectIds,
            });
          }
        }
      }
      return selectBestMonthlyFinish(rows);
    },
    async hasMonthlyTop100(userId, scope) {
      for (const [key, list] of finishStore) {
        if (!key.startsWith(`${scope}:`)) continue;
        if (list.some((r) => r.userId === userId && r.rank <= 100)) return true;
      }
      return false;
    },
    async countMonthlyTop100Finishes(userId, scope) {
      let count = 0;
      for (const [key, list] of finishStore) {
        if (!key.startsWith(`${scope}:`)) continue;
        if (list.some((r) => r.userId === userId && r.rank <= 100)) count += 1;
      }
      return count;
    },
    async getUser(id) {
      return { account_type: id.startsWith("artist") ? "artist" : "user" };
    },
  };
}

describe("PROFILE-REFINEMENT-C2A — authority boundary", () => {
  it("2026-08 is rejected as pre-authority", async () => {
    assert.equal(LEADERBOARD_MONTHLY_SNAPSHOT_START, "2026-09");
    const mock = createMockStorage();
    await assert.rejects(
      () =>
        freezeLeaderboardMonth({
          scope: "community",
          yearMonth: PRE_AUTH_MONTH,
          now: NOW_OCT,
          storage: mock,
        }),
      /before 2026-09|not reconstructed/i,
    );
    assert.equal(mock.writes.length, 0);
  });

  it("2026-09 accepted only once it is completed", async () => {
    const mock = createMockStorage();
    await assert.rejects(
      () =>
        freezeLeaderboardMonth({
          scope: "community",
          yearMonth: AUTH_MONTH,
          now: NOW_SEP,
          storage: mock,
        }),
      /completed|current or future/i,
    );
    const result = await freezeLeaderboardMonth({
      scope: "community",
      yearMonth: AUTH_MONTH,
      now: NOW_OCT,
      storage: mock,
    });
    assert.equal(result.yearMonth, AUTH_MONTH);
    assert.equal(result.finisherCount, 3);
  });

  it("startup ensure during September skips August (no freeze_run)", async () => {
    const mock = createMockStorage({ now: NOW_SEP });
    const result = await ensurePreviousLeaderboardMonthFrozen({
      now: NOW_SEP,
      storage: mock,
    });
    assert.equal(previousUtcCalendarMonth(NOW_SEP), PRE_AUTH_MONTH);
    assert.equal(result.yearMonth, PRE_AUTH_MONTH);
    assert.equal(result.skipped, true);
    assert.equal(result.skipReason, "before_snapshot_start");
    assert.deepEqual(result.results, []);
    assert.equal(mock.writes.length, 0);
    assert.equal(mock.freezeChecks.length, 0);
  });

  it("startup ensure during October targets September", async () => {
    const mock = createMockStorage({
      frozen: new Set([`community:${AUTH_MONTH}`]),
      now: NOW_OCT,
    });
    const result = await ensurePreviousLeaderboardMonthFrozen({
      now: NOW_OCT,
      storage: mock,
    });
    assert.equal(previousUtcCalendarMonth(NOW_OCT), AUTH_MONTH);
    assert.equal(result.yearMonth, AUTH_MONTH);
    assert.equal(result.skipped, undefined);
    assert.deepEqual(
      result.results.map((r) => r.status),
      ["already_frozen", "frozen"],
    );
    assert.equal(mock.writes.length, 1);
    assert.equal(mock.writes[0].scope, "artist");
    assert.equal(mock.writes[0].yearMonth, AUTH_MONTH);
  });

  it("admin recovery rejects pre-September month", async () => {
    assert.match(routesSrc, /before 2026-09|not reconstructed|authoritative snapshot/);
    await assert.rejects(
      () =>
        freezeLeaderboardMonth({
          scope: "community",
          yearMonth: normalizeYearMonthInput("2026-08"),
          now: NOW_OCT,
          storage: createMockStorage(),
        }),
      /before 2026-09|not reconstructed/i,
    );
  });
});

describe("PROFILE-REFINEMENT-C2 — freeze guards", () => {
  it("current month cannot be frozen", async () => {
    const mock = createMockStorage();
    await assert.rejects(
      () =>
        freezeLeaderboardMonth({
          scope: "community",
          yearMonth: "2026-10",
          now: NOW_OCT,
          storage: mock,
        }),
      /completed|current or future/i,
    );
    assert.equal(mock.writes.length, 0);
  });

  it("previous completed authoritative month can be frozen", async () => {
    const mock = createMockStorage();
    const result = await freezeLeaderboardMonth({
      scope: "community",
      yearMonth: "2026-09",
      now: NOW_OCT,
      storage: mock,
    });
    assert.equal(result.yearMonth, AUTH_MONTH);
    assert.equal(result.status, "frozen");
    assert.equal(result.finisherCount, 3);
    assert.equal(mock.writes.length, 1);
    assert.ok(mock.writes[0].finishes.every((f) => f.periodScore > 0));
  });

  it("zero-score users are not inserted; zero-finisher month still marks freeze_runs", async () => {
    const zerosOnly = assignLeaderboardPeriodRanks([
      { userId: "a", username: "a", periodScore: 0, periodCorrectIds: 0 },
      { userId: "b", username: "b", periodScore: 0, periodCorrectIds: 0 },
    ]);
    const mock = createMockStorage({ rankedByType: { user: zerosOnly, artist: zerosOnly } });
    const result = await freezeLeaderboardMonth({
      scope: "community",
      yearMonth: AUTH_MONTH,
      now: NOW_OCT,
      storage: mock,
    });
    assert.equal(result.finisherCount, 0);
    assert.equal(mock.writes[0].finishes.length, 0);
    assert.equal(await mock.isLeaderboardMonthFrozen("community", AUTH_MONTH), true);
  });
});

describe("PROFILE-REFINEMENT-C2 — Top 100 + idempotency + isolation", () => {
  it("#1 and #100 qualify Top 100; #101 does not", async () => {
    const mock = createMockStorage();
    await freezeLeaderboardMonth({
      scope: "community",
      yearMonth: AUTH_MONTH,
      now: NOW_OCT,
      storage: mock,
    });
    assert.equal(await mock.hasMonthlyTop100("u-1", "community"), true);
    assert.equal(await mock.hasMonthlyTop100("u-100", "community"), true);
    assert.equal(await mock.hasMonthlyTop100("u-101", "community"), false);
    assert.equal(hasMonthlyTop100FromFinishes([{ rank: 101 }]), false);
    assert.equal(countMonthlyTop100Finishes([{ rank: 1 }, { rank: 100 }, { rank: 101 }]), 2);
  });

  it("rerunning same freeze is idempotent and refreshes authoritative rows", async () => {
    const mock = createMockStorage();
    await freezeLeaderboardMonth({
      scope: "community",
      yearMonth: AUTH_MONTH,
      now: NOW_OCT,
      storage: mock,
    });
    const first = mock.writes[0].finishes.map((f) => ({ ...f }));

    mock.rankLeaderboardPeriod = async () =>
      rankedFixture([
        { userId: "u-1", username: "alpha", periodScore: 99, periodCorrectIds: 9 },
        { userId: "u-new", username: "newbie", periodScore: 5, periodCorrectIds: 1 },
      ]);

    await freezeLeaderboardMonth({
      scope: "community",
      yearMonth: AUTH_MONTH,
      now: NOW_OCT,
      storage: mock,
    });
    assert.equal(mock.writes.length, 2);
    assert.notDeepEqual(mock.writes[1].finishes, first);
    assert.equal(mock.writes[1].finishes.find((f) => f.userId === "u-1")?.periodScore, 99);
    assert.ok(mock.writes[1].finishes.some((f) => f.userId === "u-new"));
  });

  it("Community and Artist remain isolated", async () => {
    const mock = createMockStorage({
      rankedByType: {
        user: rankedFixture([{ userId: "c1", username: "comm", periodScore: 10 }]),
        artist: rankedFixture([{ userId: "a1", username: "art", periodScore: 20 }]),
      },
    });
    await freezeLeaderboardMonth({
      scope: "community",
      yearMonth: AUTH_MONTH,
      now: NOW_OCT,
      storage: mock,
    });
    await freezeLeaderboardMonth({
      scope: "artist",
      yearMonth: AUTH_MONTH,
      now: NOW_OCT,
      storage: mock,
    });
    assert.equal(mock.writes[0].scope, "community");
    assert.equal(mock.writes[1].scope, "artist");
    assert.equal(await mock.hasMonthlyTop100("c1", "community"), true);
    assert.equal(await mock.hasMonthlyTop100("c1", "artist"), false);
    assert.equal(await mock.hasMonthlyTop100("a1", "artist"), true);
  });
});

describe("PROFILE-REFINEMENT-C2 — ensure previous + recovery parsing", () => {
  it("hourly ensure is safe to run repeatedly once September is freezable", async () => {
    const mock = createMockStorage({ now: NOW_OCT });
    await runLeaderboardMonthFreezeEnsureSafe({ now: NOW_OCT, storage: mock });
    await runLeaderboardMonthFreezeEnsureSafe({ now: NOW_OCT, storage: mock });
    assert.equal(mock.writes.length, 2);
    const second = await ensurePreviousLeaderboardMonthFrozen({
      now: NOW_OCT,
      storage: mock,
    });
    assert.ok(second.results.every((r) => r.status === "already_frozen"));
  });

  it("admin recovery rejects current/future month via shared freeze guard", async () => {
    assert.equal(normalizeYearMonthInput("2026-08"), "2026-08-01");
    assert.deepEqual(parseFreezeScopes(undefined), ["community", "artist"]);
    assert.deepEqual(parseFreezeScopes("community"), ["community"]);
    await assert.rejects(
      () =>
        freezeLeaderboardMonth({
          scope: "artist",
          yearMonth: normalizeYearMonthInput("2026-09"),
          now: NOW_SEP,
          storage: createMockStorage({ now: NOW_SEP }),
        }),
      /completed|current or future/i,
    );
    await assert.rejects(
      () =>
        freezeLeaderboardMonth({
          scope: "community",
          yearMonth: "2026-11",
          now: NOW_OCT,
          storage: createMockStorage(),
        }),
      /completed|current or future/i,
    );
  });
});

describe("PROFILE-REFINEMENT-C2 — achievement read fields", () => {
  it("bestMonthlyRank chooses lowest rank; tie chooses most recent month", async () => {
    const nowNov = new Date("2026-11-05T12:00:00.000Z");
    const mock = createMockStorage({ now: nowNov });
    await mock.replaceLeaderboardMonthlyFinishes(
      "community",
      AUTH_MONTH,
      [
        {
          userId: "u",
          username: "u",
          periodScore: 10,
          periodCorrectIds: 1,
          rank: 3,
        },
      ],
      { now: nowNov },
    );
    await mock.replaceLeaderboardMonthlyFinishes(
      "community",
      "2026-10-01",
      [
        {
          userId: "u",
          username: "u",
          periodScore: 12,
          periodCorrectIds: 1,
          rank: 3,
        },
      ],
      { now: nowNov },
    );

    const achievements = await getUserLeaderboardAchievements("u", "user", mock);
    assert.equal(achievements.bestMonthlyRank, 3);
    assert.equal(achievements.bestMonthlyRankMonth, "2026-10");
    assert.equal(achievements.hasMonthlyTop100, true);
    assert.equal(achievements.monthlyTop100Finishes, 2);
  });

  it("empty history returns nulls / false / zero", async () => {
    const mock = createMockStorage();
    const empty = await getUserLeaderboardAchievements("nobody", "user", mock);
    assert.deepEqual(empty, {
      bestMonthlyRank: null,
      bestMonthlyRankMonth: null,
      hasMonthlyTop100: false,
      monthlyTop100Finishes: 0,
    });
  });
});

describe("PROFILE-REFINEMENT-C2 — wiring contracts", () => {
  it("freeze module uses shared rankLeaderboardPeriod + freezable guard", () => {
    assert.match(freezeSrc, /rankLeaderboardPeriod/);
    assert.match(freezeSrc, /replaceLeaderboardMonthlyFinishes/);
    assert.match(freezeSrc, /assertFreezableUtcMonth/);
    assert.match(freezeSrc, /before_snapshot_start/);
    assert.match(domainSrc, /LEADERBOARD_MONTHLY_SNAPSHOT_START = "2026-09"/);
    assert.doesNotMatch(freezeSrc, /SUM\(e\.score_delta\)/);
  });

  it("startup + hourly cron call ensure safely", () => {
    assert.match(indexSrc, /runLeaderboardMonthFreezeEnsureSafe/);
    assert.match(indexSrc, /\[startup\]\[LeaderboardMonthlyFreeze\]/);
    assert.match(indexSrc, /cron\.schedule\("0 \* \* \* \*"/);
    assert.match(indexSrc, /\[Cron\]\[LeaderboardMonthlyFreeze\]/);
  });

  it("admin recovery route is moderator-protected and uses freezeLeaderboardMonth", () => {
    assert.match(routesSrc, /\/api\/admin\/leaderboard\/freeze-month/);
    assert.match(routesSrc, /freezeLeaderboardMonth/);
    assert.match(routesSrc, /Moderator only/);
    assert.match(routesSrc, /normalizeYearMonthInput/);
  });

  it("owner stats + public profile expose achievement fields", () => {
    assert.match(routesSrc, /getUserLeaderboardAchievements/);
    const statsIdx = routesSrc.indexOf('app.get("/api/user/:id/stats"');
    const profileIdx = routesSrc.indexOf('app.get("/api/user/profile/:username"');
    assert.ok(statsIdx > 0 && profileIdx > 0);
    assert.match(routesSrc.slice(statsIdx, statsIdx + 4500), /getUserLeaderboardAchievements/);
    assert.match(routesSrc.slice(statsIdx, statsIdx + 4500), /\.\.\.achievements/);
    assert.match(routesSrc.slice(profileIdx, profileIdx + 3500), /getUserLeaderboardAchievements/);
    assert.match(routesSrc.slice(profileIdx, profileIdx + 3500), /\.\.\.achievements/);
    assert.match(freezeSrc, /bestMonthlyRank/);
    assert.match(freezeSrc, /bestMonthlyRankMonth/);
    assert.match(freezeSrc, /hasMonthlyTop100/);
    assert.match(freezeSrc, /monthlyTop100Finishes/);
  });

  it("leaderboard payload includes server-side hasMonthlyTop100 (no N+1)", () => {
    assert.match(storageSrc, /has_monthly_top_100/);
    assert.match(storageSrc, /hasMonthlyTop100/);
    assert.match(
      storageSrc,
      /FROM leaderboard_monthly_finishes f[\s\S]*f\.rank <= 100/,
    );
    assert.match(storageSrc, /hasMonthlyTop100: Boolean\(row\.has_monthly_top_100\)/);
    assert.match(
      storageSrc,
      /ORDER BY rank_score DESC, correct_ids DESC, username ASC, user_id ASC/,
    );
  });
});
