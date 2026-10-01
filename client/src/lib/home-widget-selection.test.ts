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
import { shouldOfferHomeWidgetSetupGuide } from "./home-widget-setup-guide";

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
  it("is on when the env var is missing", () => {
    assert.equal(isHomeReleaseWidgetSelectionEnabled({}), true);
    assert.equal(isHomeReleaseWidgetSelectionEnabled(null), true);
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: "",
      }),
      true,
    );
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: "   ",
      }),
      true,
    );
  });

  it("stays on for explicit true", () => {
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: "true",
      }),
      true,
    );
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: " TRUE ",
      }),
      true,
    );
  });

  it("turns off only for explicit false", () => {
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: "false",
      }),
      false,
    );
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: " FALSE ",
      }),
      false,
    );
    assert.equal(
      isHomeReleaseWidgetSelectionEnabled({
        HOME_RELEASE_WIDGET_SELECTION_ENABLED: "false",
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

  it("failed storage remove leaves the selected id", () => {
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(
      "user-a",
      "00000000-0000-4000-8000-000000000001",
      { storage },
    );
    clearHomeWidgetSelectedReleaseId("user-a", {
      removeItem: () => {
        throw new Error("quota");
      },
    });
    assert.equal(
      readHomeWidgetSelectedReleaseId("user-a", storage),
      "00000000-0000-4000-8000-000000000001",
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

  it("shows Add to Countdown for saved dated releases when the launch flag is on", () => {
    const enabled = isHomeReleaseWidgetSelectionEnabled({});
    assert.equal(enabled, true);
    assert.deepEqual(
      resolveHomeWidgetSelectionActionVisibility({
        enabled,
        authenticated: true,
        release: dated,
      }),
      { show: true, canSelect: true },
    );
    const storage = memoryStorage();
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: true,
        enabled,
        storage,
      }),
      true,
    );
  });

  it("hides the selector and setup guide when the kill switch is false", () => {
    const enabled = isHomeReleaseWidgetSelectionEnabled({
      VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED: "false",
    });
    const hidden = resolveHomeWidgetSelectionActionVisibility({
      enabled,
      authenticated: true,
      release: dated,
    });
    assert.equal(hidden.show, false);
    if (!hidden.show) assert.equal(hidden.reason, "flag_disabled");
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: true,
        enabled,
        storage: memoryStorage(),
      }),
      false,
    );
  });

  it("hides for signed-out, unsaved, suspended, private, and flag-off", () => {
    assert.equal(
      resolveHomeWidgetSelectionActionVisibility({
        enabled: true,
        authenticated: false,
        release: dated,
      }).reason,
      "unauthenticated",
    );
    assert.equal(
      resolveHomeWidgetSelectionActionVisibility({
        enabled: false,
        authenticated: true,
        release: dated,
      }).reason,
      "flag_disabled",
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
