/**
 * Authenticated-app premium material — C1 canvas/chrome, C2 overlays, C3 forms.
 * Intentionally separate from prelogin-material.ts (auth/onboarding scoped).
 * Opt-in only — never rewrite shared ui/input, ui/select, or ui/dialog defaults.
 * Do not apply form/canvas classes to Home / video / Comments.
 * Paywall uses shared sheet surface/backdrop tokens (VAT-PAYWALL-POLISH).
 */

/** Same interactive blue family as approved pre-login links/focus (`#0a83ff`). */
export const APP_MATERIAL_INTERACTIVE_BLUE = "#0a83ff" as const;

/**
 * Releases Tracker page canvas only.
 * Dark-mode atmosphere lives in CSS under `.dark .dubhub-app-releases-canvas`.
 */
export const APP_MATERIAL_RELEASES_CANVAS_CLASS = "dubhub-app-releases-canvas";

/**
 * Shared authenticated premium canvas (C5B+).
 * Same CSS class as Releases — alias for Profile / Leaderboard list pages.
 * Do not invent per-surface material systems.
 */
export const APP_MATERIAL_AUTH_CANVAS_CLASS = APP_MATERIAL_RELEASES_CANVAS_CLASS;

/**
 * Profile WITH uploaded banner (C5C) — navy base immediately under the banner,
 * quieter indigo wash lower on the page. Avoids top-heavy blue under real art.
 * CSS: `.dark .dubhub-app-profile-canvas-with-banner`
 */
export const APP_MATERIAL_PROFILE_WITH_BANNER_CANVAS_CLASS =
  "dubhub-app-profile-canvas-with-banner";

/**
 * Quiet form-page atmosphere (Create / Edit / Submit metadata).
 * Same family as Releases canvas; scoped class so Home cannot inherit by accident.
 */
export const APP_MATERIAL_FORM_CANVAS_CLASS = "dubhub-app-form-canvas";

/**
 * Track Details / submit-metadata shell atmosphere (C7B.1).
 * Paints `.dubhub-app-form-canvas` on AuthenticatedMainShell so the gradient
 * fills the shell padding box behind the status bar. Layout inset stays
 * `APP_SHELL_SAFE_TOP_CLASS`. `bg-background` is the light-mode fallback.
 */
export const SUBMIT_METADATA_SHELL_ATMOSPHERE_CLASS =
  `${APP_MATERIAL_FORM_CANVAS_CLASS} bg-background` as const;

/**
 * Release Detail page canvas — artwork-derived atmosphere via CSS var
 * `--release-atmosphere-rgb` (C4B). Opt-in; never apply to Home / list / nav.
 */
export const APP_MATERIAL_RELEASE_DETAIL_CANVAS_CLASS =
  "dubhub-app-release-detail-canvas";

/**
 * Safe-area + page rhythm for Release Detail after route-scoped shell bleed.
 * Atmosphere continues behind status bar; content geometry preserved.
 */
export const APP_MATERIAL_RELEASE_DETAIL_TOP_CLASS = "dubhub-app-release-detail-top";

/**
 * Safe-area + page rhythm for release create/edit after shell bleed.
 * Atmosphere continues behind status bar; content geometry preserved.
 */
export const APP_MATERIAL_RELEASE_FORM_TOP_CLASS = "dubhub-app-release-form-top";

/**
 * Icon-only Back — matches onboarding ChevronLeft language (h-7 white).
 * 44×44 min hit target; no text label.
 */
export const APP_MATERIAL_BACK_BUTTON_CLASS =
  "ios-press inline-flex min-h-11 min-w-11 items-center justify-center -ml-1 rounded-sm text-white hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1324]" as const;

export const APP_MATERIAL_BACK_ICON_CLASS = "h-7 w-7 text-white" as const;

/**
 * Neutral glass surface for destructive menu/action rows.
 * Red is reserved for icon + label content, not the outer border.
 */
export const APP_MATERIAL_DESTRUCTIVE_ACTION_SURFACE_CLASS =
  "dubhub-app-destructive-action-surface border-transparent bg-transparent text-red-400 focus:bg-white/[0.08] focus:text-red-400 data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-red-400" as const;

export const APP_MATERIAL_DESTRUCTIVE_ACTION_LABEL_CLASS =
  "font-medium text-red-400" as const;

export const APP_MATERIAL_RELEASES_STICKY_CLASS = "dubhub-app-releases-sticky";
export const APP_MATERIAL_RELEASES_STICKY_FADE_CLASS = "dubhub-app-releases-sticky-fade";
export const APP_MATERIAL_RELEASES_FAB_UNDERLAY_CLASS = "dubhub-app-releases-fab-underlay";

