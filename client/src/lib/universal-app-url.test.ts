import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveUniversalLinkDubhubRootRoute } from "./universal-app-url";

describe("resolveUniversalLinkDubhubRootRoute", () => {
  it("maps ?artist= to profile route with lowercase username", () => {
    assert.equal(
      resolveUniversalLinkDubhubRootRoute("https://dubhub.uk/?artist=DJ.Alpha"),
      "/profile/dj.alpha",
    );
  });

  it("still maps ?post= to home deep link", () => {
    assert.equal(
      resolveUniversalLinkDubhubRootRoute("https://dubhub.uk/?post=abc-123"),
      "/?post=abc-123",
    );
  });

  it("still maps ?release= to release detail", () => {
    assert.equal(
      resolveUniversalLinkDubhubRootRoute("https://dubhub.uk/?release=rel-42"),
      "/releases/rel-42",
    );
  });

  it("ignores non-root paths", () => {
    assert.equal(
      resolveUniversalLinkDubhubRootRoute("https://dubhub.uk/profile/someone"),
      null,
    );
  });

  it("returns null for homepage without share params", () => {
    assert.equal(resolveUniversalLinkDubhubRootRoute("https://dubhub.uk/"), null);
  });

  it("prefers release over artist when both present", () => {
    assert.equal(
      resolveUniversalLinkDubhubRootRoute("https://dubhub.uk/?release=r1&artist=artist1"),
      "/releases/r1",
    );
  });

  it("prefers release over post and artist when all present", () => {
    assert.equal(
      resolveUniversalLinkDubhubRootRoute("https://dubhub.uk/?post=p1&release=r1&artist=a1"),
      "/releases/r1",
    );
  });
});
