/**
 * Profile notifications-tab copy for grouped release_event rows.
 * Prefer notification_type over fragile message substring matching.
 */

import {
  getEffectiveNotificationType,
  type NotificationType,
} from "@shared/notification-types";

export type ReleaseEventGroupNotificationLike = {
  message?: string | null;
  notificationType?: string | null;
  postId?: string | null;
  releaseId?: string | null;
};

/** "Artist released Title" → "Title is out now." */
export function formatReleaseDayOutNowCopy(message: string | null | undefined): string {
  const raw = typeof message === "string" ? message.trim() : "";
  const m = raw.match(/^(.+?)\s+released\s+(.+)$/i);
  if (m?.[2]?.trim()) {
    return `${m[2].trim()} is out now.`;
  }
  return raw || "A release you follow is out now.";
}

function typeOf(n: ReleaseEventGroupNotificationLike): NotificationType {
  return getEffectiveNotificationType({
    notificationType: n.notificationType,
    message: n.message,
    postId: n.postId,
    releaseId: n.releaseId,
  });
}

/**
 * When multiple release_event rows share a release, pick deterministic list copy.
 * release_day takes priority so Out-now is not buried under "N updates".
 * Returns null when the caller should fall back to the representative message.
 */
export function getReleaseEventGroupSummaryMessage(args: {
  count: number;
  notifications: ReleaseEventGroupNotificationLike[];
}): string | null {
  const { count, notifications } = args;
  if (count < 2 || notifications.length === 0) return null;

  const typed = notifications.map((n) => ({ n, type: typeOf(n) }));
  const releaseDay = typed.find((t) => t.type === "release_day");
  if (releaseDay) {
    // Primary surface: Out now. Other events remain in the group / Notifications list.
    return formatReleaseDayOutNowCopy(releaseDay.n.message);
  }

  const messages = notifications.map((n) => (n.message || "").toLowerCase());
  const hasAnnouncement = typed.some(
    (t) =>
      t.type === "release_announce" ||
      t.type === "artist_release_alert" ||
      messages.some((m) => m.includes("just got announced") || m.includes("announced")),
  );
  const hasCollab = typed.some(
    (t) =>
      t.type === "collab_invite" ||
      t.type === "collab_accept" ||
      t.type === "collab_reject",
  );
  const hasAttached = typed.some((t) => t.type === "release_attached");

  if (hasAnnouncement && hasAttached) {
    return `${count} updates on this release`;
  }
  if (hasAnnouncement) return `${count} announcement updates for this release`;
  if (hasCollab) return `${count} collaboration updates for this release`;
  if (hasAttached) return `${count} updates for this release`;
  return `${count} updates for this release`;
}
