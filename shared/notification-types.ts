/**
 * Canonical in-app notification types. Stored on notifications.notification_type when set;
 * legacy rows may be null and are classified via classifyLegacyNotification().
 */

export const NOTIFICATION_TYPES = [
  "post_like",
  "comment_on_post",
  "reply_to_comment",
  "artist_tag_comment",
  "artist_identified_post",
  "release_attached",
  "artist_release_alert",
  "release_alert_enabled",
  "release_day",
  "release_announce",
  "collab_invite",
  "collab_accept",
  "collab_reject",
  "moderator_post_report",
  "moderator_comment_report",
  "moderator_community_verification",
  "moderator_report_resolved",
  "moderation_action",
  "id_verification_feedback",
  "unknown",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Future server-backed preference buckets (not enforced yet). */
export type NotificationPreferenceBucket = "likes" | "comments" | "artist_tags" | "releases";

const PREFERENCE_BUCKET_BY_TYPE: Partial<Record<NotificationType, NotificationPreferenceBucket>> = {
  post_like: "likes",
  comment_on_post: "comments",
  reply_to_comment: "comments",
  artist_tag_comment: "artist_tags",
  release_attached: "releases",
  artist_release_alert: "releases",
  release_alert_enabled: "releases",
  release_day: "releases",
  release_announce: "releases",
};

/** Types that must always be delivered (no user toggle). */
export const ALWAYS_ON_NOTIFICATION_TYPES = new Set<NotificationType>([
  "artist_identified_post",
  "collab_invite",
  "collab_accept",
  "collab_reject",
  "moderator_post_report",
  "moderator_comment_report",
  "moderator_community_verification",
  "moderator_report_resolved",
  "moderation_action",
  "id_verification_feedback",
]);

export function isAlwaysOnNotificationType(type: NotificationType): boolean {
  return ALWAYS_ON_NOTIFICATION_TYPES.has(type);
}

export function getPreferenceBucketForNotificationType(
  type: NotificationType,
): NotificationPreferenceBucket | null {
  return PREFERENCE_BUCKET_BY_TYPE[type] ?? null;
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export type LegacyNotificationFields = {
  message?: string | null;
  releaseId?: string | null;
  release_id?: string | null;
  postId?: string | null;
  post_id?: string | null;
  notificationType?: string | null;
  notification_type?: string | null;
};

/** Prefer stored notification_type; fall back to message/heuristic classification. */
export function getEffectiveNotificationType(fields: LegacyNotificationFields): NotificationType {
  const stored = fields.notificationType ?? fields.notification_type;
  if (isNotificationType(stored)) return stored;
  return classifyLegacyNotification(fields);
}

/**
 * Classify notifications that predate notification_type or were created by DB triggers.
 * Order matters: specific production patterns before broad keyword fallbacks.
 */
export function classifyLegacyNotification(fields: LegacyNotificationFields): NotificationType {
  const lowerMessage = String(fields.message ?? "").toLowerCase();
  const rawMessage = String(fields.message ?? "");

  // --- Social / engagement ---
  if (lowerMessage.includes("liked your post")) return "post_like";
  if (lowerMessage.includes("tagged you in a comment")) return "artist_tag_comment";
  if (lowerMessage.includes("replied to your comment")) return "reply_to_comment";
  if (lowerMessage.includes("commented on your post")) return "comment_on_post";

  // --- Identity (ID confirm by artist vs mod/community feedback) ---
  if (lowerMessage.includes("identified your track")) return "artist_identified_post";
  if (lowerMessage.includes("confirmed your track id")) return "id_verification_feedback";

  // --- Collaboration ---
  if (lowerMessage.includes("invited you as a collaborator")) return "collab_invite";
  if (lowerMessage.includes("accepted your collaboration invite")) return "collab_accept";
  if (lowerMessage.includes("rejected your collaboration invite")) return "collab_reject";

  // --- Moderator queue (prefix / exact production templates) ---
  if (rawMessage.startsWith("New post report:")) return "moderator_post_report";
  if (rawMessage.startsWith("New user report:")) return "moderator_comment_report";
  if (lowerMessage.includes("community verification requires review")) {
    return "moderator_community_verification";
  }
  if (rawMessage.startsWith("Report resolved:")) return "moderator_report_resolved";

  // --- Moderation actions (account safety) ---
  if (isModerationActionMessage(lowerMessage)) return "moderation_action";

  // --- Releases (message patterns; release_id not required for template match) ---
  if (lowerMessage.includes("release added:")) return "release_attached";
  if (lowerMessage.includes("wants to hear your future releases")) return "release_alert_enabled";
  if (lowerMessage.includes("turned on release alerts")) return "release_alert_enabled";
  if (lowerMessage.includes("announced a new release")) return "artist_release_alert";
  if (lowerMessage.includes("that tune you've been waiting for")) return "release_attached";
  if (lowerMessage.includes("announced")) return "release_announce";
  // Manual notifyReleaseLikers uses release_announce even when copy says "released …"
  if (lowerMessage.includes(" released ")) return "release_announce";

  // --- ID feedback from mod triggers (best-effort; templates not fully versioned in repo) ---
  if (
    lowerMessage.includes("rejected your track id") ||
    lowerMessage.includes("community identified") ||
    (lowerMessage.includes("rejected") && lowerMessage.includes("track"))
  ) {
    return "id_verification_feedback";
  }

  return "unknown";
}

/** Production + in-app moderation copy (multi-line warn includes disclaimer with "may be suspended"). */
function isModerationActionMessage(lowerMessage: string): boolean {
  if (lowerMessage.includes("you have been warned")) return true;
  if (lowerMessage.includes("you've received a warning")) return true;
  if (lowerMessage.includes("your post was removed")) return true;
  if (lowerMessage.includes("your comment was removed")) return true;
  if (lowerMessage.includes("was removed for")) return true;
  if (lowerMessage.includes("your account has been suspended")) return true;
  if (lowerMessage.includes("your account has been permanently banned")) return true;
  // Actual ban line only — exclude warn disclaimer "may be … permanently banned"
  if (lowerMessage.includes("permanently banned") && !lowerMessage.includes("may be")) return true;
  return false;
}

export function isModeratorQueueNotificationType(type: NotificationType): boolean {
  return (
    type === "moderator_post_report" ||
    type === "moderator_comment_report" ||
    type === "moderator_community_verification" ||
    type === "moderator_report_resolved"
  );
}

/** Legacy message keyword check for moderator queue (fallback when type is null). */
export function isModeratorQueueNotificationMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("community verification") ||
    lower.includes("pending verification") ||
    lower.includes("id confirmation") ||
    lower.includes("moderator review") ||
    lower.includes("report")
  );
}

