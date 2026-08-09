/**
 * Free verified-artist per-release link limit policy.
 * Free: at most 1 live link (any approved platform). Paid: unlimited + pre-release types.
 */

import {
  SELECTABLE_RELEASE_LINK_PLATFORM_IDS,
  isCompatibleReleaseLinkPurpose,
  isLegacyReleaseLinkPlatform,
  isSelectableReleaseLinkPlatform,
  mayPreserveHistoricalUnsupportedLinkPurpose,
  normalizeReleaseLinkPlatformId,
} from "@shared/release-link-platforms";

export const FREE_RELEASE_LINK_LIMIT = 1 as const;

export const FREE_LINK_LIMIT_CODE = "FREE_LINK_LIMIT_REACHED" as const;
export const PAID_LINK_TYPE_REQUIRED_CODE = "PAID_LINK_TYPE_REQUIRED" as const;
export const INVALID_RELEASE_LINK_TYPE_CODE = "INVALID_RELEASE_LINK_TYPE" as const;

export const FREE_LINK_LIMIT_MESSAGE =
  "Free artists can add 1 primary link per release." as const;

export const PAID_LINK_TYPE_REQUIRED_MESSAGE =
  "Upgrade to add pre-save, pre-add and pre-order links." as const;

export const INVALID_RELEASE_LINK_TYPE_MESSAGE =
  "This link type isn't supported for the selected platform." as const;

/** Namespace seed for release-scoped pg_advisory_xact_lock(hashtextextended(...)). */
export const LINK_LIMIT_ADVISORY_LOCK_SEED = 87201453n;

/** Writable (new) platforms — Juno excluded (ceased trading). */
export const APPROVED_RELEASE_LINK_PLATFORMS = SELECTABLE_RELEASE_LINK_PLATFORM_IDS;

export type ApprovedReleaseLinkPlatform =
  (typeof APPROVED_RELEASE_LINK_PLATFORMS)[number];

/** Canonical link_type values stored in release_links.link_type. */
export const CANONICAL_LINK_TYPES = ["listen", "presave", "download"] as const;
export type CanonicalLinkType = (typeof CANONICAL_LINK_TYPES)[number];

/**
 * Paid-only stored purpose: pre-release (`presave`).
 * Platforms (including free_download / dub_pack / other) are never paid-only by themselves.
 * Normal `download` / `listen` CTAs are free.
 */
export const PAID_ONLY_LINK_TYPES = new Set(["presave"]);

/**
 * Exact value "true" enables enforcement. false / unset / invalid → disabled.
 */
export function isLinkLimitEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.ARTIST_SUBSCRIPTION_LINK_LIMIT_ENFORCEMENT ?? "") === "true";
}

export function normalizeReleaseLinkPlatform(raw: string): string {
  return normalizeReleaseLinkPlatformId(raw);
}

export function normalizeReleaseLinkType(
  raw: string | null | undefined,
): CanonicalLinkType | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "listen" || s === "presave" || s === "download") return s;
  return null;
}

/** New writes must use a selectable platform (not legacy Juno). */
export function isApprovedReleaseLinkPlatform(
  platform: string,
): platform is ApprovedReleaseLinkPlatform {
  return isSelectableReleaseLinkPlatform(platform);
}

/** Accept selectable or legacy IDs for request parsing (legacy updates only). */
export function isAcceptedReleaseLinkPlatform(platform: string): boolean {
  return isSelectableReleaseLinkPlatform(platform) || isLegacyReleaseLinkPlatform(platform);
}

export { isLegacyReleaseLinkPlatform, isSelectableReleaseLinkPlatform };

/**
 * Platform/type compatibility before entitlement checks.
 * Null link_type remains allowed (legacy live). Historical unsupported rows may
 * keep their existing purpose on same-platform URL-only edits only.
 */
export function assertReleaseLinkTypeCompatible(args: {
  platform: string;
  linkType: string | null;
  existingRow?: { platform: string; linkType: string | null } | null;
}): void {
  if (isCompatibleReleaseLinkPurpose(args.platform, args.linkType)) return;
  if (
    mayPreserveHistoricalUnsupportedLinkPurpose({
      existing: args.existingRow ?? null,
      proposed: { platform: args.platform, linkType: args.linkType },
    })
  ) {
    return;
  }
  throw new InvalidReleaseLinkTypeError();
}

