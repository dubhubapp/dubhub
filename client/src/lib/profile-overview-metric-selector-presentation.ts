/**
 * Artist Overview metric mode selector — presentation only.
 * Artist Impact / Community Activity liquid-glass capsule (not Posts/Likes filters).
 * Tap-only local state; does not participate in profile primary-tab swipe.
 */

/** Full-width glass track — same 24px content box as primary nav / pager panel. */
export const PROFILE_METRIC_SELECTOR_TRACK_CLASS =
  "flex w-full min-h-11 items-center gap-1 rounded-full border border-[#DCE3EC] bg-[#EEF3FF] p-1 shadow-none dark:border-white/10 dark:bg-black/30 dark:backdrop-blur-md dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" as const;

/**
 * Equal-width segment hit target inside the track.
 * Keep `button` + `role="tab"` at the call site so pager interactive exclusion stays intact.
 */
export const PROFILE_METRIC_SELECTOR_SEGMENT_CLASS =
  "ios-press relative flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-full px-2 text-center text-[12px] font-medium leading-tight transition-[color,background-color,box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:text-[13px]" as const;

/** Brighter ice-glass platter — no solid #0a83ff CTA fill. */
export const PROFILE_METRIC_SELECTOR_ACTIVE_CLASS =
  "bg-white font-semibold text-[#101828] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_1px_rgba(16,24,40,0.06)] dark:bg-transparent dark:bg-gradient-to-b dark:from-white/[0.16] dark:to-white/[0.06] dark:font-semibold dark:text-white dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28),inset_0_-0.5px_0_0_rgba(0,0,0,0.35)]" as const;

export const PROFILE_METRIC_SELECTOR_INACTIVE_CLASS =
  "bg-transparent font-medium text-[#667085] hover:text-[#101828] dark:text-white/55 dark:hover:text-white/80" as const;

/** Gap from metric selector → first section heading (both modes). */
export const PROFILE_OVERVIEW_AFTER_SELECTOR_CLASS = "mb-3" as const;

/**
 * Shared post-selector / Overview metric section heading row.
 * `min-h-11` so Artist “Your Impact” and Community “Your Activity” share one baseline.
 */
export const PROFILE_OVERVIEW_METRIC_HEADING_CLASS =
  "mb-3 flex w-full min-h-11 items-center" as const;
