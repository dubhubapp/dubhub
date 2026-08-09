import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_ALERTS_DELIVERY_ENABLED_TOAST_BODY,
  RELEASE_ALERTS_DELIVERY_PENDING_TOAST_BODY,
  RELEASE_ALERTS_ON_TOAST_TITLE,
  releaseAlertsEnableToastCopy,
} from "./release-alerts-enable-toast";

describe("releaseAlertsEnableToastCopy", () => {
  it("deliveryEnabled true selects delivery copy", () => {
    assert.deepEqual(releaseAlertsEnableToastCopy(true), {
      title: RELEASE_ALERTS_ON_TOAST_TITLE,
      description: RELEASE_ALERTS_DELIVERY_ENABLED_TOAST_BODY,
    });
  });

  it("deliveryEnabled false selects waiting copy", () => {
    assert.deepEqual(releaseAlertsEnableToastCopy(false), {
      title: RELEASE_ALERTS_ON_TOAST_TITLE,
      description: RELEASE_ALERTS_DELIVERY_PENDING_TOAST_BODY,
    });
  });

  it("missing deliveryEnabled safely selects waiting copy", () => {
    assert.deepEqual(releaseAlertsEnableToastCopy(undefined), {
      title: RELEASE_ALERTS_ON_TOAST_TITLE,
      description: RELEASE_ALERTS_DELIVERY_PENDING_TOAST_BODY,
    });
  });
});
