/**
 * Artist Overview metric mode selector — presentation only.
 * Artist Impact / Community Activity liquid-glass capsule (not Posts/Likes filters).
 * Tap-only local state; does not participate in profile primary-tab swipe.
 */

/** Full-width glass track — same 24px content box as primary nav / pager panel. */
export const PROFILE_METRIC_SELECTOR_TRACK_CLASS =
  "flex w-full min-h-11 items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" as const;

/**
 * Equal-width segment hit target inside the track.
 * Keep `button` + `role="tab"` at the call site so pager interactive exclusion stays intact.
 */
export const PROFILE_METRIC_SELECTOR_SEGMENT_CLASS =
  "ios-press relative flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-full px-2 text-center text-[12px] font-medium leading-tight transition-[color,background-color,box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:text-[13px]" as const;

/** Brighter ice-glass platter — no solid #0a83ff CTA fill. */
export const PROFILE_METRIC_SELECTOR_ACTIVE_CLASS =
  "bg-gradient-to-b from-white/[0.16] to-white/[0.06] font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28),inset_0_-0.5px_0_0_rgba(0,0,0,0.35)]" as const;

export const PROFILE_METRIC_SELECTOR_INACTIVE_CLASS =
  "bg-transparent font-medium text-white/55 hover:text-white/80" as const;

/** Gap from metric selector → first section heading (both modes). */
export const PROFILE_OVERVIEW_AFTER_SELECTOR_CLASS = "mb-3" as const;

/**
 * Shared post-selector / Overview metric section heading row.
 * `min-h-11` so Artist “Your Impact” and Community “Your Activity” share one baseline.
 */
export const PROFILE_OVERVIEW_METRIC_HEADING_CLASS =
  "mb-3 flex w-full min-h-11 items-center" as const;
