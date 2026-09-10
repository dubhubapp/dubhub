/**
 * ARTIST-ID-UX-2 — autocomplete disabled denied artists.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARTIST_DENIED_MENTION_HINT } from "../../../shared/artist-video-tag-status";
import { buildMentionSuggestions } from "./comment-mention-suggestions";

describe("ARTIST-ID-UX-2 mention suggestions denial", () => {
  const artists = [
    { id: "artist-a", username: "alpha", verified_artist: true },
    { id: "artist-b", username: "beta", verified_artist: true },
  ];

  it("marks denied artist disabled with hint; other artists remain selectable", () => {
    const results = buildMentionSuggestions({
      query: "",
      verifiedArtists: artists,
      recentMentionUsers: [],
      threadParticipants: [],
      deniedArtistIds: new Set(["artist-a"]),
      deniedArtistHint: ARTIST_DENIED_MENTION_HINT,
    });

    const alpha = results.find((r) => r.userId === "artist-a");
    const beta = results.find((r) => r.userId === "artist-b");
    assert.ok(alpha);
    assert.equal(alpha!.disabled, true);
    assert.equal(alpha!.disabledReason, ARTIST_DENIED_MENTION_HINT);
    assert.ok(beta);
    assert.equal(beta!.disabled, undefined);
  });

  it("still shows denied artist when query matches their username", () => {
    const results = buildMentionSuggestions({
      query: "alp",
      verifiedArtists: artists,
      recentMentionUsers: [],
      threadParticipants: [],
      deniedArtistIds: new Set(["artist-a"]),
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.userId, "artist-a");
    assert.equal(results[0]!.disabled, true);
  });
});
