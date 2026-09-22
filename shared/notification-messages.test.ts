import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTIST_IDENTIFIED_POST_FALLBACK_MESSAGE,
  COMMUNITY_IDENTIFIED_UPLOADER_MESSAGE,
  TRACK_ID_CONFIRMED_TITLE,
  TRACK_ID_REVEALED_TITLE,
  TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
  formatAnonymousTrackIdentifiedLikerMessage,
  formatAnonymousTrackIdentifiedUploaderMessage,
  formatAnonymousTrackRevealedLikerMessage,
  formatAnonymousTrackRevealedUploaderMessage,
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

describe("VAT-ANON-5 anonymous identify / reveal copy", () => {
  it("uploader anonymous identify ± title", () => {
    assert.equal(
      formatAnonymousTrackIdentifiedUploaderMessage(null),
      "A track you uploaded was identified.",
    );
    assert.equal(
      formatAnonymousTrackIdentifiedUploaderMessage("Test Song"),
      "A track you uploaded was identified.\nID - Test Song",
    );
  });

  it("liker anonymous identify ± title", () => {
    assert.equal(
      formatAnonymousTrackIdentifiedLikerMessage(null),
      TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
    );
    assert.equal(
      formatAnonymousTrackIdentifiedLikerMessage("Test Song"),
      "A track you saved was identified.\nID - Test Song",
    );
  });

  it("manual reveal uploader copy with optional title", () => {
    assert.equal(TRACK_ID_REVEALED_TITLE, "Track ID Revealed");
    assert.equal(
      formatAnonymousTrackRevealedUploaderMessage("ArtistUsername", null),
      "Mystery solved — it's @ArtistUsername",
    );
    assert.equal(
      formatAnonymousTrackRevealedUploaderMessage("ArtistUsername", "Test Song"),
      "Mystery solved — it's @ArtistUsername\nID - Test Song",
    );
  });

  it("manual reveal liker copy with optional title", () => {
    assert.equal(
      formatAnonymousTrackRevealedLikerMessage("ArtistUsername", null),
      "The artist behind a track you saved has revealed themselves — @ArtistUsername",
    );
    assert.equal(
      formatAnonymousTrackRevealedLikerMessage("ArtistUsername", "Test Song"),
      "The artist behind a track you saved has revealed themselves — @ArtistUsername\nID - Test Song",
    );
  });
});
