/**
 * Presentation helpers for the Leaderboard tab.
 * Scope/timeframe query behaviour stays in the page — this file is display/state-shape only.
 */

import { useLayoutEffect, useState, type RefObject } from "react";
import type { TrustLevelInfo } from "@shared/trust-level";
import { APP_PAGE_SCROLL_CLASS } from "@/lib/app-shell-layout";
import {
  STICKY_TAB_PRIMARY_ROW_CLASS,
} from "@/lib/sticky-tab-chrome";

/**
 * Leaderboard page scroller: shared APP_PAGE_SCROLL + overflow-anchor none.
 * Scope changes collapse large panel height and intentionally scroll to top;
 * default Safari anchoring can leave blank extent or jump after collapse.
 * Leaderboard-only — does not modify APP_PAGE_SCROLL_CLASS / Home.
 */
export const LEADERBOARD_PAGE_SCROLL_CLASS =
  `${APP_PAGE_SCROLL_CLASS} [overflow-anchor:none]` as const;

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

/**
 * Leaderboard-only sticky chrome for branded reward hero.
 * Top: transparent over artwork. Scrolled glass via `data-lb-sticky-glass` + CSS
 * (`.dubhub-lb-sticky-chrome` in index.css). Does NOT modify shared Releases sticky.
 */
export const LEADERBOARD_STICKY_CHROME_CLASS =
  "dubhub-lb-sticky-chrome relative sticky top-0 z-30 -mx-4 bg-transparent px-4 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] pb-1 [text-shadow:0_1px_2px_rgba(0,0,0,0.94),0_2px_18px_rgba(15,19,36,0.94)]" as const;

/**
 * Under-chrome dissolve — inert at top (h-0); glass state expands via CSS
 * when sticky has `data-lb-sticky-glass="true"`.
 */
export const LEADERBOARD_STICKY_FADE_CLASS =
  "dubhub-lb-sticky-fade pointer-events-none absolute inset-x-0 top-full h-0 overflow-hidden" as const;

/**
 * Gap between hero and pager list — tight on purpose after taller hero
 * (LEADERBOARD-REWARD-HERO-4). Shared Releases still uses {@link STICKY_TAB_CONTENT_TOP_GAP_CLASS}.
 */
export const LEADERBOARD_CONTENT_TOP_GAP_CLASS = "pt-0" as const;

/**
 * Sticky chrome content height below safe-area inset (primary + secondary rows + padding).
 * Used to pull the reward hero under floating tabs without changing shell bleed.
 * HERO-11: 6rem matches real row stack (was 5.75rem → ~4px under-pull).
 */
export const LEADERBOARD_STICKY_CHROME_BODY_OFFSET = "6rem" as const;

/**
 * Proven pull-under distance: safe-area + sticky pt (0.25rem) + body offset (6rem).
 * Owned by heroViewport only (HERO-20/22) — not added into stage min-height.
 */
export const LEADERBOARD_REWARD_HERO_UNDER_STICKY_PULL =
  "calc(env(safe-area-inset-top,0px)+0.25rem+6rem)" as const;

/**
 * Reward hero shell — vertical pull lives on heroViewport (HERO-20).
 * Horizontal full-bleed is owned by heroViewport (HERO-19).
 */
export const LEADERBOARD_PRIZE_SECTION_CLASS = "relative mb-1.5" as const;

/**
 * Controlled hero media stage — true ~top-third media (HERO-18 / HERO-22).
 * No sticky/safe height compensation: pull-under is viewport margin only, so the
 * stage itself stays ~34dvh and the composition ends earlier on screen.
 */
export const LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS =
  "relative w-full min-h-[clamp(12rem,34dvh,20rem)] overflow-hidden" as const;

/**
 * Supplied reward poster — absolute cover fill with generic top-biased crop.
 * Fills the shallow stage; landscape sources need milder width crop than tall heroes.
 * Interchangeable month-to-month; no campaign-specific crop assumptions.
 */
export const LEADERBOARD_REWARD_HERO_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 z-0 h-full w-full max-w-none select-none object-cover object-[center_22%]" as const;

/**
 * Top readability scrim — status bar + primary + secondary tabs, then quick feather.
 * Holds meaningful opacity through secondary row (HERO-11); not a navbar bar.
 */
export const LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS =
  "pointer-events-none absolute inset-x-0 top-0 z-[2] h-[calc(env(safe-area-inset-top,0px)+6.5rem)] bg-[linear-gradient(to_bottom,rgba(15,19,36,0.74)_0%,rgba(15,19,36,0.58)_35%,rgba(15,19,36,0.5)_72%,rgba(15,19,36,0.22)_90%,transparent_100%)]" as const;

