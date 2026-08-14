import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_TRACKER_LAYOUT_DEFAULT,
  parseReleaseTrackerLayoutPreference,
  readReleaseTrackerLayoutPreference,
  releaseTrackerLayoutStorageKey,
  writeReleaseTrackerLayoutPreference,
} from "@/lib/release-tracker-layout-preference";

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

describe("release-tracker-layout-preference", () => {
  it("defaults to List when missing or malformed", () => {
    const storage = memoryStorage();
    assert.equal(readReleaseTrackerLayoutPreference("u1", storage), "list");
    assert.equal(parseReleaseTrackerLayoutPreference("Artwork"), "artwork");
    assert.equal(parseReleaseTrackerLayoutPreference("LIST"), "list");
    assert.equal(parseReleaseTrackerLayoutPreference("grid"), RELEASE_TRACKER_LAYOUT_DEFAULT);
  });

  it("persists per account", () => {
    const storage = memoryStorage();
    writeReleaseTrackerLayoutPreference("alice", "artwork", storage);
    writeReleaseTrackerLayoutPreference("bob", "list", storage);
    assert.equal(readReleaseTrackerLayoutPreference("alice", storage), "artwork");
    assert.equal(readReleaseTrackerLayoutPreference("bob", storage), "list");
    assert.match(releaseTrackerLayoutStorageKey("alice"), /alice$/);
  });

  it("returns List when user id empty", () => {
    assert.equal(readReleaseTrackerLayoutPreference("  "), "list");
    assert.equal(writeReleaseTrackerLayoutPreference("", "artwork"), false);
  });
});
