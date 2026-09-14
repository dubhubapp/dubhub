import type { NotificationWithUser } from "@shared/schema";
import { isModeratorQueueNotification } from "@shared/notification-types";
import {
  isNotificationVisibleByUserPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { notificationRowFields } from "@/lib/notification-routing";

/**
 * PROFILE-NAV-BADGE-1: Shared unread filter for Profile tab, React bottom nav,
 * and native Profile badge. Prefs + moderator-queue exclusion; account-type agnostic.
 */
export function countVisibleUnreadNotifications(
  list: readonly unknown[] | null | undefined,
  prefs: NotificationPreferences | null | undefined,
  options: { isModerator: boolean },
): number {
  if (!Array.isArray(list)) return 0;
  try {
    return list.filter((raw) => {
      const n = raw as NotificationWithUser | null | undefined;
      if (!n || (n as { read?: boolean }).read) return false;
      if (options.isModerator && isModeratorQueueNotification(notificationRowFields(n))) {
        return false;
      }
      return isNotificationVisibleByUserPreferences(n, prefs);
    }).length;
  } catch {
    return list.filter((raw) => {
      const n = raw as {
        read?: boolean;
        message?: string;
        releaseId?: string;
        release_id?: string;
        postId?: string;
        post_id?: string;
        notificationType?: string;
        notification_type?: string;
      } | null;
      if (!n || n.read) return false;
      if (
        options.isModerator &&
        isModeratorQueueNotification({
          message: n.message,
          releaseId: n.releaseId ?? n.release_id,
          postId: n.postId ?? n.post_id,
          notificationType: n.notificationType ?? n.notification_type,
        })
      ) {
        return false;
      }
      return true;
    }).length;
  }
}
