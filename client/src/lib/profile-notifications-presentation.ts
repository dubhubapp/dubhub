/**
 * Profile → Notifications tab presentation contract.
 * Display-only — mark-read, routing, grouping, and types stay in page/shared modules.
 */

import { APP_MATERIAL_INTERACTIVE_BLUE } from "./app-material";

/** Same interactive blue as Settings focus / material links. */
export const PROFILE_NOTIFICATION_INTERACTIVE_BLUE = APP_MATERIAL_INTERACTIVE_BLUE;

/**
 * Nested Notifications list scroller.
 * Scroll ownership only — top dissolve lives on {@link PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS}.
 * `pt-[5px]` (PROFILE-TABS-2A-FIX-7): tiny scrollable inset so the first row clears the fade at rest.
 * `overscroll-y-none` + WK `[overscroll-behavior-y:none]`: custom PTR owns top pull (PROFILE-NOTIFICATIONS-PTR-2).
 */
export const PROFILE_NOTIFICATIONS_VIEWPORT_CLASS =
  "relative mt-12 max-h-[70dvh] overflow-y-auto overscroll-y-none [overscroll-behavior-y:none] pt-[5px] pr-1" as const;

/** Asymptotic visual pull cap (no hard wall). */
export const PROFILE_NOTIFICATIONS_PTR_MAX_VISUAL_PX = 108;
/** Rubber-band gain — initial movement ~0.60× finger, then progressive resistance. */
export const PROFILE_NOTIFICATIONS_PTR_GAIN = 0.6;
/** Visual pull distance that commits refresh on release. */
export const PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX = 56;
/** Snap-back / completion height transition. */
export const PROFILE_NOTIFICATIONS_PTR_SNAP_MS = 240;
export const PROFILE_NOTIFICATIONS_PTR_SNAP_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Minimum time the committed refresh hold stays open (vinyl spin) after threshold release. */
export const PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS = 1000;
/** Continuous refresh-phase vinyl period (Notifications only — not Tailwind `animate-spin`). */
export const PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_MS = 700;
/**
 * Faster linear infinite spin while refresh is committed / completing.
 * CSS: `.profile-notifications-ptr-refresh-spin` in index.css.
 */
export const PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_CLASS =
  "profile-notifications-ptr-refresh-spin text-primary" as const;
/** Finger-led pull rotation: degrees per visual pull pixel. */
export const PROFILE_NOTIFICATIONS_PTR_PULL_ROTATE_DEG_PER_PX = 2;
/** Tolerate subpixel / elastic settle at top before arming PTR. */
export const PROFILE_NOTIFICATIONS_PTR_TOP_EPSILON_PX = 1;

/**
 * Extra wait after fetch settles before collapse may begin.
 * Fast fetch → pad up to min visible; slow fetch → 0 (no stacked delay).
 */
export function profileNotificationsPtrPostFetchHoldMs(
  fetchElapsedMs: number,
  minVisibleMs: number = PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS,
): number {
  if (minVisibleMs <= 0) return 0;
  return Math.max(0, minVisibleMs - Math.max(0, fetchElapsedMs));
}

/**
 * Maps finger travel → visual pull with increasing resistance
 * (same asymptotic form as Home math; Profile-owned constants).
 */
export function profileNotificationsRubberBandPull(
  fingerDeltaPx: number,
  maxVisualPullPx: number = PROFILE_NOTIFICATIONS_PTR_MAX_VISUAL_PX,
  gain: number = PROFILE_NOTIFICATIONS_PTR_GAIN,
): number {
  if (fingerDeltaPx <= 0 || maxVisualPullPx <= 0) return 0;
  return maxVisualPullPx * (1 - Math.exp((-fingerDeltaPx * gain) / maxVisualPullPx));
}

/** Hold spacer after threshold commit — keep release height, never below threshold. */
export function profileNotificationsPtrHoldHeightPx(releaseVisualPx: number): number {
  return Math.min(
    PROFILE_NOTIFICATIONS_PTR_MAX_VISUAL_PX,
    Math.max(PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX, Math.round(releaseVisualPx)),
  );
}

/** Indicator opacity from visual pull progress (0…1 at threshold). */
export function profileNotificationsPtrIndicatorOpacity(
  visualPullPx: number,
  refreshing: boolean,
): number {
  if (refreshing) return 1;
  if (visualPullPx <= 0) return 0;
  return Math.min(1, visualPullPx / PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX);
}

