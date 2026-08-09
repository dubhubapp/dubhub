import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isHomeReleaseWidgetSelectionEnabled,
} from "./home-widget-selection-flag";
import {
  clearHomeWidgetSelectedReleaseId,
  homeWidgetSelectionStorageKey,
  parseHomeWidgetSelectionRecord,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
} from "./home-widget-selection-store";
import {
  HOME_WIDGET_UNDATED_COPY,
  resolveHomeWidgetSelectionActionVisibility,
} from "./home-widget-selection-eligibility";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    raw: map,
  };
}

describe("home widget selection flag", () => {
  it("defaults false and enables only on exact true", () => {
    assert.equal(isHomeReleaseWidgetSelectionEnabled({}), false);
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: "true",
      }),
      true,
    );
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: "1",
      }),
      false,
    );
  });
});

describe("home widget selection storage", () => {
  it("uses a per-user key", () => {
    assert.equal(
      homeWidgetSelectionStorageKey("user-a"),
      "dubhub:home-widget-selected-release:user-a",
    );
  });

  it("keeps User A and User B independent", () => {
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(
      "user-a",
      "00000000-0000-4000-8000-000000000001",
      { storage },
    );
    writeHomeWidgetSelectedReleaseId(
      "user-b",
      "00000000-0000-4000-8000-000000000002",
      { storage },
    );
    assert.equal(
      readHomeWidgetSelectedReleaseId("user-a", storage),
      "00000000-0000-4000-8000-000000000001",
    );
    assert.equal(
      readHomeWidgetSelectedReleaseId("user-b", storage),
      "00000000-0000-4000-8000-000000000002",
    );
  });

  it("treats invalid JSON as no selection and clears the key", () => {
    const storage = memoryStorage({
      [homeWidgetSelectionStorageKey("user-a")]: "{not-json",
    });
    assert.equal(readHomeWidgetSelectedReleaseId("user-a", storage), null);
    assert.equal(storage.getItem(homeWidgetSelectionStorageKey("user-a")), null);
  });

  it("rejects missing user id and malformed records", () => {
    const storage = memoryStorage();
    assert.equal(readHomeWidgetSelectedReleaseId(null, storage), null);
    assert.equal(
      writeHomeWidgetSelectedReleaseId("", "00000000-0000-4000-8000-000000000001", {
        storage,
      }),
      null,
    );
    assert.equal(parseHomeWidgetSelectionRecord({ schemaVersion: 99 }), null);
  });

  it("clear removes only the intended user’s key", () => {
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(
      "user-a",
      "00000000-0000-4000-8000-000000000001",
      { storage },
    );
    writeHomeWidgetSelectedReleaseId(
      "user-b",
      "00000000-0000-4000-8000-000000000002",
      { storage },
    );
    clearHomeWidgetSelectedReleaseId("user-a", storage);
    assert.equal(readHomeWidgetSelectedReleaseId("user-a", storage), null);
    assert.equal(
      readHomeWidgetSelectedReleaseId("user-b", storage),
      "00000000-0000-4000-8000-000000000002",
    );
  });
});

describe("home widget selection eligibility UI", () => {
  const dated = {
    id: "00000000-0000-4000-8000-000000000001",
    releaseDate: "2026-08-10T00:00:00.000Z",
    isPublic: true,
    viewerSavedRelease: true,
  };

  it("shows Add to Countdown for saved dated releases when enabled", () => {
    assert.deepEqual(
      resolveHomeWidgetSelectionActionVisibility({
        enabled: true,
        authenticated: true,
        release: dated,
      }),
      { show: true, canSelect: true },
    );
  });

  it("hides for unsaved, suspended, private, and flag-off", () => {
    assert.equal(
      resolveHomeWidgetSelectionActionVisibility({
        enabled: false,
        authenticated: true,
        release: dated,
      }).show,
      false,
    );
    assert.equal(
      resolveHomeWidgetSelectionActionVisibility({
        enabled: true,
        authenticated: true,
        release: { ...dated, viewerSavedRelease: false },
      }).reason,
      "unsaved",
    );
    assert.equal(
      resolveHomeWidgetSelectionActionVisibility({
        enabled: true,
        authenticated: true,
        release: { ...dated, subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z" },
      }).reason,
      "suspended",
    );
    assert.equal(
      resolveHomeWidgetSelectionActionVisibility({
        enabled: true,
        authenticated: true,
        release: { ...dated, isPublic: false },
      }).reason,
      "private",
    );
  });

  it("blocks undated Coming Soon with restrained copy", () => {
    const result = resolveHomeWidgetSelectionActionVisibility({
      enabled: true,
      authenticated: true,
      release: {
        ...dated,
        releaseDate: null,
        isComingSoon: true,
      },
      assumeSaved: true,
    });
    assert.equal(result.show, false);
    assert.equal(result.reason, "undated");
    if (result.show === false && result.reason === "undated") {
      assert.equal(result.message, HOME_WIDGET_UNDATED_COPY);
    }
  });
});
