/**
 * Pure domain helpers for future-release subscription suspension.
 * No DB imports — callers apply plans transactionally.
 *
 * Active future semantics:
 * - Exact: until release_at (absolute).
 * - Midnight / legacy: UTC calendar day of release_date (artist-owned; no viewer TZ).
 */

import {
  normalizeReleaseTimingMode,
  RELEASE_TIMING_MODE_EXACT,
} from "@shared/release-timing";

export const FREE_ACTIVE_FUTURE_RELEASE_LIMIT = 2 as const;

export const FUTURE_RELEASE_SUSPENSION_REASON = "over_free_future_allowance" as const;

export const RELEASE_SUBSCRIPTION_SUSPENDED_CODE =
  "RELEASE_SUBSCRIPTION_SUSPENDED" as const;

export const RELEASE_SUBSCRIPTION_SUSPENDED_MESSAGE =
  "This upcoming release is paused. Upgrade to restore it." as const;

/** Namespace seed for artist-scoped pg_advisory_xact_lock(hashtextextended(...)). */
export const FUTURE_RELEASE_SUSPENSION_ADVISORY_LOCK_SEED = 87201453n;

export type ReleaseUtcBucket =
  | "future_dated"
  | "future_today"
  | "past"
  | "coming_soon_undated"
  | "invalid";

export type ReleaseSuspensionRow = {
  id: string;
  isPublic: boolean;
  isComingSoon: boolean;
  releaseDate: Date | string | null;
  createdAt: Date | string | null;
  subscriptionSuspendedAt: Date | string | null;
  /** Defaults to midnight when absent (legacy rows). */
  releaseTimingMode?: string | null;
  releaseAt?: Date | string | null;
};

/**
 * Exact value "true" enables enforcement. false / unset / invalid → disabled.
 */
export function isFutureReleaseSuspensionEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    String(env.ARTIST_SUBSCRIPTION_FUTURE_RELEASE_SUSPENSION_ENFORCEMENT ?? "") ===
    "true"
  );
}

/** YYYY-MM-DD in UTC. */
export function utcCalendarDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function classifyReleaseUtc(
  release: Pick<
    ReleaseSuspensionRow,
    "isComingSoon" | "releaseDate" | "releaseTimingMode" | "releaseAt"
  >,
  now: Date,
): ReleaseUtcBucket {
  if (release.releaseDate == null) {
    return release.isComingSoon ? "coming_soon_undated" : "invalid";
  }
  const date = parseDate(release.releaseDate);
  if (date == null) return "invalid";

  const mode = normalizeReleaseTimingMode(release.releaseTimingMode);
  if (mode === RELEASE_TIMING_MODE_EXACT) {
    const at = parseDate(release.releaseAt ?? null);
    if (at != null && now.getTime() >= at.getTime()) {
      return "past";
    }
    // Still future (or Exact missing release_at): calendar buckets for ordering.
  }

  const releaseDay = utcCalendarDateString(date);
  const today = utcCalendarDateString(now);
  if (releaseDay === today) return "future_today";
  if (releaseDay > today) return "future_dated";
  // Exact with future release_at but calendar carrier already past UTC day.
  if (
    mode === RELEASE_TIMING_MODE_EXACT &&
    parseDate(release.releaseAt ?? null) != null
  ) {
    return "future_dated";
  }
  return "past";
}

export function isUtcFutureOrToday(bucket: ReleaseUtcBucket): boolean {
  return bucket === "future_dated" || bucket === "future_today";
}

/** Public and not past: dated future/today, or coming-soon undated. */
export function isEligiblePublicFuture(
  release: ReleaseSuspensionRow,
  now: Date,
): boolean {
  if (!release.isPublic) return false;
  const bucket = classifyReleaseUtc(release, now);
  return isUtcFutureOrToday(bucket) || bucket === "coming_soon_undated";
}

function compareNullableAsc(
  a: Date | string | null,
  b: Date | string | null,
): number {
  const ta = parseDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
  const tb = parseDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
  return ta - tb;
}

function compareIdAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Selection order for free allowance:
 * dated (future_dated / future_today) first by release_date ascending;
 * undated coming-soon after by created_at ascending;
 * id ascending as tie-breaker.
 */
export function compareEligibleFuturesForSelection(
  a: ReleaseSuspensionRow,
  b: ReleaseSuspensionRow,
  now: Date,
): number {
  const datedA = isUtcFutureOrToday(classifyReleaseUtc(a, now));
  const datedB = isUtcFutureOrToday(classifyReleaseUtc(b, now));

  if (datedA !== datedB) {
    return datedA ? -1 : 1;
  }

  if (datedA) {
    const byDate = compareNullableAsc(a.releaseDate, b.releaseDate);
    if (byDate !== 0) return byDate;
    return compareIdAsc(a.id, b.id);
  }

  const byCreated = compareNullableAsc(a.createdAt, b.createdAt);
  if (byCreated !== 0) return byCreated;
  return compareIdAsc(a.id, b.id);
}

export function sortEligibleFuturesForSelection(
  releases: ReleaseSuspensionRow[],
  now: Date,
): ReleaseSuspensionRow[] {
  return [...releases].sort((a, b) =>
    compareEligibleFuturesForSelection(a, b, now),
  );
}

export function planInitialDowngradeSuspensions(
  eligiblePublicFutures: ReleaseSuspensionRow[],
  now: Date,
  freeLimit: number = FREE_ACTIVE_FUTURE_RELEASE_LIMIT,
): { keepActiveIds: string[]; suspendIds: string[] } {
  const sorted = sortEligibleFuturesForSelection(eligiblePublicFutures, now);
  const keep = sorted.slice(0, freeLimit);
  const suspend = sorted.slice(freeLimit);
  return {
    keepActiveIds: keep.map((r) => r.id),
    suspendIds: suspend.map((r) => r.id),
  };
}

