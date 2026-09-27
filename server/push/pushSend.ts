import { evaluatePushPreferenceGate } from "@shared/push-notification-preferences";
import { buildTitleAndBody } from "./pushCopy";
import { sendApnsNotification } from "./apns";
import { storage } from "../storage";

function isPushPrefGatingEnabled(): boolean {
  const raw = String(process.env.PUSH_PREF_GATING_ENABLED ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

type PushEventName =
  | "comment_on_post"
  | "reply_to_comment"
  | "artist_tag_comment"
  | "user_mention_comment"
  | "artist_identified_post"
  | "community_identified_post"
  | "track_identified"
  | "anonymous_track_identified"
  | "anonymous_track_revealed"
  | "release_attached_to_liked_or_uploaded_post"
  | "artist_release_alert"
  | "release_day_out_today"
  | "release_announce"
  | "collab_invite"
  | "collab_accept"
  | "collab_reject"
  | "moderator_community_verification_pending"
  | "moderator_report_opened";

interface BaseEventPayload {
  type: PushEventName;
}

interface CommentOnPostPayload extends BaseEventPayload {
  type: "comment_on_post";
  notificationId: string;
  postId: string | null;
  actorUserId: string;
  actorUsername: string;
}

interface ReplyToCommentPayload extends BaseEventPayload {
  type: "reply_to_comment";
  notificationId: string;
  postId: string;
  actorUserId: string;
  actorUsername: string;
}

interface ArtistTagCommentPayload extends BaseEventPayload {
  type: "artist_tag_comment";
  notificationId: string;
  postId: string;
  actorUserId: string;
  actorUsername: string;
}

interface UserMentionCommentPayload extends BaseEventPayload {
  type: "user_mention_comment";
  notificationId: string;
  postId: string;
  actorUserId: string;
  actorUsername: string;
}

interface ArtistNotificationEmojiFields {
  notificationEmoji?: string | null;
  notificationEmojiPaidAccess?: boolean;
}

interface ArtistIdentifiedPayload extends BaseEventPayload, ArtistNotificationEmojiFields {
  type: "artist_identified_post";
  postId: string;
  artistId: string;
  verifiedCommentId: string;
  artistUsername?: string | null;
}

interface CommunityIdentifiedPayload extends BaseEventPayload {
  type: "community_identified_post";
  notificationId: string;
  postId: string;
  actorUserId: string;
}

interface TrackIdentifiedPayload extends BaseEventPayload {
  type: "track_identified";
  notificationId: string;
  postId: string;
  actorUserId: string;
}

/** Actor-less: no artistId / actorUserId / username in payload. */
interface AnonymousTrackIdentifiedPayload extends BaseEventPayload {
  type: "anonymous_track_identified";
  notificationId: string;
  postId: string;
  message: string;
}

interface AnonymousTrackRevealedPayload extends BaseEventPayload {
  type: "anonymous_track_revealed";
  notificationId: string;
  postId: string;
  actorUserId: string;
  actorUsername?: string | null;
  message: string;
}

interface ReleaseAttachedPayload extends BaseEventPayload {
  type: "release_attached_to_liked_or_uploaded_post";
  releaseId: string;
  postId: string | null;
  artistId: string;
}

interface ArtistReleaseAlertPayload extends BaseEventPayload, ArtistNotificationEmojiFields {
  type: "artist_release_alert";
  notificationId: string;
  releaseId: string;
  postId: string | null;
  artistId: string;
  artistUsername: string;
  releaseTitle?: string;
}

interface ReleaseDayOutPayload extends BaseEventPayload, ArtistNotificationEmojiFields {
  type: "release_day_out_today";
  releaseId: string;
  postId: string | null;
  artistId: string;
  /** Human-readable title for alert body (not the APNs title). */
  releaseTitle: string;
  /** Artist username for contextual copy when available. */
  artistUsername?: string;
  /** Accepted collaborator usernames when cheaply available. */
  collaboratorUsernames?: string[];
}

interface CollabWorkflowPayload extends BaseEventPayload, ArtistNotificationEmojiFields {
  type: "collab_invite" | "collab_accept" | "collab_reject";
  notificationId: string;
  releaseId: string;
  actorUserId: string;
  actorUsername: string;
  releaseTitle: string;
}

interface ReleaseAnnouncePayload extends BaseEventPayload, ArtistNotificationEmojiFields {
  type: "release_announce";
  notificationId: string;
  releaseId: string;
  artistId: string;
  artistUsername: string;
  releaseTitle: string;
  postId?: string | null;
}

interface ModeratorCommunityVerificationPayload extends BaseEventPayload {
  type: "moderator_community_verification_pending";
  postId: string;
  triggeredByUserId: string;
}

interface ModeratorReportOpenedPayload extends BaseEventPayload {
  type: "moderator_report_opened";
  postId: string;
  triggeredByUserId: string;
  reportKind: "post" | "comment";
  reportId?: string;
}

export type EventPayload =
  | CommentOnPostPayload
  | ReplyToCommentPayload
  | ArtistTagCommentPayload
  | UserMentionCommentPayload
  | ArtistIdentifiedPayload
  | CommunityIdentifiedPayload
  | TrackIdentifiedPayload
  | AnonymousTrackIdentifiedPayload
  | AnonymousTrackRevealedPayload
  | ReleaseAttachedPayload
  | ArtistReleaseAlertPayload
  | ReleaseDayOutPayload
  | ReleaseAnnouncePayload
  | CollabWorkflowPayload
  | ModeratorCommunityVerificationPayload
  | ModeratorReportOpenedPayload;

export async function sendPushToUser(
  recipientUserId: string,
  payload: EventPayload,
): Promise<void> {
  try {
    if (isPushPrefGatingEnabled()) {
      const prefs = await storage.getUserNotificationPreferences(recipientUserId);
      const gate = evaluatePushPreferenceGate(payload.type, prefs);
      if (!gate.allowed) {
        console.log("[push] sendPushToUser skipping: preference disabled", {
          recipientUserId,
          eventType: payload.type,
          preferenceKey: gate.preferenceKey,
          reason: gate.reason,
        });
        return;
      }
    }

    const tokens = await storage.getActivePushTokensForUser(recipientUserId);
    const environmentsFound = tokens?.length
      ? [...new Set(tokens.map((t) => (t.environment === "production" ? "production" : "sandbox")))]
      : [];
    console.log("[push] sendPushToUser", {
      recipientUserId,
      eventType: payload.type,
      activeTokenCount: tokens?.length ?? 0,
      environmentsFound,
    });

    if (!tokens || tokens.length === 0) {
      console.log("[push] sendPushToUser skipping: no active tokens", { recipientUserId, eventType: payload.type });
      return;
    }

    const bundleId = process.env.APNS_BUNDLE_ID;
    if (!bundleId) {
      console.error("[push] APNS_BUNDLE_ID missing; skipping push send", {
        recipientUserId,
        eventType: payload.type,
      });
      return;
    }

    const { title, body } = buildTitleAndBody(payload);
    const data: Record<string, unknown> = { ...payload };

    for (const token of tokens) {
      const env = token.environment === "production" ? "production" : "sandbox";
      const result = await sendApnsNotification({
        environment: env,
        deviceToken: token.token,
        bundleId,
        title,
        body,
        data,
      });

      if (result.ok) {
        console.log("[push] sendPushToUser APNs result", {
          recipientUserId,
          eventType: payload.type,
          environment: env,
          ok: true,
        });
      } else if (result.reason === "invalid_token") {
        console.log("[push] sendPushToUser APNs result", {
          recipientUserId,
          eventType: payload.type,
          environment: env,
          ok: false,
          reason: "invalid_token",
          status: result.status,
          apnsReason: summarizeApnsErrorBody(result.error),
        });
        try {
          await storage.deactivatePushTokenByValue(token.token, "apns_invalid_token");
        } catch (err) {
          console.error("[push] Failed to deactivate invalid token", err);
        }
      } else {
        console.log("[push] sendPushToUser APNs result", {
          recipientUserId,
          eventType: payload.type,
          environment: env,
          ok: false,
          reason: "transient_error",
          status: result.status,
          apnsReason: summarizeApnsErrorBody(result.error),
        });
      }
    }
  } catch (err) {
    console.error("[push] sendPushToUser error", err);
  }
}

/** Apple error response body may be JSON with a `reason` field; never log token values. */
function summarizeApnsErrorBody(raw: string | undefined): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as { reason?: string };
    if (typeof parsed.reason === "string" && parsed.reason.length > 0) {
      return parsed.reason;
    }
  } catch {
    // non-JSON body
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

