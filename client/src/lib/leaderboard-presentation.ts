/**
 * Presentation helpers for the Leaderboard tab.
 * Scope/timeframe query behaviour stays in the page — this file is display/state-shape only.
 */

import { useLayoutEffect, useState, type RefObject } from "react";
import type { TrustLevelInfo } from "@shared/trust-level";
import {
  APP_MATERIAL_AUTH_STICKY_CLASS,
  APP_MATERIAL_AUTH_STICKY_FADE_CLASS,
} from "@/lib/app-material";
import {
  STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS,
  STICKY_TAB_CHROME_CLASS,
  STICKY_TAB_CONTENT_TOP_GAP_CLASS,
  STICKY_TAB_PRIMARY_ROW_CLASS,
} from "@/lib/sticky-tab-chrome";

export type LeaderboardScope = "users" | "artists";
export type LeaderboardTimeFilter = "month" | "year" | "all";

export const LEADERBOARD_TOP_LIMIT = 100 as const;

/**
 * First-route-paint row cap (LG-NAV-5A4).
 * Rows are ~64px (py-3 + 40px avatar). After sticky chrome + prize, a tall phone
 * shows ~8–10 rows. 16 rows fills the first screen with room below the fold so
 * expansion cannot pop into the current viewport.
 */
export const LEADERBOARD_INITIAL_PAINT_ROWS = 16 as const;

/** How many real rows to commit before the first-paint release. */
export function leaderboardFirstPaintRowCount(
  totalRows: number,
  firstPaintReleased: boolean,
): number {
  if (firstPaintReleased || totalRows <= LEADERBOARD_INITIAL_PAINT_ROWS) {
    return totalRows;
  }
  return LEADERBOARD_INITIAL_PAINT_ROWS;
}

export function leaderboardShouldPaintOutsideTop(
  totalRows: number,
  firstPaintReleased: boolean,
): boolean {
  return firstPaintReleased || totalRows <= LEADERBOARD_INITIAL_PAINT_ROWS;
}

export function leaderboardFirstPaintSlice<T>(
  rows: readonly T[],
  firstPaintReleased: boolean,
): T[] {
  return rows.slice(0, leaderboardFirstPaintRowCount(rows.length, firstPaintReleased));
}

/**
 * After the first real-row commit, wait two animation frames (and any early
 * scroll) before allowing the full list. Not a timeout; not gated on network.
 */
export function useLeaderboardFirstPaintRelease(
  hasLoadedRows: boolean,
  scrollRootRef?: RefObject<HTMLElement | null> | RefObject<HTMLDivElement | null>,
): boolean {
  const [released, setReleased] = useState(false);

  useLayoutEffect(() => {
    if (!hasLoadedRows || released) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setReleased(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [hasLoadedRows, released]);

  useLayoutEffect(() => {
    if (!hasLoadedRows || released) return;
    const root = scrollRootRef?.current;
    if (!root) return;
    const onScroll = () => setReleased(true);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [hasLoadedRows, released, scrollRootRef]);

  return released;
}

export const LEADERBOARD_TIME_FILTERS: readonly {
  value: LeaderboardTimeFilter;
  label: string;
  testId: string;
}[] = [
  { value: "month", label: "This Month", testId: "filter-month" },
  { value: "year", label: "This Year", testId: "filter-year" },
  { value: "all", label: "All Time", testId: "filter-all" },
] as const;

/** Sticky chrome — shared rhythm + authenticated premium sticky wash (C5B). */
export const LEADERBOARD_STICKY_CHROME_CLASS =
  `${STICKY_TAB_CHROME_CLASS} ${APP_MATERIAL_AUTH_STICKY_CLASS}` as const;

/**
 * Overlay under sticky chrome: same blur as header, low fill alpha, ~48px tall,
 * gradient-masked so the blur itself dissolves (not a colour-only stripe).
 * Does not affect document flow / prize position.
 * Shared constant — Releases reuses the same class for bottom-nav parity.
 */
export const LEADERBOARD_STICKY_FADE_CLASS =
  `${STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS} ${APP_MATERIAL_AUTH_STICKY_FADE_CLASS}` as const;

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
/** Generic selection underline — approved interactive blue (not teal accent). */
export const LEADERBOARD_PRIMARY_INDICATOR_CLASS =
  "after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[#0a83ff]" as const;

/** Secondary timeframe tabs — same underline language as Releases secondary views. */
export const LEADERBOARD_SECONDARY_ROW_CLASS = "flex min-h-11 items-end" as const;
export const LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-0.5 text-[13px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" as const;
export const LEADERBOARD_SECONDARY_ACTIVE_CLASS =
  "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#0a83ff]" as const;
export const LEADERBOARD_SECONDARY_INACTIVE_CLASS =
  "font-medium text-white/55 hover:text-white/80" as const;

/** Flat ranking row — no per-entry glass card shell. */
export const LEADERBOARD_ROW_BASE_CLASS =
  "flex items-center gap-3 px-1 py-3 transition-colors" as const;
/**
 * Current-user row chrome — intentionally empty (C5B.2).
 * Orientation is the `You` pill only; no wash/ring/border.
 */
export const LEADERBOARD_ROW_CURRENT_CLASS = "" as const;
export const LEADERBOARD_LIST_CLASS = "divide-y divide-white/[0.08]" as const;
/**
 * Prize + list body enter classes.
 * Empty on purpose (LG-NAV-5A2a): a remount-keyed `fade-in-0 duration-200` wrapper
 * started every `/leaderboard` route paint — and every Community/Artists / timeframe
 * remount — at opacity 0 for ~200ms. First route paint must be full opacity;
 * skipping the in-page fade is simpler than first-paint bookkeeping for a minor animation.
 */
export const LEADERBOARD_BODY_ENTER_CLASS = "" as const;

/** Viewport-filling skeleton rows — enough contrast on the dark canvas (not 100-row list). */
export const LEADERBOARD_SKELETON_ROW_COUNT = 8 as const;
/** Loading bones — `white/5` is invisible on the navy canvas; /15 reads as structure. */
export const LEADERBOARD_SKELETON_BONE_CLASS = "animate-pulse rounded bg-white/15" as const;
/** Current-user "You" chip — restrained interactive blue. */
export const LEADERBOARD_YOU_PILL_CLASS =
  "inline-flex shrink-0 items-center rounded-full bg-[#0a83ff] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white" as const;
/**
 * Score column — right-aligned with inset matching left rank comfort (C5B.1).
 * `pr-3` balances page `px-4` + row `px-1` optical weight vs the w-10 rank slot.
 */
export const LEADERBOARD_SCORE_COLUMN_CLASS =
  "w-[68px] shrink-0 pr-3 text-right" as const;

/** Singular/plural unit for confirmed-ID scores (presentation only). */
export function leaderboardIdsUnitLabel(count: number): "ID" | "IDs" {
  return count === 1 ? "ID" : "IDs";
}

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
