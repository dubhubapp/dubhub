/**
 * Home feed scrub visual geometry vs hit target.
 *
 * Home maps seek % to the inset visual track, not the full-width hit rect.
 * Extra hit slop around the pill must not move 0% or 100%.
 */

/**
 * Home visual track inset (HOME-SCRUB-4).
 * Left ≈ 14px (`pl-3.5`) = overlay `pl-3` + inner `pl-0.5` (avatar button).
 * Right ≈ 21px on 440pt: rail `right` 0.5rem + half of (rail column − 1.75rem glyph).
 * 440 − 14 − 21 = 405; right X = 419.
 */
export const HOME_SCRUB_VISUAL_INSET_CLASS =
  "pl-3.5 pr-[calc(0.5rem+(var(--video-feed-rail-width)-1.75rem)/2)] sm:pl-4" as const;

export const HOME_SCRUB_TRACK_CLASS =
  "pointer-events-none relative h-[3px] w-full overflow-hidden rounded-full" as const;

export const HOME_SCRUB_INACTIVE_CLASS = "absolute inset-0 bg-white/20" as const;

export const HOME_SCRUB_FILL_CLASS =
  "absolute inset-y-0 left-0 w-full origin-left bg-white/80 will-change-transform motion-reduce:transition-none" as const;

/**
 * Time readout sits above the visual track, not in overlay flow.
 * 2rem clears the release-card bottom that `8px` overlapped.
 */
export const HOME_SCRUB_READOUT_CLASS =
  "pointer-events-none absolute bottom-[calc(100%+2rem)] left-0 right-0 z-[2] text-center text-[11px] font-medium tabular-nums tracking-tight text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]" as const;

/** Home mute shell: same 54px rail column, right 8px, 44px control centred (centre X ≈ 405). */
export const HOME_SCRUB_SOUND_SHELL_CLASS =
  "pointer-events-none fixed z-[38] flex w-[var(--video-feed-rail-width)] justify-center bottom-[calc(var(--video-feed-scrub-bottom)+1.25rem)] right-[max(0.5rem,env(safe-area-inset-right,0px))]" as const;

export const HOME_SCRUB_SOUND_BUTTON_CLASS =
  "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-transparent [-webkit-tap-highlight-color:transparent] transition-opacity duration-300 ease-out motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95" as const;

export const HOME_FEED_SELECTOR = "[data-home-video-feed]";
export const HOME_FEED_SCRUB_LOCK_ATTR = "data-home-feed-scrub-lock";

let homeFeedScrubLockCount = 0;

/** Home-only: freeze the snap scroller while the portaled scrub owns the pointer. */
export function lockHomeFeedScrollForScrub(): void {
  if (typeof document === "undefined") return;
  const feed = document.querySelector<HTMLElement>(HOME_FEED_SELECTOR);
  if (!feed) return;
  homeFeedScrubLockCount += 1;
  feed.setAttribute(HOME_FEED_SCRUB_LOCK_ATTR, "on");
}

export function unlockHomeFeedScrollForScrub(): void {
  if (typeof document === "undefined") return;
  homeFeedScrubLockCount = Math.max(0, homeFeedScrubLockCount - 1);
  if (homeFeedScrubLockCount > 0) return;
  document.querySelector(HOME_FEED_SELECTOR)?.removeAttribute(HOME_FEED_SCRUB_LOCK_ATTR);
}

/** Unmount / interrupted gesture: drop the lock even if acquire/release counts drift. */
export function forceUnlockHomeFeedScrollForScrub(): void {
  homeFeedScrubLockCount = 0;
  if (typeof document === "undefined") return;
  document.querySelector(HOME_FEED_SELECTOR)?.removeAttribute(HOME_FEED_SCRUB_LOCK_ATTR);
}

export function scrubRatioFromClientX(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(trackLeft) || !(trackWidth > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, (clientX - trackLeft) / trackWidth));
}
