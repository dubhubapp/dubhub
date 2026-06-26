import { evaluatePushPreferenceGate } from "@shared/push-notification-preferences";
import { ARTIST_IDENTIFIED_POST_MESSAGE, formatReleaseAnnounceMessage } from "@shared/notification-messages";
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
  | "artist_identified_post"
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

interface ArtistIdentifiedPayload extends BaseEventPayload {
  type: "artist_identified_post";
  postId: string;
  artistId: string;
  verifiedCommentId: string;
}

interface ReleaseAttachedPayload extends BaseEventPayload {
  type: "release_attached_to_liked_or_uploaded_post";
  releaseId: string;
  postId: string | null;
  artistId: string;
}

interface ArtistReleaseAlertPayload extends BaseEventPayload {
  type: "artist_release_alert";
  notificationId: string;
  releaseId: string;
  postId: string | null;
  artistId: string;
  artistUsername: string;
  releaseTitle?: string;
}

interface ReleaseDayOutPayload extends BaseEventPayload {
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

interface CollabWorkflowPayload extends BaseEventPayload {
  type: "collab_invite" | "collab_accept" | "collab_reject";
  notificationId: string;
  releaseId: string;
  actorUserId: string;
  actorUsername: string;
  releaseTitle: string;
}

interface ReleaseAnnouncePayload extends BaseEventPayload {
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

type EventPayload =
  | CommentOnPostPayload
  | ReplyToCommentPayload
  | ArtistTagCommentPayload
  | ArtistIdentifiedPayload
  | ReleaseAttachedPayload
  | ArtistReleaseAlertPayload
  | ReleaseDayOutPayload
  | ReleaseAnnouncePayload
  | CollabWorkflowPayload
  | ModeratorCommunityVerificationPayload
  | ModeratorReportOpenedPayload;

function buildTitleAndBody(payload: EventPayload): { title: string; body: string } {
  switch (payload.type) {
    case "comment_on_post":
      return {
        title: "New comment 💬",
        body: `@${payload.actorUsername} commented on your post.`,
      };
    case "reply_to_comment":
      return {
        title: "New reply 💬",
        body: `@${payload.actorUsername} replied to your comment.`,
      };
    case "artist_tag_comment":
      return {
        title: "Artist tag 🎵",
        body: `@${payload.actorUsername} tagged you in a comment.`,
      };
    case "artist_identified_post":
      return {
        title: "Track identified ✅",
        body: ARTIST_IDENTIFIED_POST_MESSAGE,
      };
    case "release_attached_to_liked_or_uploaded_post":
      return {
        title: "Release added",
        body: "That tune you've been waiting for? It's finally got a release date.",
      };
    case "artist_release_alert": {
      const artist = toMention(payload.artistUsername) ?? "Artist";
      const title = payload.releaseTitle?.trim();
      const body =
        title && title.length > 0
          ? `${artist} announced a new release: ${title}`
          : `${artist} announced a new release.`;
      return {
        title: "New Release",
        body,
      };
    }
    case "release_day_out_today": {
      const name = payload.releaseTitle.trim() || "Release";
      const artist = toMention(payload.artistUsername);
      const collaborators = Array.from(
        new Set(
          (payload.collaboratorUsernames ?? [])
            .map((u) => toMention(u))
            .filter((u): u is string => Boolean(u) && u !== artist),
        ),
      );
      let body = `${name} is out today.`;
      if (artist && collaborators.length === 1) {
        body = `${artist} & ${collaborators[0]} - ${name} just dropped.`;
      } else if (artist && collaborators.length > 1) {
        body = `${artist} + collaborators - ${name} just dropped.`;
      } else if (artist) {
        body = `${artist} - ${name} just dropped.`;
      }
      return {
        title: "Out today 🎧",
        body,
      };
    }
    case "release_announce": {
      const artistUsername = String(payload.artistUsername ?? "").trim() || "Artist";
      const releaseTitle = payload.releaseTitle.trim() || "a release";
      return {
        title: "New release",
        body: formatReleaseAnnounceMessage(artistUsername, releaseTitle),
      };
    }
    case "collab_invite": {
      const actor = toMention(payload.actorUsername) ?? "Someone";
      const title = payload.releaseTitle.trim() || "a release";
      return {
        title: "Collaboration invite 🤝",
        body: `${actor} invited you to collaborate on ${title}.`,
      };
    }
    case "collab_accept": {
      const actor = toMention(payload.actorUsername) ?? "Someone";
      const title = payload.releaseTitle.trim() || "your release";
      return {
        title: "Collaboration accepted ✅",
        body: `${actor} accepted your collaboration invite for ${title}.`,
      };
    }
    case "collab_reject": {
      const actor = toMention(payload.actorUsername) ?? "Someone";
      const title = payload.releaseTitle.trim() || "your release";
      return {
        title: "Collaboration declined",
        body: `${actor} declined your collaboration invite for ${title}.`,
      };
    }
    case "moderator_community_verification_pending":
      return {
        title: "ID review 🕵️",
        body: "A community ID needs reviewing.",
      };
    case "moderator_report_opened":
      return {
        title: "New report ⚠️",
        body: "A new report needs review.",
      };
  }
}

function toMention(username: unknown): string | null {
  const cleaned = String(username ?? "").trim().replace(/^@+/, "");
  if (!cleaned) return null;
  return `@${cleaned}`;
}

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