/** True when the proposed purpose requires Verified Artist Tools (pre-release). */
export function isPaidOnlyReleaseLink(
  _platform: string,
  linkType: string | null | undefined,
): boolean {
  const lt = normalizeReleaseLinkType(linkType);
  if (lt && PAID_ONLY_LINK_TYPES.has(lt)) return true;
  // Non-canonical link_type strings are not a free live purpose; treat as paid-gated.
  if (linkType != null && String(linkType).trim() !== "" && lt === null) {
    return true;
  }
  return false;
}

/**
 * Free primary link: any approved platform with a normal live purpose
 * (null/listen/download) — never pre-release `presave`.
 */
export function isFreePrimaryReleaseLink(
  platform: string,
  linkType: string | null | undefined,
): boolean {
  const p = normalizeReleaseLinkPlatform(platform);
  if (!isApprovedReleaseLinkPlatform(p)) return false;
  if (isPaidOnlyReleaseLink(p, linkType)) return false;
  if (linkType != null && String(linkType).trim() !== "") {
    const lt = normalizeReleaseLinkType(linkType);
    // Allowed free live purposes: listen or download.
    if (lt !== "listen" && lt !== "download") return false;
  }
  return true;
}

export type FreeLinkMutationDecision =
  | { outcome: "allow" }
  | { outcome: "block_limit"; used: number }
  | { outcome: "block_paid_type" };

/**
 * Decide whether a free artist may upsert a link for a release.
 * existingRow null = insert; non-null = update existing platform row.
 */
export function decideFreeLinkUpsert(args: {
  used: number;
  existingRow: { platform: string; linkType: string | null } | null;
  proposed: { platform: string; linkType: string | null };
}): FreeLinkMutationDecision {
  const { used, existingRow, proposed } = args;

  if (existingRow) {
    const existingPaid = isPaidOnlyReleaseLink(existingRow.platform, existingRow.linkType);
    const proposedPaid = isPaidOnlyReleaseLink(proposed.platform, proposed.linkType);

    // Legacy platform (e.g. Juno) URL correction — never newly selectable.
    if (
      isLegacyReleaseLinkPlatform(existingRow.platform) &&
      normalizeReleaseLinkPlatform(proposed.platform) ===
        normalizeReleaseLinkPlatform(existingRow.platform) &&
      !proposedPaid
    ) {
      return { outcome: "allow" };
    }

    // URL correction of paid-era paid-only rows stays allowed when classification stays paid-only.
    if (existingPaid && proposedPaid) {
      const existingLt = normalizeReleaseLinkType(existingRow.linkType);
      const proposedLt = normalizeReleaseLinkType(proposed.linkType);
      // Block converting between distinct paid-only types (e.g. download → presave).
      if (
        existingLt &&
        proposedLt &&
        existingLt !== proposedLt &&
        PAID_ONLY_LINK_TYPES.has(existingLt) &&
        PAID_ONLY_LINK_TYPES.has(proposedLt)
      ) {
        return { outcome: "block_paid_type" };
      }
      return { outcome: "allow" };
    }

    // Free listening → paid-only conversion blocked.
    if (!existingPaid && proposedPaid) {
      return { outcome: "block_paid_type" };
    }

    // Softening paid-era → free primary, or free → free: allow (no count change).
    if (proposedPaid) {
      return { outcome: "block_paid_type" };
    }
    if (!isFreePrimaryReleaseLink(proposed.platform, proposed.linkType)) {
      return { outcome: "block_paid_type" };
    }
    return { outcome: "allow" };
  }

  // Insert
  if (used >= FREE_RELEASE_LINK_LIMIT) {
    return { outcome: "block_limit", used };
  }
  if (!isFreePrimaryReleaseLink(proposed.platform, proposed.linkType)) {
    return { outcome: "block_paid_type" };
  }
  return { outcome: "allow" };
}

