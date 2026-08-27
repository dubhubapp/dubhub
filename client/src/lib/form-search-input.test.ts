import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KeyboardEvent } from "react";
import { preventImplicitFormSubmitOnEnter } from "./form-search-input";

type FakeTarget = {
  tagName: string;
  isContentEditable?: boolean;
};

function makeEvent(options: {
  key: string;
  keyCode?: number;
  isComposing?: boolean;
  nativeKeyCode?: number;
  target: FakeTarget;
}): KeyboardEvent & { defaultPrevented: boolean; blurred: boolean } {
  let defaultPrevented = false;
  let blurred = false;
  const target = {
    ...options.target,
    blur() {
      blurred = true;
    },
  };
  const event = {
    key: options.key,
    keyCode: options.keyCode ?? (options.key === "Enter" ? 13 : 0),
    nativeEvent: {
      isComposing: options.isComposing ?? false,
      keyCode: options.nativeKeyCode,
    },
    target,
    get defaultPrevented() {
      return defaultPrevented;
    },
    get blurred() {
      return blurred;
    },
    preventDefault() {
      defaultPrevented = true;
    },
  };
  return event as unknown as KeyboardEvent & { defaultPrevented: boolean; blurred: boolean };
}

describe("preventImplicitFormSubmitOnEnter", () => {
  it("prevents Enter and blurs a Title-like input", () => {
    const event = makeEvent({
      key: "Enter",
      target: { tagName: "INPUT" },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.blurred, true);
  });

  it("prevents Enter and blurs Location / Played by inputs", () => {
    for (const tagName of ["INPUT"] as const) {
      const event = makeEvent({ key: "Enter", target: { tagName } });
      preventImplicitFormSubmitOnEnter(event);
      assert.equal(event.defaultPrevented, true);
      assert.equal(event.blurred, true);
    }
  });

  it("does not prevent or blur non-Enter keys on an input", () => {
    const event = makeEvent({
      key: "Tab",
      keyCode: 9,
      target: { tagName: "INPUT" },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.blurred, false);
  });

  it("prevents Enter in a textarea so no newline is inserted, and blurs", () => {
    const event = makeEvent({
      key: "Enter",
      target: { tagName: "TEXTAREA" },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.blurred, true);
  });

  it("does not prevent or blur Enter in contenteditable", () => {
    const event = makeEvent({
      key: "Enter",
      target: { tagName: "DIV", isContentEditable: true },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.blurred, false);
  });

  it("does not prevent or blur during IME composition (isComposing)", () => {
    const event = makeEvent({
      key: "Enter",
      isComposing: true,
      target: { tagName: "INPUT" },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.blurred, false);
  });

  it("does not prevent or blur during IME composition (keyCode 229)", () => {
    const event = makeEvent({
      key: "Enter",
      keyCode: 229,
      target: { tagName: "INPUT" },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.blurred, false);
  });

  it("does not prevent or blur during IME composition (native keyCode 229)", () => {
    const event = makeEvent({
      key: "Enter",
      keyCode: 13,
      nativeKeyCode: 229,
      target: { tagName: "TEXTAREA" },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.blurred, false);
  });

  it("does not prevent Enter on a submit button", () => {
    const event = makeEvent({
      key: "Enter",
      target: { tagName: "BUTTON" },
    });
    preventImplicitFormSubmitOnEnter(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.blurred, false);
  });
});
