import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_COMING_SOON_LABEL,
  RELEASE_PAUSED_PILL_CLASS,
  RELEASE_STATUS_PILL_BASE_CLASS,
  RELEASE_STATUS_PILL_SIZE_CLASS,
  resolveReleaseStatusPillPresentation,
} from "./release-status-pill";
import { RELEASE_SUBSCRIPTION_PAUSED_LABEL } from "./release-subscription-paused";

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
});
