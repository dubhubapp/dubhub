/**
 * Presentation helpers for the Releases tab (ReleaseTracker).
 * Scope/view URL behaviour and feed queries stay in the page — this file is display/state-shape only.
 */

import {
  APP_MATERIAL_CERAMIC_BUTTON_CLASS,
  APP_MATERIAL_RELEASES_ADD_CTA_CLASS,
  APP_MATERIAL_RELEASES_CANVAS_CLASS,
  APP_MATERIAL_RELEASES_FAB_UNDERLAY_CLASS,
  APP_MATERIAL_RELEASES_STICKY_CLASS,
  APP_MATERIAL_RELEASES_STICKY_FADE_CLASS,
} from "@/lib/app-material";
import {
  STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS,
  STICKY_TAB_CHROME_CLASS,
  STICKY_TAB_CONTENT_TOP_GAP_CLASS,
  STICKY_TAB_PRIMARY_ROW_CLASS,
} from "@/lib/sticky-tab-chrome";

export type ReleaseTrackerFeedView = "upcoming" | "collaborations" | "past";
export type ReleaseTrackerFeedScope = "my" | "saved";

export const RELEASE_TRACKER_ADD_HREF = "/releases/new" as const;
export const RELEASE_FEED_SKELETON_VARIANT = "flat-row" as const;

/** Route-scoped page shell — atmosphere only on Releases (not Home). */
export const RELEASE_TRACKER_PAGE_CLASS =
  `${APP_MATERIAL_RELEASES_CANVAS_CLASS} flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-none` as const;

/** Flat media row — no per-item glass card shell. Top-align artwork with metadata. */
export const RELEASE_FEED_ROW_BASE_CLASS =
  "ios-press relative flex items-start w-full min-w-0 gap-3.5 overflow-hidden py-4 text-left transition-colors" as const;

/** Restrained list separators (not card chrome). */
export const RELEASE_FEED_DIVIDE_CLASS = "divide-y divide-white/[0.08]" as const;

/**
 * Artwork size — 120px (+8 from 112) for stronger presence without dominating.
 * Meta min-height must stay in lockstep with artwork.
 */
export const RELEASE_FEED_ARTWORK_SIZE_CLASS =
  "h-[7.5rem] w-[7.5rem] shrink-0 rounded-lg ring-1 ring-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.22)]" as const;
export const RELEASE_FEED_ARTWORK_PX = 120 as const;
export const RELEASE_FEED_ARTWORK_FALLBACK_ICON_CLASS = "h-12 w-12" as const;

/**
 * Metadata column — min-h matches artwork; flex-col so the action row can
 * mt-auto to the artwork bottom edge regardless of title/artist line count.
 */
export const RELEASE_FEED_META_COLUMN_CLASS =
  "flex min-h-[7.5rem] min-w-0 flex-1 flex-col" as const;

/** Top metadata: title (+ @artist when shown). */
export const RELEASE_FEED_META_TOP_CLASS =
  "flex w-full min-w-0 flex-col gap-1" as const;

/**
 * @deprecated Prefer schedule row + mt-auto actions.
 * Kept for tests that still reference the old bottom group token.
 */
export const RELEASE_FEED_META_BOTTOM_CLASS =
  "flex w-full min-w-0 flex-col gap-1" as const;

/**
 * @deprecated Prefer META_TOP / META_BOTTOM. Solo stack kept for rhythm helpers.
 */
export const RELEASE_FEED_META_STACK_SOLO_CLASS =
  "flex w-full min-w-0 flex-col gap-1" as const;

/**
 * @deprecated Prefer META_TOP / META_BOTTOM. Byline stack kept for rhythm helpers.
 */
export const RELEASE_FEED_META_STACK_BYLINE_CLASS =
  "flex w-full min-w-0 flex-col gap-1" as const;

/** @deprecated Prefer SOLO / BYLINE via resolveReleaseFeedCardRhythm. */
export const RELEASE_FEED_META_STACK_CLASS = RELEASE_FEED_META_STACK_SOLO_CLASS;

/* -------------------------------------------------------------------------- */
/* Byline-visible — title then @artist (stacked), calmer leading               */
/* -------------------------------------------------------------------------- */

