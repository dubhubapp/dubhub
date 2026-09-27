/**
 * One custom notification emoji per verified artist.
 * No dependency: Intl.Segmenter + Unicode properties.
 *
 * Flags are one grapheme of two regional indicators. This runtime does not
 * mark regional indicators as Extended_Pictographic, so flags are allowed
 * by that pair rule. Every other accepted cluster must contain
 * Extended_Pictographic.
 */

/** Hard cap on the raw request string, applied before segmentation. */
export const NOTIFICATION_EMOJI_MAX_RAW_LENGTH = 32;

export type NotificationEmojiParse =
  | { ok: true; emoji: string | null }
  | { ok: false; error: "invalid_notification_emoji" };

export type NotificationEmojiRenderInput = {
  notificationEmoji?: string | null;
  /** True only when canArtistUsePaidTools is true at send time. */
  paidAccess?: boolean;
};

/**
 * Write-path parser.
 * null and "" clear. Whitespace, words, multiple emoji, and over-length input reject.
 */
export function parseNotificationEmojiInput(raw: unknown): NotificationEmojiParse {
  if (raw === null) return { ok: true, emoji: null };
  if (typeof raw !== "string") return { ok: false, error: "invalid_notification_emoji" };
  if (raw.length === 0) return { ok: true, emoji: null };
  if (raw.length > NOTIFICATION_EMOJI_MAX_RAW_LENGTH) {
    return { ok: false, error: "invalid_notification_emoji" };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "invalid_notification_emoji" };

  const clusters = graphemeClusters(trimmed);
  if (clusters.length !== 1) return { ok: false, error: "invalid_notification_emoji" };

  const cluster = clusters[0] ?? "";
  if (!isAllowedEmojiGrapheme(cluster)) {
    return { ok: false, error: "invalid_notification_emoji" };
  }
  return { ok: true, emoji: cluster };
}

/**
 * Send-time emoji. Inactive paid access and invalid stored values render as null.
 * Does not modify the stored string.
 */
export function resolveActiveNotificationEmoji(args: {
  stored: string | null | undefined;
  paidAccess: boolean;
}): string | null {
  if (args.paidAccess !== true) return null;
  const parsed = parseNotificationEmojiInput(args.stored ?? null);
  if (!parsed.ok) return null;
  return parsed.emoji;
}

/**
 * Append a validated emoji after an already-built artist mention.
 * Does not search or rewrite the rest of a sentence.
 * `mention` keeps the caller's current formatting (`@sota` or `sota`).
 */
export function formatArtistIdentityMention(args: {
  mention: string;
  notificationEmoji?: string | null;
  paidAccess?: boolean;
}): string {
  const active = resolveActiveNotificationEmoji({
    stored: args.notificationEmoji,
    paidAccess: args.paidAccess === true,
  });
  if (!active) return args.mention;
  return `${args.mention} ${active}`;
}

function graphemeClusters(value: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const clusters: string[] = [];
  const iterator = segmenter.segment(value)[Symbol.iterator]();
  let step = iterator.next();
  while (!step.done) {
    clusters.push(step.value.segment);
    step = iterator.next();
  }
  return clusters;
}

function isAllowedEmojiGrapheme(cluster: string): boolean {
  if (EXTENDED_PICTOGRAPHIC.test(cluster)) return true;
  return FLAG.test(cluster);
}

const EXTENDED_PICTOGRAPHIC = new RegExp("\\p{Extended_Pictographic}", "u");
const FLAG = new RegExp("^(\\p{Regional_Indicator}){2}$", "u");
