/**
 * Home sorted-feed end-of-list presentation — copy, material, idle dice tease.
 * Does not own Random navigation; callers keep handleFeedSortChange("random").
 */

import { APP_MATERIAL_INTERACTIVE_BLUE } from "@/lib/app-material";

export const HOME_FEED_END_TITLE = "You're all caught up" as const;

export const HOME_FEED_END_BODY =
  "Spin the dice and jump into a random unidentified clip." as const;

export const HOME_FEED_END_DICE_ARIA_LABEL = "Switch to random discovery" as const;

/** Match `animation.dice-spin` in tailwind.config.ts (0.42s). */
export const HOME_FEED_END_DICE_SPIN_MS = 420 as const;

/** Still beat after the end state becomes visible before the first idle spin. */
export const HOME_FEED_END_IDLE_SPIN_INITIAL_MS = 4000 as const;

/** Gap after an idle spin finishes before the next tease (not continuous). */
export const HOME_FEED_END_IDLE_SPIN_INTERVAL_MS = 8000 as const;

/** Snap slide shell — same geometry as video rows; local atmosphere only. */
export const HOME_FEED_END_SLIDE_CLASS =
  "min-h-full h-full relative w-full shrink-0 snap-start snap-always [scroll-snap-stop:always] bg-black" as const;

/**
 * Quiet blue-black radial lift behind the composition (not a global Home canvas).
 * Uses the shared interactive blue family — no teal gaming glow.
 */
export const HOME_FEED_END_ATMOSPHERE_CLASS =
  "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(10,131,255,0.11)_0%,rgba(8,12,28,0.42)_38%,transparent_68%)]" as const;

/** Content column — centered in the snap viewport; no bordered card. */
export const HOME_FEED_END_CONTENT_CLASS =
  "absolute inset-0 flex flex-col items-center justify-center px-8 text-center" as const;

/** Soft catch-light behind the dice control (single focus treatment). */
export const HOME_FEED_END_DICE_HALO_STYLE = {
  background: `radial-gradient(circle, ${APP_MATERIAL_INTERACTIVE_BLUE}38 0%, ${APP_MATERIAL_INTERACTIVE_BLUE}14 42%, transparent 72%)`,
} as const;

export const HOME_FEED_END_DICE_HALO_CLASS =
  "pointer-events-none absolute size-[4.5rem] rounded-full" as const;

/**
 * Compact circular material for the dice CTA — glass/tonal only.
 * No hard teal outline; no second glow ring.
 */
export const HOME_FEED_END_DICE_BUTTON_CLASS =
  "relative z-10 !min-h-11 !min-w-11 rounded-full border border-white/12 bg-white/[0.08] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] opacity-100 transition-transform duration-150 active:scale-95 !ring-0" as const;

export const HOME_FEED_END_TITLE_CLASS =
  "mt-5 text-base font-semibold tracking-wide text-white" as const;

export const HOME_FEED_END_BODY_CLASS =
  "mt-2 max-w-[17.5rem] text-sm leading-relaxed text-white/75" as const;

export type HomeFeedEndVisibilityInput = {
  sortMode: string;
  isInitialFeedLoad: boolean;
  isError: boolean;
  uiPostsLength: number;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  suppressPlaceholderFeedRows: boolean;
};

/** True only when the sorted feed has truly exhausted pagination. */
export function shouldShowHomeFeedEndState(input: HomeFeedEndVisibilityInput): boolean {
  return (
    input.sortMode !== "random" &&
    !input.isInitialFeedLoad &&
    !input.isError &&
    input.uiPostsLength > 0 &&
    input.hasNextPage === false &&
    !input.isFetchingNextPage &&
    !input.suppressPlaceholderFeedRows
  );
}

export type HomeFeedEndIdleSpinGateInput = {
  reducedMotion: boolean;
  documentVisible: boolean;
  endStateInView: boolean;
  userTriggeredRandom: boolean;
};

/** Idle dice tease only when the surface is active and motion is allowed. */
export function shouldScheduleHomeFeedEndIdleSpin(
  input: HomeFeedEndIdleSpinGateInput,
): boolean {
  return (
    !input.reducedMotion &&
    input.documentVisible &&
    input.endStateInView &&
    !input.userTriggeredRandom
  );
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
