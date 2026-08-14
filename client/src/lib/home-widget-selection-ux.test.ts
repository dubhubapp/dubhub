import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { hasReleaseArtworkUrl } from "@/components/release-artwork-thumb";
import {
  buildReleaseFeedCardAccessibilityLabel,
  HOME_FEED_NEWEST_ICON_NAME,
  HOME_WIDGET_COUNTDOWN_A11Y,
  HOME_WIDGET_COUNTDOWN_BUSY_COPY,
  HOME_WIDGET_COUNTDOWN_ICON_NAME,
  isCountdownIconDistinctFromNewest,
  resolveHomeWidgetSelectionButtonPresentation,
  shouldShowSavedReleaseCountdownIndicator,
} from "@/lib/home-widget-countdown-icon";
import {
  HOME_WIDGET_SELECTION_COPY,
  HOME_WIDGET_UNDATED_COPY,
} from "@/lib/home-widget-selection-eligibility";

const here = dirname(fileURLToPath(import.meta.url));
const selectionButtonSrc = readFileSync(
  join(here, "../components/home-widget-selection-button.tsx"),
  "utf8",
);
const selectionHookSrc = readFileSync(
  join(here, "../hooks/use-home-widget-selection.ts"),
  "utf8",
);
const selectionActionsSrc = readFileSync(
  join(here, "./home-widget-selection.ts"),
  "utf8",
);

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
  it("exposes Detail add/selected toggle labels and card suffix", () => {
    assert.equal(
      HOME_WIDGET_COUNTDOWN_A11Y.addAction,
      "Add this release to your Release Countdown",
    );
    assert.equal(
      HOME_WIDGET_COUNTDOWN_A11Y.selectedAction,
      "Remove this release from your Release Countdown",
    );
    assert.doesNotMatch(HOME_WIDGET_COUNTDOWN_A11Y.selectedAction, /Double tap for options/i);
    assert.doesNotMatch(HOME_WIDGET_COUNTDOWN_A11Y.selectedAction, /menu/i);
    assert.equal(
      HOME_WIDGET_COUNTDOWN_A11Y.cardSelectedSuffix,
      "In your Release Countdown.",
    );
  });
});

describe("Release Detail Countdown binary control", () => {
  it("unselected renders Add to Countdown with aria-pressed false", () => {
    const idle = resolveHomeWidgetSelectionButtonPresentation("idle");
    assert.equal(idle.label, "Add to Countdown");
    assert.equal(idle.ariaPressed, false);
    assert.equal(idle.action, "select");
    assert.equal(idle.ariaLabel, HOME_WIDGET_COUNTDOWN_A11Y.addAction);
    assert.equal(idle.iconToneClass, "text-muted-foreground");
    assert.equal(idle.labelToneClass, "text-muted-foreground");
    assert.equal(idle.testId, "button-home-widget-use");
  });

  it("selected renders In your Countdown with aria-pressed true", () => {
    const selected = resolveHomeWidgetSelectionButtonPresentation("selected");
    assert.equal(selected.label, "In your Countdown");
    assert.equal(selected.ariaPressed, true);
    assert.equal(selected.action, "clear");
    assert.equal(selected.ariaLabel, HOME_WIDGET_COUNTDOWN_A11Y.selectedAction);
    assert.equal(selected.iconToneClass, "text-foreground");
    assert.equal(selected.labelToneClass, "text-muted-foreground");
    assert.equal(selected.testId, "home-widget-selection-selected");
  });

  it("busy labels stay Adding… / Removing… and keep the pending action", () => {
    const selecting = resolveHomeWidgetSelectionButtonPresentation("selecting");
    assert.equal(selecting.label, HOME_WIDGET_COUNTDOWN_BUSY_COPY.adding);
    assert.equal(selecting.label, "Adding…");
    assert.equal(selecting.action, "select");
    assert.equal(selecting.ariaPressed, false);

    const clearing = resolveHomeWidgetSelectionButtonPresentation("clearing");
    assert.equal(clearing.label, HOME_WIDGET_COUNTDOWN_BUSY_COPY.removing);
    assert.equal(clearing.label, "Removing…");
    assert.equal(clearing.action, "clear");
    assert.equal(clearing.ariaPressed, true);
  });

  it("selected label is never accent/turquoise", () => {
    for (const state of ["idle", "selecting", "selected", "clearing"] as const) {
      const view = resolveHomeWidgetSelectionButtonPresentation(state);
      assert.equal(view.labelToneClass, "text-muted-foreground");
      assert.notEqual(view.labelToneClass, "text-accent");
      assert.notEqual(view.iconToneClass, "text-accent");
    }
  });

  it("ON icon is a slightly stronger neutral, not turquoise", () => {
    const selected = resolveHomeWidgetSelectionButtonPresentation("selected");
    const clearing = resolveHomeWidgetSelectionButtonPresentation("clearing");
    const idle = resolveHomeWidgetSelectionButtonPresentation("idle");
    assert.equal(selected.iconToneClass, "text-foreground");
    assert.equal(clearing.iconToneClass, "text-foreground");
    assert.equal(idle.iconToneClass, "text-muted-foreground");
    assert.notEqual(selected.iconToneClass, idle.iconToneClass);
  });

  it("does not keep a presentation-only selected boolean", () => {
    assert.doesNotMatch(selectionButtonSrc, /useState/);
    assert.doesNotMatch(selectionButtonSrc, /setIsSelected/);
    assert.match(selectionButtonSrc, /useHomeWidgetSelection/);
    assert.match(selectionHookSrc, /setSelectedReleaseId\(getCurrentHomeWidgetSelectedReleaseId\(userId\)\)/);
  });

  it("OFF tap is select and ON tap is clear — no dropdown chrome", () => {
    assert.match(selectionButtonSrc, /view\.action === "clear"\) void clear\(\)/);
    assert.match(selectionButtonSrc, /void select\(\)/);
    assert.match(selectionButtonSrc, /aria-pressed=\{view\.ariaPressed\}/);
    assert.match(selectionButtonSrc, /disabled=\{busy\}/);
    assert.match(selectionButtonSrc, /HomeWidgetCountdownIcon/);
    assert.doesNotMatch(selectionButtonSrc, /DropdownMenu/);
    assert.doesNotMatch(selectionButtonSrc, /ChevronDown/);
    assert.doesNotMatch(selectionButtonSrc, /aria-haspopup/);
    assert.doesNotMatch(selectionButtonSrc, /Remove from Countdown/);
    assert.doesNotMatch(selectionButtonSrc, /labels\.removeFromWidget/);
    assert.doesNotMatch(selectionButtonSrc, /text-accent/);
  });

  it("busy is guarded in the existing select/clear hook", () => {
    assert.match(selectionHookSrc, /if \(!userId \|\| !releaseId \|\| busy\) return/);
    assert.match(selectionHookSrc, /if \(!userId \|\| busy\) return/);
    assert.match(selectionHookSrc, /selectHomeWidgetRelease/);
    assert.match(selectionHookSrc, /clearHomeWidgetReleaseSelection/);
    assert.doesNotMatch(selectionHookSrc, /\/api\/releases\/.*\/save/);
  });

  it("clear does not unsave the release", () => {
    assert.doesNotMatch(selectionActionsSrc, /\/api\/releases\/.*\/save/);
    assert.doesNotMatch(selectionButtonSrc, /\/save/);
    assert.match(selectionActionsSrc, /clearHomeWidgetSelectedReleaseId/);
    assert.match(selectionActionsSrc, /refreshHomeWidgetPayload/);
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
