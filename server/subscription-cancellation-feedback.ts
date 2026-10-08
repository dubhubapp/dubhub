/**
 * Optional Artist Tools cancellation feedback body.
 * Stored through the existing feedback_submissions insert. Does not read or
 * write subscription snapshots.
 */

import { INPUT_LIMITS } from "@shared/input-limits";

export const SUBSCRIPTION_CANCELLATION_CATEGORY = "subscription_cancellation" as const;

export const SUBSCRIPTION_CANCELLATION_REASONS = [
  "too_expensive",
  "not_using_enough",
  "missing_features",
  "app_trouble",
  "taking_break",
  "other",
] as const;

export type SubscriptionCancellationReason =
  (typeof SUBSCRIPTION_CANCELLATION_REASONS)[number];

const REASON_SET = new Set<string>(SUBSCRIPTION_CANCELLATION_REASONS);

export function isSubscriptionCancellationCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return (
    normalized === SUBSCRIPTION_CANCELLATION_CATEGORY ||
    normalized === "subscription cancellation"
  );
}

export function buildSubscriptionCancellationFeedbackBody(
  reason: SubscriptionCancellationReason,
  note: string,
): string {
  if (!note) return `Reason: ${reason}`;
  return `Reason: ${reason}\nNote: ${note}`;
}

export type SubscriptionCancellationFeedbackResolution =
  | { ok: true; reason: SubscriptionCancellationReason; body: string }
  | { ok: false; message: string };

/**
 * Allowlisted reason codes only. A note with no reason is stored as `other`.
 * Empty reason and empty note is rejected. Client free-text is never used as
 * the reason.
 */
export function resolveSubscriptionCancellationFeedback(input: {
  reason: unknown;
  note: unknown;
}): SubscriptionCancellationFeedbackResolution {
  if (input.reason != null && input.reason !== "" && typeof input.reason !== "string") {
    return { ok: false, message: "Invalid cancellation reason" };
  }
  if (input.note != null && typeof input.note !== "string") {
    return { ok: false, message: "Invalid cancellation note" };
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";
  const reasonRaw = typeof input.reason === "string" ? input.reason.trim().toLowerCase() : "";

  let reason: SubscriptionCancellationReason | null = null;
  if (reasonRaw) {
    if (!REASON_SET.has(reasonRaw)) {
      return { ok: false, message: "Invalid cancellation reason" };
    }
    reason = reasonRaw as SubscriptionCancellationReason;
  } else if (note) {
    reason = "other";
  } else {
    return { ok: false, message: "Feedback cannot be empty" };
  }

  const body = buildSubscriptionCancellationFeedbackBody(reason, note);
  if (body.length > INPUT_LIMITS.feedbackBody) {
    return {
      ok: false,
      message: `Feedback must be at most ${INPUT_LIMITS.feedbackBody} characters`,
    };
  }

  return { ok: true, reason, body };
}