export const RELEASE_FEED_TITLE_ROW_CLASS =
  "flex w-full min-w-0 items-start" as const;

/** Title — primary; truncate cleanly across full meta width. */
export const RELEASE_FEED_TITLE_CLASS =
  "m-0 w-full min-w-0 truncate p-0 text-[15px] font-semibold leading-snug text-foreground" as const;

export const RELEASE_FEED_BYLINE_ROW_CLASS =
  "flex w-full min-w-0 items-start" as const;

/** Artist — secondary; muted; no separator into the title. */
export const RELEASE_FEED_BYLINE_CLASS =
  "m-0 w-full min-w-0 truncate p-0 text-xs leading-snug text-muted-foreground" as const;

/** Date on its own row (status pill follows beneath). */
export const RELEASE_FEED_DATE_ROW_CLASS =
  "flex w-full min-w-0 items-start" as const;

export const RELEASE_FEED_DATE_CLASS =
  "m-0 w-full min-w-0 p-0 text-xs leading-snug text-muted-foreground" as const;

/** Status (+ collab) row beneath the date. */
export const RELEASE_FEED_STATUS_ROW_CLASS =
  "flex w-full min-w-0 flex-wrap items-center gap-1" as const;

/** @deprecated Combined date+status row removed — status is its own row again. */
export const RELEASE_FEED_SCHEDULE_ROW_CLASS =
  "flex w-full min-w-0 flex-col gap-1" as const;

/**
 * Provider icons — sit at the end of the bottom meta group so glyph bottoms
 * flush with the artwork edge. No mt-auto here (bottom group owns anchoring).
 */
export const RELEASE_FEED_CTA_LIST_BYLINE_CLASS =
  "flex w-full min-w-0 flex-wrap items-end gap-[3px]" as const;

/* -------------------------------------------------------------------------- */
/* No-byline (solo) — title only, same top/bottom contract                     */
/* -------------------------------------------------------------------------- */

export const RELEASE_FEED_TITLE_SOLO_CLASS =
  "line-clamp-2 w-full min-w-0 break-words text-[15px] font-semibold leading-snug text-foreground" as const;

export const RELEASE_FEED_DATE_SOLO_CLASS =
  "w-full min-w-0 text-xs leading-snug text-muted-foreground" as const;

export const RELEASE_FEED_STATUS_ROW_SOLO_CLASS =
  "flex w-full min-w-0 flex-wrap items-center gap-1" as const;

export const RELEASE_FEED_CTA_LIST_SOLO_CLASS =
  "flex w-full min-w-0 flex-wrap items-end gap-[3px]" as const;

/** @deprecated Prefer BYLINE / SOLO via resolveReleaseFeedCardRhythm. */
export const RELEASE_FEED_CTA_LIST_CLASS = RELEASE_FEED_CTA_LIST_BYLINE_CLASS;

export type ReleaseFeedCardRhythm = {
  /** True when artist/collaborator byline is shown. */
  bylineVisible: boolean;
  /** When true, wrap title/byline/date in compact shell divs. */
  useTextShells: boolean;
  metaStackClass: string;
  titleRowClass: string | null;
  titleClass: string;
  bylineRowClass: string | null;
  bylineClass: string;
  dateRowClass: string | null;
  dateClass: string;
  statusRowClass: string;
  ctaListClass: string;
};

/**
 * Spacing density from byline visibility — not collaboration/account type.
 * Byline → stacked title then @artist in the top group.
 * No byline → title-only top group (own releases).
 */
