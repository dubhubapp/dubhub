import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasReleaseArtworkUrl } from "@/components/release-artwork-thumb";
import {
  buildReleaseFeedCardAccessibilityLabel,
  HOME_FEED_NEWEST_ICON_NAME,
  HOME_WIDGET_COUNTDOWN_A11Y,
  HOME_WIDGET_COUNTDOWN_ICON_NAME,
  isCountdownIconDistinctFromNewest,
  shouldShowSavedReleaseCountdownIndicator,
} from "@/lib/home-widget-countdown-icon";
import {
  HOME_WIDGET_SELECTION_COPY,
  HOME_WIDGET_UNDATED_COPY,
} from "@/lib/home-widget-selection-eligibility";

describe("release artwork canonical fallback contract", () => {
  it("treats null/empty artwork as fallback (Music note path)", () => {
    assert.equal(hasReleaseArtworkUrl(null), false);
    assert.equal(hasReleaseArtworkUrl(undefined), false);
    assert.equal(hasReleaseArtworkUrl(""), false);
    assert.equal(hasReleaseArtworkUrl("   "), false);
  });

  it("treats a non-empty URL as image candidate (onError → Music in UI)", () => {
    assert.equal(hasReleaseArtworkUrl("https://example.com/a.jpg"), true);
  });
});

describe("Release Countdown product copy", () => {
  it("uses Release Countdown product language, not Widget", () => {
    assert.equal(HOME_WIDGET_SELECTION_COPY.useInWidget, "Add to Countdown");
    assert.equal(HOME_WIDGET_SELECTION_COPY.selectedForWidget, "In your Countdown");
    assert.equal(HOME_WIDGET_SELECTION_COPY.removeFromWidget, "Remove from Countdown");
    assert.equal(
      HOME_WIDGET_SELECTION_COPY.successSelected,
      "Added to your Release Countdown.",
    );
    assert.equal(
      HOME_WIDGET_SELECTION_COPY.successRemoved,
      "Removed from your Release Countdown.",
    );
    assert.equal(
      HOME_WIDGET_SELECTION_COPY.artistFallbackSaved,
      "Saved as your fallback Countdown. Your next release is currently shown.",
    );
    assert.equal(HOME_WIDGET_SELECTION_COPY.toastTitle, "Release Countdown");
    assert.doesNotMatch(HOME_WIDGET_SELECTION_COPY.useInWidget, /widget/i);
    assert.doesNotMatch(HOME_WIDGET_SELECTION_COPY.selectedForWidget, /widget/i);
    assert.match(HOME_WIDGET_UNDATED_COPY, /Countdown/i);
  });
});

describe("Release Countdown icon semantics", () => {
  it("uses CalendarClock, distinct from Home Feed Newest Clock", () => {
    assert.equal(HOME_WIDGET_COUNTDOWN_ICON_NAME, "CalendarClock");
    assert.equal(HOME_FEED_NEWEST_ICON_NAME, "Clock");
    assert.equal(isCountdownIconDistinctFromNewest(), true);
  });
});

describe("Release Countdown accessibility copy", () => {
  it("exposes Detail add/selected/remove labels and card suffix", () => {
    assert.equal(
      HOME_WIDGET_COUNTDOWN_A11Y.addAction,
      "Add this release to your Release Countdown",
    );
    assert.equal(
      HOME_WIDGET_COUNTDOWN_A11Y.selectedAction,
      "This release is in your Release Countdown. Double tap for options.",
    );
    assert.equal(
      HOME_WIDGET_COUNTDOWN_A11Y.removeAction,
      "Remove from Release Countdown",
    );
    assert.equal(
      HOME_WIDGET_COUNTDOWN_A11Y.cardSelectedSuffix,
      "In your Release Countdown.",
    );
  });
});

describe("Saved Releases Countdown status-only indicator", () => {
  it("shows indicator only for the current user’s selected release when flag on", () => {
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: "rel-a",
        cardReleaseId: "rel-a",
      }),
      true,
    );
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: "rel-a",
        cardReleaseId: "rel-b",
      }),
      false,
    );
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: false,
        selectedReleaseId: "rel-a",
        cardReleaseId: "rel-a",
      }),
      false,
    );
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: null,
        cardReleaseId: "rel-a",
      }),
      false,
    );
  });

  it("appends Countdown to card accessibility label when selected", () => {
    const selected = buildReleaseFeedCardAccessibilityLabel({
      byline: "artist",
      title: "Track",
      countdownSelected: true,
    });
    assert.match(selected, /In your Release Countdown/);
    const unselected = buildReleaseFeedCardAccessibilityLabel({
      byline: "artist",
      title: "Track",
      countdownSelected: false,
    });
    assert.doesNotMatch(unselected, /Countdown/i);
  });
});
