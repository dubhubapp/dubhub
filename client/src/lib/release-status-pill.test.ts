import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_COMING_SOON_LABEL,
  RELEASE_COMING_SOON_PILL_CLASS,
  RELEASE_PAUSED_PILL_CLASS,
  RELEASE_RELEASED_PILL_CLASS,
  RELEASE_STATUS_PILL_BASE_CLASS,
  RELEASE_STATUS_PILL_LABEL_CLASS,
  RELEASE_STATUS_PILL_SIZE_CLASS,
  RELEASE_UPCOMING_LABEL,
  RELEASE_UPCOMING_PILL_CLASS,
  resolveReleaseStatusPillPresentation,
} from "./release-status-pill";
import { RELEASE_SUBSCRIPTION_PAUSED_LABEL } from "./release-subscription-paused";

const TURQUOISE_PATTERN = /accent|teal|cyan|secondary/;

describe("resolveReleaseStatusPillPresentation", () => {
  it("Paused and Coming Soon use distinct variants", () => {
    const paused = resolveReleaseStatusPillPresentation({ paused: true, isComingSoon: true });
    const comingSoon = resolveReleaseStatusPillPresentation({
      paused: false,
      isComingSoon: true,
    });
    assert.equal(paused.variant, "paused");
    assert.equal(paused.label, RELEASE_SUBSCRIPTION_PAUSED_LABEL);
    assert.equal(comingSoon.variant, "coming_soon");
    assert.equal(comingSoon.label, RELEASE_COMING_SOON_LABEL);
    assert.notEqual(paused.toneClass, comingSoon.toneClass);
  });

  it("Paused pill typography/dimensions match shared status-pill contract", () => {
    const paused = resolveReleaseStatusPillPresentation({ paused: true });
    assert.equal(paused.baseClass, RELEASE_STATUS_PILL_BASE_CLASS);
    assert.equal(paused.sizeClass, RELEASE_STATUS_PILL_SIZE_CLASS.default);
    assert.equal(paused.toneClass, RELEASE_PAUSED_PILL_CLASS);
    assert.match(paused.sizeClass, /text-xs/);
    assert.match(paused.sizeClass, /min-h-\[1\.375rem\]/);
  });

  it("paused overrides coming soon / released", () => {
    const pill = resolveReleaseStatusPillPresentation({
      paused: true,
      isComingSoon: false,
      upcoming: false,
    });
    assert.equal(pill.variant, "paused");
    assert.equal(pill.label, "Paused");
  });

  it("explicit Coming Soon stays Coming Soon", () => {
    const pill = resolveReleaseStatusPillPresentation({
      isComingSoon: true,
      releaseDate: null,
    });
    assert.equal(pill.variant, "coming_soon");
    assert.equal(pill.label, RELEASE_COMING_SOON_LABEL);
    assert.equal(pill.toneClass, RELEASE_COMING_SOON_PILL_CLASS);
  });

  it("dated future Midnight is Upcoming pill, not Coming Soon", () => {
    const pill = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "midnight",
    });
    assert.equal(pill.variant, "upcoming");
    assert.equal(pill.label, RELEASE_UPCOMING_LABEL);
    assert.equal(pill.label, "Upcoming");
    assert.equal(pill.toneClass, RELEASE_UPCOMING_PILL_CLASS);
    assert.equal(pill.baseClass, RELEASE_STATUS_PILL_BASE_CLASS);
    assert.doesNotMatch(pill.toneClass, TURQUOISE_PATTERN);
    assert.match(pill.toneClass, /indigo/);
  });

  it("dated future Exact is Upcoming pill, not Coming Soon", () => {
    const pill = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "exact",
      releaseAt: "2099-06-15T19:00:00.000Z",
      releaseTimezone: "Europe/London",
    });
    assert.equal(pill.variant, "upcoming");
    assert.equal(pill.label, RELEASE_UPCOMING_LABEL);
  });

  it("Released stays Released after the canonical boundary", () => {
    const pill = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2020-01-15",
      releaseTimingMode: "midnight",
    });
    assert.equal(pill.variant, "released");
    assert.equal(pill.label, "Released");
  });

  it("Exact vs Midnight does not change Upcoming vs Coming Soon naming", () => {
    const midnight = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "midnight",
    });
    const exact = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "exact",
      releaseAt: "2099-06-15T19:00:00.000Z",
    });
    assert.equal(midnight.label, exact.label);
    assert.equal(midnight.variant, "upcoming");
    assert.equal(exact.variant, "upcoming");
  });

  it("status remains pill presentation (not plain text)", () => {
    const upcoming = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "midnight",
    });
    assert.equal(upcoming.label, "Upcoming");
    assert.match(upcoming.baseClass, /inline-flex/);
    assert.match(upcoming.sizeClass, /min-h-/);
    assert.match(upcoming.sizeClass, /px-2|px-1\.5/);
    assert.match(upcoming.toneClass, /indigo/);
    assert.match(upcoming.toneClass, /ring-/);
    assert.doesNotMatch(upcoming.toneClass, TURQUOISE_PATTERN);
  });

  it("canonical tone system: muted fill + restrained ring + white label", () => {
    assert.equal(RELEASE_STATUS_PILL_LABEL_CLASS, "text-white");

    const tones = [
      RELEASE_UPCOMING_PILL_CLASS,
      RELEASE_COMING_SOON_PILL_CLASS,
      RELEASE_RELEASED_PILL_CLASS,
      RELEASE_PAUSED_PILL_CLASS,
    ];
    for (const tone of tones) {
      assert.match(tone, /text-white/);
      assert.match(tone, /ring-1/);
      assert.match(tone, /ring-inset/);
      assert.doesNotMatch(tone, /text-amber|text-green|text-indigo-|text-muted|dark:text-/);
    }

    assert.match(RELEASE_UPCOMING_PILL_CLASS, /indigo/);
    assert.doesNotMatch(RELEASE_UPCOMING_PILL_CLASS, TURQUOISE_PATTERN);
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /amber/);
    assert.match(RELEASE_RELEASED_PILL_CLASS, /green/);
    assert.match(RELEASE_PAUSED_PILL_CLASS, /slate/);

    const upcoming = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "midnight",
    });
    const comingSoon = resolveReleaseStatusPillPresentation({ isComingSoon: true });
    const paused = resolveReleaseStatusPillPresentation({ paused: true });
    const released = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2020-01-15",
      releaseTimingMode: "midnight",
    });
    assert.equal(upcoming.toneClass, RELEASE_UPCOMING_PILL_CLASS);
    assert.equal(comingSoon.toneClass, RELEASE_COMING_SOON_PILL_CLASS);
    assert.equal(paused.toneClass, RELEASE_PAUSED_PILL_CLASS);
    assert.equal(released.toneClass, RELEASE_RELEASED_PILL_CLASS);
  });
});