export function resolveReleaseFeedCardRhythm(args: {
  showByline: boolean;
}): ReleaseFeedCardRhythm {
  if (args.showByline) {
    return {
      bylineVisible: true,
      useTextShells: true,
      metaStackClass: RELEASE_FEED_META_STACK_BYLINE_CLASS,
      titleRowClass: RELEASE_FEED_TITLE_ROW_CLASS,
      titleClass: RELEASE_FEED_TITLE_CLASS,
      bylineRowClass: RELEASE_FEED_BYLINE_ROW_CLASS,
      bylineClass: RELEASE_FEED_BYLINE_CLASS,
      dateRowClass: RELEASE_FEED_DATE_ROW_CLASS,
      dateClass: RELEASE_FEED_DATE_CLASS,
      statusRowClass: RELEASE_FEED_STATUS_ROW_CLASS,
      ctaListClass: RELEASE_FEED_CTA_LIST_BYLINE_CLASS,
    };
  }
  return {
    bylineVisible: false,
    useTextShells: false,
    metaStackClass: RELEASE_FEED_META_STACK_SOLO_CLASS,
    titleRowClass: null,
    titleClass: RELEASE_FEED_TITLE_SOLO_CLASS,
    bylineRowClass: null,
    bylineClass: RELEASE_FEED_BYLINE_CLASS,
    dateRowClass: null,
    dateClass: RELEASE_FEED_DATE_SOLO_CLASS,
    statusRowClass: RELEASE_FEED_STATUS_ROW_SOLO_CLASS,
    ctaListClass: RELEASE_FEED_CTA_LIST_SOLO_CLASS,
  };
}

/**
 * Home/feed release preview: date + canonical status pill on one compact row.
 */
export const RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS =
  "mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5" as const;

/** Month / section headings — title case, near-white (not muted uppercase). */
export const RELEASE_FEED_MONTH_HEADING_CLASS =
  "mb-1.5 text-sm font-semibold tracking-tight text-white/95" as const;

/**
 * Expanded provider hit area (Release Detail Countdown pattern).
 * Flow slot stays h-5; ::before restores h-8 tap height downward into row padding
 * so usable target is preserved without consuming vertical layout budget.
 */
export const RELEASE_FEED_CTA_HIT_SLOP_CLASS =
  "before:absolute before:inset-x-0 before:top-0 before:h-8 before:content-['']" as const;

/**
 * Icon-only overview tap target.
 * In-flow visual slot is h-5 (matches glyph); items-end keeps the mark on the
 * artwork edge. Hit slop expands to h-8 without growing the meta column.
 */
export const RELEASE_FEED_CTA_ICON_ONLY_CLASS =
  `ios-press ios-press-soft relative inline-flex h-5 min-w-8 shrink-0 items-end justify-start pl-0 text-foreground hover:text-white ${RELEASE_FEED_CTA_HIT_SLOP_CLASS}` as const;

/** Semantic overview action (Free DL / Dub Pack / Other) — icon + short label. */
export const RELEASE_FEED_CTA_SEMANTIC_CLASS =
  `ios-press ios-press-soft relative inline-flex h-5 max-w-full min-w-0 shrink-0 items-end gap-1 pl-0 text-left text-xs font-medium leading-none text-foreground hover:text-white ${RELEASE_FEED_CTA_HIT_SLOP_CLASS}` as const;

/** @deprecated Prefer RELEASE_FEED_CTA_ICON_ONLY_CLASS / SEMANTIC — kept for older imports. */
export const RELEASE_FEED_CTA_CLASS = RELEASE_FEED_CTA_SEMANTIC_CLASS;

/** Icon box inside overview actions. */
export const RELEASE_FEED_CTA_ICON_SLOT_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden" as const;

/** Decorative Lucide ExternalLink is intentionally not shown on list CTAs. */
export const RELEASE_FEED_CTA_SHOW_EXTERNAL_ICON = false as const;

/** Primary streaming / pre-save pill — content-sized, no forced width. */
export const RELEASE_FEED_PRIMARY_CTA_CLASS =
  "ios-press ios-press-soft relative inline-flex w-auto max-w-full shrink-0 items-center gap-1.5 rounded-full bg-white/[0.12] px-2.5 py-1.5 text-xs font-semibold leading-none text-foreground ring-1 ring-white/10 hover:bg-white/[0.16] hover:text-white" as const;

export const RELEASE_FEED_PRIMARY_CTA_ICON_SLOT_CLASS =
  "flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden" as const;

/** Plain secondary platform glyphs — no per-icon containers. */
export const RELEASE_FEED_SECONDARY_ICON_CLASS =
  `ios-press ios-press-soft relative inline-flex h-5 w-5 shrink-0 items-center justify-center text-foreground/80 hover:text-white ${RELEASE_FEED_CTA_HIT_SLOP_CLASS}` as const;