export function isModeratorQueueNotification(fields: LegacyNotificationFields): boolean {
  const type = getEffectiveNotificationType(fields);
  if (type !== "unknown") return isModeratorQueueNotificationType(type);
  return isModeratorQueueNotificationMessage(fields.message);
}

export function isReportNotificationType(type: NotificationType): boolean {
  return (
    type === "moderator_post_report" ||
    type === "moderator_comment_report" ||
    type === "moderator_report_resolved"
  );
}

export function isCommunityVerificationNotificationType(type: NotificationType): boolean {
  return type === "moderator_community_verification";
}

/** Client profile tab grouping kind (maps from canonical notification_type). */
export type NotificationGroupKind =
  | "post_like"
  | "post_owner_comment"
  | "post_comment_reply"
  | "artist_tag_comment"
  | "release_event"
  | "system_event"
  | "moderator_event"
  | "single";

export function notificationTypeToGroupKind(type: NotificationType): NotificationGroupKind {
  switch (type) {
    case "post_like":
      return "post_like";
    case "comment_on_post":
      return "post_owner_comment";
    case "reply_to_comment":
      return "post_comment_reply";
    case "artist_tag_comment":
      return "artist_tag_comment";
    case "release_attached":
    case "artist_release_alert":
    case "release_day":
    case "release_announce":
      return "release_event";
    case "release_alert_enabled":
      return "single";
    case "moderation_action":
    case "moderator_post_report":
    case "moderator_comment_report":
    case "moderator_community_verification":
    case "moderator_report_resolved":
      return "moderator_event";
    case "artist_identified_post":
    case "id_verification_feedback":
    case "collab_invite":
      return "release_event";
    case "collab_accept":
    case "collab_reject":
      return "single";
    default:
      return "single";
  }
}

/** Maps to Settings toggle buckets; null = always shown (not user-toggleable). */
export type ToggleableNotificationKind = "release" | "comment" | "like";

export function notificationTypeToToggleableKind(type: NotificationType): ToggleableNotificationKind | null {
  switch (type) {
    case "post_like":
      return "like";
    case "comment_on_post":
    case "reply_to_comment":
    case "artist_tag_comment":
      return "comment";
    case "release_attached":
    case "artist_release_alert":
    case "release_alert_enabled":
    case "release_day":
    case "release_announce":
    case "collab_invite":
      // collab_invite matched release_id heuristic in legacy client prefs
      return "release";
    case "collab_accept":
    case "collab_reject":
      return null;
    default:
      return null;
  }
}

export function getNotificationGroupKind(fields: LegacyNotificationFields): NotificationGroupKind {
  return notificationTypeToGroupKind(getEffectiveNotificationType(fields));
}

export function getToggleableNotificationKindFromFields(
  fields: LegacyNotificationFields,
): ToggleableNotificationKind | null {
  return notificationTypeToToggleableKind(getEffectiveNotificationType(fields));
}
