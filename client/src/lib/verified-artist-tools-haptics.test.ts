import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hapticKindForCommercePhase,
  shouldTriggerPackageSelectionHaptic,
  triggerCommercePhaseHapticOnce,
} from "./verified-artist-tools-haptics";

describe("verified-artist-tools-haptics", () => {
  it("maps commerce phases to approved haptic kinds", () => {
    assert.equal(hapticKindForCommercePhase("success"), "success");
    assert.equal(hapticKindForCommercePhase("restore_success"), "success");
    assert.equal(hapticKindForCommercePhase("pending"), "warning");
    assert.equal(hapticKindForCommercePhase("verification_pending"), "warning");
    assert.equal(hapticKindForCommercePhase("store_error"), "error");
    assert.equal(hapticKindForCommercePhase("identity_error"), "error");
  });

  it("stays silent for processing, cancel, nothing-to-restore, and active", () => {
    assert.equal(hapticKindForCommercePhase("purchasing"), null);
    assert.equal(hapticKindForCommercePhase("verifying"), null);
    assert.equal(hapticKindForCommercePhase("restoring"), null);
    assert.equal(hapticKindForCommercePhase("ready"), null);
    assert.equal(hapticKindForCommercePhase("restore_nothing"), null);
    assert.equal(hapticKindForCommercePhase("active"), null);
    assert.equal(hapticKindForCommercePhase("offerings_loading"), null);
  });

  it("package selection fires only on genuine Monthly ↔ Annual change", () => {
    assert.equal(shouldTriggerPackageSelectionHaptic(null, "monthly"), false);
    assert.equal(shouldTriggerPackageSelectionHaptic(null, "annual"), false);
    assert.equal(shouldTriggerPackageSelectionHaptic("monthly", "monthly"), false);
    assert.equal(shouldTriggerPackageSelectionHaptic("annual", "annual"), false);
    assert.equal(shouldTriggerPackageSelectionHaptic("monthly", "annual"), true);
    assert.equal(shouldTriggerPackageSelectionHaptic("annual", "monthly"), true);
  });

  it("fires each phase haptic at most once per attempt set", () => {
    const fired = new Set<string>();
    const counts = { success: 0, warning: 0, error: 0 };
    const handlers = {
      success: () => {
        counts.success += 1;
      },
      warning: () => {
        counts.warning += 1;
      },
      error: () => {
        counts.error += 1;
      },
    };

    triggerCommercePhaseHapticOnce("verification_pending", fired, handlers);
    triggerCommercePhaseHapticOnce("verification_pending", fired, handlers);
    assert.equal(counts.warning, 1);

    triggerCommercePhaseHapticOnce("pending", fired, handlers);
    assert.equal(counts.warning, 2);

    triggerCommercePhaseHapticOnce("success", fired, handlers);
    triggerCommercePhaseHapticOnce("success", fired, handlers);
    assert.equal(counts.success, 1);

    triggerCommercePhaseHapticOnce("store_error", fired, handlers);
    triggerCommercePhaseHapticOnce("store_error", fired, handlers);
    assert.equal(counts.error, 1);
  });

  it("retry returning to verification_pending does not repeat when memory kept", () => {
    const fired = new Set<string>();
    let warnings = 0;
    const handlers = {
      warning: () => {
        warnings += 1;
      },
    };
    triggerCommercePhaseHapticOnce("verification_pending", fired, handlers);
    // simulating retry: verifying is silent; landing again on verification_pending
    assert.equal(hapticKindForCommercePhase("verifying"), null);
    triggerCommercePhaseHapticOnce("verification_pending", fired, handlers);
    assert.equal(warnings, 1);
  });

  it("silent phases never mark or call handlers", () => {
    const fired = new Set<string>();
    let calls = 0;
    triggerCommercePhaseHapticOnce("purchasing", fired, {
      success: () => {
        calls += 1;
      },
      warning: () => {
        calls += 1;
      },
      error: () => {
        calls += 1;
      },
    });
    assert.equal(calls, 0);
    assert.equal(fired.size, 0);
  });
});
