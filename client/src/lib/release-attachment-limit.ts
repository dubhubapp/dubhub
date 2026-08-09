/**
 * Free attachment limit copy and FREE_ATTACHMENT_LIMIT_REACHED detection.
 */

export const FREE_ATTACHMENT_LIMIT = 3 as const;
export const FREE_ATTACHMENT_LIMIT_REACHED_CODE = "FREE_ATTACHMENT_LIMIT_REACHED" as const;

export const ATTACHMENT_ALLOWANCE_QUERY_KEY = [
  "/api/artists/me/release-attachment-allowance",
] as const;

export function releaseAttachmentCapacityQueryKey(releaseId: string) {
  return ["/api/releases", releaseId, "attachment-capacity"] as const;
}

export type ReleaseAttachmentAllowance = {
  unlimited: boolean;
  limit: number;
};

export type ReleaseAttachmentCapacity = {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
  canAttachMore: boolean;
};

export const ATTACHMENT_LIMIT_TOAST = {
  title: "Attachment limit reached",
  body: "Free artists can attach up to 3 posts per release. Upgrade for unlimited attachments.",
} as const;

/** At-limit / default body when used <= limit. Title is always generated dynamically. */
export const ATTACHMENT_LIMIT_CARD_COPY = {
  body: "Free artists can attach up to 3 posts per release. Upgrade for unlimited attachments.",
  ctaLabel: "Upgrade",
  ctaHint: "Purchase options coming soon",
} as const;

export const ATTACHMENT_OVER_LIMIT_CARD_BODY =
  "Your existing attachments remain live. Remove one to return to your free allowance, or upgrade for unlimited attachments." as const;

export const ATTACHMENT_NEAR_LIMIT_HINT =
  "Free artists can attach up to 3 posts per release." as const;

export type AttachmentLimitCardCopy = {
  title: string;
  body: string;
};

/** Title always uses the real used count — never clamped to limit. */
export function formatAttachmentLimitTitle(used: number, limit: number): string {
  const safeUsed = Math.max(0, Math.floor(used));
  const safeLimit = Math.max(0, Math.floor(limit));
  return `${safeUsed} of ${safeLimit} free attachments used`;
}

/**
 * Capacity card title/body for free attachment limit UI.
 * Over-limit (used > limit) keeps the true used count and explains existing attachments stay live.
 */
export function resolveAttachmentLimitCardCopy(args: {
  used: number;
  limit: number;
}): AttachmentLimitCardCopy {
  const used = Math.max(0, Math.floor(args.used));
  const limit = Math.max(0, Math.floor(args.limit));
  const title = formatAttachmentLimitTitle(used, limit);
  if (used > limit) {
    return { title, body: ATTACHMENT_OVER_LIMIT_CARD_BODY };
  }
  return { title, body: ATTACHMENT_LIMIT_CARD_COPY.body };
}

export function parseAttachmentAllowance(
  value: unknown,
): ReleaseAttachmentAllowance | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.unlimited !== "boolean") return null;
  if (typeof record.limit !== "number" || !Number.isFinite(record.limit)) return null;
  return {
    unlimited: record.unlimited,
    limit: Math.max(0, Math.floor(record.limit)),
  };
}

export function parseAttachmentCapacity(
  value: unknown,
): ReleaseAttachmentCapacity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.unlimited !== "boolean") return null;
  if (typeof record.used !== "number" || !Number.isFinite(record.used)) return null;
  if (typeof record.limit !== "number" || !Number.isFinite(record.limit)) return null;
  if (typeof record.remaining !== "number" || !Number.isFinite(record.remaining)) {
    return null;
  }
  if (typeof record.canAttachMore !== "boolean") return null;
  return {
    unlimited: record.unlimited,
    used: Math.max(0, Math.floor(record.used)),
    limit: Math.max(0, Math.floor(record.limit)),
    remaining: Math.max(0, Math.floor(record.remaining)),
    canAttachMore: record.canAttachMore,
  };
}

/** Max selectable attachments for free artists given already-committed used count. */
export function maxSelectableAttachments(args: {
  unlimited: boolean;
  limit: number;
  /** Already persisted on the release (0 on create). */
  usedOnRelease?: number;
}): number | null {
  if (args.unlimited) return null;
  const used = Math.max(0, args.usedOnRelease ?? 0);
  return Math.max(0, args.limit - used);
}

export function isFreeAttachmentLimitReachedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status !== 403) return false;

  const body =
    typeof (error as { responseBody?: unknown }).responseBody === "string"
      ? (error as { responseBody: string }).responseBody
      : typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";

  if (body.includes(FREE_ATTACHMENT_LIMIT_REACHED_CODE)) return true;
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return parsed?.code === FREE_ATTACHMENT_LIMIT_REACHED_CODE;
  } catch {
    return false;
  }
}
