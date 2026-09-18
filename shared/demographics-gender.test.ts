import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDemographicsGender,
  DEMOGRAPHICS_GENDER_VALUES,
} from "./demographics-gender";

describe("parseDemographicsGender", () => {
  it("accepts canonical values", () => {
    for (const value of DEMOGRAPHICS_GENDER_VALUES) {
      assert.equal(parseDemographicsGender(value), value);
    }
  });

  it("normalizes case/trim", () => {
    assert.equal(parseDemographicsGender(" Male "), "male");
    assert.equal(parseDemographicsGender("PREFER_NOT_TO_SAY"), "prefer_not_to_say");
  });

  it("rejects unknown", () => {
    assert.equal(parseDemographicsGender("nonbinary"), null);
    assert.equal(parseDemographicsGender(""), null);
    assert.equal(parseDemographicsGender(null), null);
  });
});