/** Shared sticky chrome wash — same family as Releases sticky (C5B+). */
export const APP_MATERIAL_AUTH_STICKY_CLASS = APP_MATERIAL_RELEASES_STICKY_CLASS;

/** Shared sticky dissolve wash modifier (C5B+). */
export const APP_MATERIAL_AUTH_STICKY_FADE_CLASS = APP_MATERIAL_RELEASES_STICKY_FADE_CLASS;

export const APP_MATERIAL_CERAMIC_BUTTON_CLASS =
  "rounded-[15px] border border-white/80 bg-white font-semibold text-slate-900 shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:bg-white hover:opacity-95 active:scale-[0.985]";

export const APP_MATERIAL_RELEASES_ADD_CTA_CLASS =
  "ios-press pointer-events-auto h-12 w-full rounded-[18px] border border-white/80 bg-white text-slate-900 shadow-[0_10px_28px_-18px_rgba(255,255,255,0.95),0_10px_24px_-18px_rgba(15,23,42,0.45)] transition-all hover:opacity-95 active:scale-[0.995]";

/* ——— C2: opt-in Dialog / Sheet overlay material ——— */

export const APP_MATERIAL_OVERLAY_BACKDROP_CLASS = "dubhub-app-overlay-backdrop";
/** Lighter sheet scrim for Release Schedule/timezone only (not Comments/paywall). */
export const APP_MATERIAL_SHEET_BACKDROP_CLASS = "dubhub-app-sheet-backdrop";
export const APP_MATERIAL_OVERLAY_SURFACE_CLASS = "dubhub-app-overlay-surface";
export const APP_MATERIAL_SHEET_SURFACE_CLASS = "dubhub-app-sheet-surface";

export const APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS =
  `${APP_MATERIAL_OVERLAY_SURFACE_CLASS} max-w-sm` as const;

export const APP_MATERIAL_DIALOG_CONTENT_CLASS =
  `${APP_MATERIAL_OVERLAY_SURFACE_CLASS} max-w-md` as const;

export const APP_MATERIAL_OVERLAY_TITLE_CLASS =
  "text-lg font-semibold tracking-tight text-foreground" as const;

export const APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS =
  "text-sm leading-relaxed text-muted-foreground" as const;

export const APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS =
  "border border-white/80 bg-white font-semibold text-slate-900 shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:bg-white hover:text-slate-900 hover:opacity-95" as const;

export const APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS =
  "border border-white/15 bg-white/[0.06] font-medium text-foreground hover:bg-white/10 hover:text-foreground" as const;

export const APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS =
  "bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90" as const;

/* ——— C3: opt-in form / control material ——— */

/**
 * Text / date / time field body — material in CSS under `.dubhub-app-field`.
 * Height stays caller-owned (h-10 typical). No per-field backdrop-filter.
 */
export const APP_MATERIAL_FIELD_CLASS =
  "dubhub-app-field rounded-[15px] border-transparent bg-transparent text-foreground placeholder:text-muted-foreground shadow-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0" as const;

export const APP_MATERIAL_FIELD_INVALID_CLASS = "dubhub-app-field-invalid" as const;

/** Semantic success (green) — not generic blue. */
export const APP_MATERIAL_FIELD_SUCCESS_CLASS = "dubhub-app-field-success" as const;

export const APP_MATERIAL_SELECT_TRIGGER_CLASS =
  "dubhub-app-field rounded-[15px] border-transparent bg-transparent text-foreground shadow-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 data-[placeholder]:text-muted-foreground" as const;

/** Portaled Select menu — rounded shell; items use inset radius. */
export const APP_MATERIAL_SELECT_CONTENT_CLASS =
  "dubhub-app-select-content border-white/[0.08]" as const;

export const APP_MATERIAL_SELECT_ITEM_CLASS =
  "mx-0.5 rounded-[11px] text-foreground focus:bg-[#0a83ff]/14 focus:text-foreground data-[highlighted]:bg-[#0a83ff]/14 data-[highlighted]:text-foreground hover:bg-[#0a83ff]/10" as const;

/** Two-choice segment base (Scheduled / Coming soon, Midnight / Exact). */
export const APP_MATERIAL_SEGMENT_BASE_CLASS =
  "ios-press box-border min-h-10 min-w-0 w-full max-w-full rounded-[15px] border px-2 py-2.5 text-sm font-medium leading-snug transition-colors break-words text-center" as const;

/**
 * Selected segment — dark material platter (no saturated system-blue fill).
 * Dimensional highlight via `.dubhub-app-segment-active` in index.css.
 */
