/**
 * Release Detail header action chrome.
 *
 * Countdown on Release Detail is one full-width secondary CTA under streaming links.
 */

/** Compact text action beside Coming Soon. */
export const RELEASE_DETAIL_SHARE_ACTION_CLASS =
  "ios-press inline-flex shrink-0 items-center justify-center gap-1 rounded px-2 py-0.5 text-xs font-medium leading-none text-muted-foreground min-h-[1.375rem] bg-transparent hover:bg-muted/40" as const;

/** Strong secondary CTA. Shorter than a primary submit button. */
export const RELEASE_DETAIL_COUNTDOWN_CTA_CLASS =
  "dubhub-app-secondary-action ios-press flex h-11 min-h-11 w-full items-center justify-center gap-2 rounded-[15px] border px-4 text-sm font-medium" as const;

export const RELEASE_DETAIL_COUNTDOWN_CTA_ICON_CLASS = "h-4 w-4 shrink-0" as const;

/** Share icon — keep optically compact on the status row. */
export const RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS =
  "h-3 w-3 shrink-0" as const;

/** Artwork / metadata bounded column height (Tailwind h-32). */
export const RELEASE_DETAIL_ARTWORK_SIZE_CLASS = "h-32 w-32" as const;
export const RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS = "min-h-32" as const;
