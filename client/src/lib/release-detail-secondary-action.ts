/**
 * Release Detail header action chrome.
 *
 * Countdown keeps a 44pt hit target (`min-h-11`, `items-end`) but is mounted in a
 * compact flow slot matching Share height so it sits just under Coming Soon without
 * pushing past the artwork bottom. Transparent hit area extends upward.
 */

/** Compact text action beside Coming Soon. */
export const RELEASE_DETAIL_SHARE_ACTION_CLASS =
  "ios-press inline-flex shrink-0 items-center justify-center gap-1 rounded px-2 py-0.5 text-xs font-medium leading-none text-muted-foreground min-h-[1.375rem] bg-transparent hover:bg-muted/40" as const;

/**
 * Countdown control chrome. Layout height comes from the row flow slot; this class
 * sizes the tappable control (extends upward via absolute positioning in the row).
 */
export const RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS =
  "ios-press inline-flex min-h-11 shrink-0 items-end justify-center gap-1 rounded bg-transparent px-0 py-0 text-xs font-medium leading-none text-muted-foreground hover:text-foreground/90" as const;

/** In-flow height for the Countdown row (matches Share); hit target is larger. */
export const RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS =
  "relative h-[1.375rem] w-full shrink-0" as const;

export const RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS =
  "h-3 w-3 shrink-0" as const;

/** Artwork / metadata bounded column height (Tailwind h-32). */
export const RELEASE_DETAIL_ARTWORK_SIZE_CLASS = "h-32 w-32" as const;
export const RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS = "min-h-32" as const;
