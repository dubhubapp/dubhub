/**
 * Settings landing-page presentation contract.
 * Display-only — preference / subscription domain logic stays in pages and lib modules.
 *
 * Root Settings: SECTION LABEL + flat rows + divide-y (no giant group cards).
 * Nested pages (e.g. Notifications) may still use SETTINGS_GROUP_CLASS surfaces.
 */

/** Vertical stack between Settings sections (~24–28px). */
export const SETTINGS_SECTIONS_STACK_CLASS = "space-y-7" as const;

/** Uppercase section label above a settings row stack. */
export const SETTINGS_SECTION_LABEL_CLASS =
  "px-0 mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground" as const;

/**
 * Decorative group surface — Notifications / nested settings only.
 * Settings root must NOT use this (no giant rounded boxes).
 */
export const SETTINGS_GROUP_CLASS =
  "rounded-xl border border-white/10 bg-black/20 overflow-hidden px-4" as const;

/**
 * Structural row stack for Settings root — dividers only, no card chrome.
 */
export const SETTINGS_ROWS_STACK_CLASS = "divide-y divide-white/5" as const;

/** Hairline between rows when not using divide-y (legacy / explicit). */
export const SETTINGS_ROW_DIVIDER_CLASS = "border-t border-white/5" as const;

/** Shared row chrome — >=44pt, calm utilitarian. Horizontal inset from page pad. */
export const SETTINGS_ROW_CLASS =
  "flex w-full min-h-11 items-center gap-3 px-0 py-3 text-left" as const;

/** Navigation / action row (chevron destinations). No filled accent chrome. */
export const SETTINGS_NAV_ROW_CLASS =
  `${SETTINGS_ROW_CLASS} hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors` as const;

/** Inline preference row that hosts a switch. */
export const SETTINGS_SWITCH_ROW_CLASS = SETTINGS_ROW_CLASS;

export const SETTINGS_ROW_ICON_CLASS = "w-5 h-5 shrink-0 text-muted-foreground" as const;

export const SETTINGS_ROW_TITLE_CLASS = "text-sm font-medium text-foreground" as const;

export const SETTINGS_ROW_SUBTITLE_CLASS = "text-xs text-muted-foreground" as const;

export const SETTINGS_CHEVRON_CLASS = "w-4 h-4 shrink-0 text-muted-foreground" as const;

/** Destructive Log Out row — clear but restrained. */
export const SETTINGS_LOGOUT_ROW_CLASS =
  `${SETTINGS_NAV_ROW_CLASS} text-red-300 hover:text-red-200 hover:bg-red-500/[0.06]` as const;

/** Mild separation before Account / Log Out within the section stack. */
export const SETTINGS_LOGOUT_SECTION_CLASS = "pt-1" as const;

/**
 * VAT lifecycle block on Settings root — flat, no nested glass card.
 * Richer content allowed; no rounded/bordered/tinted container.
 */
export const SETTINGS_VAT_INSET_CLASS = "w-full py-3.5 space-y-3" as const;