export const RELEASE_FEED_SECONDARY_ICON_SLOT_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden" as const;

/** +N overflow → opens release detail. */
export const RELEASE_FEED_OVERFLOW_COUNT_CLASS =
  "ios-press ios-press-soft inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-semibold leading-none text-muted-foreground hover:text-foreground" as const;

/** Bottom actions anchored to artwork bottom — mt-auto on the action row only. */
export const RELEASE_FEED_ACTIONS_ROW_CLASS =
  "mt-auto flex w-full min-w-0 items-end justify-between gap-2 pt-1" as const;

export const RELEASE_FEED_ACTIONS_LEADING_CLASS =
  "flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5" as const;

export const RELEASE_FEED_WIDGET_SLOT_CLASS =
  "flex shrink-0 items-end justify-end" as const;

/** Detail: inline wrap row — no button/card shells. */
export const RELEASE_DETAIL_LINK_ROW_CLASS =
  "mb-6 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2.5" as const;

/** Detail: platform icon + full label, no bg container, no external glyph. */
export const RELEASE_DETAIL_LINK_CLASS =
  "ios-press ios-press-soft inline-flex min-h-10 max-w-full min-w-0 items-center gap-1.5 py-1 text-left text-sm font-medium text-foreground hover:text-white" as const;

export const RELEASE_DETAIL_LINK_ICON_SLOT_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden" as const;

export const RELEASE_DETAIL_LINK_SHOW_EXTERNAL_ICON = false as const;

/**
 * Primary My/Saved: text-led two-column collection switch.
 * No boxes, trays, fills, or segmented capsule. Hit area stays >=44pt.
 * Geometry from shared sticky chrome; material via Releases sticky modifier.
 */
export const RELEASE_TRACKER_STICKY_CHROME_CLASS =
  `${STICKY_TAB_CHROME_CLASS} ${APP_MATERIAL_RELEASES_STICKY_CLASS}` as const;
/** Same dissolve geometry as Leaderboard; Releases wash via sticky-fade modifier. */
export const RELEASE_TRACKER_STICKY_FADE_CLASS =
  `${STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS} ${APP_MATERIAL_RELEASES_STICKY_FADE_CLASS}` as const;
export const RELEASE_TRACKER_CONTENT_TOP_GAP_CLASS = STICKY_TAB_CONTENT_TOP_GAP_CLASS;
export const RELEASE_TRACKER_PRIMARY_ROW_CLASS = STICKY_TAB_PRIMARY_ROW_CLASS;
/** Secondary Upcoming/Collaborations/Past + layout toggle. No full-width baseline rule. */
export const RELEASE_TRACKER_SECONDARY_ROW_CLASS = "flex min-h-11 items-end" as const;
export const RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS =
  "ios-press relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-1 text-[15px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" as const;
export const RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS =
  "font-semibold text-foreground" as const;
export const RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS =
  "font-medium text-white/55 hover:text-white/80" as const;
/** Label-width indicator host — underline sits under the words, not the half-column. */
export const RELEASE_TRACKER_PRIMARY_LABEL_CLASS =
  "relative inline-block whitespace-nowrap px-0.5 pb-[5px]" as const;
/** Generic selection underline — dub hub blue (not semantic teal). */
export const RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS =
  "after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[#0a83ff]" as const;

/**
 * Secondary tab label typography (RELEASES-SWIPE-TABS-7).
 * Active + inactive share `font-semibold` so swipe/tap commit never shifts glyph metrics.
 * Selection emphasis is colour/opacity only (classes here + pager colour lerp).
 */
export const RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS =
  "font-semibold text-foreground" as const;
export const RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS =
  "font-semibold text-white/55 hover:text-white/80" as const;

/**
 * Shared secondary underline (list + artwork tap morph).
 * Matches former per-button `after:h-0.5` / `#0a83ff` / rounded-full.
 * Horizontal inset (8px each side) applied when measuring flex-1 tab rects.
 */
export const RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS =
  "pointer-events-none absolute z-[1] h-0.5 rounded-full bg-[#0a83ff]" as const;

