import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  playErrorNotification,
  playInteractionLight,
  playSuccessNotification,
  playWarningNotification,
} from "./haptic";

describe("haptic helpers", () => {
  it("light / success / warning / error helpers do not throw when unavailable", () => {
    assert.doesNotThrow(() => playInteractionLight());
    assert.doesNotThrow(() => playSuccessNotification());
    assert.doesNotThrow(() => playWarningNotification());
    assert.doesNotThrow(() => playErrorNotification());
  });
});
