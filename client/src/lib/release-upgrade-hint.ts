/**
 * Inline VAT upgrade affordance for release Links / attach capacity rows.
 * Same text size as surrounding helper copy; semibold + brighter; chevron; no underline/teal.
 * Tap target comes from min-height / padding — not a larger font.
 */

/** Matches capacity helper `text-xs leading-snug`. */
export const RELEASE_UPGRADE_HINT_CLASS =
  "ios-press -mx-1 -my-1 inline-flex min-h-9 max-w-full items-center gap-0.5 rounded-sm px-1 py-1 text-xs font-semibold leading-snug text-foreground/90 active:opacity-70" as const;

export const RELEASE_UPGRADE_HINT_CHEVRON_CLASS =
  "h-3 w-3 shrink-0 opacity-80" as const;