/** Tap indicator morph (when not reduced-motion) — same cadence as Profile. */
export const RELEASE_TRACKER_SECONDARY_INDICATOR_TAP_MS = 200 as const;

/** Tablist hosts the shared indicator (`relative`). */
export const RELEASE_TRACKER_SECONDARY_TABLIST_CLASS =
  "relative flex min-h-11 min-w-0 flex-1" as const;

/**
 * Usable empty region below sticky tabs / above Add Release (or listener bottom pad).
 * `min-h-full` fills the active pager panel even when that panel is temporarily
 * `display:block` (flex-1 alone cannot grow without a flex parent).
 */
export const RELEASE_TRACKER_EMPTY_REGION_CLASS =
  "flex min-h-full w-full flex-1 flex-col items-center justify-center py-4" as const;

/** Empty-state group (icon/title/body/optional CTA) — one centred block, no viewport %). */
export const RELEASE_TRACKER_EMPTY_CLASS =
  "mx-auto w-full max-w-sm px-2 text-center" as const;
export const RELEASE_TRACKER_EMPTY_ICON_CLASS =
  "mx-auto mb-4 h-12 w-12 text-white/40" as const;
export const RELEASE_TRACKER_EMPTY_TITLE_CLASS =
  "mb-2 text-base font-semibold text-foreground" as const;
export const RELEASE_TRACKER_EMPTY_BODY_CLASS =
  "text-sm leading-relaxed text-muted-foreground" as const;
export const RELEASE_TRACKER_EMPTY_CTA_CLASS =
  `mt-5 ${APP_MATERIAL_CERAMIC_BUTTON_CLASS}` as const;

export const RELEASE_TRACKER_FAB_UNDERLAY_CLASS = APP_MATERIAL_RELEASES_FAB_UNDERLAY_CLASS;
export const RELEASE_TRACKER_FAB_FADE_CLASS = "dubhub-app-releases-fab-fade";
/** React-nav opaque band over the web tab bar. Collapsed when native nav is on. */
export const RELEASE_TRACKER_NAV_SHELF_ATTR = "data-releases-nav-shelf" as const;
/** Full-width CTA bleed behind Add Release. Collapsed when native nav is on. */
export const RELEASE_TRACKER_CTA_SLAB_ATTR = "data-releases-cta-slab" as const;
/** Add Release CTA — ceramic; C2 softens radius only (~18px). */
export const RELEASE_TRACKER_ADD_CTA_CLASS = APP_MATERIAL_RELEASES_ADD_CTA_CLASS;

export function getScopeFromSearch(search: string, isArtist: boolean): ReleaseTrackerFeedScope {
  if (!isArtist) return "saved";
  const s = new URLSearchParams(search).get("scope");
  return s === "saved" ? "saved" : "my";
}

export function getViewFromSearch(
  search: string,
  scope: ReleaseTrackerFeedScope,
): ReleaseTrackerFeedView {
  const v = new URLSearchParams(search).get("view");
  if (scope === "saved") return v === "past" ? "past" : "upcoming";
  return v === "past" || v === "collaborations" ? v : "upcoming";
}

export function getReleaseTrackerSecondaryViews(
  scope: ReleaseTrackerFeedScope,
): ReleaseTrackerFeedView[] {
  return scope === "my" ? ["upcoming", "collaborations", "past"] : ["upcoming", "past"];
}

export function coerceReleaseTrackerView(
  scope: ReleaseTrackerFeedScope,
  view: ReleaseTrackerFeedView,
): ReleaseTrackerFeedView {
  return scope === "saved" && view === "collaborations" ? "upcoming" : view;
}

export function buildReleaseTrackerSearch(args: {
  isArtist: boolean;
  scope: ReleaseTrackerFeedScope;
  view: ReleaseTrackerFeedView;
}): string {
  const params = new URLSearchParams();
  if (args.isArtist) params.set("scope", args.scope);
  params.set("view", args.view);
  return `?${params}`;
}

export function hasAcceptedReleaseCollaborators(
  collaborators?: { status?: string }[] | null,
): boolean {
  return (collaborators || []).some((c) => c.status === "ACCEPTED");
}

