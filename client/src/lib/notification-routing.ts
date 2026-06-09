import type { NotificationWithUser } from "@shared/schema";
import {
  getEffectiveNotificationType,
  type NotificationType,
} from "@shared/notification-types";
export function notificationRowFields(n: NotificationWithUser) {
  return {
    message: n.message,
    releaseId: n.releaseId ?? (n as { release_id?: string }).release_id ?? n.release?.id ?? null,
    postId: n.postId ?? (n as { post_id?: string }).post_id ?? null,
    notificationType: n.notificationType ?? (n as { notification_type?: string }).notification_type,
  };
}

export function getEffectiveTypeForNotification(n: NotificationWithUser): NotificationType {
  return getEffectiveNotificationType(notificationRowFields(n));
}

export function shouldOpenCommentsForNotificationType(type: NotificationType): boolean {
  return (
    type === "reply_to_comment" ||
    type === "comment_on_post" ||
    type === "artist_tag_comment"
  );
}

/**
 * Resolve in-app / profile notification tap destination.
 * Mirrors push tap routing where types overlap; release fallbacks match v1 spec.
 */
export function getNotificationTapRoute(notification: NotificationWithUser): string {
  const fields = notificationRowFields(notification);
  const type = getEffectiveNotificationType(fields);
  const postId = fields.postId;
  const releaseId = fields.releaseId;

  if (shouldOpenCommentsForNotificationType(type) && postId) {
    return `/?post=${encodeURIComponent(postId)}&openComments=1`;
  }

  if (type === "artist_identified_post" && postId) {
    return `/?post=${encodeURIComponent(postId)}`;
  }

  if (type === "release_attached") {
    if (releaseId) return `/releases/${encodeURIComponent(releaseId)}`;
    return "/profile";
  }

  if (type === "release_day" || type === "release_announce") {
    if (releaseId) return `/releases/${encodeURIComponent(releaseId)}`;
    return "/releases";
  }

  if (postId) {
    return `/?post=${encodeURIComponent(postId)}`;
  }

  return "/profile";
}
