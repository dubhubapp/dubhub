/**
 * Monthly leaderboard snapshot domain (PROFILE-REFINEMENT-C1).
 *
 * Pure helpers for UTC month windows, completed-month guards, ranking order,
 * best-finish selection, and Monthly Top 100 derivation.
 *
 * Live leaderboard SQL and freeze writes live in `server/storage.ts` and must
 * share the same half-open period window + ORDER BY semantics.
 */

export type LeaderboardMonthlyScope = "community" | "artist";
export type LeaderboardAccountType = "user" | "artist";

export type LeaderboardPeriodWindow = {
  /** Inclusive lower bound (timestamptz). */
  periodStart: Date;
  /** Exclusive upper bound (timestamptz). */
  periodEnd: Date;
};

export type RankablePeriodEntry = {
  userId: string;
  username: string;
  periodScore: number;
  periodCorrectIds: number;
};

export type RankedPeriodEntry = RankablePeriodEntry & {
  rank: number;
};

export type MonthlyFinishRecord = {
  userId: string;
  rank: number;
  yearMonth: string; // YYYY-MM-DD (UTC month start)
  periodScore: number;
  periodCorrectIds: number;
};

export type BestMonthlyFinish = {
  rank: number;
  yearMonth: string;
  periodScore: number;
  periodCorrectIds: number;
};

/** Map live leaderboard userType → snapshot scope. */
export function leaderboardScopeFromUserType(
  userType: "user" | "artist",
): LeaderboardMonthlyScope {
  return userType === "artist" ? "artist" : "community";
}

/** Map snapshot scope → profiles.account_type. */
export function accountTypeFromLeaderboardScope(
  scope: LeaderboardMonthlyScope,
): LeaderboardAccountType {
  return scope === "artist" ? "artist" : "user";
}

/** Format a Date as UTC calendar YYYY-MM-DD (month-start dates). */
export function formatUtcDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD (or Date) as UTC midnight date-only. */
export function parseUtcDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    throw new Error(`Invalid UTC date-only value: ${value}`);
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** True when `yearMonth` is exactly a UTC calendar month start (day === 1). */
export function isUtcMonthStart(yearMonth: string | Date): boolean {
  const d = parseUtcDateOnly(yearMonth);
  return d.getUTCDate() === 1;
}

/**
 * UTC calendar month half-open window for `now`.
 * Matches Postgres `DATE_TRUNC('month', …)` + `+ INTERVAL '1 month'` in UTC.
 */
export function utcCalendarMonthWindow(now: Date = new Date()): LeaderboardPeriodWindow & {
  yearMonth: string;
} {
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { periodStart, periodEnd, yearMonth: formatUtcDateOnly(periodStart) };
}

/** UTC calendar year half-open window for `now`. */
export function utcCalendarYearWindow(now: Date = new Date()): LeaderboardPeriodWindow {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

/** Half-open window for an explicit UTC month start (`YYYY-MM-DD` day 1). */
export function utcMonthWindowFromYearMonth(
  yearMonth: string | Date,
): LeaderboardPeriodWindow & { yearMonth: string } {
  const periodStart = parseUtcDateOnly(yearMonth);
  if (periodStart.getUTCDate() !== 1) {
    throw new Error(
      `year_month must be a UTC month start (day 1); got ${formatUtcDateOnly(periodStart)}`,
    );
  }
  const periodEnd = new Date(
    Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    ),
  );
  return { periodStart, periodEnd, yearMonth: formatUtcDateOnly(periodStart) };
}

/**
 * Membership via DATE_TRUNC equality (legacy live filter), evaluated in UTC.
 * Equivalent to half-open `[monthStart, nextMonthStart)` for the same TZ.
 */
export function eventInUtcMonthByDateTrunc(
  createdAt: Date,
  now: Date,
): boolean {
  return (
    createdAt.getUTCFullYear() === now.getUTCFullYear() &&
    createdAt.getUTCMonth() === now.getUTCMonth()
  );
}

/** Half-open inclusive start / exclusive end membership. */
export function eventInPeriodHalfOpen(
  createdAt: Date,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  return createdAt >= periodStart && createdAt < periodEnd;
}

/**
 * First authoritative Monthly Top 100 / Best Monthly Rank snapshot month (YYYY-MM).
 * Earlier leaderboard months are intentionally not reconstructed.
 */
export const LEADERBOARD_MONTHLY_SNAPSHOT_START = "2026-09" as const;

/** UTC month-start date for {@link LEADERBOARD_MONTHLY_SNAPSHOT_START}. */
export const LEADERBOARD_MONTHLY_SNAPSHOT_START_DATE = "2026-09-01" as const;

