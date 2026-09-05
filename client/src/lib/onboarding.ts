const ONBOARDING_PENDING_EMAIL_PREFIX = "dubhub_onboarding_pending_";
const ONBOARDING_SEEN_PREFIX = "dubhub_onboarding_seen_";
export const WELCOME_BACK_FLAG_KEY = "dubhub_show_welcome_back";
export const ONBOARDING_ACTIVE_SESSION_KEY = "dubhub_onboarding_active";
export const HOME_FEED_READY_EVENT = "dubhub:home-feed-ready";
/**
 * Fires when HomeFeedInitialSkeleton commits to the DOM.
 * Startup overlay listens here — NOT HOME_FEED_READY_EVENT, which waits for feed data.
 * This is presentation-only; do not use for business logic.
 */
export const HOME_FEED_SKELETON_READY_EVENT = "dubhub:home-feed-skeleton-ready";
export const HINT_GENRE_OPENED_EVENT = "dubhub:hint:genre-opened";
export const HINT_GENRE_CLOSED_EVENT = "dubhub:hint:genre-closed";
export const HINT_COMMENTS_OPENED_EVENT = "dubhub:hint:comments-opened";
export const HINT_COMMENTS_CLOSED_EVENT = "dubhub:hint:comments-closed";
/** Fires after Comments sheet settle with a measurable composer target (HINTS-PREMIUM-3). */
export const HINT_COMMENTS_READY_EVENT = "dubhub:hint:comments-ready";
/** Fires after a successful new comment — may complete the Comments coachmark. */
export const HINT_COMMENTS_COMPLETED_EVENT = "dubhub:hint:comments-completed";
export const HINT_LIKED_POST_EVENT = "dubhub:hint:liked-post";
/** Legacy event name retained; proactive Random coaching no longer listens. */
export const HINT_RANDOM_USED_EVENT = "dubhub:hint:random-used";
/** Fires after Comments closes on an eligible unidentified post (verified artist). */
export const HINT_ARTIST_SELF_TAG_READY_EVENT = "dubhub:hint:artist-self-tag-ready";
/** Fires when the artist completes self-tag / opens Mark ID on that flow. */
export const HINT_ARTIST_SELF_TAG_COMPLETED_EVENT = "dubhub:hint:artist-self-tag-completed";

export function getHintGenreFilterSeenKey(userId: string): string {
  return `dubhub_hint_genre_filter_seen_${userId}`;
}

export function getHintCommentsSeenKey(userId: string): string {
  return `dubhub_hint_comments_seen_${userId}`;
}

export function getHintLikeReleaseSeenKey(userId: string): string {
  return `dubhub_hint_like_release_seen_${userId}`;
}

/** Kept for legacy localStorage compatibility; proactive Random coaching removed. */
export function getHintRandomSeenKey(userId: string): string {
  return `dubhub_hint_random_seen_${userId}`;
}

export function getHintArtistSelfTagSeenKey(userId: string): string {
  return `dubhub_hint_artist_self_tag_flow_seen_${userId}`;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function getOnboardingSeenKey(userId: string): string {
  return `${ONBOARDING_SEEN_PREFIX}${userId}`;
}

export function getOnboardingPendingKey(email: string): string {
  return `${ONBOARDING_PENDING_EMAIL_PREFIX}${normalizeEmail(email)}`;
}

export type FirstLoginOnboardingQueueDecision =
  | {
      queue: false;
      reason: "already_seen" | "email_unconfirmed" | "unverified_artist" | "no_pending";
    }
  | {
      queue: true;
      audience: "user" | "artist";
    };

/**
 * Pure eligibility for FirstLoginOnboardingModal.
 */
export function resolveFirstLoginOnboardingQueue(input: {
  userId: string;
  email: string | null | undefined;
  accountType: string | null | undefined;
  verifiedArtist: boolean | null | undefined;
  emailConfirmed: boolean;
  localStorage?: Pick<Storage, "getItem"> | null;
}): FirstLoginOnboardingQueueDecision {
  const local =
    input.localStorage ??
    (typeof localStorage !== "undefined" ? localStorage : null);

  if (!input.emailConfirmed) {
    return { queue: false, reason: "email_unconfirmed" };
  }
  if (input.accountType === "artist" && !input.verifiedArtist) {
    return { queue: false, reason: "unverified_artist" };
  }

  const seen = local?.getItem(getOnboardingSeenKey(input.userId)) === "1";
  if (seen) {
    return { queue: false, reason: "already_seen" };
  }

  const normalizedEmail = normalizeEmail(input.email);
  const pending =
    !!normalizedEmail &&
    local?.getItem(`${ONBOARDING_PENDING_EMAIL_PREFIX}${normalizedEmail}`) === "1";
  if (!pending) {
    return { queue: false, reason: "no_pending" };
  }

  return {
    queue: true,
    audience: input.accountType === "artist" ? "artist" : "user",
  };
}

export function markOnboardingPendingForEmail(email: string): void {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  localStorage.setItem(`${ONBOARDING_PENDING_EMAIL_PREFIX}${normalized}`, "1");
}

export function hasPendingOnboardingForEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return localStorage.getItem(`${ONBOARDING_PENDING_EMAIL_PREFIX}${normalized}`) === "1";
}

export function clearPendingOnboardingForEmail(email: string | null | undefined): void {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  localStorage.removeItem(`${ONBOARDING_PENDING_EMAIL_PREFIX}${normalized}`);
}

const WELCOME_BACK_SEEN_PREFIX = "dubhub_welcome_back_seen_";

export function getWelcomeBackSeenKey(userId: string): string {
  return `${WELCOME_BACK_SEEN_PREFIX}${userId}`;
}

export function markOnboardingSeenForUser(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(getOnboardingSeenKey(userId), "1");
  } catch {
    // Storage may be unavailable in constrained environments.
  }
}

export function markWelcomeBackSeenForUser(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(getWelcomeBackSeenKey(userId), "1");
  } catch {
    // Storage may be unavailable in constrained environments.
  }
}

/** Marks welcome modal seen and clears pending signup flags for all provided emails. */
export function persistOnboardingDismissed(options: {
  userId: string | null | undefined;
  emails: (string | null | undefined)[];
}): void {
  markOnboardingSeenForUser(options.userId);
  markWelcomeBackSeenForUser(options.userId);
  const cleared = new Set<string>();
  for (const email of options.emails) {
    const normalized = normalizeEmail(email);
    if (!normalized || cleared.has(normalized)) continue;
    cleared.add(normalized);
    clearPendingOnboardingForEmail(email);
  }
}

export function persistHintSeen(key: string | null | undefined): void {
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Storage may be unavailable in constrained environments.
  }
}
