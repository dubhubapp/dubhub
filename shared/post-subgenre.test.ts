import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANONICAL_GENRE_IDS, type CanonicalGenreId } from "./report-genre";
import {
  POST_SUBGENRES_BY_PARENT,
  getSubgenreLabel,
  getSubgenresForParent,
  isValidSubgenre,
} from "./post-subgenre";

const LOCKED_TAXONOMY: Record<CanonicalGenreId, { id: string; label: string }[]> = {
  dnb: [
    { id: "jump_up", label: "Jump Up" },
    { id: "liquid", label: "Liquid" },
    { id: "neuro", label: "Neuro" },
    { id: "dancefloor", label: "Dancefloor" },
    { id: "minimal", label: "Minimal" },
    { id: "rollers", label: "Rollers" },
    { id: "jungle", label: "Jungle" },
  ],
  ukg: [
    { id: "garage", label: "Garage" },
    { id: "2_step", label: "2-Step" },
    { id: "speed_garage", label: "Speed Garage" },
    { id: "uk_funky", label: "UK Funky" },
  ],
  bassline: [
    { id: "uk_bass", label: "UK Bass" },
    { id: "4x4", label: "4x4" },
  ],
  dubstep: [
    { id: "140", label: "140" },
    { id: "deep_dubstep", label: "Deep Dubstep" },
    { id: "riddim", label: "Riddim" },
    { id: "brostep", label: "Brostep" },
    { id: "colour_bass", label: "Colour Bass" },
  ],
  house: [
    { id: "tech_house", label: "Tech House" },
    { id: "deep_house", label: "Deep House" },
    { id: "future_house", label: "Future House" },
    { id: "bass_house", label: "Bass House" },
    { id: "progressive_house", label: "Progressive House" },
    { id: "electro_house", label: "Electro House" },
    { id: "jackin_house", label: "Jackin' House" },
    { id: "disco_house", label: "Disco House" },
    { id: "hard_house", label: "Hard House" },
  ],
  techno: [
    { id: "hard_techno", label: "Hard Techno" },
    { id: "minimal_techno", label: "Minimal Techno" },
    { id: "industrial_techno", label: "Industrial Techno" },
    { id: "acid_techno", label: "Acid Techno" },
    { id: "melodic_techno", label: "Melodic Techno" },
  ],
  trance: [
    { id: "psytrance", label: "Psytrance" },
    { id: "progressive_trance", label: "Progressive Trance" },
    { id: "uplifting_trance", label: "Uplifting Trance" },
    { id: "tech_trance", label: "Tech Trance" },
    { id: "hard_trance", label: "Hard Trance" },
  ],
  other: [
    { id: "donk", label: "Donk" },
    { id: "hardstyle", label: "Hardstyle" },
    { id: "uptempo", label: "Uptempo" },
  ],
};

function allEntries() {
  return CANONICAL_GENRE_IDS.flatMap((parentId) =>
    POST_SUBGENRES_BY_PARENT[parentId].map((entry) => ({ parentId, ...entry })),
  );
}

