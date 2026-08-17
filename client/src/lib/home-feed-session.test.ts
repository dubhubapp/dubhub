import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHomeFeedSessionSnapshot,
  sanitizeHomeFeedSessionState,
} from "./home-feed-session";

describe("home feed session subgenre persistence", () => {
  it("old snapshot without children restores as {}", () => {
    const restored = sanitizeHomeFeedSessionState({
      sortMode: "trending",
      selectedGenres: ["dnb"],
      identificationFilter: "all",
      activePostId: "post-1",
      scrollTop: 12,
    });
    assert.ok(restored);
    assert.deepEqual(restored.selectedGenres, ["dnb"]);
    assert.deepEqual(restored.selectedSubgenresByGenre, {});
  });

  it("valid child state round-trips through session snapshot", () => {
    const snapshot = buildHomeFeedSessionSnapshot({
      sortMode: "hottest",
      selectedGenres: ["dnb", "house"],
      selectedSubgenresByGenre: {
        dnb: ["neuro", "jump_up"],
        house: ["bass_house"],
      },
      identificationFilter: "identified",
      activePostId: "post-2",
      scrollTop: 40,
    });
    const restored = sanitizeHomeFeedSessionState(snapshot);
    assert.ok(restored);
    assert.deepEqual(restored.selectedGenres, ["dnb", "house"]);
    assert.deepEqual(restored.selectedSubgenresByGenre, {
      dnb: ["jump_up", "neuro"],
      house: ["bass_house"],
    });
  });

  it("orphan restored child is dropped", () => {
    const restored = sanitizeHomeFeedSessionState({
      sortMode: "newest",
      selectedGenres: ["house"],
      selectedSubgenresByGenre: {
        dnb: ["jump_up"],
        house: ["future_house"],
      },
      identificationFilter: "all",
      activePostId: null,
      scrollTop: 0,
    });
    assert.ok(restored);
    assert.deepEqual(restored.selectedSubgenresByGenre, {
      house: ["future_house"],
    });
  });

  it("wrong-parent restored child is dropped", () => {
    const restored = sanitizeHomeFeedSessionState({
      sortMode: "trending",
      selectedGenres: ["dnb"],
      selectedSubgenresByGenre: {
        dnb: ["bass_house", "jump_up"],
      },
      identificationFilter: "all",
      activePostId: null,
      scrollTop: 0,
    });
    assert.ok(restored);
    assert.deepEqual(restored.selectedSubgenresByGenre, { dnb: ["jump_up"] });
  });

  it("malformed child state restores as {}", () => {
    const restored = sanitizeHomeFeedSessionState({
      sortMode: "trending",
      selectedGenres: ["dnb"],
      selectedSubgenresByGenre: ["jump_up"],
      identificationFilter: "all",
      activePostId: null,
      scrollTop: 0,
    });
    assert.ok(restored);
    assert.deepEqual(restored.selectedSubgenresByGenre, {});
  });
});
