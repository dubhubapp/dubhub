/**
 * Shared sticky primary/secondary tab chrome — Leaderboard + Releases.
 * Presentation only. No gesture, query, or route behaviour.
 */

/** Frosted sticky shell: safe-area aware, compact bottom, backdrop blur preserved. */
export const STICKY_TAB_CHROME_CLASS =
  "relative sticky top-0 z-30 -mx-4 bg-background/80 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] pb-1 backdrop-blur-md" as const;

/**
 * Legacy short colour fade (kept for reference / gradual migration).
 * Prefer {@link STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS} for Leaderboard/Releases parity.
 */
export const STICKY_TAB_CHROME_FADE_CLASS =
  "pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-background/80 to-transparent" as const;

/**
 * Proven Leaderboard sticky bottom transition — masked blur dissolve overlay.
 * Reused by Releases for bottom-nav parity. Does not add document height.
 * CSS utility: `.leaderboard-sticky-blur-dissolve` in index.css.
 */
export const STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS =
  "leaderboard-sticky-blur-dissolve pointer-events-none absolute inset-x-0 top-full h-12 bg-background/35 backdrop-blur-md" as const;

/** Primary row → secondary row gap (tighter than legacy mb-2). */
export const STICKY_TAB_PRIMARY_ROW_CLASS = "mb-1 flex" as const;

/** Gap between sticky chrome and first content block (prize / feed). */
export const STICKY_TAB_CONTENT_TOP_GAP_CLASS = "pt-2" as const;
