/**
 * Shared overview Countdown badge chrome (Artwork View + List View).
 * Passive personal-state companion to the canonical status pill.
 * Do not use text-accent — Countdown is personal state, not a release-status accent.
 */

/** Matches status-pill default height (`min-h-[1.375rem]`) as a compact icon badge. */
export const COUNTDOWN_STATUS_BADGE_CLASS =
  "pointer-events-none inline-flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 text-foreground" as const;

export const COUNTDOWN_STATUS_BADGE_ICON_CLASS = "h-3.5 w-3.5" as const;
