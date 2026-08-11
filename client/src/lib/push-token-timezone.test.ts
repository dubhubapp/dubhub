import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPushTokenRegisterBody,
  shouldReportPushTimezone,
} from "./push-token-timezone";

describe("push token timezone reporting", () => {
  it("omits timezone for legacy clients", () => {
    const body = buildPushTokenRegisterBody({
      token: "abc",
      environment: "sandbox",
    });
    assert.equal("timezone" in body, false);
  });

  it("includes valid IANA when provided", () => {
    const body = buildPushTokenRegisterBody({
      token: "abc",
      environment: "sandbox",
      timezone: "Europe/London",
    });
    assert.equal(body.timezone, "Europe/London");
  });

  it("foreground unchanged timezone → no update", () => {
    assert.equal(
      shouldReportPushTimezone({
        lastReported: "Europe/London",
        current: "Europe/London",
      }),
      false,
    );
  });

  it("foreground changed timezone → update", () => {
    assert.equal(
      shouldReportPushTimezone({
        lastReported: "Europe/London",
        current: "America/New_York",
      }),
      true,
    );
  });

  it("first report with known timezone → update", () => {
    assert.equal(
      shouldReportPushTimezone({
        lastReported: null,
        current: "Europe/Amsterdam",
      }),
      true,
    );
  });

  it("null current → no update", () => {
    assert.equal(
      shouldReportPushTimezone({
        lastReported: "Europe/London",
        current: null,
      }),
      false,
    );
  });
});
