/**
 * Free verified-artist per-release attachment limit policy.
 * Cap is counted from release_posts rows for that release.
 */

export const FREE_ATTACHMENT_LIMIT = 3 as const;

export const FREE_ATTACHMENT_LIMIT_CODE = "FREE_ATTACHMENT_LIMIT_REACHED" as const;

export const FREE_ATTACHMENT_LIMIT_MESSAGE =
  "You've reached the free limit of 3 attached posts per release. Upgrade for unlimited attachments." as const;

/** Namespace seed for release-scoped pg_advisory_xact_lock(hashtextextended(...)). */
export const ATTACHMENT_LIMIT_ADVISORY_LOCK_SEED = 87201452n;

/**
 * Exact value "true" enables enforcement. false / unset / invalid → disabled.
 */
export function isAttachmentLimitEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.ARTIST_SUBSCRIPTION_ATTACHMENT_LIMIT_ENFORCEMENT ?? "") === "true";
}

export class FreeAttachmentLimitReachedError extends Error {
  readonly code = FREE_ATTACHMENT_LIMIT_CODE;
  readonly limit = FREE_ATTACHMENT_LIMIT;
  readonly used: number;
  readonly statusCode = 403 as const;

  constructor(used: number) {
    super(FREE_ATTACHMENT_LIMIT_MESSAGE);
    this.name = "FreeAttachmentLimitReachedError";
    this.used = used;
  }

  toJSON(): {
    message: string;
    code: typeof FREE_ATTACHMENT_LIMIT_CODE;
    limit: typeof FREE_ATTACHMENT_LIMIT;
    used: number;
  } {
    return {
      message: FREE_ATTACHMENT_LIMIT_MESSAGE,
      code: FREE_ATTACHMENT_LIMIT_CODE,
      limit: FREE_ATTACHMENT_LIMIT,
      used: this.used,
    };
  }
}

export function isFreeAttachmentLimitReachedError(
  error: unknown,
): error is FreeAttachmentLimitReachedError {
  return error instanceof FreeAttachmentLimitReachedError;
}

export function logAttachmentLimitDecision(args: {
  releaseId: string;
  ownerId: string;
  enforcementEnabled: boolean;
  paidToolAccess: boolean;
  used: number;
  attemptedNew: number;
  limit: number;
  outcome:
    | "allowed_paid"
    | "allowed_free_slot"
    | "blocked_free_limit"
    | "bypassed_enforcement_disabled"
    | "failed_paid_policy_lookup";
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[release-attachment-limit]", {
    releaseId: args.releaseId,
    ownerId: args.ownerId,
    enforcementEnabled: args.enforcementEnabled,
    paidToolAccess: args.paidToolAccess,
    used: args.used,
    attemptedNew: args.attemptedNew,
    limit: args.limit,
    outcome: args.outcome,
  });
}
