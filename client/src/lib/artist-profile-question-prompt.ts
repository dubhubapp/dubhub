export type ArtistQuestionPromptDismissReason = "skip" | "save";

const DISMISS_AT_KEY_PREFIX = "dubhub:artist-question-prompt-dismissed-at:";
const DISMISS_REASON_KEY_PREFIX = "dubhub:artist-question-prompt-dismissed-reason:";

export const ARTIST_QUESTION_PROMPT_SKIP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const ARTIST_QUESTION_PROMPT_SAVE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
export const ARTIST_QUESTION_PROMPT_RANDOM_SHOW_PROBABILITY = 0.35;

function dismissAtKey(artistId: string): string {
  return `${DISMISS_AT_KEY_PREFIX}${artistId}`;
}

function dismissReasonKey(artistId: string): string {
  return `${DISMISS_REASON_KEY_PREFIX}${artistId}`;
}

export function getArtistQuestionPromptDismissal(
  artistId: string,
): { dismissedAt: number; reason: ArtistQuestionPromptDismissReason } | null {
  if (!artistId) return null;
  try {
    const rawAt = localStorage.getItem(dismissAtKey(artistId));
    const rawReason = localStorage.getItem(dismissReasonKey(artistId));
    if (!rawAt) return null;
    const dismissedAt = Number.parseInt(rawAt, 10);
    if (!Number.isFinite(dismissedAt)) return null;
    const reason: ArtistQuestionPromptDismissReason =
      rawReason === "save" ? "save" : "skip";
    return { dismissedAt, reason };
  } catch {
    return null;
  }
}

export function setArtistQuestionPromptDismissal(
  artistId: string,
  reason: ArtistQuestionPromptDismissReason,
  dismissedAt: number = Date.now(),
): void {
  if (!artistId) return;
  try {
    localStorage.setItem(dismissAtKey(artistId), String(dismissedAt));
    localStorage.setItem(dismissReasonKey(artistId), reason);
  } catch {
    /* ignore */
  }
}

export function getArtistQuestionPromptCooldownMs(
  reason: ArtistQuestionPromptDismissReason,
): number {
  return reason === "save"
    ? ARTIST_QUESTION_PROMPT_SAVE_COOLDOWN_MS
    : ARTIST_QUESTION_PROMPT_SKIP_COOLDOWN_MS;
}

export function isArtistQuestionPromptInCooldown(
  artistId: string,
  now: number = Date.now(),
): boolean {
  const dismissal = getArtistQuestionPromptDismissal(artistId);
  if (!dismissal) return false;
  const elapsed = now - dismissal.dismissedAt;
  return elapsed < getArtistQuestionPromptCooldownMs(dismissal.reason);
}

export function shouldShowArtistQuestionPrompt(params: {
  artistId: string;
  unansweredCount: number;
  answeredCount: number;
  now?: number;
  random?: () => number;
}): boolean {
  const { artistId, unansweredCount, answeredCount } = params;
  const now = params.now ?? Date.now();
  const random = params.random ?? Math.random;

  if (!artistId || unansweredCount <= 0) return false;
  if (isArtistQuestionPromptInCooldown(artistId, now)) return false;
  if (answeredCount === 0) return true;
  return random() < ARTIST_QUESTION_PROMPT_RANDOM_SHOW_PROBABILITY;
}

export function pickRandomUnansweredQuestionSlug(slugs: string[]): string | null {
  if (slugs.length === 0) return null;
  return slugs[Math.floor(Math.random() * slugs.length)] ?? null;
}
