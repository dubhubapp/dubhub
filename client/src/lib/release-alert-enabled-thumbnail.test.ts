import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getReleaseAlertEnabledThumbnailPresentation } from "./release-alert-enabled-thumbnail";

describe("getReleaseAlertEnabledThumbnailPresentation", () => {
  it("uses actor avatar with circular shape and no bell overlay", () => {
    const presentation = getReleaseAlertEnabledThumbnailPresentation();
    assert.equal(presentation.useActorAvatar, true);
    assert.equal(presentation.shape, "circle");
    assert.equal(presentation.showBellOverlay, false);
    assert.match(presentation.listContainerClassName, /rounded-full/);
    assert.match(presentation.listImageClassName, /rounded-full/);
    assert.match(presentation.listImageClassName, /avatar-media/);
    assert.match(presentation.bannerFrameClassName, /rounded-full/);
  });

  it("does not reserve absolute-position overlay space", () => {
    const presentation = getReleaseAlertEnabledThumbnailPresentation();
    assert.doesNotMatch(presentation.listContainerClassName, /absolute/);
    assert.doesNotMatch(presentation.listImageClassName, /absolute/);
    assert.doesNotMatch(presentation.bannerFrameClassName, /absolute/);
  });

  it("person frame is circular, not square media rounded-lg", () => {
    const presentation = getReleaseAlertEnabledThumbnailPresentation();
    assert.doesNotMatch(presentation.listContainerClassName, /rounded-lg/);
    assert.doesNotMatch(presentation.bannerFrameClassName, /rounded-lg/);
    // Contrast: post/release list tiles use `rounded` (not rounded-full).
    assert.doesNotMatch(presentation.listContainerClassName, /(?:^|\s)rounded(?:\s|$)/);
  });
});
