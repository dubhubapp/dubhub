/**
 * Settings landing-page presentation contract.
 * Display-only — preference / subscription domain logic stays in pages and lib modules.
 *
 * Root + Notifications: SECTION LABEL + flat rows + divide-y (no giant group cards).
 * SETTINGS_GROUP_CLASS is legacy nested chrome — do not apply on production Settings pages.
 */

import {
  APP_MATERIAL_AUTH_CANVAS_CLASS,
  APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS,
  APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS,
} from "./app-material";
import { APP_PAGE_SCROLL_CLASS } from "./app-shell-layout";

/**
 * Settings-family routes that share the utility page chrome (Back + title).
 * Developer diagnostics is intentionally excluded — it uses its own opaque surface.
 */
export function isSettingsUtilityRoute(pathname: string): boolean {
  const path = pathname.split("?")[0];
  return (
    path === "/settings" ||
    path === "/settings/notifications" ||
    path === "/settings/artist-questions"
  );
}

/**
 * Premium atmosphere on the authenticated shell itself (C6B.4).
 * Paints the shell padding box behind the status bar. Layout inset stays
 * `APP_SHELL_SAFE_TOP_CLASS`. `bg-background` is the light-mode fallback;
 * dark canvas CSS overrides it.
 */
export const SETTINGS_SHELL_ATMOSPHERE_CLASS =
  `${APP_MATERIAL_AUTH_CANVAS_CLASS} bg-background` as const;

/**
 * Settings utility scroller. Transparent so the shell atmosphere shows through.
 * Must NOT carry env(safe-area-inset-top) padding (shell already owns that).
 */
export const SETTINGS_PAGE_SCROLL_CLASS =
  `${APP_PAGE_SCROLL_CLASS} bg-transparent` as const;

/** Compact inner pad after the shell inset (~4px). */
export const SETTINGS_PAGE_PAD_CLASS = "pt-1 px-6 pb-8" as const;

/** Title row immediately under Back (~4px). */
export const SETTINGS_TITLE_AFTER_BACK_CLASS = "mt-1 flex items-center gap-2" as const;

/** Page subtitle under the title. */
export const SETTINGS_SUBTITLE_CLASS = "mt-1 text-sm text-muted-foreground" as const;

/** Vertical stack between Settings sections only — header is not in this stack. */
export const SETTINGS_SECTIONS_STACK_CLASS = "space-y-4" as const;

/** Gap from page subtitle to the first section label. */
export const SETTINGS_HEADER_TO_SECTIONS_CLASS = "mt-5" as const;

/** Uppercase section label above a settings row stack. */
export const SETTINGS_SECTION_LABEL_CLASS =
  "px-0 mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground" as const;

/** Supporting line under a section label (e.g. Notifications Push). */
export const SETTINGS_SECTION_HELPER_CLASS = "mt-1 mb-2 text-xs text-muted-foreground" as const;

/**
 * Decorative group surface — legacy nested settings only.
 * Production Settings root / Notifications must NOT use this.
 */
export const SETTINGS_GROUP_CLASS =
  "rounded-xl border border-white/10 bg-black/20 overflow-hidden px-4" as const;

/**
 * Structural row stack — dividers only, no card chrome.
 * Dark: ~8% white. Light: theme border (never divide-white on a light canvas).
 */
export const SETTINGS_ROWS_STACK_CLASS =
  "divide-y divide-border dark:divide-white/[0.08]" as const;

/** Hairline between rows when not using divide-y (legacy / explicit). */
export const SETTINGS_ROW_DIVIDER_CLASS =
  "border-t border-border dark:border-white/[0.08]" as const;

/** Shared row chrome — >=44pt, calm utilitarian. Horizontal inset from page pad. */
export const SETTINGS_ROW_CLASS =
  "flex w-full min-h-11 items-center gap-3 px-0 py-3 text-left" as const;

/**
 * Safe full-width list-row press. No ios-press scale (clips at scroll edges).
 * Touch uses active only so WKWebView cannot retain a sticky hover wash.
 * Desktop hover is gated to hover-capable pointers.
 */
export const SETTINGS_ROW_PRESS_CLASS =
  "rounded-lg px-2 -mx-2 bg-transparent hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-black/[0.04] dark:active:bg-white/[0.04] [@media(hover:hover)]:hover:bg-black/[0.03] dark:[@media(hover:hover)]:hover:bg-white/[0.03]" as const;

/** Navigation / action row (chevron destinations). */
export const SETTINGS_NAV_ROW_CLASS =
  `${SETTINGS_ROW_CLASS} ${SETTINGS_ROW_PRESS_CLASS} transition-colors` as const;

/** Inline preference row that hosts a switch. No press scale. */
export const SETTINGS_SWITCH_ROW_CLASS = SETTINGS_ROW_CLASS;

export const SETTINGS_ROW_ICON_CLASS = "w-5 h-5 shrink-0 text-muted-foreground" as const;

export const SETTINGS_ROW_TITLE_CLASS = "text-sm font-medium text-foreground" as const;

export const SETTINGS_ROW_SUBTITLE_CLASS = "mt-0.5 text-xs text-muted-foreground" as const;

export const SETTINGS_ROW_TEXT_WRAP_CLASS = "min-w-0 flex-1 text-left" as const;

export const SETTINGS_CHEVRON_CLASS = "w-4 h-4 shrink-0 text-muted-foreground" as const;

/** Destructive Log Out row — clear but restrained. No sticky hover wash. */
export const SETTINGS_LOGOUT_ROW_CLASS =
  `${SETTINGS_NAV_ROW_CLASS} text-red-600 dark:text-red-300 active:bg-red-500/[0.06]` as const;

/**
 * Theme-aware Settings Back overlay on approved geometry.
 * Overrides hardcoded white / dark ring-offset from APP_MATERIAL_BACK_*.
 */
export const SETTINGS_BACK_BUTTON_CLASS =
  "text-foreground hover:text-foreground/90 focus-visible:ring-offset-background" as const;

export const SETTINGS_BACK_ICON_CLASS = "text-foreground" as const;

/**
 * VAT lifecycle block on Settings root — flat, no nested glass card.
 * Matches standard row vertical cadence (py-3).
 */
export const SETTINGS_VAT_INSET_CLASS = "w-full py-3" as const;

export const SETTINGS_INTRO_ARTIST_COPY =
  "Preferences, artist tools, support and account." as const;

export const SETTINGS_INTRO_COMMUNITY_COPY =
  "Preferences, support and account." as const;

export const SETTINGS_NOTIFICATIONS_INTRO_COPY =
  "Choose what appears in dub hub and what can be sent to your device." as const;

export const SETTINGS_NOTIFICATIONS_PUSH_HELPER_COPY =
  "Push alerts control what can be sent to your device." as const;

/** Compact VAT primary (Retry / Upgrade) — premium blue glass, not ceramic. */
export const SETTINGS_VAT_ACTION_PRIMARY_CLASS =
  APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS;

/** Compact VAT secondary (Restore / Manage) — quiet glass, same geometry. */
export const SETTINGS_VAT_ACTION_SECONDARY_CLASS =
  APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS;

export const SETTINGS_VAT_ACTIONS_CLASS =
  "mt-2 flex flex-wrap items-center gap-2" as const;

/** OS push-denied warning — semantic amber, not a Settings group card. */
export const SETTINGS_OS_WARNING_CLASS =
  "rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 space-y-2" as const;