export function snapshotStartUtcMonth(): Date {
  return parseUtcDateOnly(LEADERBOARD_MONTHLY_SNAPSHOT_START_DATE);
}

/** True when yearMonth is on/after the product authority boundary (2026-09). */
export function isAtOrAfterLeaderboardSnapshotStart(
  yearMonth: string | Date,
): boolean {
  const monthStart = parseUtcDateOnly(
    typeof yearMonth === "string" && /^\d{4}-\d{2}$/.test(yearMonth.trim())
      ? `${yearMonth.trim()}-01`
      : yearMonth,
  );
  return monthStart >= snapshotStartUtcMonth();
}

/** Completed month = yearMonth start is strictly before the current UTC month start. */
export function isCompletedUtcMonth(
  yearMonth: string | Date,
  now: Date = new Date(),
): boolean {
  const monthStart = parseUtcDateOnly(yearMonth);
  if (monthStart.getUTCDate() !== 1) return false;
  const currentStart = utcCalendarMonthWindow(now).periodStart;
  return monthStart < currentStart;
}

export function assertCompletedUtcMonth(
  yearMonth: string | Date,
  now: Date = new Date(),
): void {
  if (!isUtcMonthStart(yearMonth)) {
    throw new Error("year_month must be a UTC calendar month start");
  }
  if (!isCompletedUtcMonth(yearMonth, now)) {
    throw new Error(
      "Cannot snapshot the current or future UTC month; only completed months are allowed",
    );
  }
}

/**
 * Freeze eligibility: completed UTC month AND on/after snapshot start (2026-09).
 * Rejects historical reconstruction of pre-authority months.
 */
export function assertFreezableUtcMonth(
  yearMonth: string | Date,
  now: Date = new Date(),
): void {
  assertCompletedUtcMonth(yearMonth, now);
  if (!isAtOrAfterLeaderboardSnapshotStart(yearMonth)) {
    throw new Error(
      `Cannot freeze months before ${LEADERBOARD_MONTHLY_SNAPSHOT_START}; ` +
        "leaderboard achievement history starts at that authoritative snapshot month " +
        "(earlier months are not reconstructed)",
    );
  }
}

/**
 * Exact live ORDER BY / ROW_NUMBER semantics:
 * period_score DESC, period_correct_ids DESC, username ASC, user_id ASC.
 */
export function compareLeaderboardPeriodEntries(
  a: RankablePeriodEntry,
  b: RankablePeriodEntry,
): number {
  if (b.periodScore !== a.periodScore) return b.periodScore - a.periodScore;
  if (b.periodCorrectIds !== a.periodCorrectIds) {
    return b.periodCorrectIds - a.periodCorrectIds;
  }
  const byName = a.username.localeCompare(b.username);
  if (byName !== 0) return byName;
  return a.userId.localeCompare(b.userId);
}

/** Assign dense ROW_NUMBER ranks with live tie-break order. */
export function assignLeaderboardPeriodRanks(
  entries: RankablePeriodEntry[],
): RankedPeriodEntry[] {
  const sorted = [...entries].sort(compareLeaderboardPeriodEntries);
  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Snapshot persistence filter — inactive (zero-score) users never freeze. */
export function qualifyingFinishesForSnapshot(
  ranked: RankedPeriodEntry[],
): RankedPeriodEntry[] {
  return ranked.filter((row) => row.periodScore > 0);
}

/** Best finish: lowest rank, then most recent year_month. */
export function selectBestMonthlyFinish(
  finishes: MonthlyFinishRecord[],
): BestMonthlyFinish | null {
  if (finishes.length === 0) return null;
  const sorted = [...finishes].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // year_month DESC (lexicographic works for YYYY-MM-DD)
    return b.yearMonth.localeCompare(a.yearMonth);
  });
  const best = sorted[0];
  return {
    rank: best.rank,
    yearMonth: best.yearMonth,
    periodScore: best.periodScore,
    periodCorrectIds: best.periodCorrectIds,
  };
}

/** Permanent Monthly Top 100 — any completed finish with rank <= 100. */
export function hasMonthlyTop100FromFinishes(
  finishes: Array<Pick<MonthlyFinishRecord, "rank">>,
): boolean {
  return finishes.some((f) => f.rank <= 100);
}

export function countMonthlyTop100Finishes(
  finishes: Array<Pick<MonthlyFinishRecord, "rank">>,
): number {
  return finishes.filter((f) => f.rank <= 100).length;
}
