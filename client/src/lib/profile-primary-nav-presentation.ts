/**
 * Own-Profile primary nav — presentation only (C5B.2 non-sticky + C5C group underline).
 * Text + underline. No sticky chrome / blur / dissolve (Releases/Leaderboard sticky untouched).
 *
 * C5C: icon + label share one optically centred group; active underline spans that group
 * (intrinsic width + modest pad), not label-only and not full quarter-width trigger.
 */

export const PROFILE_PRIMARY_NAV_SHELL_CLASS =
  "relative -mx-6 mb-3 px-6 pb-1" as const;

/** @deprecated Alias kept so older imports resolve — same non-sticky shell (C5B.2). */
export const PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS = PROFILE_PRIMARY_NAV_SHELL_CLASS;

export const PROFILE_PRIMARY_NAV_LIST_CLASS =
  "flex h-auto w-full items-end gap-0 bg-transparent p-0" as const;

/**
 * Radix TabsTrigger base — full equal-width hit target (flex-1, min-h-11).
 * Centres the inner icon+label group; does not host the underline itself.
 */
export const PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS =
  "ios-press group relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-none border-0 bg-transparent px-0.5 text-[13px] font-medium leading-tight text-white/55 shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none sm:text-[14px]" as const;

/**
 * Centred visual unit: [icon + label]. Underline spans this group only.
 */
export const PROFILE_PRIMARY_NAV_GROUP_CLASS =
  "relative inline-flex max-w-full items-center gap-0.5 px-0.5 pb-[5px] sm:gap-1 group-data-[state=active]:after:absolute group-data-[state=active]:after:inset-x-0 group-data-[state=active]:after:bottom-0 group-data-[state=active]:after:h-[3px] group-data-[state=active]:after:rounded-full group-data-[state=active]:after:bg-[#0a83ff]" as const;

export const PROFILE_PRIMARY_NAV_ICON_CLASS = "h-3.5 w-3.5 shrink-0" as const;

/** Label text only — underline lives on PROFILE_PRIMARY_NAV_GROUP_CLASS. */
export const PROFILE_PRIMARY_NAV_LABEL_CLASS = "max-w-full truncate" as const;
