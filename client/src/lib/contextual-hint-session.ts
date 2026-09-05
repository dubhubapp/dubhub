/**
 * HINTS-PREMIUM-2B/3 — session-only contextual-hint pacing.
 * Context remains authoritative: no out-of-context FIFO queue.
 */

/** Max Home/feed contextual coachmarks shown per app session (in-memory). */
export const CONTEXTUAL_HINTS_SESSION_MAX = 3 as const;

/** Feed-driven breathing room after dismiss (~mid of 20–30s). */
export const CONTEXTUAL_HINT_FEED_COOLDOWN_MS = 25_000 as const;

/** Alternate feed breathing room: meaningful active-post advances after dismiss. */
export const CONTEXTUAL_HINT_FEED_COOLDOWN_POST_ADVANCES = 2 as const;

export type ContextualHintPacingKind = "feed" | "surface";

export type ContextualHintOccurrenceKind = "genre" | "comments" | "like" | "artist";

export type ContextualHintSessionState = {
  shownCount: number;
  lastDismissedAt: number | null;
  postAdvancesSinceDismiss: number;
  lastTrackedActivePostId: string | null;
  /** Increments each Discover open / Comments open / successful Like / artist self-tag ready. */
  genreOpenId: number;
  commentsOpenId: number;
  likeEventId: number;
  artistSelfTagEventId: number;
  /** When equal to the matching *OpenId / *EventId, that occurrence stays suppressed. */
  suppressedGenreOpenId: number | null;
  suppressedCommentsOpenId: number | null;
  suppressedLikeEventId: number | null;
  suppressedArtistSelfTagEventId: number | null;
};

export type ContextualHintGateReason =
  | "active"
  | "budget"
  | "cooldown"
  | "seen"
  | "onboarding"
  | "occurrence_suppressed";

export function createEmptyContextualHintSession(): ContextualHintSessionState {
  return {
    shownCount: 0,
    lastDismissedAt: null,
    postAdvancesSinceDismiss: 0,
    lastTrackedActivePostId: null,
    genreOpenId: 0,
    commentsOpenId: 0,
    likeEventId: 0,
    artistSelfTagEventId: 0,
    suppressedGenreOpenId: null,
    suppressedCommentsOpenId: null,
    suppressedLikeEventId: null,
    suppressedArtistSelfTagEventId: null,
  };
}

/**
 * Long-term seen check against genuine localStorage hint keys.
 */
