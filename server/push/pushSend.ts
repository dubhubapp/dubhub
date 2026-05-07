import { sendApnsNotification } from "./apns";
import { storage } from "../storage";

type PushEventName =
  | "comment_on_post"
  | "artist_identified_post"
  | "release_attached_to_liked_or_uploaded_post"
  | "release_day_out_today"
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
  | ArtistIdentifiedPayload
  | ReleaseAttachedPayload
  | ReleaseDayOutPayload
  | ModeratorCommunityVerificationPayload
  | ModeratorReportOpenedPayload;

function buildTitleAndBody(payload: EventPayload): { title: string; body: string } {
  switch (payload.type) {
    case "comment_on_post":
      return {
        title: "New comment 💬",
        body: `@${payload.actorUsername} commented on your post.`,
      };
    case "artist_identified_post":
      return {
        title: "Track identified ✅",
        body: "Your post has been identified by the artist.",
      };
    case "release_attached_to_liked_or_uploaded_post":
      return {
        title: "Release added 🗓️",
        body: "A track you liked now has a release.",
      };
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
    case "moderator_community_verification_pending":
      return {
        title: "ID review 🕵️",
        body: "A community ID needs reviewing.",
      };
    case "moderator_report_opened":
      return {
        title: "New report ⚠️",
        body: "A new report needs review.ing",
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

