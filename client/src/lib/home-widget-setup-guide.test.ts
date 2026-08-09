import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_WIDGET_SETUP_GUIDE_COPY,
  hasAcknowledgedHomeWidgetSetupGuide,
  homeWidgetSetupGuideStorageKey,
  markHomeWidgetSetupGuideAcknowledged,
  shouldOfferHomeWidgetSetupGuide,
} from "./home-widget-setup-guide";

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

  it("acknowledgement suppresses replay for same user", () => {
    const storage = memoryStorage();
    markHomeWidgetSetupGuideAcknowledged("user-a", storage);
    assert.equal(hasAcknowledgedHomeWidgetSetupGuide("user-a", storage), true);
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

  it("keeps User A and User B acknowledgements independent", () => {
    const storage = memoryStorage();
    markHomeWidgetSetupGuideAcknowledged("user-a", storage);
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
});
