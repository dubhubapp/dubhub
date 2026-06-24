const REOPEN_COMMENTS_KEY = "dubhub:profile-return-reopen-comments";
const ENTER_ANIMATION_KEY = "dubhub:public-profile-enter";

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

/** Read and clear the stashed comments post id (once per return). */
export function consumeProfileReturnReopenComments(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(REOPEN_COMMENTS_KEY);
    if (value) sessionStorage.removeItem(REOPEN_COMMENTS_KEY);
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
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
