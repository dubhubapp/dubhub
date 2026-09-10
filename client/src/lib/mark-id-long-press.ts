import { isDeletedCommentBody } from "@shared/deleted-comment";

/** Conventional deliberate long-press (iOS-range); not a short tap. */
export const MARK_ID_LONG_PRESS_MS = 500 as const;

/**
 * MARK-ID-UX-1B — after haptic acknowledgement, wait this long before opening
 * the ID dialog so the pulse perceptually leads the visual. Keep short.
 */
export const MARK_ID_LONG_PRESS_OPEN_DELAY_MS = 72 as const;

/** Cancel pending long-press once finger moves past this distance (px). */
export const MARK_ID_LONG_PRESS_MOVE_SLOP_PX = 10 as const;

/**
 * Gesture-scoped class: suppress WebKit text selection / callout only while a
 * Mark-as-ID long-press is armed or accepted (not permanent on Comments).
 */
export const MARK_ID_LONG_PRESS_ARMED_CLASS = "mark-id-long-press-armed" as const;

export type OwnerCommunityMarkPostFields = {
  userId?: string | null;
  user_id?: string | null;
  user?: { id?: string | null } | null;
  comments?: number | null;
  comments_count?: number | null;
  verificationStatus?: string | null;
  verification_status?: string | null;
  isVerifiedCommunity?: boolean | null;
  is_verified_community?: boolean | null;
  verifiedByModerator?: boolean | null;
  verified_by_moderator?: boolean | null;
  isVerifiedArtist?: boolean | null;
  is_verified_artist?: boolean | null;
  artistVerifiedBy?: string | null;
  artist_verified_by?: string | null;
};

/**
 * Mirrors VideoCard owner Mark eligibility: owner + ≥1 comment + not already identified.
 * Does not introduce self-comment blocks.
 */
export function isOwnerCommunityMarkEligible(
  post: OwnerCommunityMarkPostFields,
  currentUserId: string | null | undefined,
): boolean {
  const postOwnerId = post.user_id ?? post.userId ?? post.user?.id ?? null;
  if (currentUserId == null || postOwnerId == null || currentUserId !== postOwnerId) {
    return false;
  }

  const commentCount = Number(post.comments ?? post.comments_count ?? 0);
  if (!(commentCount >= 1)) return false;

  const status = post.verificationStatus ?? post.verification_status;
  const isVerifiedCommunity = !!(post.isVerifiedCommunity ?? post.is_verified_community);
  const isModeratorVerified = !!(post.verifiedByModerator ?? post.verified_by_moderator);
  const isArtistVerified = !!(post.isVerifiedArtist ?? post.is_verified_artist);
  const artistVerifiedBy = post.artistVerifiedBy ?? post.artist_verified_by ?? null;

  const isAnyIdentifiedState =
    isVerifiedCommunity ||
    status === "community_approved" ||
    status === "verified" ||
    status === "identified" ||
    status === "community" ||
    isModeratorVerified ||
    isArtistVerified ||
    !!artistVerifiedBy;

  if (isAnyIdentifiedState) return false;

  const alreadyArtistVerifiedBySomeone = isArtistVerified && !!artistVerifiedBy;
  return !alreadyArtistVerifiedBySomeone;
}

/** Tombstoned comments are not long-press Mark targets. */
export function isCommentEligibleForOwnerMarkAsId(body: unknown): boolean {
  return !isDeletedCommentBody(body);
}

/**
 * Nested controls that must keep normal behaviour and must not start Mark long-press.
 */
export function isMarkIdLongPressInteractiveTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== "object") return false;
  const el = target as { closest?: (selectors: string) => Element | null };
  if (typeof el.closest !== "function") return false;
  return Boolean(
    el.closest(
      'button, a, input, textarea, select, [role="button"], [role="menuitem"], [data-mark-id-long-press-ignore="true"]',
    ),
  );
}

export function shouldCancelMarkIdLongPressForMove(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  slopPx: number = MARK_ID_LONG_PRESS_MOVE_SLOP_PX,
): boolean {
  const dx = Math.abs(clientX - startX);
  const dy = Math.abs(clientY - startY);
  return dx > slopPx || dy > slopPx;
}

/** Clear any active DOM text selection (best-effort; safe without window). */
export function clearDomTextSelection(): void {
  try {
    if (typeof window === "undefined") return;
    const selection = window.getSelection?.();
    selection?.removeAllRanges?.();
  } catch {
    /* ignore */
  }
}

export function armMarkIdLongPressSelectionGuard(row: HTMLElement | null | undefined): void {
  if (!row) return;
  row.classList.add(MARK_ID_LONG_PRESS_ARMED_CLASS);
  if (!row.dataset.markIdSelectStartBound) {
    row.addEventListener("selectstart", preventMarkIdSelectStart, { capture: true });
    row.dataset.markIdSelectStartBound = "1";
  }
  clearDomTextSelection();
}

export function disarmMarkIdLongPressSelectionGuard(row: HTMLElement | null | undefined): void {
  if (!row) return;
  row.classList.remove(MARK_ID_LONG_PRESS_ARMED_CLASS);
  if (row.dataset.markIdSelectStartBound) {
    row.removeEventListener("selectstart", preventMarkIdSelectStart, { capture: true });
    delete row.dataset.markIdSelectStartBound;
  }
}

function preventMarkIdSelectStart(event: Event): void {
  event.preventDefault();
}

/**
 * Accepted long-press rhythm: suppress selection → haptic → short beat → open.
 * Dialog open is never synchronous with the haptic call.
 */
export function runAcceptedMarkIdLongPress(params: {
  playHaptic: () => void;
  openDialog: () => void;
  suppressNativeSelection: () => void;
  delayMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): { cancelOpen: () => void } {
  const setTimeoutFn = params.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = params.clearTimeoutFn ?? clearTimeout;
  const delayMs = params.delayMs ?? MARK_ID_LONG_PRESS_OPEN_DELAY_MS;

  params.suppressNativeSelection();
  params.playHaptic();

  let cancelled = false;
  const timerId = setTimeoutFn(() => {
    if (cancelled) return;
    params.openDialog();
  }, delayMs);

  return {
    cancelOpen: () => {
      cancelled = true;
      clearTimeoutFn(timerId as ReturnType<typeof setTimeout>);
    },
  };
}
