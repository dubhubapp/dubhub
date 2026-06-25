import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  Bell,
  CalendarDays,
  CheckCircle,
  Disc3,
  MessageCircle,
  Reply,
} from "lucide-react";
import type { NotificationType } from "@shared/notification-types";

const DUBHUB_TEAL = "#4ae9df";
const VERIFIED_GOLD = "#FFD700";

/** Badge kinds shown on in-app notification banners (single types + grouped payloads). */
export type InAppNotificationBadgeKind =
  | "comment_on_post"
  | "reply_to_comment"
  | "artist_tag_comment"
  | "artist_identified_post"
  | "release_attached"
  | "artist_release_alert"
  | "release_day"
  | "release_announce"
  | "summary"
  | "release_batch";

const TOASTABLE_BADGE_KINDS = new Set<InAppNotificationBadgeKind>([
  "comment_on_post",
  "reply_to_comment",
  "artist_tag_comment",
  "artist_identified_post",
  "release_attached",
  "artist_release_alert",
  "release_day",
  "release_announce",
]);

export function notificationTypeToBadgeKind(type: NotificationType): InAppNotificationBadgeKind {
  if (TOASTABLE_BADGE_KINDS.has(type as InAppNotificationBadgeKind)) {
    return type as InAppNotificationBadgeKind;
  }
  return "summary";
}

type BadgeIconConfig = {
  Icon: LucideIcon;
  color: string;
};

const BADGE_ICON_BY_KIND: Record<InAppNotificationBadgeKind, BadgeIconConfig> = {
  comment_on_post: { Icon: MessageCircle, color: DUBHUB_TEAL },
  reply_to_comment: { Icon: Reply, color: DUBHUB_TEAL },
  artist_tag_comment: { Icon: AtSign, color: DUBHUB_TEAL },
  artist_identified_post: { Icon: CheckCircle, color: VERIFIED_GOLD },
  release_attached: { Icon: CalendarDays, color: DUBHUB_TEAL },
  artist_release_alert: { Icon: Disc3, color: DUBHUB_TEAL },
  release_day: { Icon: CalendarDays, color: DUBHUB_TEAL },
  release_announce: { Icon: Disc3, color: DUBHUB_TEAL },
  summary: { Icon: Bell, color: DUBHUB_TEAL },
  release_batch: { Icon: Bell, color: DUBHUB_TEAL },
};

export function getInAppNotificationBadgeIcon(kind: InAppNotificationBadgeKind): BadgeIconConfig {
  return BADGE_ICON_BY_KIND[kind] ?? BADGE_ICON_BY_KIND.summary;
}
