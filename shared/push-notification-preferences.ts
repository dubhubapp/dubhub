/** Server-side push preference bucket keys (maps to user_notification_preferences columns). */
export type PushPreferenceKey =
  | "device_push_alerts"
  | "comments_and_replies"
  | "artist_tags"
  | "release_updates";

export type PushPreferenceGateInput = {
  commentsAndRepliesPush: boolean;
  artistTagsPush: boolean;
  releaseUpdatesPush: boolean;
  devicePushAlerts: boolean;
};

export type PushPreferenceGateResult =
  | { allowed: true }
  | { allowed: false; preferenceKey: PushPreferenceKey; reason: string };

/**
 * Evaluate whether a push event may be sent for the recipient's preferences.
 * Always-on events bypass category toggles but still respect device_push_alerts.
 */
export function evaluatePushPreferenceGate(
  eventType: string,
  prefs: PushPreferenceGateInput,
): PushPreferenceGateResult {
  if (!prefs.devicePushAlerts) {
    return {
      allowed: false,
      preferenceKey: "device_push_alerts",
      reason: "device_push_alerts disabled",
    };
  }

  switch (eventType) {
    case "comment_on_post":
    case "reply_to_comment":
      if (!prefs.commentsAndRepliesPush) {
        return {
          allowed: false,
          preferenceKey: "comments_and_replies",
          reason: "comments_and_replies disabled",
        };
      }
      break;
    case "artist_tag_comment":
      if (!prefs.artistTagsPush) {
        return {
          allowed: false,
          preferenceKey: "artist_tags",
          reason: "artist_tags disabled",
        };
      }
      break;
    case "release_attached_to_liked_or_uploaded_post":
    case "artist_release_alert":
    case "release_day_out_today":
    case "release_announce":
      if (!prefs.releaseUpdatesPush) {
        return {
          allowed: false,
          preferenceKey: "release_updates",
          reason: "release_updates disabled",
        };
      }
      break;
    case "artist_identified_post":
    case "collab_invite":
    case "collab_accept":
    case "collab_reject":
    case "moderator_community_verification_pending":
    case "moderator_report_opened":
      break;
    default:
      break;
  }

  return { allowed: true };
}
