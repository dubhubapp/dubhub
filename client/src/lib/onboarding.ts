const ONBOARDING_PENDING_EMAIL_PREFIX = "dubhub_onboarding_pending_";
const ONBOARDING_SEEN_PREFIX = "dubhub_onboarding_seen_";
export const WELCOME_BACK_FLAG_KEY = "dubhub_show_welcome_back";
export const ONBOARDING_ACTIVE_SESSION_KEY = "dubhub_onboarding_active";
export const HOME_FEED_READY_EVENT = "dubhub:home-feed-ready";
export const HINT_GENRE_OPENED_EVENT = "dubhub:hint:genre-opened";
export const HINT_GENRE_CLOSED_EVENT = "dubhub:hint:genre-closed";
export const HINT_COMMENTS_OPENED_EVENT = "dubhub:hint:comments-opened";
export const HINT_COMMENTS_CLOSED_EVENT = "dubhub:hint:comments-closed";
export const HINT_LIKED_POST_EVENT = "dubhub:hint:liked-post";
export const HINT_RANDOM_USED_EVENT = "dubhub:hint:random-used";

export function getHintGenreFilterSeenKey(userId: string): string {
  return `dubhub_hint_genre_filter_seen_${userId}`;
}

export function getHintCommentsSeenKey(userId: string): string {
  return `dubhub_hint_comments_seen_${userId}`;
}

export function getHintLikeReleaseSeenKey(userId: string): string {
  return `dubhub_hint_like_release_seen_${userId}`;
}

export function getHintRandomSeenKey(userId: string): string {
  return `dubhub_hint_random_seen_${userId}`;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function getOnboardingSeenKey(userId: string): string {
  return `${ONBOARDING_SEEN_PREFIX}${userId}`;
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
