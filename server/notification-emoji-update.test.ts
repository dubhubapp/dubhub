import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateNotificationEmojiForUser } from "./notification-emoji-update";

const ARTIST = {
  id: "artist-1",
  account_type: "artist",
  verified_artist: true,
};

describe("updateNotificationEmojiForUser", () => {
  it("saves a valid emoji for a paid verified artist", async () => {
    const saved: Array<{ userId: string; emoji: string | null }> = [];
    const result = await updateNotificationEmojiForUser({
      user: ARTIST,
      body: { emoji: "⚙️" },
      canUsePaidTools: async () => true,
      saveEmoji: async (userId, emoji) => {
        saved.push({ userId, emoji });
        return true;
      },
    });
    assert.deepEqual(result, { ok: true, notification_emoji: "⚙️" });
    assert.deepEqual(saved, [{ userId: "artist-1", emoji: "⚙️" }]);
  });

  it("clears to null", async () => {
    let stored: string | null = "⚙️";
    const result = await updateNotificationEmojiForUser({
      user: ARTIST,
      body: { emoji: null },
      canUsePaidTools: async () => true,
      saveEmoji: async (_userId, emoji) => {
        stored = emoji;
        return true;
      },
    });
    assert.deepEqual(result, { ok: true, notification_emoji: null });
    assert.equal(stored, null);
  });

  it("rejects an invalid value before save", async () => {
    let writes = 0;
    const result = await updateNotificationEmojiForUser({
      user: ARTIST,
      body: { emoji: "fire" },
      canUsePaidTools: async () => true,
      saveEmoji: async () => {
        writes += 1;
        return true;
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
    assert.equal(writes, 0);
  });

  it("locks free verified artists without clearing", async () => {
    let writes = 0;
    const result = await updateNotificationEmojiForUser({
      user: ARTIST,
      body: { emoji: null },
      canUsePaidTools: async () => false,
      saveEmoji: async () => {
        writes += 1;
        return true;
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "PAID_ARTIST_TOOL_REQUIRED");
    }
    assert.equal(writes, 0);
  });

  it("rejects non-artists and unverified artists", async () => {
    const listener = await updateNotificationEmojiForUser({
      user: { id: "u1", account_type: "user", verified_artist: false },
      body: { emoji: "⚙️" },
      canUsePaidTools: async () => true,
      saveEmoji: async () => true,
    });
    const unverified = await updateNotificationEmojiForUser({
      user: { id: "u2", account_type: "artist", verified_artist: false },
      body: { emoji: "⚙️" },
      canUsePaidTools: async () => true,
      saveEmoji: async () => true,
    });
    assert.equal(listener.ok, false);
    assert.equal(unverified.ok, false);
    if (!listener.ok) assert.equal(listener.status, 403);
    if (!unverified.ok) assert.equal(unverified.message, "Verified artist access only");
  });

  it("requires authentication", async () => {
    const result = await updateNotificationEmojiForUser({
      user: null,
      body: { emoji: "⚙️" },
      canUsePaidTools: async () => true,
      saveEmoji: async () => true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });
});
