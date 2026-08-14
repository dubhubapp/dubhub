import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseReleaseTrackerArtworkSession,
  readReleaseTrackerArtworkSession,
  releaseTrackerArtworkSessionKey,
  resolveArtworkSessionReleaseId,
  writeReleaseTrackerArtworkSession,
} from "@/lib/release-tracker-artwork-session";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("release-tracker-artwork-session", () => {
  it("round-trips a valid session record", () => {
    const storage = memoryStorage();
    writeReleaseTrackerArtworkSession(
      "user-1",
      { scope: "my", view: "past", selectedReleaseId: "rel-9" },
      storage,
    );
    const session = readReleaseTrackerArtworkSession("user-1", storage);
    assert.deepEqual(session, {
      schemaVersion: 1,
      scope: "my",
      view: "past",
      selectedReleaseId: "rel-9",
    });
    assert.equal(
      resolveArtworkSessionReleaseId({
        session,
        scope: "my",
        view: "past",
      }),
      "rel-9",
    );
  });

  it("ignores session when scope/view mismatch", () => {
    const session = parseReleaseTrackerArtworkSession({
      schemaVersion: 1,
      scope: "saved",
      view: "upcoming",
      selectedReleaseId: "rel-1",
    });
    assert.equal(
      resolveArtworkSessionReleaseId({
        session,
        scope: "saved",
        view: "past",
      }),
      null,
    );
  });

  it("isolates account keys and clears malformed", () => {
    const storage = memoryStorage({
      [releaseTrackerArtworkSessionKey("bad")]: "{not-json",
    });
    assert.equal(readReleaseTrackerArtworkSession("bad", storage), null);
    assert.notEqual(
      releaseTrackerArtworkSessionKey("a"),
      releaseTrackerArtworkSessionKey("b"),
    );
  });
});