/**
 * Unpaid reconcile with frozen assignment:
 * - Ignore non-public
 * - Past: never newly suspend; leave already-suspended past alone
 * - If any suspension already exists for the artist: freeze mode
 *   - active <= limit → promote from sorted suspended eligible
 *   - active > limit → suspend preferSuspendIds first (newly public newcomers),
 *     then newest-by-created_at among remaining actives; never swap in
 *     nearer suspended rows; never demote solely because dates changed
 * - If no suspensions yet and active > limit: initial Option-1 selection
 * - restoreIds always empty
 */
export function planUnpaidReconcile(args: {
  releases: ReleaseSuspensionRow[];
  now: Date;
  freeLimit?: number;
  /**
   * When freeze is established and over capacity, suspend these active IDs
   * first (e.g. a release that just became public). Preserves frozen actives
   * even when the newcomer has an older created_at.
   */
  preferSuspendIds?: string[];
}): { suspendIds: string[]; promoteIds: string[]; restoreIds: string[] } {
  const limit = args.freeLimit ?? FREE_ACTIVE_FUTURE_RELEASE_LIMIT;
  const { releases, now } = args;
  const restoreIds: string[] = [];
  const preferSuspend = new Set(
    (args.preferSuspendIds ?? []).filter((id) => typeof id === "string" && id.length > 0),
  );

  const eligible = releases.filter((r) => isEligiblePublicFuture(r, now));
  const active = eligible.filter((r) => r.subscriptionSuspendedAt == null);
  const suspendedEligible = eligible.filter(
    (r) => r.subscriptionSuspendedAt != null,
  );
  const freezeEstablished = releases.some(
    (r) => r.subscriptionSuspendedAt != null,
  );

  if (active.length <= limit) {
    const sortedSuspended = sortEligibleFuturesForSelection(
      suspendedEligible,
      now,
    );
    const slots = limit - active.length;
    return {
      suspendIds: [],
      promoteIds: sortedSuspended.slice(0, slots).map((r) => r.id),
      restoreIds,
    };
  }

  if (!freezeEstablished) {
    const initial = planInitialDowngradeSuspensions(active, now, limit);
    return {
      suspendIds: initial.suspendIds,
      promoteIds: [],
      restoreIds,
    };
  }

  // Over capacity after freeze: prefer explicit newcomers, then newest created_at.
  const excess = active.length - limit;
  const preferred = active.filter((r) => preferSuspend.has(r.id));
  const preferredIds = preferred.slice(0, excess).map((r) => r.id);
  const preferredSet = new Set(preferredIds);
  const remainingNeeded = excess - preferredIds.length;
  if (remainingNeeded <= 0) {
    return {
      suspendIds: preferredIds,
      promoteIds: [],
      restoreIds,
    };
  }

  const byNewestCreated = active
    .filter((r) => !preferredSet.has(r.id))
    .sort((a, b) => {
      const tb = parseDate(b.createdAt)?.getTime() ?? 0;
      const ta = parseDate(a.createdAt)?.getTime() ?? 0;
      if (tb !== ta) return tb - ta;
      return compareIdAsc(b.id, a.id);
    });
  return {
    suspendIds: [
      ...preferredIds,
      ...byNewestCreated.slice(0, remainingNeeded).map((r) => r.id),
    ],
    promoteIds: [],
    restoreIds,
  };
}

export function planPaidRestore(
  releases: ReleaseSuspensionRow[],
): { restoreIds: string[] } {
  return {
    restoreIds: releases
      .filter((r) => r.subscriptionSuspendedAt != null)
      .map((r) => r.id),
  };
}

export function canReleaseFanOutPublicNotifications(
  release: Pick<ReleaseSuspensionRow, "isPublic" | "subscriptionSuspendedAt">,
): boolean {
  return release.isPublic && release.subscriptionSuspendedAt == null;
}

/**
 * Fresh paid → restore path; fresh unpaid → suspend/reconcile path;
 * stale/unknown → do not write.
 */
export function classifyAccessForSuspensionReconcile(args: {
  freshness: "fresh" | "stale" | "unknown";
  hasPaidToolAccess: boolean;
}): "confirmed_paid" | "confirmed_unpaid" | "no_write" {
  if (args.freshness !== "fresh") return "no_write";
  return args.hasPaidToolAccess ? "confirmed_paid" : "confirmed_unpaid";
}

export class FreeReleaseSubscriptionSuspendedError extends Error {
  readonly code = RELEASE_SUBSCRIPTION_SUSPENDED_CODE;
  readonly statusCode = 403 as const;

  constructor() {
    super(RELEASE_SUBSCRIPTION_SUSPENDED_MESSAGE);
    this.name = "FreeReleaseSubscriptionSuspendedError";
  }

  toJSON(): {
    message: string;
    code: typeof RELEASE_SUBSCRIPTION_SUSPENDED_CODE;
  } {
    return {
      message: RELEASE_SUBSCRIPTION_SUSPENDED_MESSAGE,
      code: RELEASE_SUBSCRIPTION_SUSPENDED_CODE,
    };
  }
}

export function isFreeReleaseSubscriptionSuspendedError(
  error: unknown,
): error is FreeReleaseSubscriptionSuspendedError {
  return error instanceof FreeReleaseSubscriptionSuspendedError;
}