/**
 * Hide byline only for own solo releases on My Releases.
 * Saved, Collaborations, other-owned, and accepted multi-artist rows keep attribution.
 */
export function shouldShowReleaseFeedByline(args: {
  scope: ReleaseTrackerFeedScope;
  view: ReleaseTrackerFeedView;
  currentUserId: string | undefined;
  artistId: string;
  collaborators?: { status?: string }[] | null;
}): boolean {
  if (args.scope === "saved") return true;
  if (args.view === "collaborations") return true;
  if (!args.currentUserId || args.artistId !== args.currentUserId) return true;
  return hasAcceptedReleaseCollaborators(args.collaborators);
}

export function getReleaseTrackerEmptyCopy(args: {
  view: ReleaseTrackerFeedView;
  scope: ReleaseTrackerFeedScope;
  /**
   * My Upcoming only — owned Past history when known.
   * `null` / omitted = unresolved (stable generic upcoming empty).
   */
  hasOwnedReleaseHistory?: boolean | null;
}): { title: string; body: string } {
  if (args.view === "upcoming") {
    if (args.scope === "my") {
      if (args.hasOwnedReleaseHistory === true) {
        return {
          title: "No upcoming releases",
          body: "Add your next release when you're ready.",
        };
      }
      if (args.hasOwnedReleaseHistory === false) {
        return {
          title: "No releases yet",
          body:
            "Create your first release to start linking your identified posts and sharing release details.",
        };
      }
      return {
        title: "No upcoming releases",
        body:
          "Create a release or accept collaboration invites to see upcoming releases here.",
      };
    }
    return {
      title: "No upcoming releases",
      body: "Like posts identified by artists to see their releases here.",
    };
  }
  if (args.view === "collaborations") {
    return {
      title: "No collaborations",
      body: "You'll see releases you're invited to collaborate on here.",
    };
  }
  if (args.scope === "my") {
    return {
      title: "No past releases",
      body: "Your released music will appear here.",
    };
  }
  return {
    title: "No past releases",
    body: "Past releases from liked posts will appear here.",
  };
}

/** My Upcoming empty CTA — owned history only (`artistId`), never collaborations. */
export const MY_UPCOMING_EMPTY_CTA_FIRST = "Add your first release" as const;
export const MY_UPCOMING_EMPTY_CTA_NEXT = "Add your next release" as const;
/** Stable empty-state CTA while Past ownership history is still unresolved. */
export const MY_UPCOMING_EMPTY_CTA_UNRESOLVED = "Add release" as const;

export type MyUpcomingEmptyReleaseCtaLabel =
  | typeof MY_UPCOMING_EMPTY_CTA_FIRST
  | typeof MY_UPCOMING_EMPTY_CTA_NEXT
  | typeof MY_UPCOMING_EMPTY_CTA_UNRESOLVED;

export function hasOwnedReleaseHistory(
  pastFeedItems: { artistId: string }[],
  currentUserId: string | undefined,
): boolean {
  if (!currentUserId) return false;
  return pastFeedItems.some((release) => release.artistId === currentUserId);
}

export function getMyUpcomingEmptyReleaseCtaLabel(
  hasOwnedHistory: boolean,
): typeof MY_UPCOMING_EMPTY_CTA_FIRST | typeof MY_UPCOMING_EMPTY_CTA_NEXT {
  return hasOwnedHistory ? MY_UPCOMING_EMPTY_CTA_NEXT : MY_UPCOMING_EMPTY_CTA_FIRST;
}

/**
 * My Upcoming empty CTA label.
 *
 * Permanent stable copy: parallel Past prefetch cannot guarantee history before
 * empty-state paint on cold load, and first/next refinement changes button width.
 * Ownership helpers remain for non-CTA use / unit coverage.
 */
export function resolveMyUpcomingEmptyReleaseCtaLabel(_args?: {
  pastFeedResolved?: boolean;
  pastFeedItems?: { artistId: string }[];
  currentUserId?: string | undefined;
}): typeof MY_UPCOMING_EMPTY_CTA_UNRESOLVED {
  return MY_UPCOMING_EMPTY_CTA_UNRESOLVED;
}

export function stopReleaseRowNavigation(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}