export function isContextualHintSeen(
  key: string | null | undefined,
  options: {
    localStorage?: Pick<Storage, "getItem"> | null;
  } = {},
): boolean {
  if (!key) return true;
  const local =
    options.localStorage ??
    (typeof localStorage !== "undefined" ? localStorage : null);
  if (!local) return false;
  try {
    return local.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function pacingKindForHintType(
  type: "genre" | "comments" | "like" | "artist",
): ContextualHintPacingKind {
  if (type === "genre" || type === "comments" || type === "artist") return "surface";
  return "feed";
}

export function beginGenreOpenOccurrence(
  session: ContextualHintSessionState,
): ContextualHintSessionState {
  return { ...session, genreOpenId: session.genreOpenId + 1 };
}

export function beginCommentsOpenOccurrence(
  session: ContextualHintSessionState,
): ContextualHintSessionState {
  return { ...session, commentsOpenId: session.commentsOpenId + 1 };
}

export function beginLikeEventOccurrence(
  session: ContextualHintSessionState,
): ContextualHintSessionState {
  return { ...session, likeEventId: session.likeEventId + 1 };
}

export function beginArtistSelfTagOccurrence(
  session: ContextualHintSessionState,
): ContextualHintSessionState {
  return { ...session, artistSelfTagEventId: session.artistSelfTagEventId + 1 };
}

export function suppressHintOccurrence(
  session: ContextualHintSessionState,
  kind: ContextualHintOccurrenceKind,
): ContextualHintSessionState {
  if (kind === "genre") {
    return { ...session, suppressedGenreOpenId: session.genreOpenId };
  }
  if (kind === "comments") {
    return { ...session, suppressedCommentsOpenId: session.commentsOpenId };
  }
  if (kind === "artist") {
    return { ...session, suppressedArtistSelfTagEventId: session.artistSelfTagEventId };
  }
  return { ...session, suppressedLikeEventId: session.likeEventId };
}

export function isHintOccurrenceSuppressed(
  session: ContextualHintSessionState,
  kind: ContextualHintOccurrenceKind,
): boolean {
  if (kind === "genre") {
    return session.suppressedGenreOpenId === session.genreOpenId && session.genreOpenId > 0;
  }
  if (kind === "comments") {
    return (
      session.suppressedCommentsOpenId === session.commentsOpenId &&
      session.commentsOpenId > 0
    );
  }
  if (kind === "artist") {
    return (
      session.suppressedArtistSelfTagEventId === session.artistSelfTagEventId &&
      session.artistSelfTagEventId > 0
    );
  }
  return session.suppressedLikeEventId === session.likeEventId && session.likeEventId > 0;
}

/**
 * Gate a contextual opportunity. Failure means: do not show, do not mark seen,
 * do not queue for later unrelated display — wait for the next real context.
 */
export function evaluateContextualHintOpportunity(input: {
  activeHintType: string | null | undefined;
  session: ContextualHintSessionState;
  kind: ContextualHintPacingKind;
  hintKey: string;
  occurrenceKind?: ContextualHintOccurrenceKind;
  onboardingActive?: boolean;
  now?: number;
  maxShown?: number;
  feedCooldownMs?: number;
  feedCooldownPosts?: number;
  localStorage?: Pick<Storage, "getItem"> | null;
}): { ok: true } | { ok: false; reason: ContextualHintGateReason } {
  const now = input.now ?? Date.now();
  const maxShown = input.maxShown ?? CONTEXTUAL_HINTS_SESSION_MAX;
  const feedCooldownMs = input.feedCooldownMs ?? CONTEXTUAL_HINT_FEED_COOLDOWN_MS;
  const feedCooldownPosts =
    input.feedCooldownPosts ?? CONTEXTUAL_HINT_FEED_COOLDOWN_POST_ADVANCES;

  if (input.activeHintType != null) {
    return { ok: false, reason: "active" };
  }
  if (input.onboardingActive) {
    return { ok: false, reason: "onboarding" };
  }
  if (
    input.occurrenceKind &&
    isHintOccurrenceSuppressed(input.session, input.occurrenceKind)
  ) {
    return { ok: false, reason: "occurrence_suppressed" };
  }
  if (
    isContextualHintSeen(input.hintKey, {
      localStorage: input.localStorage,
    })
  ) {
    return { ok: false, reason: "seen" };
  }

  if (input.session.shownCount >= maxShown) {
    return { ok: false, reason: "budget" };
  }

  if (input.kind === "feed" && input.session.lastDismissedAt != null) {
    const elapsed = now - input.session.lastDismissedAt;
    const postsOk =
      input.session.postAdvancesSinceDismiss >= feedCooldownPosts;
    const timeOk = elapsed >= feedCooldownMs;
    if (!postsOk && !timeOk) {
      return { ok: false, reason: "cooldown" };
    }
  }

  // surface: allowed as soon as prior coachmark cleared (active already null).
  return { ok: true };
}

/** Whether closing a surface should persist seen (hint was visible long enough). */
export function shouldPersistOnSurfaceClose(input: {
  shownAt: number | null | undefined;
  now?: number;
  minVisibleMs?: number;
}): boolean {
  if (input.shownAt == null) return false;
  const now = input.now ?? Date.now();
  const minVisibleMs = input.minVisibleMs ?? 900;
  return now - input.shownAt >= minVisibleMs;
}

export function noteContextualHintShown(
  session: ContextualHintSessionState,
): ContextualHintSessionState {
  return {
    ...session,
    shownCount: session.shownCount + 1,
  };
}

export function noteContextualHintDismissed(
  session: ContextualHintSessionState,
  now: number = Date.now(),
): ContextualHintSessionState {
  return {
    ...session,
    lastDismissedAt: now,
    postAdvancesSinceDismiss: 0,
  };
}

/**
 * Count meaningful Home active-post changes after a dismiss (breathing room).
 * First observation only seeds the tracker — does not count as an advance.
 */
export function noteContextualHintActivePostChange(
  session: ContextualHintSessionState,
  nextActivePostId: string | null,
): ContextualHintSessionState {
  if (!nextActivePostId) return session;
  if (session.lastTrackedActivePostId == null) {
    return { ...session, lastTrackedActivePostId: nextActivePostId };
  }
  if (session.lastTrackedActivePostId === nextActivePostId) return session;

  const next: ContextualHintSessionState = {
    ...session,
    lastTrackedActivePostId: nextActivePostId,
  };
  if (session.lastDismissedAt == null) return next;
  return {
    ...next,
    postAdvancesSinceDismiss: session.postAdvancesSinceDismiss + 1,
  };
}
