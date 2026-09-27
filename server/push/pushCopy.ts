/**
 * Pure push title/body builder. No database or Supabase imports.
 */

import { formatArtistIdentityMention } from "@shared/notification-emoji";
import {
  COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
  TRACK_ID_CONFIRMED_TITLE,
  TRACK_ID_REVEALED_TITLE,
  TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
  formatArtistIdentifiedPostMessage,
  formatReleaseAnnounceMessage,
} from "@shared/notification-messages";
import { formatArtistReleaseAlertMessage } from "../maybe-notify-release-public";
import type { EventPayload } from "./pushSend";

export function buildTitleAndBody(payload: EventPayload): { title: string; body: string } {
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
    case "user_mention_comment":
      return {
        title: "Mention 💬",
        body: `@${payload.actorUsername} mentioned you in a comment.`,
      };
    case "artist_identified_post":
      return {
        title: TRACK_ID_CONFIRMED_TITLE,
        body: formatArtistIdentifiedPostMessage(payload.artistUsername, {
          notificationEmoji: payload.notificationEmoji,
          paidAccess: payload.notificationEmojiPaidAccess,
        }),
      };
    case "community_identified_post":
      return {
        title: TRACK_ID_CONFIRMED_TITLE,
        body: COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
      };
    case "track_identified":
      return {
        title: TRACK_ID_CONFIRMED_TITLE,
        body: TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
      };
    case "anonymous_track_identified":
      return {
        title: TRACK_ID_CONFIRMED_TITLE,
        body: payload.message,
      };
    case "anonymous_track_revealed":
      return {
        title: TRACK_ID_REVEALED_TITLE,
        body: payload.message,
      };
    case "release_attached_to_liked_or_uploaded_post":
      return {
        title: "🪩 Release added",
        body: "That tune you've been waiting for? It's finally got a release date.",
      };
    case "artist_release_alert":
      return {
        title: "🔔 New Release",
        body: formatArtistReleaseAlertMessage(payload.artistUsername, payload.releaseTitle, {
          notificationEmoji: payload.notificationEmoji,
          paidAccess: payload.notificationEmojiPaidAccess,
        }),
      };
    case "release_day_out_today": {
      const name = payload.releaseTitle.trim() || "Release";
      const artistPlain = toMention(payload.artistUsername);
      const collaborators = Array.from(
        new Set(
          (payload.collaboratorUsernames ?? [])
            .map((u) => toMention(u))
            .filter((u): u is string => Boolean(u) && u !== artistPlain),
        ),
      );
      const artist = artistPlain ? mentionWithActiveEmoji(artistPlain, payload) : null;
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
        title: "🗓️ New Release",
        body: formatReleaseAnnounceMessage(artistUsername, releaseTitle, {
          notificationEmoji: payload.notificationEmoji,
          paidAccess: payload.notificationEmojiPaidAccess,
        }),
      };
    }
    case "collab_invite": {
      const actor = mentionWithActiveEmoji(toMention(payload.actorUsername) ?? "Someone", payload);
      const title = payload.releaseTitle.trim() || "a release";
      return {
        title: "Collaboration invite 🤝",
        body: `${actor} invited you to collaborate on ${title}.`,
      };
    }
    case "collab_accept": {
      const actor = mentionWithActiveEmoji(toMention(payload.actorUsername) ?? "Someone", payload);
      const title = payload.releaseTitle.trim() || "your release";
      return {
        title: "Collaboration accepted ✅",
        body: `${actor} accepted your collaboration invite for ${title}.`,
      };
    }
    case "collab_reject": {
      const actor = mentionWithActiveEmoji(toMention(payload.actorUsername) ?? "Someone", payload);
      const title = payload.releaseTitle.trim() || "your release";
      return {
        title: "❌ Collaboration Declined",
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

function mentionWithActiveEmoji(
  mention: string,
  payload: {
    notificationEmoji?: string | null;
    notificationEmojiPaidAccess?: boolean;
  },
): string {
  return formatArtistIdentityMention({
    mention,
    notificationEmoji: payload.notificationEmoji,
    paidAccess: payload.notificationEmojiPaidAccess,
  });
}

function toMention(username: unknown): string | null {
  const cleaned = String(username ?? "").trim().replace(/^@+/, "");
  if (!cleaned) return null;
  return `@${cleaned}`;
}
