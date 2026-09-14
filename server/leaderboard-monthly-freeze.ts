/**
 * PROFILE-REFINEMENT-C2 — completed-month leaderboard freeze + achievement reads.
 *
 * Uses C1 shared `rankLeaderboardPeriod` + `replaceLeaderboardMonthlyFinishes`.
 * No historical backfill; current UTC month is never frozen.
 *
 * Default storage is loaded lazily so unit tests can inject mocks without
 * requiring DATABASE_URL at import time.
 */

import {
  accountTypeFromLeaderboardScope,
  assertFreezableUtcMonth,
  countMonthlyTop100Finishes as countTop100FromRecords,
  formatUtcDateOnly,
  isAtOrAfterLeaderboardSnapshotStart,
  leaderboardScopeFromUserType,
  LEADERBOARD_MONTHLY_SNAPSHOT_START,
  parseUtcDateOnly,
  utcCalendarMonthWindow,
  utcMonthWindowFromYearMonth,
  type LeaderboardMonthlyScope,
} from "./leaderboard-monthly-domain";

export type LeaderboardFreezeStorage = {
  rankLeaderboardPeriod: (
    userType: "user" | "artist",
    periodStart: Date,
    periodEnd: Date,
  ) => Promise<
    Array<{
      userId: string;
      username: string;
      periodScore: number;
      periodCorrectIds: number;
      rank: number;
    }>
  >;
  replaceLeaderboardMonthlyFinishes: (
    scope: LeaderboardMonthlyScope,
    yearMonth: string | Date,
    finishes: Array<{
      userId: string;
      username: string;
      periodScore: number;
      periodCorrectIds: number;
      rank: number;
    }>,
    opts?: { now?: Date },
  ) => Promise<{ finisherCount: number }>;
  isLeaderboardMonthFrozen: (
    scope: LeaderboardMonthlyScope,
    yearMonth: string | Date,
  ) => Promise<boolean>;
  getBestMonthlyFinish: (
    userId: string,
    scope: LeaderboardMonthlyScope,
  ) => Promise<{
    rank: number;
    yearMonth: string;
    periodScore: number;
    periodCorrectIds: number;
  } | null>;
  hasMonthlyTop100: (
    userId: string,
    scope: LeaderboardMonthlyScope,
  ) => Promise<boolean>;
  countMonthlyTop100Finishes: (
    userId: string,
    scope: LeaderboardMonthlyScope,
  ) => Promise<number>;
  getUser: (id: string) => Promise<{ account_type?: string } | undefined>;
};

export type FreezeLeaderboardMonthResult = {
  scope: LeaderboardMonthlyScope;
  yearMonth: string;
  finisherCount: number;
  status: "frozen";
};

export type EnsurePreviousFreezeResult = {
  yearMonth: string;
  /** True when previous month is before the authoritative snapshot start. */
  skipped?: boolean;
  skipReason?: "before_snapshot_start";
  results: Array<{
    scope: LeaderboardMonthlyScope;
    yearMonth: string;
    status: "already_frozen" | "frozen";
    finisherCount?: number;
  }>;
};

export type UserLeaderboardAchievements = {
  bestMonthlyRank: number | null;
  /** UTC month as YYYY-MM (null when no completed finishes). */
  bestMonthlyRankMonth: string | null;
  hasMonthlyTop100: boolean;
  monthlyTop100Finishes: number;
};

export const EMPTY_LEADERBOARD_ACHIEVEMENTS: UserLeaderboardAchievements = {
  bestMonthlyRank: null,
  bestMonthlyRankMonth: null,
  hasMonthlyTop100: false,
  monthlyTop100Finishes: 0,
};

async function resolveStorage(
  override?: LeaderboardFreezeStorage,
): Promise<LeaderboardFreezeStorage> {
  if (override) return override;
  const mod = await import("./storage");
  return mod.storage as unknown as LeaderboardFreezeStorage;
}

/** Accept `YYYY-MM` or `YYYY-MM-DD` (day must be 01 when full date). */
export function normalizeYearMonthInput(input: string): string {
  const trimmed = String(input ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = parseUtcDateOnly(trimmed);
    if (d.getUTCDate() !== 1) {
      throw new Error("yearMonth must be a UTC month start (YYYY-MM or YYYY-MM-01)");
    }
    return formatUtcDateOnly(d);
  }
  throw new Error("yearMonth must be YYYY-MM or YYYY-MM-01");
}

/** Previous completed UTC calendar month start (YYYY-MM-DD). */
export function previousUtcCalendarMonth(now: Date = new Date()): string {
  const currentStart = utcCalendarMonthWindow(now).periodStart;
  const prev = new Date(
    Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1),
  );
  return formatUtcDateOnly(prev);
}

export function scopeForAccountType(
  accountType: string | null | undefined,
): LeaderboardMonthlyScope {
  return accountType === "artist" ? "artist" : "community";
}

export function formatAchievementsMonth(yearMonth: string): string {
  return yearMonth.slice(0, 7);
}

export function parseFreezeScopes(
  scopeInput: unknown,
): LeaderboardMonthlyScope[] {
  if (scopeInput == null || scopeInput === "" || scopeInput === "both") {
    return ["community", "artist"];
  }
  const raw = String(scopeInput).trim().toLowerCase();
  if (raw === "community" || raw === "artist") return [raw];
  throw new Error('scope must be "community", "artist", or omit for both');
}

