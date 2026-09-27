/**
 * Settings presentation for the notification emoji row.
 * Access uses resolvePaidToolGateMode. This module does not check subscriptions itself.
 * The preview mention is a plain @username. It does not append an emoji.
 */

import { parseNotificationEmojiInput } from "@shared/notification-emoji";
import type { PaidToolGateMode } from "./paid-tool-gate";

export type NotificationEmojiEditorMode = "editable" | "locked" | "disabled";

/** Colour-emoji fonts for the glyph spans only. Username text does not use this. */
export const NOTIFICATION_EMOJI_GLYPH_STYLE = {
  fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
} as const;

export function notificationEmojiEditorMode(gate: PaidToolGateMode): NotificationEmojiEditorMode {
  if (gate === "available") return "editable";
  if (gate === "locked") return "locked";
  return "disabled";
}

/**
 * Native keyboard input. A single valid emoji is saved.
 * Empty, words, and multiple emoji are ignored — they do not clear the stored value.
 */
export function notificationEmojiInputDecision(raw: string): string | null {
  const parsed = parseNotificationEmojiInput(raw);
  if (!parsed.ok || parsed.emoji == null) return null;
  return parsed.emoji;
}

/** Plain @username. Does not read or append a notification emoji. */
export function notificationEmojiPlainMention(username: string | null | undefined): string {
  const core = typeof username === "string" ? username.trim().replace(/^@+/, "") : "";
  return core ? `@${core}` : "@artist";
}