describe("post sub-genre taxonomy", () => {
  it("represents the exact locked taxonomy for every canonical parent", () => {
    assert.deepEqual(
      [...CANONICAL_GENRE_IDS].sort(),
      Object.keys(LOCKED_TAXONOMY).sort(),
    );
    for (const parentId of CANONICAL_GENRE_IDS) {
      assert.deepEqual(
        POST_SUBGENRES_BY_PARENT[parentId].map((e) => ({ id: e.id, label: e.label })),
        LOCKED_TAXONOMY[parentId],
      );
    }
  });

  it("gives each child ID exactly one parent and no duplicate IDs", () => {
    const ids = allEntries().map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("resolves DnB raw forms supported by existing normalisation to the DNB list", () => {
    const expected = LOCKED_TAXONOMY.dnb;
    for (const raw of ["dnb", "DnB", "DNB", " dnb "]) {
      assert.deepEqual(
        getSubgenresForParent(raw).map((e) => ({ id: e.id, label: e.label })),
        expected,
      );
    }
  });

  it("resolves UKG raw forms to the UKG list", () => {
    const expected = LOCKED_TAXONOMY.ukg;
    for (const raw of ["ukg", "UKG"]) {
      assert.deepEqual(
        getSubgenresForParent(raw).map((e) => ({ id: e.id, label: e.label })),
        expected,
      );
    }
  });

  it("Bassline includes exactly UK Bass and 4x4", () => {
    assert.deepEqual(
      getSubgenresForParent("Bassline").map((e) => ({ id: e.id, label: e.label })),
      [
        { id: "uk_bass", label: "UK Bass" },
        { id: "4x4", label: "4x4" },
      ],
    );
  });

  it("House includes Future House", () => {
    const house = getSubgenresForParent("house");
    assert.ok(house.some((e) => e.id === "future_house" && e.label === "Future House"));
  });
});

describe("isValidSubgenre", () => {
  it("accepts a valid parent/child pair", () => {
    assert.equal(isValidSubgenre("DnB", "jump_up"), true);
    assert.equal(isValidSubgenre("dnb", "jump_up"), true);
  });

  it("rejects a child under the wrong parent", () => {
    assert.equal(isValidSubgenre("House", "jump_up"), false);
    assert.equal(isValidSubgenre("house", "jump_up"), false);
  });

  it("rejects unknown children and does not accept labels as IDs", () => {
    assert.equal(isValidSubgenre("dnb", "not_a_real_subgenre"), false);
    assert.equal(isValidSubgenre("dnb", "Jump Up"), false);
    assert.equal(isValidSubgenre("ukg", "2-Step"), false);
  });

  it("returns false for unknown / empty parent or child", () => {
    assert.equal(isValidSubgenre("not-a-genre", "jump_up"), false);
    assert.equal(isValidSubgenre("Drum & Bass", "jump_up"), false);
    assert.equal(isValidSubgenre(null, "jump_up"), false);
    assert.equal(isValidSubgenre(undefined, "jump_up"), false);
    assert.equal(isValidSubgenre("", "jump_up"), false);
    assert.equal(isValidSubgenre("dnb", null), false);
    assert.equal(isValidSubgenre("dnb", undefined), false);
    assert.equal(isValidSubgenre("dnb", ""), false);
    assert.equal(isValidSubgenre("dnb", "   "), false);
  });
});

describe("getSubgenresForParent", () => {
  it("returns no children for unknown or empty parent", () => {
    assert.deepEqual(getSubgenresForParent("not-a-genre"), []);
    assert.deepEqual(getSubgenresForParent("Drum & Bass"), []);
    assert.deepEqual(getSubgenresForParent(null), []);
    assert.deepEqual(getSubgenresForParent(undefined), []);
    assert.deepEqual(getSubgenresForParent(""), []);
    assert.deepEqual(getSubgenresForParent("   "), []);
  });
});

describe("getSubgenreLabel", () => {
  it("returns human display values including hyphen and apostrophe labels", () => {
    assert.equal(getSubgenreLabel("2_step"), "2-Step");
    assert.equal(getSubgenreLabel("jackin_house"), "Jackin' House");
    assert.equal(getSubgenreLabel("future_house"), "Future House");
    assert.equal(getSubgenreLabel("jump_up"), "Jump Up");
    assert.equal(getSubgenreLabel("4x4"), "4x4");
  });

  it("returns null for unknown or empty IDs", () => {
    assert.equal(getSubgenreLabel("not_a_real_subgenre"), null);
    assert.equal(getSubgenreLabel("Jump Up"), null);
    assert.equal(getSubgenreLabel(null), null);
    assert.equal(getSubgenreLabel(undefined), null);
    assert.equal(getSubgenreLabel(""), null);
  });
});
