import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NOTIFICATION_EMOJI_MAX_RAW_LENGTH,
  formatArtistIdentityMention,
  parseNotificationEmojiInput,
  resolveActiveNotificationEmoji,
} from "./notification-emoji";
import {
  ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE,
  COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
  TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
  formatAnonymousTrackIdentifiedLikerMessage,
  formatAnonymousTrackIdentifiedUploaderMessage,
  formatArtistIdentifiedPostMessage,
  formatCollabAcceptStoredMessage,
  formatCollabInviteStoredMessage,
  formatCollabRejectStoredMessage,
  formatReleaseAnnounceMessage,
  formatReleaseDayInAppMessage,
} from "./notification-messages";
import { formatArtistReleaseAlertMessage } from "../server/maybe-notify-release-public";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const paid = { notificationEmoji: "⚙️", paidAccess: true } as const;

describe("parseNotificationEmojiInput", () => {
  it("accepts a single emoji, variation selector, skin tone, ZWJ, and flag", () => {
    assert.deepEqual(parseNotificationEmojiInput("⚙️"), { ok: true, emoji: "⚙️" });
    assert.deepEqual(parseNotificationEmojiInput("❤️"), { ok: true, emoji: "❤️" });
    assert.deepEqual(parseNotificationEmojiInput("👍🏽"), { ok: true, emoji: "👍🏽" });
    assert.deepEqual(parseNotificationEmojiInput("👩‍💻"), { ok: true, emoji: "👩‍💻" });
    assert.deepEqual(parseNotificationEmojiInput("👨‍👩‍👧‍👦"), { ok: true, emoji: "👨‍👩‍👧‍👦" });
    assert.deepEqual(parseNotificationEmojiInput("🇬🇧"), { ok: true, emoji: "🇬🇧" });
    assert.deepEqual(parseNotificationEmojiInput("  ⚙️  "), { ok: true, emoji: "⚙️" });
  });

  it("clears null and empty string", () => {
    assert.deepEqual(parseNotificationEmojiInput(null), { ok: true, emoji: null });
    assert.deepEqual(parseNotificationEmojiInput(""), { ok: true, emoji: null });
  });

  it("rejects words, multiple emoji, trailing text, whitespace, and over-length input", () => {
    assert.equal(parseNotificationEmojiInput("fire").ok, false);
    assert.equal(parseNotificationEmojiInput("🔥🔥").ok, false);
    assert.equal(parseNotificationEmojiInput("⚙️ ok").ok, false);
    assert.equal(parseNotificationEmojiInput("   ").ok, false);
    assert.equal(parseNotificationEmojiInput("a").ok, false);
    assert.equal(
      parseNotificationEmojiInput("🔥".repeat(NOTIFICATION_EMOJI_MAX_RAW_LENGTH + 1)).ok,
      false,
    );
    assert.equal(parseNotificationEmojiInput(1).ok, false);
  });
});

describe("formatArtistIdentityMention", () => {
  it("appends emoji only when the value is valid and paid access is on", () => {
    assert.equal(
      formatArtistIdentityMention({ mention: "@sota", notificationEmoji: "⚙️", paidAccess: true }),
      "@sota ⚙️",
    );
    assert.equal(
      formatArtistIdentityMention({ mention: "sota", notificationEmoji: "⚙️", paidAccess: true }),
      "sota ⚙️",
    );
    assert.equal(
      formatArtistIdentityMention({ mention: "@sota", notificationEmoji: "⚙️", paidAccess: false }),
      "@sota",
    );
    assert.equal(
      formatArtistIdentityMention({ mention: "@sota", notificationEmoji: "fire", paidAccess: true }),
      "@sota",
    );
    assert.equal(resolveActiveNotificationEmoji({ stored: "⚙️", paidAccess: false }), null);
    assert.equal(resolveActiveNotificationEmoji({ stored: "fire", paidAccess: true }), null);
  });
});

