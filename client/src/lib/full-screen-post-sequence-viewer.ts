/**
 * Shared full-screen post sequence viewer contracts (PROFILE-GRID-VIEWER-2B).
 * FULLSCREEN-POST-VIEWER-2A: viewer-only metadata bottom stack (not Home nav exclusion).
 */

export const FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS =
  "fixed inset-0 z-[100] h-[100dvh] w-screen bg-black" as const;

export const FULL_SCREEN_POST_SEQUENCE_SCROLL_CLASS =
  "h-[100dvh] w-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" as const;

export const FULL_SCREEN_POST_SEQUENCE_SLIDE_CLASS =
  "relative h-[100dvh] w-full shrink-0 snap-start snap-always" as const;

/**
 * Viewer scrub chrome above its outer bottom pad: hit `pb-1` (0.25rem) + track ~3px.
 * Token kept at 0.5rem so the 2A metadata→scrub gap contract does not shift with 2B chrome.
 */
export const FULL_SCREEN_VIEWER_SCRUB_CHROME_ABOVE_PAD = "0.5rem" as const;

/** Compact gap between lowest metadata content and scrub track (~12px). */
export const FULL_SCREEN_VIEWER_METADATA_SCRUB_GAP = "0.75rem" as const;

/**
 * Profile / Likes viewer: scrub is `bottom-0` + `pb-[max(0.25rem,safe-area)]`.
 * Overlay bottom = that pad + scrub chrome above pad + metadata→scrub gap.
 * Does not consume Home `--video-card-overlay-bottom`.
 */
export const FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_CLASS =
  "bottom-[calc(max(0.25rem,env(safe-area-inset-bottom,0px))+0.5rem+0.75rem)]" as const;

export const FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_CLASS =
  "h-[calc(max(0.25rem,env(safe-area-inset-bottom,0px))+0.5rem+0.75rem)]" as const;

/**
 * Attached Clips (`moderatorPreview`): scrub is `bottom-[calc(safe+28px)]` with `pb-0`.
 * Same chrome + gap stacked on that scrub Y — not the old safe+5.25rem metadata pad.
 */
export const FULL_SCREEN_VIEWER_OVERLAY_BOTTOM_ATTACHED_CLASS =
  "bottom-[calc(env(safe-area-inset-bottom,0px)+28px+0.5rem+0.75rem)]" as const;

export const FULL_SCREEN_VIEWER_OVERLAY_FADE_HEIGHT_ATTACHED_CLASS =
  "h-[calc(env(safe-area-inset-bottom,0px)+28px+0.5rem+0.75rem)]" as const;

/** Viewer never inherits Home LG-NAV metadata translate. */
export const FULL_SCREEN_VIEWER_METADATA_SHIFT_CLASS = "translate-y-0" as const;

/**
 * Viewer right action rail: same clamp lift Home uses, with overlay-bottom forced to 0.
 * Ignores Home `--video-card-overlay-bottom` (hidden-nav exclusion while covered) and
 * metadata/release height so rail Y stays stable across sparse/rich posts.
 *
 * Absolute Y matches React-nav / visible-off Home rail — not the elevated native
 * exclusion band, and not the viewer metadata bottom token.
 */
export const FULL_SCREEN_VIEWER_ACTION_RAIL_BOTTOM_CLASS =
  "bottom-[clamp(calc(4.5rem+env(safe-area-inset-bottom,0px)),14lvh,7rem)]" as const;

/** True when VideoCard is hosted in the shared full-screen post sequence viewer. */
export function isFullScreenPostViewerCard(input: {
  embeddedFeed?: boolean;
  clipViewerOverlay?: boolean;
}): boolean {
  return Boolean(input.embeddedFeed && input.clipViewerOverlay);
}

/** Clamp open index into [0, length-1]. Empty sequence → 0. */
export function clampPostSequenceInitialIndex(initialIndex: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(initialIndex, length - 1));
}

/** Neighbour preload distance (matches attached-post / Profile snap policy). */
export function postSequenceShouldLoadVideo(distanceFromSnap: number): boolean {
  return distanceFromSnap <= 1;
}

export function postSequenceVideoPreload(
  distanceFromSnap: number,
): "auto" | "metadata" | "none" {
  if (distanceFromSnap === 0) return "auto";
  if (distanceFromSnap <= 1) return "metadata";
  return "none";
}