/**
 * Freeze one completed UTC month for one board.
 * Idempotent: safe to rerun; refreshes finish rows + freeze_runs marker.
 */
export async function freezeLeaderboardMonth(opts: {
  scope: LeaderboardMonthlyScope;
  yearMonth: string;
  now?: Date;
  storage?: LeaderboardFreezeStorage;
}): Promise<FreezeLeaderboardMonthResult> {
  const store = await resolveStorage(opts.storage);
  const now = opts.now ?? new Date();
  const yearMonth = normalizeYearMonthInput(opts.yearMonth);
  assertFreezableUtcMonth(yearMonth, now);

  const { periodStart, periodEnd, yearMonth: month } =
    utcMonthWindowFromYearMonth(yearMonth);
  const userType = accountTypeFromLeaderboardScope(opts.scope);
  const ranked = await store.rankLeaderboardPeriod(userType, periodStart, periodEnd);
  const { finisherCount } = await store.replaceLeaderboardMonthlyFinishes(
    opts.scope,
    month,
    ranked,
    { now },
  );

  return {
    scope: opts.scope,
    yearMonth: month,
    finisherCount,
    status: "frozen",
  };
}

/**
 * Ensure the previous UTC month is frozen for Community and Artist.
 * Skips scopes that already have a freeze_runs marker.
 */
export async function ensurePreviousLeaderboardMonthFrozen(opts?: {
  now?: Date;
  storage?: LeaderboardFreezeStorage;
}): Promise<EnsurePreviousFreezeResult> {
  const store = await resolveStorage(opts?.storage);
  const now = opts?.now ?? new Date();
  const yearMonth = previousUtcCalendarMonth(now);

  // Do not reconstruct months before the product authority boundary (2026-09).
  if (!isAtOrAfterLeaderboardSnapshotStart(yearMonth)) {
    console.log(
      `[LeaderboardMonthlyFreeze] skip previous month ${yearMonth}: before snapshot start ${LEADERBOARD_MONTHLY_SNAPSHOT_START}`,
    );
    return {
      yearMonth,
      skipped: true,
      skipReason: "before_snapshot_start",
      results: [],
    };
  }

  assertFreezableUtcMonth(yearMonth, now);

  const results: EnsurePreviousFreezeResult["results"] = [];
  for (const scope of ["community", "artist"] as const) {
    const already = await store.isLeaderboardMonthFrozen(scope, yearMonth);
    if (already) {
      results.push({ scope, yearMonth, status: "already_frozen" });
      continue;
    }
    const frozen = await freezeLeaderboardMonth({
      scope,
      yearMonth,
      now,
      storage: store,
    });
    results.push({
      scope,
      yearMonth: frozen.yearMonth,
      status: "frozen",
      finisherCount: frozen.finisherCount,
    });
  }

  return { yearMonth, results };
}

/** Fire-and-forget safe wrapper for startup / cron. Never throws to caller. */
export async function runLeaderboardMonthFreezeEnsureSafe(opts?: {
  now?: Date;
  storage?: LeaderboardFreezeStorage;
  logPrefix?: string;
}): Promise<EnsurePreviousFreezeResult | null> {
  const prefix = opts?.logPrefix ?? "[LeaderboardMonthlyFreeze]";
  try {
    const result = await ensurePreviousLeaderboardMonthFrozen({
      now: opts?.now,
      storage: opts?.storage,
    });
    const frozen = result.results.filter((r) => r.status === "frozen");
    const skipped = result.results.filter((r) => r.status === "already_frozen");
    console.log(
      `${prefix} ensure previous month ${result.yearMonth}: frozen=${frozen.length} already=${skipped.length}`,
      result.results,
    );
    return result;
  } catch (err) {
    console.error(`${prefix} ensure failed (non-fatal):`, err);
    return null;
  }
}

export async function getUserLeaderboardAchievements(
  userId: string,
  accountType: string | null | undefined,
  store?: LeaderboardFreezeStorage,
): Promise<UserLeaderboardAchievements> {
  const resolved = await resolveStorage(store);
  const scope = scopeForAccountType(accountType);
  try {
    const [best, hasTop100, top100Count] = await Promise.all([
      resolved.getBestMonthlyFinish(userId, scope),
      resolved.hasMonthlyTop100(userId, scope),
      resolved.countMonthlyTop100Finishes(userId, scope),
    ]);
    if (!best) {
      return {
        ...EMPTY_LEADERBOARD_ACHIEVEMENTS,
        hasMonthlyTop100: hasTop100,
        monthlyTop100Finishes: top100Count,
      };
    }
    return {
      bestMonthlyRank: best.rank,
      bestMonthlyRankMonth: formatAchievementsMonth(best.yearMonth),
      hasMonthlyTop100: hasTop100,
      monthlyTop100Finishes: top100Count,
    };
  } catch (err) {
    console.error("[getUserLeaderboardAchievements] Error:", err);
    return { ...EMPTY_LEADERBOARD_ACHIEVEMENTS };
  }
}

export async function getUserLeaderboardAchievementsForProfileId(
  userId: string,
  store?: LeaderboardFreezeStorage,
): Promise<UserLeaderboardAchievements> {
  const resolved = await resolveStorage(store);
  const user = await resolved.getUser(userId);
  return getUserLeaderboardAchievements(userId, user?.account_type, resolved);
}

export { countTop100FromRecords, leaderboardScopeFromUserType };
