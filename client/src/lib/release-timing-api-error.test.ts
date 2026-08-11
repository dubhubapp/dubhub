import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "./apiDiagnostics";
import { releaseTimingApiErrorToast } from "./release-timing-api-error";
import {
  RELEASE_TIMING_LOCKED_CODE,
  RELEASE_TIMING_LOCKED_MESSAGE,
  RELEASE_TITLE_LOCKED_CODE,
  RELEASE_TITLE_LOCKED_MESSAGE,
} from "@shared/release-timing";

describe("releaseTimingApiErrorToast", () => {
  it("maps RELEASE_TIMING_LOCKED 409 for boundary race", () => {
    const error = new ApiRequestError({
      message: "Conflict",
      url: "/api/releases/x",
      method: "PATCH",
      status: 409,
      responseBody: JSON.stringify({
        code: RELEASE_TIMING_LOCKED_CODE,
        message: RELEASE_TIMING_LOCKED_MESSAGE,
      }),
    });
    const toast = releaseTimingApiErrorToast(error);
    assert.ok(toast);
    assert.equal(toast!.title, "Schedule locked");
    assert.match(toast!.description, /live|schedule/i);
  });

  it("maps RELEASE_TITLE_LOCKED 409 for post-live title race", () => {
    const error = new ApiRequestError({
      message: "Conflict",
      url: "/api/releases/x",
      method: "PATCH",
      status: 409,
      responseBody: JSON.stringify({
        code: RELEASE_TITLE_LOCKED_CODE,
        message: RELEASE_TITLE_LOCKED_MESSAGE,
      }),
    });
    const toast = releaseTimingApiErrorToast(error);
    assert.ok(toast);
    assert.equal(toast!.title, "Title locked");
    assert.match(toast!.description, /title|live/i);
  });

  it("does not map RELEASE_LOCKED detach 409 as timing lock", () => {
    const error = new ApiRequestError({
      message: "Conflict",
      url: "/api/releases/x/attach-posts",
      method: "DELETE",
      status: 409,
      responseBody: JSON.stringify({
        code: "RELEASE_LOCKED",
        message: "Posts cannot be removed after a release is live.",
      }),
    });
    assert.equal(releaseTimingApiErrorToast(error), null);
  });
});
