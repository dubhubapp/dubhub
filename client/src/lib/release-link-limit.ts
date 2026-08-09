/**
 * Free release-link limit copy, capacity parsing, and friendly error detection.
 * Limit is 1 primary listening link for free artists (not attachments).
 */

export const FREE_RELEASE_LINK_LIMIT = 1 as const;
export const FREE_LINK_LIMIT_REACHED_CODE = "FREE_LINK_LIMIT_REACHED" as const;
export const PAID_LINK_TYPE_REQUIRED_CODE = "PAID_LINK_TYPE_REQUIRED" as const;
export const INVALID_RELEASE_LINK_TYPE_CODE = "INVALID_RELEASE_LINK_TYPE" as const;

export const LINK_ALLOWANCE_QUERY_KEY = [
  "/api/artists/me/release-link-allowance",
] as const;

export function releaseLinkCapacityQueryKey(releaseId: string) {
  return ["/api/releases", releaseId, "link-capacity"] as const;
}

export type ReleaseLinkAllowance = {
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  canAdd: boolean;
  enforcementEnabled: boolean;
};

export type ReleaseLinkCapacity = ReleaseLinkAllowance;

export const LINK_LIMIT_TOAST = {
  title: "Link limit reached",
  body: "Free artists can add 1 primary link per release. Upgrade for unlimited links.",
} as const;

export const PAID_LINK_TYPE_TOAST = {
  title: "Upgrade required",
  body: "Upgrade to add pre-save, pre-add and pre-order links.",
} as const;

export const INVALID_RELEASE_LINK_TYPE_TOAST = {
  title: "Unsupported link type",
  body: "This link type isn't supported for the selected platform.",
} as const;

export const LINK_LIMIT_CARD_COPY = {
  ctaLabel: "Upgrade",
  ctaHint: "Purchase options coming soon",
} as const;

export const LINK_ZERO_USED_BODY =
  "Add one primary link. Upgrade for unlimited links and pre-release link types." as const;

export const LINK_AT_LIMIT_BODY =
  "You've used your free primary link. Upgrade for unlimited release links and pre-saves." as const;

export const LINK_OVER_LIMIT_BODY =
  "Your existing links remain live. You can edit or remove them, or upgrade to add more." as const;

export const LINK_PAID_TITLE = "Unlimited release links" as const;
export const LINK_PAID_BODY =
  "You're subscribed to Verified Artist Tools." as const;

/** Owner guidance when a free listening link is saved on a future / Coming Soon release. */
export const LISTENING_LINK_FUTURE_GUIDANCE = {
  title: "Link saved",
  body: "This link will become visible when the release is out. Upgrade to add pre-save, pre-add or pre-order links before release day.",
} as const;

export const PAID_ONLY_LINK_TYPES = new Set(["presave"]);

/** True when purpose requires Verified Artist Tools (pre-release only). */
export function isPaidOnlyReleaseLink(
  _platform: string,
  linkType?: string | null,
): boolean {
  const lt = linkType?.trim().toLowerCase() ?? "";
  if (lt && PAID_ONLY_LINK_TYPES.has(lt)) return true;
  if (lt && lt !== "listen" && lt !== "download" && lt.length > 0) {
    return true;
  }
  return false;
}

export function isFreePrimaryReleaseLink(
  platform: string,
  linkType?: string | null,
): boolean {
  const p = String(platform).trim().toLowerCase();
  if (!p) return false;
  if (isPaidOnlyReleaseLink(p, linkType)) return false;
  if (linkType != null && String(linkType).trim() !== "") {
    const lt = String(linkType).trim().toLowerCase();
    if (lt !== "listen" && lt !== "download") return false;
  }
  return true;
}

export type LinkLimitCardCopy = {
  title: string;
  body: string;
};

/** Title always uses the real used count — never clamped to limit. */
export function formatLinkLimitTitle(used: number, limit: number): string {
  const safeUsed = Math.max(0, Math.floor(used));
  const safeLimit = Math.max(0, Math.floor(limit));
  return `${safeUsed} of ${safeLimit} free links used`;
}

export function resolveLinkLimitCardCopy(args: {
  unlimited: boolean;
  used: number;
  limit: number | null;
}): LinkLimitCardCopy {
  if (args.unlimited) {
    return { title: LINK_PAID_TITLE, body: LINK_PAID_BODY };
  }
  const used = Math.max(0, Math.floor(args.used));
  const limit = Math.max(0, Math.floor(args.limit ?? FREE_RELEASE_LINK_LIMIT));
  const title = formatLinkLimitTitle(used, limit);
  if (used > limit) {
    return { title, body: LINK_OVER_LIMIT_BODY };
  }
  if (used >= limit) {
    return { title, body: LINK_AT_LIMIT_BODY };
  }
  return { title, body: LINK_ZERO_USED_BODY };
}

