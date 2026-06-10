import { USERNAME_REGEX } from "./usernameValidation";

/** Characters allowed inside a mention token after `@`. */
const MENTION_SCAN_PATTERN = /[a-zA-Z0-9._]/;

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; username: string; display: string };

/**
 * Trim trailing `.` / `_` until the token matches username rules, or reject.
 */
function normalizeMentionCandidate(raw: string): string | null {
  let candidate = raw;
  while (candidate.length > 0) {
    if (USERNAME_REGEX.test(candidate)) {
      return candidate;
    }
    if (candidate.endsWith(".") || candidate.endsWith("_")) {
      candidate = candidate.slice(0, -1);
      continue;
    }
    return null;
  }
  return null;
}

/**
 * Extract valid @username tokens from comment text (server artist-tag detection).
 * Invalid tokens (too short, bad format, etc.) are ignored.
 */
export function extractMentionUsernames(text: string): string[] {
  if (!text) return [];

  const mentions: string[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "@") {
      i++;
      continue;
    }

    const atIndex = i;
    i++;
    let j = i;
    while (j < text.length && MENTION_SCAN_PATTERN.test(text[j]!)) {
      j++;
    }

    if (j === i) {
      i = atIndex + 1;
      continue;
    }

    const username = normalizeMentionCandidate(text.slice(i, j));
    if (username) {
      mentions.push(username);
      i = j;
    } else {
      i = atIndex + 1;
    }
  }

  return mentions;
}

/** Case-insensitive check whether comment text @mentions a username. */
export function commentMentionsUsername(text: string, username: string): boolean {
  const target = username.trim().toLowerCase();
  if (!target) return false;
  return extractMentionUsernames(text).some((m) => m.toLowerCase() === target);
}

/**
 * Split comment text into plain text and valid mention segments for rendering.
 */
export function parseCommentMentionSegments(text: string): MentionSegment[] {
  if (!text) return [];

  const segments: MentionSegment[] = [];
  let i = 0;
  let textStart = 0;

  while (i < text.length) {
    if (text[i] !== "@") {
      i++;
      continue;
    }

    const atIndex = i;
    i++;
    let j = i;
    while (j < text.length && MENTION_SCAN_PATTERN.test(text[j]!)) {
      j++;
    }

    const username =
      j > i ? normalizeMentionCandidate(text.slice(i, j)) : null;

    if (username) {
      if (atIndex > textStart) {
        segments.push({ type: "text", value: text.slice(textStart, atIndex) });
      }
      segments.push({
        type: "mention",
        username,
        display: `@${username}`,
      });
      textStart = j;
      i = j;
    } else {
      i = atIndex + 1;
    }
  }

  if (textStart < text.length) {
    segments.push({ type: "text", value: text.slice(textStart) });
  }

  return segments;
}
