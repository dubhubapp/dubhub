/**
 * PATCH /api/user/notification-emoji
 * Verified artists with paid tool access may set or clear profiles.notification_emoji.
 * Uses canArtistUsePaidTools. Does not invent a second subscription check.
 */

import { parseNotificationEmojiInput } from "@shared/notification-emoji";

export type NotificationEmojiUser = {
  id: string;
  account_type?: string | null;
  verified_artist?: boolean | null;
};

export type UpdateNotificationEmojiResult =
  | { ok: true; notification_emoji: string | null }
  | {
      ok: false;
      status: 401 | 400 | 403 | 500;
      code?: "PAID_ARTIST_TOOL_REQUIRED" | "invalid_notification_emoji";
      message: string;
    };

export async function updateNotificationEmojiForUser(args: {
  user: NotificationEmojiUser | null | undefined;
  body: unknown;
  canUsePaidTools: (userId: string) => Promise<boolean>;
  saveEmoji: (userId: string, emoji: string | null) => Promise<boolean>;
}): Promise<UpdateNotificationEmojiResult> {
  const user = args.user;
  if (!user?.id) {
    return { ok: false, status: 401, message: "Not authenticated" };
  }
  if (user.account_type !== "artist" || user.verified_artist !== true) {
    return { ok: false, status: 403, message: "Verified artist access only" };
  }

  const body = args.body;
  if (!body || typeof body !== "object" || !Object.prototype.hasOwnProperty.call(body, "emoji")) {
    return { ok: false, status: 400, message: "emoji is required (use null to clear)" };
  }

  const parsed = parseNotificationEmojiInput((body as { emoji?: unknown }).emoji);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      code: "invalid_notification_emoji",
      message: "Enter a single emoji",
    };
  }

  let paid = false;
  try {
    paid = (await args.canUsePaidTools(user.id)) === true;
  } catch {
    paid = false;
  }
  if (!paid) {
    return {
      ok: false,
      status: 403,
      code: "PAID_ARTIST_TOOL_REQUIRED",
      message: "Artist Tools required",
    };
  }

  const saved = await args.saveEmoji(user.id, parsed.emoji);
  if (!saved) {
    return { ok: false, status: 500, message: "Failed to update notification emoji" };
  }
  return { ok: true, notification_emoji: parsed.emoji };
}
