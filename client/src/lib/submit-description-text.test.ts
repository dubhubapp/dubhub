import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDescriptionNewlines } from "./submit-description-text";

describe("normalizeDescriptionNewlines", () => {
  it("leaves ordinary paragraph text unchanged", () => {
    assert.equal(
      normalizeDescriptionNewlines("Great ID from last night"),
      "Great ID from last night",
    );
  });

  it("does not collapse ordinary multiple spaces while typing", () => {
    assert.equal(normalizeDescriptionNewlines("hello  world"), "hello  world");
  });

  it("turns a single newline into a space", () => {
    assert.equal(
      normalizeDescriptionNewlines("Great ID\nfrom last night"),
      "Great ID from last night",
    );
  });

  it("collapses CRLF and CR to a space", () => {
    assert.equal(normalizeDescriptionNewlines("hello\r\nworld"), "hello world");
    assert.equal(normalizeDescriptionNewlines("hello\rworld"), "hello world");
  });

  it("collapses repeated line breaks to one space", () => {
    assert.equal(normalizeDescriptionNewlines("hello\n\n\n\nworld"), "hello world");
    assert.equal(
      normalizeDescriptionNewlines("word\n\n\n\n\n\n\n\n\nanother word"),
      "word another word",
    );
  });

  it("does not leave newline characters in the result", () => {
    const out = normalizeDescriptionNewlines("a\r\n\nb\nc");
    assert.equal(out.includes("\n"), false);
    assert.equal(out.includes("\r"), false);
    assert.equal(out, "a b c");
  });
});
