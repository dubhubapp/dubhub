/**
 * Own-Profile primary nav — presentation only (C5B.2 non-sticky + C5C group).
 * Text. Non-sticky document tabs (Releases/Leaderboard sticky untouched).
 * PROFILE-TABS-2A-FIX-3/6: no painted fade under tabs — content dissolve lives on
 * Notifications mask shell (extends above the scroller). Shell z-10 keeps tabs crisp.
 *
 * PROFILE-TABS-3B: active underline is a single shared indicator (not per-trigger ::after).
 * Icon+label group remains the measurement target for indicator width.
 */

export const PROFILE_PRIMARY_NAV_SHELL_CLASS =
  "relative z-10 -mx-6 mb-3 px-6 pb-1" as const;

/** @deprecated Alias kept so older imports resolve — same non-sticky shell (C5B.2). */
export const PROFILE_PRIMARY_NAV_STICKY_SHELL_CLASS = PROFILE_PRIMARY_NAV_SHELL_CLASS;

/** `relative` hosts the shared PROFILE-TABS-3B indicator. */
export const PROFILE_PRIMARY_NAV_LIST_CLASS =
  "relative flex h-auto w-full items-end gap-0 bg-transparent p-0" as const;

/**
 * Radix TabsTrigger base — full equal-width hit target (flex-1, min-h-11).
 * Centres the inner icon+label group; does not host the underline itself.
 *
 * PROFILE-SWIPE-POLISH-2: active + inactive share `font-semibold` so swipe/tap
 * commit never shifts glyph metrics. Selection emphasis is colour/opacity only
 * (classes here + pager colour lerp).
 */
export const PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS =
  "ios-press group relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-none border-0 bg-transparent px-0.5 text-[13px] font-semibold leading-tight text-white/55 shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none sm:text-[14px]" as const;

/**
 * Centred visual unit: [icon + label].
 * `pb-[5px]` reserves the optical band where the shared indicator sits.
 * No per-trigger ::after (PROFILE-TABS-3B).
 */
export const PROFILE_PRIMARY_NAV_GROUP_CLASS =
  "relative inline-flex max-w-full items-center gap-0.5 px-0.5 pb-[5px] sm:gap-1" as const;

/** Fixed 14×14 Lucide slot — centres the glyph against the label line box.
 * Shared 1px lift: Lucide optical mass sits slightly below cap-height. */
export const PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS =
  "inline-flex h-3.5 w-3.5 shrink-0 -translate-y-px items-center justify-center" as const;

export const PROFILE_PRIMARY_NAV_ICON_CLASS = "h-3.5 w-3.5" as const;

/** Label text only — underline is the shared indicator. */
export const PROFILE_PRIMARY_NAV_LABEL_CLASS = "max-w-full truncate leading-none" as const;

/**
 * Shared active underline (PROFILE-TABS-3B).
 * Position/size set via inline left/width/bottom from measured groups.
 */
export const PROFILE_PRIMARY_NAV_INDICATOR_CLASS =
  "pointer-events-none absolute z-[1] h-[3px] rounded-full bg-[#0a83ff]" as const;

/** Tap indicator morph (when not reduced-motion). */
export const PROFILE_PRIMARY_NAV_INDICATOR_TAP_MS = 200 as const;
