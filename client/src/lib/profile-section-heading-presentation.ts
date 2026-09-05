/**
 * Own/public Profile section subheadings — icon + title alignment only.
 * Does not own copy, role logic, or section spacing outside the heading row.
 */

/** Icon + title (+ optional info) cluster. */
export const PROFILE_SECTION_HEADING_ROW_CLASS = "flex items-center gap-1.5" as const;

/** Fixed 16×16 Lucide slot — no optical translate/margin nudges. */
export const PROFILE_SECTION_HEADING_ICON_SLOT_CLASS =
  "inline-flex h-4 w-4 shrink-0 items-center justify-center" as const;

/** Line-box only. Callers keep existing font-size / font-weight. */
export const PROFILE_SECTION_HEADING_TEXT_CLASS = "leading-none" as const;