export function parseLinkAllowance(value: unknown): ReleaseLinkAllowance | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.unlimited !== "boolean") return null;
  if (typeof record.canAdd !== "boolean") return null;
  if (typeof record.enforcementEnabled !== "boolean") return null;
  if (typeof record.used !== "number" || !Number.isFinite(record.used)) return null;

  let limit: number | null;
  if (record.limit === null) {
    limit = null;
  } else if (typeof record.limit === "number" && Number.isFinite(record.limit)) {
    limit = Math.max(0, Math.floor(record.limit));
  } else {
    return null;
  }

  let remaining: number | null;
  if (record.remaining === null) {
    remaining = null;
  } else if (typeof record.remaining === "number" && Number.isFinite(record.remaining)) {
    remaining = Math.max(0, Math.floor(record.remaining));
  } else {
    return null;
  }

  return {
    unlimited: record.unlimited,
    limit: record.unlimited ? null : (limit ?? FREE_RELEASE_LINK_LIMIT),
    used: Math.max(0, Math.floor(record.used)),
    remaining: record.unlimited ? null : (remaining ?? 0),
    canAdd: record.canAdd,
    enforcementEnabled: record.enforcementEnabled,
  };
}

export function parseLinkCapacity(value: unknown): ReleaseLinkCapacity | null {
  return parseLinkAllowance(value);
}

/** Max draft links for free artists. null = unlimited. */
export function maxSelectableLinks(args: {
  unlimited: boolean;
  limit: number | null;
  usedOnRelease?: number;
}): number | null {
  if (args.unlimited) return null;
  const limit = args.limit ?? FREE_RELEASE_LINK_LIMIT;
  const used = Math.max(0, args.usedOnRelease ?? 0);
  // Create: usedOnRelease 0 → max 1. Edit over-limit: remaining slots for *new* = 0.
  return Math.max(0, limit - used);
}

/**
 * Draft-time Add control for free artists.
 * Uses the proposed final draft count — not only persisted server `used`.
 * `unlimited === true` → always allow. Otherwise require draftCount < free limit (default 1).
 * When entitlement is still unknown (`unlimited` null/undefined), fail closed to the free cap.
 */
export function canAddLinkToDraft(args: {
  unlimited?: boolean | null;
  draftCount: number;
  limit?: number | null;
}): boolean {
  if (args.unlimited === true) return true;
  const limit = Math.max(0, Math.floor(args.limit ?? FREE_RELEASE_LINK_LIMIT));
  const draftCount = Math.max(0, Math.floor(args.draftCount));
  return draftCount < limit;
}

function errorBodyString(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  if (typeof (error as { responseBody?: unknown }).responseBody === "string") {
    return (error as { responseBody: string }).responseBody;
  }
  if (typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "";
}

export function isFreeLinkLimitReachedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status !== 403) return false;
  const body = errorBodyString(error);
  if (body.includes(FREE_LINK_LIMIT_REACHED_CODE)) return true;
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return parsed?.code === FREE_LINK_LIMIT_REACHED_CODE;
  } catch {
    return false;
  }
}

export function isPaidLinkTypeRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status !== 403) return false;
  const body = errorBodyString(error);
  if (body.includes(PAID_LINK_TYPE_REQUIRED_CODE)) return true;
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return parsed?.code === PAID_LINK_TYPE_REQUIRED_CODE;
  } catch {
    return false;
  }
}

export function isInvalidReleaseLinkTypeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status !== 400) return false;
  const body = errorBodyString(error);
  if (body.includes(INVALID_RELEASE_LINK_TYPE_CODE)) return true;
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return parsed?.code === INVALID_RELEASE_LINK_TYPE_CODE;
  } catch {
    return false;
  }
}

export function linkErrorToastFromCode(code: unknown): {
  title: string;
  body: string;
} | null {
  if (code === FREE_LINK_LIMIT_REACHED_CODE) return LINK_LIMIT_TOAST;
  if (code === PAID_LINK_TYPE_REQUIRED_CODE) return PAID_LINK_TYPE_TOAST;
  if (code === INVALID_RELEASE_LINK_TYPE_CODE) return INVALID_RELEASE_LINK_TYPE_TOAST;
  return null;
}
