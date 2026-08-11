import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampReleaseTitleInput,
  isReleaseTitleWithinLimit,
  releaseTitleCharCountLabel,
  RELEASE_TITLE_MAX_LENGTH,
} from "./release-title-input";

describe("release title input helpers", () => {
  it("I. clamps to 100 characters and formats counter", () => {
    assert.equal(RELEASE_TITLE_MAX_LENGTH, 100);
    const long = "x".repeat(120);
    assert.equal(clampReleaseTitleInput(long).length, 100);
    assert.equal(releaseTitleCharCountLabel(16), "16 / 100");
    assert.equal(isReleaseTitleWithinLimit("ok"), true);
    assert.equal(isReleaseTitleWithinLimit("y".repeat(101)), false);
  });
});
