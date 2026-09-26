/**
 * Post-create free release allowance success moment (1 of 2 / 2 of 2).
 * Display never mentions rolling window / calendar year.
 */

import type { ReleaseCreationCapacity } from "./release-creation-capacity";

export const FREE_RELEASE_ALLOWANCE_SUCCESS_TITLE = "Release created" as const;
export const FREE_RELEASE_ALLOWANCE_SUCCESS_DONE = "Done" as const;
export const FREE_RELEASE_ALLOWANCE_SUCCESS_VIEW_TOOLS =
  "View Artist Tools" as const;

export const FREE_RELEASE_ALLOWANCE_COUNT_ANIMATION_MS = 350 as const;

export type FreeReleaseAllowanceSuccessUsed = 1 | 2;

export type FreeReleaseAllowanceSuccessCopy = {
  used: FreeReleaseAllowanceSuccessUsed;
  /** Animated digit (final value). */
  usedCount: FreeReleaseAllowanceSuccessUsed;
  /** Digits start from this value when animating. */
  animateFrom: number;
  progressSuffix: string;
  supporting: string;
  showViewArtistTools: boolean;
};

/**
 * Authoritative capacity gate for the post-create allowance dialog.
 * Never use optimistic used+1.
 */
export function shouldShowFreeReleaseAllowanceSuccess(
  capacity: ReleaseCreationCapacity | null | undefined,
): capacity is ReleaseCreationCapacity & {
  used: FreeReleaseAllowanceSuccessUsed;
  unlimited: false;
} {
  if (!capacity) return false;
  if (capacity.unlimited === true) return false;
  if (capacity.limit !== 2) return false;
  return capacity.used === 1 || capacity.used === 2;
}

export function resolveFreeReleaseAllowanceSuccessCopy(
  used: FreeReleaseAllowanceSuccessUsed,
): FreeReleaseAllowanceSuccessCopy {
  if (used === 1) {
    return {
      used: 1,
      usedCount: 1,
      animateFrom: 0,
      progressSuffix: "of 2 free releases used",
      supporting: "You have 1 free release left.",
      showViewArtistTools: false,
    };
  }
  return {
    used: 2,
    usedCount: 2,
    animateFrom: 1,
    progressSuffix: "of 2 free releases used",
    supporting:
      "You've used your free release allowance. Verified Artist Tools gives you unlimited releases.",
    showViewArtistTools: true,
  };
}

export function resolveAllowanceCountDisplay(args: {
  used: FreeReleaseAllowanceSuccessUsed;
  reducedMotion: boolean;
  /** 0–1 progress through the tween; ignored when reducedMotion. */
  progress?: number;
}): number {
  const copy = resolveFreeReleaseAllowanceSuccessCopy(args.used);
  if (args.reducedMotion) return copy.usedCount;
  const p = Math.min(1, Math.max(0, args.progress ?? 1));
  const eased = 1 - (1 - p) * (1 - p);
  return Math.round(copy.animateFrom + (copy.usedCount - copy.animateFrom) * eased);
}
