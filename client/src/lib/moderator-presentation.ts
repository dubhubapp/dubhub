/**
 * Moderator tab presentation contract — visual-only.
 * Queue / claim / mutation behavior stays in pages/moderator.tsx and filter lib.
 */

import {
  APP_MATERIAL_AUTH_CANVAS_CLASS,
  APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS,
  APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS,
  APP_MATERIAL_FOCUS_RING_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
} from "./app-material";
import { APP_PAGE_SCROLL_CLASS } from "./app-shell-layout";

/**
 * Premium atmosphere on the authenticated shell for `/moderator`.
 * Same canvas family as Settings / Releases — paints behind status bar.
 */
export const MODERATOR_SHELL_ATMOSPHERE_CLASS =
  `${APP_MATERIAL_AUTH_CANVAS_CLASS} bg-background` as const;

/** Transparent scroller so shell atmosphere shows through. */
export const MODERATOR_PAGE_SCROLL_CLASS =
  `${APP_PAGE_SCROLL_CLASS} bg-transparent` as const;

/** Quiet privilege identity — soft glass, not a CTA. */
export const MODERATOR_ACCESS_BADGE_CLASS =
  "rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-foreground/70 shadow-none" as const;

/** Text-led tablist — no pill tray / teal fill. */
export const MODERATOR_TABLIST_CLASS =
  "grid !h-auto w-full grid-cols-2 gap-0 rounded-none border-0 !bg-transparent p-0 shadow-none" as const;

export const MODERATOR_TAB_TRIGGER_BASE_CLASS =
  `relative inline-flex min-h-11 flex-wrap items-center justify-center gap-1.5 rounded-none border-0 bg-transparent px-1 pb-[7px] pt-1 text-[15px] leading-tight shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:shadow-none ${APP_MATERIAL_FOCUS_RING_CLASS}` as const;

export const MODERATOR_TAB_TRIGGER_ACTIVE_CLASS =
  "font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[#0a83ff]" as const;

export const MODERATOR_TAB_TRIGGER_INACTIVE_CLASS =
  "font-medium text-white/55 hover:bg-transparent hover:text-white/80 data-[state=inactive]:bg-transparent" as const;

/** Open filter block — no outer card. */
export const MODERATOR_FILTER_BLOCK_CLASS = "mt-3 space-y-2.5" as const;

export const MODERATOR_FILTER_LABEL_CLASS =
  "text-[11px] font-medium uppercase tracking-wide text-muted-foreground" as const;

/** Compact claim segments — material blue selected, not teal/default primary. */
export const MODERATOR_CLAIM_FILTER_ACTIVE_CLASS =
  "h-8 min-h-8 rounded-[12px] border border-[#0a83ff]/45 bg-[#0a83ff]/15 px-2.5 text-xs font-semibold text-white shadow-none hover:bg-[#0a83ff]/22 hover:text-white" as const;

export const MODERATOR_CLAIM_FILTER_INACTIVE_CLASS =
  "h-8 min-h-8 rounded-[12px] border border-white/10 bg-white/[0.06] px-2.5 text-xs font-medium text-white/70 shadow-none hover:bg-white/[0.1] hover:text-white" as const;

export const MODERATOR_SECTION_HELPER_CLASS =
  "text-sm text-muted-foreground/90" as const;

export const MODERATOR_EMPTY_STATE_CLASS =
  "px-2 py-12 text-center text-muted-foreground" as const;

/** Flat queue list — dividers only. */
export const MODERATOR_QUEUE_LIST_CLASS =
  "divide-y divide-border dark:divide-white/[0.08]" as const;

export const MODERATOR_QUEUE_ITEM_CLASS = "py-4 first:pt-2" as const;

export const MODERATOR_THUMB_CLASS =
  "group relative h-32 w-full flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-muted sm:h-24 sm:w-24" as const;

/** Semantic panels — meaning via tint, modernized borders. */
export const MODERATOR_PANEL_ID_CLASS =
  "space-y-2 rounded-xl border border-blue-500/25 bg-blue-500/10 p-3" as const;

export const MODERATOR_PANEL_ID_FALLBACK_CLASS =
  "rounded-xl border border-blue-500/25 bg-blue-500/10 p-2.5" as const;

export const MODERATOR_PANEL_CLAIM_LOCK_CLASS =
  "rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm" as const;

export const MODERATOR_PANEL_REPORT_REASON_CLASS =
  "rounded-xl border border-red-500/25 bg-red-500/10 p-3" as const;

export const MODERATOR_PANEL_COMMUNITY_REPORT_CLASS =
  "mt-2 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-2.5" as const;

export const MODERATOR_REPORTER_META_CLASS =
  "mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs" as const;

/** Soft chip inside Uploader's Selection — supports title, does not compete. */
export const MODERATOR_SELECTED_COMMENT_CHIP_CLASS =
  "rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/65 shadow-none" as const;

/**
 * Claim hint + Keep explanation stack.
 * Tight rhythm so helpers don't form a dense grey block before actions.
 */
export const MODERATOR_HELPER_STACK_CLASS = "space-y-0.5 pt-1" as const;

export const MODERATOR_HELPER_CLAIM_CLASS =
  "text-xs leading-snug text-muted-foreground" as const;

export const MODERATOR_HELPER_KEEP_HINT_CLASS =
  "text-[10px] leading-snug text-muted-foreground/65" as const;

/** Queue action hierarchy — material compact / ceramic / destructive. */
export const MODERATOR_ACTION_PRIMARY_CLASS =
  `${APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS} h-8 min-h-8 rounded-[12px] px-3 text-xs shadow-[0_2px_10px_rgba(0,0,0,0.14)]` as const;

/** Shared secondary for Reports (Dismiss / Correct Genre) — same visual weight as before. */
export const MODERATOR_ACTION_SECONDARY_CLASS =
  `${APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS} h-8 min-h-8 rounded-[12px] px-3 text-xs` as const;

/** Shared destructive for Reports (Remove & Moderate). */
export const MODERATOR_ACTION_DESTRUCTIVE_CLASS =
  `${APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS} h-8 min-h-8 rounded-[12px] px-3 text-xs` as const;

/**
 * Pending follow-ups (Keep / Reopen) — quieter than Claim + Confirm ID.
 * Slightly shorter; Keep is soft glass; Reopen is red-tint glass (not solid mass).
 */
export const MODERATOR_ACTION_FOLLOWUP_SECONDARY_CLASS =
  "h-7 min-h-7 rounded-[11px] border border-white/[0.1] bg-white/[0.04] px-2.5 text-[11px] font-medium text-foreground/75 shadow-none hover:bg-white/[0.07] hover:text-foreground" as const;

export const MODERATOR_ACTION_FOLLOWUP_DESTRUCTIVE_CLASS =
  "h-7 min-h-7 rounded-[11px] border border-red-500/35 bg-red-500/10 px-2.5 text-[11px] font-medium text-red-300 shadow-none hover:bg-red-500/15 hover:text-red-200" as const;

/** Claim chip uses compact primary blue glass (high-signal but not ceramic). */
export const MODERATOR_ACTION_CLAIM_CLASS =
  `${APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS} !h-8 !min-h-8 !rounded-[12px] !px-3 !text-xs` as const;

export const MODERATOR_ACTION_RELEASE_CLASS =
  `${APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS} !h-8 !min-h-8 !rounded-[12px] !px-3 !text-xs` as const;
