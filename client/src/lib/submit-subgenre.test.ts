import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSubgenresForParent } from "@shared/post-subgenre";
import {
  SUBMIT_SUBGENRE_NONE_VALUE,
  serializeSubmitSubgenre,
} from "./submit-subgenre";

describe("serializeSubmitSubgenre", () => {
  it("no selection serialises to null", () => {
    assert.equal(serializeSubmitSubgenre(undefined), null);
    assert.equal(serializeSubmitSubgenre(null), null);
    assert.equal(serializeSubmitSubgenre(""), null);
    assert.equal(serializeSubmitSubgenre("   "), null);
    assert.equal(serializeSubmitSubgenre(SUBMIT_SUBGENRE_NONE_VALUE), null);
  });

  it("selected jump_up serialises as jump_up", () => {
    assert.equal(serializeSubmitSubgenre("jump_up"), "jump_up");
    assert.equal(serializeSubmitSubgenre(" future_house "), "future_house");
  });
});

describe("Submit parent values expose shared taxonomy children", () => {
  it("DnB exposes Jump Up as jump_up", () => {
    const dnb = getSubgenresForParent("DnB");
    assert.ok(dnb.some((e) => e.id === "jump_up" && e.label === "Jump Up"));
  });

  it("House exposes Future House as future_house", () => {
    const house = getSubgenresForParent("House");
    assert.ok(house.some((e) => e.id === "future_house" && e.label === "Future House"));
  });

  it("Bassline exposes UK Bass + 4x4 as stored IDs", () => {
    assert.deepEqual(
      getSubgenresForParent("Bassline").map((e) => ({ id: e.id, label: e.label })),
      [
        { id: "uk_bass", label: "UK Bass" },
        { id: "4x4", label: "4x4" },
      ],
    );
  });
});