describe("eligible notification copy", () => {
  it("artist confirm, announce, release day, and collab mentions include the emoji", () => {
    const confirm = formatArtistIdentifiedPostMessage("sota", paid);
    const announce = formatReleaseAnnounceMessage("sota", "Night Bus", paid);
    const alert = formatArtistReleaseAlertMessage("sota", "Night Bus", paid);
    assert.equal(confirm, "@sota ⚙️ just confirmed the track you uploaded.");
    assert.equal(announce, "@sota ⚙️ just announced Night Bus.");
    assert.equal(alert, "@sota ⚙️ announced a new release: Night Bus");
    for (const line of [confirm, announce, alert]) {
      const at = line.indexOf("⚙️");
      assert.equal(line.slice(at - 1, at + "⚙️".length + 1), " ⚙️ ");
      assert.equal(line.split("⚙️").length - 1, 1);
    }
    assert.equal(formatReleaseDayInAppMessage("sota", "Night Bus", paid), "sota ⚙️ released Night Bus");
    assert.equal(
      formatCollabInviteStoredMessage("sota", "Night Bus", paid),
      "@sota ⚙️ invited you as a collaborator on Night Bus. Accept or reject.",
    );
    assert.equal(
      formatCollabAcceptStoredMessage("sota", "Night Bus", paid),
      "@sota ⚙️ accepted your collaboration invite for Night Bus",
    );
    assert.equal(
      formatCollabRejectStoredMessage("sota", "Night Bus", paid),
      "@sota ⚙️ declined your collaboration invite for Night Bus",
    );
  });

  it("omitting emoji keeps the previous sentences", () => {
    assert.equal(
      formatArtistIdentifiedPostMessage("sota"),
      "@sota just confirmed the track you uploaded.",
    );
    assert.equal(formatArtistIdentifiedPostMessage(null), ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE);
    assert.equal(formatReleaseAnnounceMessage("sota", "Night Bus"), "@sota just announced Night Bus.");
    assert.equal(formatReleaseDayInAppMessage("sota", "Night Bus"), "sota released Night Bus");
    assert.equal(
      formatCollabInviteStoredMessage("sota", "Night Bus"),
      "@sota invited you as a collaborator on Night Bus. Accept or reject.",
    );
  });
});

describe("ineligible notification copy stays plain", () => {
  it("anonymous identify, community, and saved-track lines have no artist emoji slot", () => {
    assert.equal(
      formatAnonymousTrackIdentifiedUploaderMessage(null),
      "A track you uploaded was identified.",
    );
    assert.equal(
      formatAnonymousTrackIdentifiedLikerMessage("Title"),
      "A track you saved was identified.\nID - Title",
    );
    assert.equal(
      COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
      "Great news - your post has just been identified by the community.",
    );
    assert.equal(
      TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
      "You finally found it - that track you saved has been identified.",
    );
  });

  it("does not add notification_emoji to public_profiles", () => {
    const view = readFileSync(
      join(root, "supabase/migrations/20260917180000_public_profiles_view.sql"),
      "utf8",
    );
    assert.doesNotMatch(view, /notification_emoji/);
    const migration = readFileSync(
      join(root, "supabase/migrations/20260927120000_profiles_notification_emoji.sql"),
      "utf8",
    );
    assert.match(migration, /ADD COLUMN IF NOT EXISTS notification_emoji text NULL/);
    assert.doesNotMatch(migration, /CREATE OR REPLACE VIEW public\.public_profiles/);
    assert.doesNotMatch(migration, /ALTER VIEW public\.public_profiles/);
    assert.match(migration, /REVOKE INSERT \(notification_emoji\), UPDATE \(notification_emoji\)/);
    assert.match(migration, /FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /TO service_role/);
    assert.match(migration, /protect_profiles_notification_emoji/);
    assert.match(migration, /current_user IN \('service_role', 'postgres', 'supabase_admin'\)/);
    assert.match(migration, /notification_emoji is server-managed/);
  });
});
