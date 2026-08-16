/**
 * Presentation helpers for the Releases tab (ReleaseTracker).
 * Scope/view URL behaviour and feed queries stay in the page — this file is display/state-shape only.
 */

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

/** Flat media row — no per-item glass card shell. Top-align artwork with metadata. */
export const RELEASE_FEED_ROW_BASE_CLASS =
  "ios-press relative flex items-start w-full min-w-0 gap-3.5 overflow-hidden py-3.5 text-left transition-colors" as const;

/** Artwork size token — 96px (R1.5). Bottom edge does not dictate status placement. */
export const RELEASE_FEED_ARTWORK_SIZE_CLASS = "h-24 w-24 shrink-0 rounded-lg" as const;
export const RELEASE_FEED_ARTWORK_PX = 96 as const;
export const RELEASE_FEED_ARTWORK_FALLBACK_ICON_CLASS = "h-11 w-11" as const;

/**
 * Metadata column — top-anchored primary stack; min-h matches artwork so the
 * icon row can sit on the artwork bottom via mt-auto without clipping.
 */
export const RELEASE_FEED_META_COLUMN_CLASS =
  "flex min-h-24 min-w-0 flex-1 flex-col" as const;

/** Primary metadata stack (title → optional byline → date → banner → status). */
export const RELEASE_FEED_META_STACK_CLASS = "flex min-w-0 flex-col gap-0.5" as const;

/** Status sits in the same compact stack as title/date — not bottom-anchored. */
export const RELEASE_FEED_STATUS_ROW_CLASS =
  "flex w-full flex-wrap items-center gap-1 pt-0.5" as const;

/**
 * Home/feed release preview: date + canonical status pill on one compact row.
 */
export const RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS =
  "mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5" as const;

/** Month / section headings — title case, near-white (not muted uppercase). */
export const RELEASE_FEED_MONTH_HEADING_CLASS =
  "mb-1 text-sm font-semibold text-white" as const;

/**
 * Overview link row — in-flow at column bottom (mt-auto).
 * Glyph bottoms meet artwork bottom; gap keeps marks from touching.
 */
export const RELEASE_FEED_CTA_LIST_CLASS =
  "mt-auto flex w-full min-w-0 flex-wrap items-end gap-[3px]" as const;

/**
 * Icon-only overview tap target.
 * Layout box is h-8 with items-end so the h-5 glyph sits on the artwork edge;
 * left-aligned with metadata text.
 */
export const RELEASE_FEED_CTA_ICON_ONLY_CLASS =
  "ios-press ios-press-soft inline-flex h-8 min-w-8 shrink-0 items-end justify-start pl-0 text-foreground hover:text-white" as const;

/** Semantic overview action (Free DL / Dub Pack / Other) — icon + short label. */
export const RELEASE_FEED_CTA_SEMANTIC_CLASS =
  "ios-press ios-press-soft inline-flex h-8 max-w-full min-w-0 shrink-0 items-end gap-1 pl-0 text-left text-xs font-medium leading-none text-foreground hover:text-white" as const;

/** @deprecated Prefer RELEASE_FEED_CTA_ICON_ONLY_CLASS / SEMANTIC — kept for older imports. */
export const RELEASE_FEED_CTA_CLASS = RELEASE_FEED_CTA_SEMANTIC_CLASS;

/** Icon box inside overview actions. */
export const RELEASE_FEED_CTA_ICON_SLOT_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden" as const;

/** Decorative Lucide ExternalLink is intentionally not shown on list CTAs. */
export const RELEASE_FEED_CTA_SHOW_EXTERNAL_ICON = false as const;

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
 */
export const RELEASE_TRACKER_STICKY_CHROME_CLASS = STICKY_TAB_CHROME_CLASS;
/** Same dissolve treatment as Leaderboard sticky (parity when switching bottom tabs). */
export const RELEASE_TRACKER_STICKY_FADE_CLASS = STICKY_TAB_BLUR_DISSOLVE_FADE_CLASS;
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
/** Stronger than secondary `after:h-0.5` + `inset-x-2`; still not a half-width bar. */
export const RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS =
  "after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-accent" as const;

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
}): { title: string; body: string } {
  if (args.view === "upcoming") {
    return {
      title: "No upcoming releases",
      body:
        args.scope === "my"
          ? "Create a release or accept collaboration invites to see upcoming releases here."
          : "Like posts that are verified by artists to see their releases here.",
    };
  }
  if (args.view === "collaborations") {
    return {
      title: "No collaborations",
      body: "You'll see releases you're invited to collaborate on here.",
    };
  }
  return {
    title: "No past releases",
    body:
      args.scope === "my"
        ? "Past releases from you and collaborations will appear here."
        : "Past releases from liked posts will appear here.",
  };
}

export function stopReleaseRowNavigation(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}