export function decideFreePrimaryReplace(args: {
  used: number;
  fromExists: boolean;
  proposed: { platform: string; linkType: string | null };
  targetPlatformAlreadyExists: boolean;
}): FreeLinkMutationDecision {
  if (!args.fromExists) {
    return { outcome: "block_limit", used: args.used };
  }
  if (args.used !== FREE_RELEASE_LINK_LIMIT) {
    // Replacement is only for exactly one primary.
    if (args.used > FREE_RELEASE_LINK_LIMIT) {
      return { outcome: "block_limit", used: args.used };
    }
    return { outcome: "block_limit", used: args.used };
  }
  if (args.targetPlatformAlreadyExists) {
    return { outcome: "block_limit", used: args.used };
  }
  if (!isFreePrimaryReleaseLink(args.proposed.platform, args.proposed.linkType)) {
    return { outcome: "block_paid_type" };
  }
  return { outcome: "allow" };
}

export class FreeLinkLimitReachedError extends Error {
  readonly code = FREE_LINK_LIMIT_CODE;
  readonly limit = FREE_RELEASE_LINK_LIMIT;
  readonly used: number;
  readonly statusCode = 403 as const;

  constructor(used: number) {
    super(FREE_LINK_LIMIT_MESSAGE);
    this.name = "FreeLinkLimitReachedError";
    this.used = used;
  }

  toJSON(): {
    message: string;
    code: typeof FREE_LINK_LIMIT_CODE;
    limit: typeof FREE_RELEASE_LINK_LIMIT;
    used: number;
  } {
    return {
      message: FREE_LINK_LIMIT_MESSAGE,
      code: FREE_LINK_LIMIT_CODE,
      limit: FREE_RELEASE_LINK_LIMIT,
      used: this.used,
    };
  }
}

export class PaidLinkTypeRequiredError extends Error {
  readonly code = PAID_LINK_TYPE_REQUIRED_CODE;
  readonly statusCode = 403 as const;

  constructor() {
    super(PAID_LINK_TYPE_REQUIRED_MESSAGE);
    this.name = "PaidLinkTypeRequiredError";
  }

  toJSON(): {
    message: string;
    code: typeof PAID_LINK_TYPE_REQUIRED_CODE;
  } {
    return {
      message: PAID_LINK_TYPE_REQUIRED_MESSAGE,
      code: PAID_LINK_TYPE_REQUIRED_CODE,
    };
  }
}

export class InvalidReleaseLinkTypeError extends Error {
  readonly code = INVALID_RELEASE_LINK_TYPE_CODE;
  readonly statusCode = 400 as const;

  constructor() {
    super(INVALID_RELEASE_LINK_TYPE_MESSAGE);
    this.name = "InvalidReleaseLinkTypeError";
  }

  toJSON(): {
    message: string;
    code: typeof INVALID_RELEASE_LINK_TYPE_CODE;
  } {
    return {
      message: INVALID_RELEASE_LINK_TYPE_MESSAGE,
      code: INVALID_RELEASE_LINK_TYPE_CODE,
    };
  }
}

export function isFreeLinkLimitReachedError(
  error: unknown,
): error is FreeLinkLimitReachedError {
  return error instanceof FreeLinkLimitReachedError;
}

export function isPaidLinkTypeRequiredError(
  error: unknown,
): error is PaidLinkTypeRequiredError {
  return error instanceof PaidLinkTypeRequiredError;
}

export function isInvalidReleaseLinkTypeError(
  error: unknown,
): error is InvalidReleaseLinkTypeError {
  return error instanceof InvalidReleaseLinkTypeError;
}

export function logLinkLimitDecision(args: {
  releaseId: string;
  ownerId: string;
  enforcementEnabled: boolean;
  paidToolAccess: boolean;
  used: number;
  outcome:
    | "allowed_paid"
    | "allowed_free_update"
    | "allowed_free_insert"
    | "allowed_free_replace"
    | "blocked_free_limit"
    | "blocked_paid_type"
    | "bypassed_enforcement_disabled"
    | "failed_paid_policy_lookup";
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[release-link-limit]", {
    releaseId: args.releaseId,
    ownerId: args.ownerId,
    enforcementEnabled: args.enforcementEnabled,
    paidToolAccess: args.paidToolAccess,
    used: args.used,
    outcome: args.outcome,
  });
}
