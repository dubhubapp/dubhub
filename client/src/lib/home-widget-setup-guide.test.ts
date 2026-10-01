import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { homeWidgetSelectionStorageKey } from "./home-widget-selection-store";
import {
  HOME_WIDGET_SETUP_GUIDE_COPY,
  hasOptedOutOfHomeWidgetSetupGuide,
  homeWidgetSetupGuideDismissWritesMarker,
  homeWidgetSetupGuideStorageKey,
  markHomeWidgetSetupGuideOptedOut,
  resetHomeWidgetSetupGuideOptOut,
  shouldOfferHomeWidgetSetupGuide,
} from "./home-widget-setup-guide";

const here = dirname(fileURLToPath(import.meta.url));

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key() {
      return null;
    },
  } as Storage;
}

describe("home widget setup guide", () => {
  it("does not offer before a successful selection", () => {
    const storage = memoryStorage();
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: false,
        enabled: true,
        storage,
      }),
      false,
    );
  });

  it("offers after first successful selection when flag enabled", () => {
    const storage = memoryStorage();
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: true,
        enabled: true,
        storage,
      }),
      true,
    );
  });

  it("hides when feature flag is false", () => {
    const storage = memoryStorage();
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: true,
        enabled: false,
        storage,
      }),
      false,
    );
  });

  it("offers again after a temporary close and hides only after opt-out", () => {
    const storage = memoryStorage();
    assert.equal(homeWidgetSetupGuideDismissWritesMarker("temporary"), false);
    assert.equal(homeWidgetSetupGuideDismissWritesMarker("opt-out"), true);
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: true,
        enabled: true,
        storage,
      }),
      true,
    );
    markHomeWidgetSetupGuideOptedOut("user-a", storage);
    assert.equal(hasOptedOutOfHomeWidgetSetupGuide("user-a", storage), true);
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: true,
        enabled: true,
        storage,
      }),
      false,
    );
  });

  it("keeps User A and User B opt-outs independent", () => {
    const storage = memoryStorage();
    markHomeWidgetSetupGuideOptedOut("user-a", storage);
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-b",
        selectionSucceeded: true,
        enabled: true,
        storage,
      }),
      true,
    );
    assert.equal(
      homeWidgetSetupGuideStorageKey("user-a"),
      "dubhub:release-countdown-widget-guide:user-a",
    );
  });

  it("copy never claims the widget was auto-added", () => {
    const blob = [
      HOME_WIDGET_SETUP_GUIDE_COPY.title,
      HOME_WIDGET_SETUP_GUIDE_COPY.body,
      ...HOME_WIDGET_SETUP_GUIDE_COPY.steps,
      HOME_WIDGET_SETUP_GUIDE_COPY.primaryCta,
      HOME_WIDGET_SETUP_GUIDE_COPY.secondaryCta,
    ].join(" ");
    assert.doesNotMatch(blob, /widget added|now on your home screen|automatically/i);
  });

  it("reset clears only this user’s guide marker and offers the guide again", () => {
    const storage = memoryStorage({
      [homeWidgetSetupGuideStorageKey("user-a")]: "1",
      [homeWidgetSetupGuideStorageKey("user-b")]: "1",
      [homeWidgetSelectionStorageKey("user-a")]: JSON.stringify({
        schemaVersion: 1,
        selectedReleaseId: "rel-1",
        selectedAt: "2026-10-01T00:00:00.000Z",
      }),
    });
    assert.equal(resetHomeWidgetSetupGuideOptOut("user-a", storage), true);
    assert.equal(hasOptedOutOfHomeWidgetSetupGuide("user-a", storage), false);
    assert.equal(hasOptedOutOfHomeWidgetSetupGuide("user-b", storage), true);
    assert.equal(
      storage.getItem(homeWidgetSelectionStorageKey("user-a"))?.includes("rel-1"),
      true,
    );
    assert.equal(
      shouldOfferHomeWidgetSetupGuide({
        userId: "user-a",
        selectionSucceeded: true,
        enabled: true,
        storage,
      }),
      true,
    );
    assert.equal(resetHomeWidgetSetupGuideOptOut("", storage), false);
  });

  it("uses lowercase dub hub brand and countdown in steps", () => {
    assert.equal(
      HOME_WIDGET_SETUP_GUIDE_COPY.steps[1],
      "Add a widget and search for dub hub.",
    );
    assert.equal(
      HOME_WIDGET_SETUP_GUIDE_COPY.steps[2],
      "Choose your countdown size.",
    );
    const blob = HOME_WIDGET_SETUP_GUIDE_COPY.steps.join(" ");
    assert.doesNotMatch(blob, /Dub Hub/);
    assert.doesNotMatch(blob, /your Countdown/);
  });
});

describe("home widget setup guide dev reset surface", () => {
  const diagnosticsSrc = readFileSync(
    join(here, "../pages/settings-developer-diagnostics.tsx"),
    "utf8",
  );
  const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
  const hostSrc = readFileSync(
    join(here, "../components/home-widget-setup-guide-host.tsx"),
    "utf8",
  );
  const guideSrc = readFileSync(join(here, "./home-widget-setup-guide.ts"), "utf8");

  it("does not expose a diagnostics reset and keeps production opt-out", () => {
    assert.doesNotMatch(diagnosticsSrc, /Reset Release Countdown guide/);
    assert.doesNotMatch(diagnosticsSrc, /resetHomeWidgetSetupGuideOptOut/);
    assert.doesNotMatch(settingsSrc, /isCancellationFeedbackLocalQaBuild/);
    assert.match(diagnosticsSrc, /revenueCatIdentityDiagnosticsEnabled\(\)/);
    assert.match(settingsSrc, /revenueCatIdentityDiagnosticsEnabled\(\)/);
    assert.match(guideSrc, /storage\.removeItem\(homeWidgetSetupGuideStorageKey\(userId\)\)/);
    assert.doesNotMatch(guideSrc, /revenuecat-identity|isCancellationFeedbackLocalQaBuild/);
    assert.doesNotMatch(guideSrc, /clearHomeWidget|writeHomeWidgetPayload|reloadTimelines|selectedReleaseId/);
    assert.match(hostSrc, /dismissedRef\.current\.delete\(requestUserId\)/);
    assert.match(hostSrc, /markHomeWidgetSetupGuideOptedOut/);
  });

  it("writes the marker only for Don’t show again", () => {
    const hookSrc = readFileSync(
      join(here, "../hooks/use-home-widget-selection.ts"),
      "utf8",
    );
    assert.equal(HOME_WIDGET_SETUP_GUIDE_COPY.primaryCta, "Got it");
    assert.equal(HOME_WIDGET_SETUP_GUIDE_COPY.secondaryCta, "Don't show again");
    assert.match(hostSrc, /closeSheet\("temporary"\)/);
    assert.match(hostSrc, /closeSheet\("opt-out"\)/);
    assert.match(hostSrc, /if \(!next\) setOpen\(false\)/);
    assert.doesNotMatch(hostSrc, /Not now/);
    const selectStart = hookSrc.indexOf("const select = useCallback");
    const clearStart = hookSrc.indexOf("const clear = useCallback");
    assert.ok(selectStart > 0 && clearStart > selectStart);
    assert.match(
      hookSrc.slice(selectStart, clearStart),
      /maybeRequestHomeWidgetSetupGuide/,
    );
    assert.doesNotMatch(hookSrc.slice(clearStart), /maybeRequestHomeWidgetSetupGuide/);
  });
});
