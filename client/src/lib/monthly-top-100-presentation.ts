/**
 * PROFILE-REFINEMENT — Monthly Top 100 / 100 Club / Best Monthly Rank presentation.
 */

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Locked vinyl “100” mark viewBox — includes ≥2.5u padding; never tight-crop. */
export const HUNDRED_CLUB_MARK_VIEWBOX = "0 0 56 32" as const;

export type HundredClubMarkSize = "md" | "sm" | "micro";

/**
 * Premium ice-glass achievement chrome — cooler/brighter than joined-date pills.
 * Never gold (verified), never You/mod blue.
 */
export const MONTHLY_TOP_100_BADGE_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-full border border-white/35 bg-gradient-to-b from-white/[0.16] to-white/[0.06] font-semibold text-white/90 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28),inset_0_-0.5px_0_0_rgba(0,0,0,0.35)]" as const;

/** Profile: optical pad — slightly more trailing space so “Club” balances the vinyl mass. */
export const MONTHLY_TOP_100_BADGE_PROFILE_CLASS =
  `${MONTHLY_TOP_100_BADGE_BASE_CLASS} gap-[3px] py-[3px] pl-[5px] pr-[9px] text-xs leading-none` as const;

export const MONTHLY_TOP_100_BADGE_POPUP_CLASS =
  `${MONTHLY_TOP_100_BADGE_BASE_CLASS} gap-[2px] py-[2px] pl-[4px] pr-[7px] text-[10px] leading-none` as const;

/** Leaderboard: compact ice chip in the username identity cluster. */
export const MONTHLY_TOP_100_BADGE_LEADERBOARD_CLASS =
  `${MONTHLY_TOP_100_BADGE_BASE_CLASS} gap-[2px] py-[2px] pl-[4px] pr-[7px] text-[10px] leading-none` as const;

/** Label optical nudge — sits with the icon as one centered unit. */
export const MONTHLY_TOP_100_BADGE_LABEL_CLASS =
  "whitespace-nowrap leading-none tracking-tight text-white/88 translate-y-[0.5px]" as const;

/** Accessible name — visible copy is icon + “Club”. */
export const MONTHLY_TOP_100_ACHIEVEMENT_A11Y_LABEL =
  "100 Club — monthly Top 100 achievement" as const;

export const BEST_MONTHLY_RANK_POPOVER_TITLE = "Best monthly finish" as const;

export type MonthlyTop100BadgeContext = "profile" | "popup" | "leaderboard";

/** Visible label beside the vinyl mark — always “Club”. */
export function monthlyTop100BadgeLabel(
  _context: MonthlyTop100BadgeContext,
): string {
  return "Club";
}

export function monthlyTop100MarkSize(
  context: MonthlyTop100BadgeContext,
): HundredClubMarkSize {
  if (context === "leaderboard") return "micro";
  if (context === "popup") return "sm";
  return "md";
}

/**
 * Deterministic year-month display from `YYYY-MM` (no Date timezone shift).
 * Example: `"2026-08"` → `"Aug ’26"`.
 */
export function formatBestMonthlyRankMonth(
  yearMonth: string | null | undefined,
): string | null {
  if (yearMonth == null) return null;
  const trimmed = String(yearMonth).trim();
  const m = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null;
  const mon = MONTH_ABBREVIATIONS[monthIndex];
  const yy = String(year).slice(-2);
  return `${mon} ’${yy}`;
}

/** Primary Best Monthly Rank value: `#3` or `—`. */
export function formatBestMonthlyRankValue(
  rank: number | null | undefined,
): string {
  if (rank == null) return "—";
  const n = Number(rank);
  if (!Number.isFinite(n) || n < 1) return "—";
  return `#${Math.floor(n)}`;
}

/**
 * Compact public-header label: `Top Rank #3`, or null when no finished rank
 * (omit from header — do not show `—`).
 */
export function formatBestMonthlyRankHeaderLabel(
  rank: number | null | undefined,
): string | null {
  const value = formatBestMonthlyRankValue(rank);
  if (value === "—") return null;
  return `Top Rank ${value}`;
}

export function hasEarnedMonthlyTop100(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}
