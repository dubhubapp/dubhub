import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSignupEmail } from "./signup-email";

describe("normalizeSignupEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeSignupEmail("  Alice@Example.COM "), "alice@example.com");
  });

  it("does not strip Gmail dots or plus aliases", () => {
    assert.equal(
      normalizeSignupEmail("a.b+tag@gmail.com"),
      "a.b+tag@gmail.com",
    );
  });

  it("rejects non-emails", () => {
    assert.equal(normalizeSignupEmail(""), null);
    assert.equal(normalizeSignupEmail("   "), null);
    assert.equal(normalizeSignupEmail("no-at-sign"), null);
    assert.equal(normalizeSignupEmail(null), null);
    assert.equal(normalizeSignupEmail(12), null);
  });
});
