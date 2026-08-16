/**
 * Presentation helpers for the Leaderboard tab.
 * Scope/timeframe query behaviour stays in the page — this file is display/state-shape only.
 */

import type { TrustLevelInfo } from "@shared/trust-level";
import {
  STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS,
  STICKY_TAB_CHROME_CLASS,
  STICKY_TAB_CONTENT_TOP_GAP_CLASS,
  STICKY_TAB_PRIMARY_ROW_CLASS,
} from "@/lib/sticky-tab-chrome";

export type LeaderboardScope = "users" | "artists";
export type LeaderboardTimeFilter = "month" | "year" | "all";

export const LEADERBOARD_TOP_LIMIT = 100 as const;

export const LEADERBOARD_TIME_FILTERS: readonly {
  value: LeaderboardTimeFilter;
  label: string;
  testId: string;
}[] = [
  { value: "month", label: "This Month", testId: "filter-month" },
  { value: "year", label: "This Year", testId: "filter-year" },
  { value: "all", label: "All Time", testId: "filter-all" },
] as const;

/** Sticky chrome — shared rhythm with Releases (geometry frozen). */
export const LEADERBOARD_STICKY_CHROME_CLASS = STICKY_TAB_CHROME_CLASS;

/**
 * Overlay under sticky chrome: same blur as header, low fill alpha, ~48px tall,
 * gradient-masked so the blur itself dissolves (not a colour-only stripe).
 * Does not affect document flow / prize position.
 * Shared constant — Releases reuses the same class for bottom-nav parity.
 */
export const LEADERBOARD_STICKY_FADE_CLASS = STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS;

export const LEADERBOARD_CONTENT_TOP_GAP_CLASS = STICKY_TAB_CONTENT_TOP_GAP_CLASS;

/**
 * Prize block spacing — top clears sticky fade enough for the full glow;
 * bottom keeps breathing room before #1. Optical balance around the glow, not the border alone.
 */
export const LEADERBOARD_PRIZE_SECTION_CLASS = "relative mt-3 mb-4" as const;

/** Primary Community/Artists — same text-led language as Releases My/Saved. */
export const LEADERBOARD_PRIMARY_ROW_CLASS = STICKY_TAB_PRIMARY_ROW_CLASS;
export const LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-none border-0 bg-transparent px-1 text-[15px] leading-tight shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=active]:bg-transparent data-[state=active]:shadow-none" as const;
export const LEADERBOARD_PRIMARY_ACTIVE_CLASS =
  "font-semibold text-foreground" as const;
export const LEADERBOARD_PRIMARY_INACTIVE_CLASS =
  "font-medium text-white/55 hover:text-white/80" as const;
export const LEADERBOARD_PRIMARY_LABEL_CLASS =
  "relative inline-block whitespace-nowrap px-0.5 pb-[5px]" as const;
export const LEADERBOARD_PRIMARY_INDICATOR_CLASS =
  "after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-accent" as const;

/** Secondary timeframe tabs — same underline language as Releases secondary views. */
export const LEADERBOARD_SECONDARY_ROW_CLASS = "flex min-h-11 items-end" as const;
export const LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-0.5 text-[13px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" as const;
export const LEADERBOARD_SECONDARY_ACTIVE_CLASS =
  "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" as const;
export const LEADERBOARD_SECONDARY_INACTIVE_CLASS =
  "font-medium text-white/55 hover:text-white/80" as const;

/** Flat ranking row — no per-entry glass card shell. */
export const LEADERBOARD_ROW_BASE_CLASS =
  "flex items-center gap-3 px-1 py-3 transition-colors" as const;
export const LEADERBOARD_ROW_CURRENT_CLASS = "rounded-lg bg-primary/[0.08]" as const;
export const LEADERBOARD_LIST_CLASS = "divide-y divide-white/10" as const;
export const LEADERBOARD_SCORE_COLUMN_CLASS = "w-[68px] shrink-0 text-right" as const;

/** Lifted neutral track — recessive empty portion with clear fill separation. */
export const LEADERBOARD_REP_TRACK_CLASS =
  "h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07] ring-1 ring-inset ring-white/[0.04]" as const;
/** Soft top sheen on fill — depth without neon glow. */
export const LEADERBOARD_REP_FILL_CLASS =
  "h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-[width] duration-300 ease-out motion-reduce:transition-none" as const;

/**
 * Existing visual floor: any non-zero tier progress paints at least ~14% / 18px.
 * Preserved in this slice — do not change without a separate product decision.
 */
export const LEADERBOARD_REP_VISIBLE_FLOOR_PCT = 14 as const;
export const LEADERBOARD_REP_MIN_WIDTH_PX = 18 as const;

export function leaderboardUsersQueryKey(timeFilter: LeaderboardTimeFilter) {
  return ["/api/leaderboard/users", timeFilter] as const;
}

export function leaderboardArtistsQueryKey(timeFilter: LeaderboardTimeFilter) {
  return ["/api/leaderboard/artists", timeFilter] as const;
}

export function leaderboardUsersMyRankQueryKey(
  currentUserId: string | undefined,
  timeFilter: LeaderboardTimeFilter,
) {
  return ["/api/leaderboard/users/my-rank", currentUserId, timeFilter] as const;
}

export function leaderboardArtistsMyRankQueryKey(
  currentUserId: string | undefined,
  timeFilter: LeaderboardTimeFilter,
) {
  return ["/api/leaderboard/artists/my-rank", currentUserId, timeFilter] as const;
}

/** Maps deriveTrustLevel progressPct → painted width %, preserving the visual floor. */
export function leaderboardVisibleProgressPct(levelProgress: number): number {
  const clamped = Math.min(
    100,
    Math.max(0, Number.isFinite(levelProgress) ? levelProgress : 0),
  );
  return clamped > 0 ? Math.max(clamped, LEADERBOARD_REP_VISIBLE_FLOOR_PCT) : 0;
}

export function leaderboardRepProgressAriaValueText(trust: TrustLevelInfo): string {
  const pct = Math.round(
    Math.min(100, Math.max(0, Number.isFinite(trust.progressPct) ? trust.progressPct : 0)),
  );
  if (trust.isTopTier || !trust.nextDisplayName) {
    return `${pct}% progress within ${trust.displayName}`;
  }
  return `${pct}% progress toward ${trust.nextDisplayName}`;
}
