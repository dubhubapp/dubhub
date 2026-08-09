import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE,
  COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
  TRACK_ID_CONFIRMED_TITLE,
  TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
  formatArtistIdentifiedPostMessage,
} from "./notification-messages";

describe("Track ID notification copy", () => {
  it("uses the canonical Track ID Confirmed title", () => {
    assert.equal(TRACK_ID_CONFIRMED_TITLE, "🔌 Track ID Confirmed");
  });

  it("community uploader copy matches approved Variant A", () => {
    assert.equal(
      COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
      "Great news - your post has just been identified by the community.",
    );
  });

  it("saved-track copy matches approved Variant C", () => {
    assert.equal(
      TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
      "You finally found it - that track you saved has been identified.",
    );
  });

  it("formats artist own-track copy with username (Variant B)", () => {
    assert.equal(
      formatArtistIdentifiedPostMessage("ChaseAndStatus"),
      "@ChaseAndStatus just confirmed the track you uploaded.",
    );
  });

  it("strips leading @ from artist username", () => {
    assert.equal(
      formatArtistIdentifiedPostMessage("@ChaseAndStatus"),
      "@ChaseAndStatus just confirmed the track you uploaded.",
    );
  });

  it("falls back safely when username is missing", () => {
    assert.equal(formatArtistIdentifiedPostMessage(null), ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE);
    assert.equal(formatArtistIdentifiedPostMessage(""), ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE);
    assert.equal(formatArtistIdentifiedPostMessage("   "), ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE);
    assert.equal(formatArtistIdentifiedPostMessage("undefined"), ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE);
    assert.equal(formatArtistIdentifiedPostMessage("null"), ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE);
    assert.equal(
      ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE,
      "The artist just confirmed the track you uploaded.",
    );
    assert.doesNotMatch(formatArtistIdentifiedPostMessage(null), /@/);
  });
});
