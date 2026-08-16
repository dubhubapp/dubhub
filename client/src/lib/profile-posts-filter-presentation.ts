/**
 * Profile Posts tab secondary filter — presentation only.
 * Mirrors Leaderboard/Releases secondary underline language without importing those modules.
 * Non-sticky. Filter semantics live in user-profile.tsx.
 */

export const PROFILE_POSTS_FILTER_ROW_CLASS = "mb-3 flex min-h-11 items-end" as const;

export const PROFILE_POSTS_FILTER_TAB_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-0.5 text-[12px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:text-[13px]" as const;

/** Active underline sits on the label span (label-width), not a full-column bar. */
export const PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS =
  "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-accent" as const;

export const PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS =
  "font-medium text-white/55 hover:text-white/80" as const;

export const PROFILE_POSTS_FILTER_LABEL_CLASS =
  "relative inline-block max-w-full truncate px-0.5 pb-[5px]" as const;
