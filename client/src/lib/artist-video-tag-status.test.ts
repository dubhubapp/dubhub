/**
 * ARTIST-ID-UX-2 — per-artist denial helpers (no network).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTIST_DENIED_MENTION_HINT,
  collectDeniedArtistIdsFromTags,
  isArtistVideoTagDeniedStatus,
  isArtistVideoTagPendingStatus,
} from "../../../shared/artist-video-tag-status";

describe("artist_video_tags denial status", () => {
  it("treats denied/DENIED/rejected as denied; pending/confirmed are not", () => {
    assert.equal(isArtistVideoTagDeniedStatus("denied"), true);
    assert.equal(isArtistVideoTagDeniedStatus("DENIED"), true);
    assert.equal(isArtistVideoTagDeniedStatus("rejected"), true);
    assert.equal(isArtistVideoTagDeniedStatus("REJECTED"), true);
    assert.equal(isArtistVideoTagDeniedStatus("pending"), false);
    assert.equal(isArtistVideoTagDeniedStatus("PENDING"), false);
    assert.equal(isArtistVideoTagDeniedStatus("confirmed"), false);
    assert.equal(isArtistVideoTagPendingStatus("PENDING"), true);
  });

  it("collects only denied artist ids from tag rows", () => {
    const ids = collectDeniedArtistIdsFromTags([
      { artist_id: "a", status: "PENDING" },
      { artist_id: "b", status: "denied" },
      { artistId: "c", status: "CONFIRMED" },
      { artist_id: "d", status: "REJECTED" },
      { artist_id: "b", status: "DENIED" },
    ]);
    assert.deepEqual([...ids].sort(), ["b", "d"]);
    assert.equal(ARTIST_DENIED_MENTION_HINT.includes("isn't their track"), true);
  });
});
