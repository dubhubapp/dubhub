/**
 * Free verified-artist release-creation limit policy and enforcement flag.
 * Capacity is counted from artist_release_creation_ledger only.
 */

import { subMonths } from "date-fns";

export const FREE_RELEASE_LIMIT = 2 as const;

export const FREE_RELEASE_LIMIT_CODE = "FREE_RELEASE_LIMIT_REACHED" as const;

export const FREE_RELEASE_LIMIT_MESSAGE =
  "You've used your 2 free releases in the last 12 months." as const;

/** Namespace seed for artist-scoped pg_advisory_xact_lock(hashtextextended(...)). */
export const RELEASE_LIMIT_ADVISORY_LOCK_SEED = 87201451n;

export type ReleaseCreationLimitOutcome =
  | "allowed_paid"
  | "allowed_free_slot"
  | "blocked_free_limit"
  | "bypassed_enforcement_disabled"
  | "failed_paid_policy_lookup";

/**
 * Exact value "true" enables enforcement. false / unset / invalid → disabled.
 */
export function isReleaseLimitEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.ARTIST_SUBSCRIPTION_RELEASE_LIMIT_ENFORCEMENT ?? "") === "true";
}

/** Rolling window: now minus 12 calendar months through now (inclusive). */
export function getReleaseLimitRollingWindow(now: Date): { start: Date; end: Date } {
  return {
    start: subMonths(now, 12),
    end: now,
  };
}

export class FreeReleaseLimitReachedError extends Error {
  readonly code = FREE_RELEASE_LIMIT_CODE;
  readonly limit = FREE_RELEASE_LIMIT;
  readonly used: number;
  readonly statusCode = 403 as const;

  constructor(used: number) {
    super(FREE_RELEASE_LIMIT_MESSAGE);
    this.name = "FreeReleaseLimitReachedError";
    this.used = used;
  }

  toJSON(): {
    message: string;
    code: typeof FREE_RELEASE_LIMIT_CODE;
    limit: typeof FREE_RELEASE_LIMIT;
    used: number;
  } {
    return {
      message: FREE_RELEASE_LIMIT_MESSAGE,
      code: FREE_RELEASE_LIMIT_CODE,
      limit: FREE_RELEASE_LIMIT,
      used: this.used,
    };
  }
}

export function isFreeReleaseLimitReachedError(
  error: unknown,
): error is FreeReleaseLimitReachedError {
  return error instanceof FreeReleaseLimitReachedError;
}

/**
 * Decide whether a free artist may create given rolling ledger count.
 * Paid / enforcement-disabled callers should not use this.
 */
export function evaluateFreeReleaseSlot(rollingCount: number): {
  allowed: boolean;
  used: number;
} {
  const used = Math.max(0, Math.floor(rollingCount));
  return {
    allowed: used < FREE_RELEASE_LIMIT,
    used,
  };
}

export function logReleaseCreationLimitDecision(args: {
  artistId: string;
  enforcementEnabled: boolean;
  paidToolAccess: boolean;
  rollingReleaseCount: number | null;
  limit: number;
  outcome: ReleaseCreationLimitOutcome;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[release-creation-limit]", {
    artistId: args.artistId,
    enforcementEnabled: args.enforcementEnabled,
    paidToolAccess: args.paidToolAccess,
    rollingReleaseCount: args.rollingReleaseCount,
    limit: args.limit,
    outcome: args.outcome,
  });
}
