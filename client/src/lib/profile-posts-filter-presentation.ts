/**
 * Profile Posts/Likes identification filter — presentation only.
 * Mirrors Leaderboard/Releases secondary underline language without importing those modules.
 * Non-sticky. Filter semantics live in user-profile / profile-identification-filter.
 *
 * Equal flex-1 columns; active underline is column-inset on the button (Releases secondary).
 *
 * PROFILE-SECONDARY-NAV-1/2: shared top rhythm + shared row height for Overview / Posts / Likes.
 */

/**
 * Shared top inset beneath primary Profile tabs for Overview / Posts / Likes secondary rows.
 * Replaces prior per-panel `mt-5` / `mt-2.5` / `mt-6` so swipe panels share one baseline.
 * `mt-2` = 8px (tighter than Overview/Likes; near prior Posts).
 */
export const PROFILE_SECONDARY_ROW_TOP_CLASS = "mt-2" as const;

/**
 * Shared secondary label row geometry (PROFILE-SECONDARY-NAV-2).
 * `min-h-11` (44px) + `items-center` so Overview “Community Activity” and
 * Posts/Likes “All / Identified / Unidentified” share one label baseline.
 * Underlines must stay `absolute` on the control — never inflate label offset.
 */
export const PROFILE_SECONDARY_ROW_CLASS =
  "mb-3 flex w-full min-h-11 items-center" as const;

/** Posts/Likes filter tablist — same shell as Overview secondary row. */
export const PROFILE_POSTS_FILTER_ROW_CLASS = PROFILE_SECONDARY_ROW_CLASS;

export const PROFILE_POSTS_FILTER_TAB_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-0.5 text-center text-[12px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:text-[13px]" as const;

/**
 * Active underline on the button — column-based inset, absolutely pinned to the
 * row bottom so it does not shift the centred label.
 */
export const PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS =
  "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#0a83ff]" as const;

export const PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS =
  "font-medium text-white/55 hover:text-white/80" as const;

export const PROFILE_POSTS_FILTER_LABEL_CLASS =
  "max-w-full truncate text-center leading-tight" as const;