/**
 * Lower fade on shorter stage (HERO-18) — starts ~58% so pixels remain under the
 * wash; continuous into navy at stage bottom. No bitmap-edge seam.
 */
export const LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS =
  "pointer-events-none absolute inset-x-0 top-[58%] bottom-0 z-[1]" as const;

/** @deprecated Prefer {@link LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS}. */
export const LEADERBOARD_REWARD_HERO_FADE_EXTENSION_CLASS =
  LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS;

/**
 * Metadata wrap — overlaps lower fade on the shortened stage (HERO-18).
 */
export const LEADERBOARD_REWARD_HERO_META_WRAP_CLASS =
  "relative z-[3] -mt-[clamp(4.5rem,16vw,7.25rem)] pb-1" as const;

/** Metadata column in the overlap zone. */
export const LEADERBOARD_REWARD_HERO_META_CLASS =
  "relative z-[1] mx-auto flex w-full max-w-[22rem] flex-col items-center gap-1.5 px-5 text-center" as const;

/**
 * Soft radial scrim behind metadata — type contrast only, not a card.
 * HERO-11: reduced peak + slightly lower center (lower fade owns hero darkening).
 */
export const LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS =
  "pointer-events-none absolute left-1/2 top-[54%] h-[11rem] w-[min(100%,23rem)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(15,19,36,0.48)_0%,rgba(15,19,36,0.22)_55%,transparent_78%)]" as const;

/** 1px IO sentinel at hero end — sticky glass only (not pager geometry). */
export const LEADERBOARD_REWARD_HERO_SENTINEL_CLASS =
  "pointer-events-none h-px w-full shrink-0" as const;

/** Primary Community/Artists — same text-led language as Releases My/Saved. */
export const LEADERBOARD_PRIMARY_ROW_CLASS = STICKY_TAB_PRIMARY_ROW_CLASS;
export const LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-none border-0 bg-transparent px-1 text-[15px] leading-tight shadow-none [text-shadow:0_1px_2px_rgba(0,0,0,0.96),0_2px_16px_rgba(15,19,36,0.94)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=active]:bg-transparent data-[state=active]:shadow-none" as const;
/**
 * Active + inactive share `font-semibold` so swipe/tap commit never shifts glyph metrics.
 * Selection emphasis is colour/opacity only (classes here + pager colour lerp).
 */
export const LEADERBOARD_PRIMARY_ACTIVE_CLASS =
  "font-semibold text-foreground" as const;
/** Slightly stronger over busy hero art (HERO-6); glass state still owns scrolled contrast. */
export const LEADERBOARD_PRIMARY_INACTIVE_CLASS =
  "font-semibold text-white/72 hover:text-white/90" as const;
export const LEADERBOARD_PRIMARY_LABEL_CLASS =
  "relative inline-block whitespace-nowrap px-0.5 pb-[5px]" as const;
/**
 * Shared primary underline (LEADERBOARD-SWIPE-2).
 * Matches former per-label `after:h-[3px]` / `#0a83ff` / rounded-full / label-width.
 */
export const LEADERBOARD_PRIMARY_INDICATOR_CLASS =
  "pointer-events-none absolute z-[1] h-[3px] rounded-full bg-[#0a83ff]" as const;
/** Tap indicator morph when idle — same cadence as Releases secondary. */
export const LEADERBOARD_PRIMARY_INDICATOR_TAP_MS = 200 as const;
/** Tablist hosts the shared indicator (`relative`). */
export const LEADERBOARD_PRIMARY_TABLIST_CLASS =
  "relative flex h-auto w-full min-w-0 bg-transparent p-0" as const;

/** Secondary timeframe tabs — same underline language as Releases secondary views. */
export const LEADERBOARD_SECONDARY_ROW_CLASS = "flex min-h-11 items-end" as const;
export const LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-0.5 text-[13px] leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.98),0_2px_18px_rgba(15,19,36,0.98)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" as const;
export const LEADERBOARD_SECONDARY_ACTIVE_CLASS =
  "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#0a83ff]" as const;
export const LEADERBOARD_SECONDARY_INACTIVE_CLASS =
  "font-medium text-white/70 hover:text-white/88" as const;

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

/**
 * Confirmed-ID count value — same mono metrics as before, with OpenType `zero`
 * disabled so `0` uses a normal (unslashed) glyph. Count element only.
 */
export const LEADERBOARD_SCORE_VALUE_CLASS =
  "font-mono text-lg font-bold leading-none [font-feature-settings:'zero'_0]" as const;

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
