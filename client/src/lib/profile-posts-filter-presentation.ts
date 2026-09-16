/**
 * Profile Posts/Likes identification filter — presentation only.
 * Compact liquid-glass segmented control (lower hierarchy than Overview
 * Artist Impact / Community Activity). Filter semantics live in
 * user-profile / profile-identification-filter.
 *
 * Do NOT reuse Overview metric-selector classes 1:1 — quieter track, shorter
 * segments, softer active platter, no blue CTA fill, no underline.
 *
 * PROFILE-SECONDARY-NAV-1: shared top rhythm for Overview / Posts / Likes panels.
 */

/**
 * Shared top inset beneath primary Profile tabs for Overview / Posts / Likes.
 * `mt-2` = 8px.
 */
export const PROFILE_SECONDARY_ROW_TOP_CLASS = "mt-2" as const;

/**
 * Legacy secondary label-row shell (min-h-11). Kept for Overview spacing
 * contracts; Posts/Likes filters use {@link PROFILE_STATUS_FILTER_TRACK_CLASS}.
 */
export const PROFILE_SECONDARY_ROW_CLASS =
  "mb-3 flex w-full min-h-11 items-center" as const;

/**
 * Compact glass track — related to Overview metric selector but quieter:
 * shorter (min-h-9 vs min-h-11), softer fill (black/20 vs /30), tighter pad.
 */
export const PROFILE_STATUS_FILTER_TRACK_CLASS =
  "mb-3 flex w-full min-h-9 items-center gap-0.5 rounded-full border border-white/[0.08] bg-black/20 p-0.5 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]" as const;

/**
 * Equal-width segment hit target. Keep `button` + `role="tab"` at the call
 * site so pager interactive exclusion stays intact.
 */
export const PROFILE_STATUS_FILTER_SEGMENT_CLASS =
  "ios-press relative flex min-h-7 min-w-0 flex-1 items-center justify-center rounded-full px-1 text-center text-[11px] font-medium leading-tight transition-[color,background-color,box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:text-[12px]" as const;

/** Soft ice-glass platter — no solid #0a83ff / blue CTA fill, no ::after underline. */
export const PROFILE_STATUS_FILTER_ACTIVE_CLASS =
  "bg-gradient-to-b from-white/[0.11] to-white/[0.04] font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),inset_0_-0.5px_0_0_rgba(0,0,0,0.25)]" as const;

export const PROFILE_STATUS_FILTER_INACTIVE_CLASS =
  "bg-transparent font-medium text-white/55 hover:text-white/75" as const;

export const PROFILE_STATUS_FILTER_LABEL_CLASS =
  "max-w-full truncate text-center leading-tight" as const;

/** @deprecated Alias — prefer PROFILE_STATUS_FILTER_TRACK_CLASS. */
export const PROFILE_POSTS_FILTER_ROW_CLASS = PROFILE_STATUS_FILTER_TRACK_CLASS;

/** @deprecated Alias — prefer PROFILE_STATUS_FILTER_SEGMENT_CLASS. */
export const PROFILE_POSTS_FILTER_TAB_BASE_CLASS = PROFILE_STATUS_FILTER_SEGMENT_CLASS;

/** @deprecated Alias — prefer PROFILE_STATUS_FILTER_ACTIVE_CLASS. */
export const PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS = PROFILE_STATUS_FILTER_ACTIVE_CLASS;

/** @deprecated Alias — prefer PROFILE_STATUS_FILTER_INACTIVE_CLASS. */
export const PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS = PROFILE_STATUS_FILTER_INACTIVE_CLASS;

/** @deprecated Alias — prefer PROFILE_STATUS_FILTER_LABEL_CLASS. */
export const PROFILE_POSTS_FILTER_LABEL_CLASS = PROFILE_STATUS_FILTER_LABEL_CLASS;
