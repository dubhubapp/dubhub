/**
 * Visual prominence for Create/Edit capacity notices.
 * Does not change entitlement checks — presentation only.
 */

export type LimitNoticeProminence = "hidden" | "quiet" | "prominent";

/** Free quotas: hide when unlimited; glass card only at/over limit. */
export function resolveFreeQuotaNoticeProminence(args: {
  unlimited: boolean;
  used: number;
  limit: number;
}): LimitNoticeProminence {
  if (args.unlimited) return "hidden";
  const used = Math.max(0, Math.floor(args.used));
  const limit = Math.max(0, Math.floor(args.limit));
  if (used >= limit) return "prominent";
  return "quiet";
}

/** Creation capacity: hide paid/unlimited; emphasize only when blocked. */
export function resolveCreationCapacityNoticeProminence(args: {
  unlimited: boolean;
  canCreate: boolean;
  remaining: number;
}): LimitNoticeProminence {
  if (args.unlimited) return "hidden";
  if (!args.canCreate || args.remaining <= 0) return "prominent";
  return "quiet";
}

/**
 * Attachment free quota: hide when unlimited or plenty of room;
 * quiet near limit; prominent at/over limit or when upgrade CTA is active.
 */
export function resolveAttachmentLimitNoticeProminence(args: {
  unlimited: boolean;
  usedOrSelected: number;
  limit: number;
  showUpgradeCta?: boolean;
}): LimitNoticeProminence {
  if (args.unlimited) return "hidden";
  const used = Math.max(0, Math.floor(args.usedOrSelected));
  const limit = Math.max(0, Math.floor(args.limit));
  if (args.showUpgradeCta || used >= limit) return "prominent";
  if (limit > 0 && used >= Math.max(1, limit - 1)) return "quiet";
  return "hidden";
}