/** Finger-led vinyl angle while pulling (not used during continuous refresh spin). */
export function profileNotificationsPtrPullRotateDeg(visualPullPx: number): number {
  return Math.max(0, visualPullPx) * PROFILE_NOTIFICATIONS_PTR_PULL_ROTATE_DEG_PER_PX;
}

/**
 * Notifications TabsContent top spacing.
 * Shell keeps shared `mb-3` (12px). `-mt-3` cancels that for Notifications only so
 * content sits ~4px under the tab underline (`pb-1` on the shell).
 * Overview / Posts / Likes spacing unchanged.
 */
export const PROFILE_NOTIFICATIONS_TAB_CONTENT_CLASS = "-mt-3" as const;

/**
 * Outer always-on top mask host (PROFILE-TABS-2A-FIX-6).
 * `-mt-12` lifts the mask origin 48px so the transparent band sits above the rows;
 * the inner scroller uses matching `mt-12` to keep notification content unmoved.
 * CSS: `.profile-notifications-top-mask` in index.css.
 */
export const PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS =
  "profile-notifications-top-mask relative z-0 -mt-12" as const;

/**
 * Profile Notifications only.
 * Full-lane press wash (no inset `mx-*`, no `rounded-lg` card shape).
 * Parent `SETTINGS_ROWS_STACK_CLASS` owns dividers; `px-2` insets content only.
 * Media thumbnails keep their own `rounded-lg` / circle frames.
 */
export const PROFILE_NOTIFICATION_ROW_SURFACE_CLASS =
  "flex w-full min-h-11 cursor-pointer items-start gap-3 rounded-none px-2 py-3 text-left bg-transparent hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0a83ff]/45 active:bg-black/[0.04] dark:active:bg-white/[0.04] [@media(hover:hover)]:hover:bg-black/[0.03] dark:[@media(hover:hover)]:hover:bg-white/[0.03]" as const;

/**
 * Single unread row wash — ~7% interactive blue.
 * No amber release / green-amber collab category washes.
 */
export const PROFILE_NOTIFICATION_UNREAD_SURFACE_CLASS = "bg-[#0a83ff]/[0.07]" as const;

/** 8px unread disc — interactive blue family (not white / amber / green). */
export const PROFILE_NOTIFICATION_UNREAD_DOT_CLASS =
  "h-2 w-2 shrink-0 rounded-full bg-[#0a83ff]" as const;

/**
 * Square post/release media frame — 56×56, material hairline.
 * Replaces legacy `bg-gray-800` + sharp `rounded`.
 */
export const PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS =
  "relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/25" as const;

/** Centered Bell on empty media — muted, no glow. */
export const PROFILE_NOTIFICATION_MEDIA_FALLBACK_CLASS =
  "flex h-full w-full items-center justify-center" as const;

export const PROFILE_NOTIFICATION_MEDIA_FALLBACK_ICON_CLASS =
  "h-5 w-5 text-muted-foreground/70" as const;

/**
 * Quiet group-count pill — material wash, no bright border / glow.
 */
export const PROFILE_NOTIFICATION_GROUP_COUNT_CLASS =
  "rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground" as const;

/** Primary body — compact; unread may use medium weight via caller. */
export const PROFILE_NOTIFICATION_BODY_CLASS = "text-sm whitespace-pre-line text-foreground/90" as const;

export const PROFILE_NOTIFICATION_BODY_UNREAD_CLASS =
  "text-sm whitespace-pre-line font-medium text-foreground" as const;

/** Skeleton row chrome — matches live row geometry (full-lane, no inset card). */
export const PROFILE_NOTIFICATION_SKELETON_ROW_CLASS =
  "flex w-full min-h-11 items-start gap-3 px-2 py-3" as const;

/** Square media placeholder for loading skeleton. */
export const PROFILE_NOTIFICATION_SKELETON_MEDIA_SQUARE_CLASS =
  "h-14 w-14 flex-shrink-0 animate-pulse rounded-lg border border-white/10 bg-white/10" as const;

/** Circle media placeholder (person-event skeleton variety). */
export const PROFILE_NOTIFICATION_SKELETON_MEDIA_CIRCLE_CLASS =
  "h-14 w-14 flex-shrink-0 animate-pulse rounded-full border border-white/10 bg-white/10" as const;

export function getProfileNotificationUnreadSurfaceClass(hasUnread: boolean): string {
  return hasUnread ? PROFILE_NOTIFICATION_UNREAD_SURFACE_CLASS : "";
}

export function getProfileNotificationBodyClass(hasUnread: boolean): string {
  return hasUnread ? PROFILE_NOTIFICATION_BODY_UNREAD_CLASS : PROFILE_NOTIFICATION_BODY_CLASS;
}
