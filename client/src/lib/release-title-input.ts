import { INPUT_LIMITS } from "@shared/input-limits";

export const RELEASE_TITLE_MAX_LENGTH = INPUT_LIMITS.releaseTitle;

/** Clamp title draft input to the shared release title limit. */
export function clampReleaseTitleInput(value: string): string {
  return value.slice(0, RELEASE_TITLE_MAX_LENGTH);
}

export function releaseTitleCharCountLabel(length: number): string {
  return `${length} / ${RELEASE_TITLE_MAX_LENGTH}`;
}

export function isReleaseTitleWithinLimit(value: string): boolean {
  return value.trim().length <= RELEASE_TITLE_MAX_LENGTH;
}
