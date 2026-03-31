/**
 * Canonical report / moderation reason labels (user reports + moderator Remove & Moderate).
 * Keep in sync with user-facing report UI.
 */
export const MODERATION_REPORT_REASONS = [
  "Sexual or graphic content",
  "Violent or disturbing content",
  "Non-music content",
  "Copyright / stolen content",
  "Spam / advertising",
  "Harassment / hate speech",
  "False or misleading track ID",
  "Impersonation",
  "Other",
] as const;

export type ModerationReportReasonLabel = (typeof MODERATION_REPORT_REASONS)[number];

export const MODERATION_REPORT_REASON_SET = new Set<string>(MODERATION_REPORT_REASONS);

/** Max length for composed moderationReason sent to the API. */
export const MODERATION_REASON_MAX_LENGTH = 500;

/** Map stored report reason to dropdown value + optional "Other" notes. */
export function defaultModerationReasonSelection(originalReason: string): {
  category: string;
  otherNotes: string;
} {
  const trimmed = (originalReason || "").trim();
  if (MODERATION_REPORT_REASON_SET.has(trimmed)) {
    return { category: trimmed, otherNotes: "" };
  }
  if (!trimmed) {
    return { category: "Other", otherNotes: "" };
  }
  return { category: "Other", otherNotes: trimmed };
}

/** Build the string persisted on the report, in logs, and in user notifications. */
export function buildModerationReasonForSubmit(category: string, otherNotes: string): string {
  const cat = (category || "").trim();
  const notes = (otherNotes || "").trim();
  if (cat === "Other") {
    if (notes) return `Other: ${notes}`.slice(0, MODERATION_REASON_MAX_LENGTH);
    return "Other";
  }
  if (cat) return cat.slice(0, MODERATION_REASON_MAX_LENGTH);
  return "Community guidelines violation".slice(0, MODERATION_REASON_MAX_LENGTH);
}
