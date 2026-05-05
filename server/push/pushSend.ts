import { sendApnsNotification } from "./apns";
import { storage } from "../storage";

type PushEventName =
  | "comment_on_post"
  | "artist_identified_post"
  | "release_attached_to_liked_or_uploaded_post";

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

type EventPayload =
  | CommentOnPostPayload
  | ArtistIdentifiedPayload
  | ReleaseAttachedPayload;

function buildTitleAndBody(payload: EventPayload): { title: string; body: string } {
  switch (payload.type) {
    case "comment_on_post":
      return {
        title: "New comment",
        body: `@${payload.actorUsername} commented on your post.`,
      };
    case "artist_identified_post":
      return {
        title: "Track identified",
        body: "An artist identified your track.",
      };
    case "release_attached_to_liked_or_uploaded_post":
      return {
        title: "Release added",
        body: "A track you interacted with has been added to your Releases.",
      };
  }
}

export async function sendPushToUser(
  recipientUserId: string,
  payload: EventPayload,
): Promise<void> {
  try {
    const tokens = await storage.getActivePushTokensForUser(recipientUserId);
    if (!tokens || tokens.length === 0) return;

    const bundleId = process.env.APNS_BUNDLE_ID;
    if (!bundleId) {
      console.error("[push] APNS_BUNDLE_ID missing; skipping push send");
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

      if (!result.ok) {
        if (result.reason === "invalid_token") {
          try {
            await storage.deactivatePushTokenByValue(token.token, "apns_invalid_token");
          } catch (err) {
            console.error("[push] Failed to deactivate invalid token", err);
          }
        } else {
          console.error("[push] transient APNS error", {
            userId: recipientUserId,
            tokenId: token.id,
            status: (result as any).status,
            error: (result as any).error,
          });
        }
      }
    }
  } catch (err) {
    console.error("[push] sendPushToUser error", err);
  }
}

