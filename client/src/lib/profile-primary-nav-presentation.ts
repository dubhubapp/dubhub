/**
 * Own-Profile primary sticky nav — presentation only.
 * Text + underline (stronger than Posts secondary). Preserves Profile safe-area
 * sticky *top offset* (not Leaderboard padding-top model).
 */

import { STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS } from "@/lib/sticky-tab-chrome";

/**
 * Frosted sticky shell: Profile sticky top contract + full-bleed within `px-6` page pad.
 * No capsule border/radius. Same geometry in flow and stuck.
 */
export const PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS =
  "relative sticky top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-30 -mx-6 mb-3 bg-[var(--dark)]/80 px-6 pb-1 backdrop-blur-md" as const;

/** Proven dissolve under sticky chrome — reuse Leaderboard/Releases fade utility. */
export const PROFILE_PRIMARY_NAV_STICKY_FADE_CLASS = STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS;

export const PROFILE_PRIMARY_NAV_LIST_CLASS =
  "flex h-auto w-full items-end gap-0 bg-transparent p-0" as const;

/**
 * Radix TabsTrigger base — transparent, min-h-11, no segment chrome.
 * `group` enables label underline via group-data-[state=active].
 */
export const PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS =
  "ios-press group relative flex min-h-11 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-none border-0 bg-transparent px-0.5 text-[13px] font-medium leading-tight text-white/55 shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none sm:gap-1 sm:text-[14px]" as const;

export const PROFILE_PRIMARY_NAV_ICON_CLASS = "h-3.5 w-3.5 shrink-0" as const;

/** Label-width active underline (~3px) — stronger than Posts secondary 2px. */
export const PROFILE_PRIMARY_NAV_LABEL_CLASS =
  "relative inline-block max-w-full truncate px-0.5 pb-[5px] group-data-[state=active]:after:absolute group-data-[state=active]:after:inset-x-0 group-data-[state=active]:after:bottom-0 group-data-[state=active]:after:h-[3px] group-data-[state=active]:after:rounded-full group-data-[state=active]:after:bg-accent" as const;
