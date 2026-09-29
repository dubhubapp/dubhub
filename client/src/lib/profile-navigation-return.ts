import { createContext, createElement, useContext, type ReactNode } from "react";
import { isPublicProfilePath, routePathname } from "@/lib/interactive-page-transitions";

const REOPEN_COMMENTS_KEY = "dubhub:profile-return-reopen-comments";
const ENTER_ANIMATION_KEY = "dubhub:public-profile-enter";

const OwnProfileViewerCommentsHostContext = createContext(false);

/** True only around Own Profile Posts/Likes `FullScreenPostSequenceViewer`. */
export function OwnProfileViewerCommentsHost({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return createElement(OwnProfileViewerCommentsHostContext.Provider, { value: active }, children);
}

export function useOwnProfileViewerCommentsHost(): boolean {
  return useContext(OwnProfileViewerCommentsHostContext);
}

export function isOwnProfileLocation(location: string): boolean {
  return routePathname(location) === "/profile";
}

/**
 * Reopen Comments only after Own Profile is actually foreground again, on the
 * same viewer post that stashed the return. Cancelled Back stays on the public
 * profile, so `location` never becomes `/profile` and this stays false.
 */
export function resolveOwnProfileViewerCommentsRestore(input: {
  previousLocation: string;
  location: string;
  hostActive: boolean;
  viewerCardActive: boolean;
  postId: string;
  stashedPostId: string | null;
}): boolean {
  const becameOwnProfileForeground =
    isPublicProfilePath(input.previousLocation) && isOwnProfileLocation(input.location);
  if (!becameOwnProfileForeground) return false;
  if (!input.hostActive) return false;
  if (!input.viewerCardActive) return false;
  const stashed = input.stashedPostId?.trim() ?? "";
  const postId = input.postId.trim();
  if (!stashed || stashed !== postId) return false;
  return true;
}

/** Home consumed the reopen stash. The next Comments mount should appear already open. */
let restoreCommentsWithoutOpenAnimation = false;

/** Stash post id so Home can reopen the comments drawer after returning from a public profile. */
export function stashProfileReturnReopenComments(postId: string): void {
  if (typeof window === "undefined") return;
  const trimmed = postId.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(REOPEN_COMMENTS_KEY, trimmed);
  } catch {
    // ignore quota / private mode
  }
}

/** Read the stashed comments post id without clearing it. */
export function peekProfileReturnReopenComments(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(REOPEN_COMMENTS_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

/** Read and clear the stashed comments post id (once per return). */
export function consumeProfileReturnReopenComments(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(REOPEN_COMMENTS_KEY);
    if (value) sessionStorage.removeItem(REOPEN_COMMENTS_KEY);
    const trimmed = value?.trim();
    if (trimmed) restoreCommentsWithoutOpenAnimation = true;
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** True once, for the Comments drawer Home opens after returning from a public profile. */
export function consumeCommentsRestoreWithoutOpenAnimation(): boolean {
  const value = restoreCommentsWithoutOpenAnimation;
  restoreCommentsWithoutOpenAnimation = false;
  return value;
}

/** Hint the public profile page to play a short enter animation after popup navigation. */
export function markPublicProfileEnterAnimation(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ENTER_ANIMATION_KEY, "1");
  } catch {
    // ignore
  }
}

export function consumePublicProfileEnterAnimation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const value = sessionStorage.getItem(ENTER_ANIMATION_KEY);
    if (value) sessionStorage.removeItem(ENTER_ANIMATION_KEY);
    return value === "1";
  } catch {
    return false;
  }
}