export const APP_MATERIAL_SEGMENT_ACTIVE_CLASS =
  "dubhub-app-segment-active border-white/20 font-semibold text-white" as const;

export const APP_MATERIAL_SEGMENT_INACTIVE_CLASS =
  "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white" as const;

export const APP_MATERIAL_SEGMENT_ROW_CLASS =
  "grid w-full min-w-0 max-w-full grid-cols-[repeat(2,minmax(0,1fr))] gap-2" as const;

/** Timezone / select-like trigger button. */
export const APP_MATERIAL_FIELD_TRIGGER_CLASS =
  "ios-press dubhub-app-field flex h-10 w-full min-w-0 max-w-full items-center justify-between rounded-[15px] border-transparent bg-transparent px-3 text-left text-sm text-foreground" as const;

/** Form primary ceramic CTA (Create / Save / Done / Submit). */
export const APP_MATERIAL_FORM_PRIMARY_CLASS =
  "dubhub-app-form-primary h-11 w-full rounded-[15px] border border-white/80 bg-white font-semibold text-slate-900 shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:bg-white hover:text-slate-900 hover:opacity-95 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-100" as const;

/** Tall Submit Track ID variant — same ceramic family, h-12. */
export const APP_MATERIAL_FORM_PRIMARY_TALL_CLASS =
  "dubhub-app-form-primary h-12 w-full rounded-[18px] border border-white/80 bg-white text-base font-semibold text-slate-900 shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:bg-white hover:text-slate-900 hover:opacity-95 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-100" as const;

/** Artwork picker surface — size owned by caller. */
export const APP_MATERIAL_ARTWORK_PICKER_CLASS =
  "dubhub-app-artwork-picker border border-white/12 bg-transparent shadow-[0_18px_40px_-28px_rgba(0,0,0,0.75)]" as const;

/** Flat tool row focus — generic blue ring, no card shell. */
export const APP_MATERIAL_TOOL_ROW_CLASS =
  "ios-press flex min-h-11 w-full items-center justify-between gap-3 border-b border-white/[0.08] py-3 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-inset focus-visible:ring-offset-0" as const;

/** Generic interactive text link (Back in schedule timezone panel). */
export const APP_MATERIAL_LINK_CLASS =
  "font-semibold text-[#0a83ff] hover:text-[#3b9bff]" as const;

/** Selected list row inside sheets (timezone). */
export const APP_MATERIAL_LIST_ROW_SELECTED_CLASS = "bg-[#0a83ff]/18" as const;

export const APP_MATERIAL_FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background" as const;

/* ——— Compact glass actions (Settings VAT compact controls) ——— */

/**
 * Shared compact-action geometry — intrinsic width, not a ceramic / full-width CTA.
 * Height, radius, padding, and type match across primary + secondary.
 */
export const APP_MATERIAL_COMPACT_ACTION_GEOMETRY_CLASS =
  "h-10 min-h-10 w-auto rounded-[14px] px-4 text-sm font-medium" as const;

/**
 * Compact-control press (Settings-safe).
 * No ios-press scale (clips at edges). No sticky iOS hover.
 * Focus-visible ring only. Slight active opacity deepening.
 */
export const APP_MATERIAL_COMPACT_ACTION_PRESS_CLASS =
  `${APP_MATERIAL_FOCUS_RING_CLASS} hover:bg-transparent hover:text-inherit focus:bg-transparent focus:outline-none active:opacity-90 disabled:opacity-50 disabled:shadow-none` as const;

/**
 * Stronger compact action — translucent dub hub blue glass.
 * Not a solid blue slab, not ceramic white.
 */
export const APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS =
  `${APP_MATERIAL_COMPACT_ACTION_GEOMETRY_CLASS} border border-[#0a83ff]/30 bg-[#0a83ff]/10 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-[#0a83ff]/35 dark:bg-[#0a83ff]/15 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] [@media(hover:hover)]:hover:bg-[#0a83ff]/14 dark:[@media(hover:hover)]:hover:bg-[#0a83ff]/22 ${APP_MATERIAL_COMPACT_ACTION_PRESS_CLASS}` as const;

/**
 * Quiet compact action — neutral glass, same geometry as primary.
 */
export const APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS =
  `${APP_MATERIAL_COMPACT_ACTION_GEOMETRY_CLASS} border border-black/10 bg-black/[0.04] text-foreground/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-white/[0.14] dark:bg-white/[0.055] dark:text-foreground/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] [@media(hover:hover)]:hover:bg-black/[0.06] dark:[@media(hover:hover)]:hover:bg-white/[0.08] ${APP_MATERIAL_COMPACT_ACTION_PRESS_CLASS}` as const;
