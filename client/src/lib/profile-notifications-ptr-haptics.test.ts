import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playNotificationsPtrRefreshCommitHaptic } from "./profile-notifications-ptr-haptics";

describe("profile-notifications-ptr-haptics", () => {
  it("commit haptic is best-effort and does not throw when unavailable", () => {
    assert.doesNotThrow(() => playNotificationsPtrRefreshCommitHaptic());
  });
});
