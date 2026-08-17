import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applySelectedGenresToSubgenreState,
  buildGenreFilterClauses,
  parseSubgenreFilterQuery,
  parseSubgenreFilterQueryLoose,
  postMatchesGenreFilter,
  sanitizeSelectedSubgenresByGenre,
  serializeSubgenreFilterQuery,
  toggleSelectedSubgenre,
} from "./home-feed-subgenre-filter";

const here = dirname(fileURLToPath(import.meta.url));
const filterSrc = readFileSync(join(here, "home-feed-subgenre-filter.ts"), "utf8");

describe("sanitizeSelectedSubgenresByGenre", () => {
  it("keeps valid children for selected parents and drops the rest", () => {
    const sanitized = sanitizeSelectedSubgenresByGenre(
      ["dnb", "house"],
      {
        dnb: ["jump_up", "jump_up", "Jump Up", "bass_house"],
        house: ["future_house"],
        ukg: ["garage"],
      },
    );
    assert.deepEqual(sanitized, {
      dnb: ["jump_up"],
      house: ["future_house"],
    });
  });

  it("drops duplicate children, wrong-parent children, unknown children, and labels", () => {
    const sanitized = sanitizeSelectedSubgenresByGenre(["dnb"], {
      dnb: ["jump_up", "jump_up", "neuro", "not_a_real_subgenre", "Jump Up", "bass_house"],
    });
    assert.deepEqual(sanitized, { dnb: ["jump_up", "neuro"] });
  });

  it("drops orphan children when the parent is not selected", () => {
    const sanitized = sanitizeSelectedSubgenresByGenre(["house"], {
      dnb: ["jump_up"],
      house: ["future_house"],
      ukg: ["garage"],
    });
    assert.deepEqual(sanitized, { house: ["future_house"] });
  });

  it("drops unknown parents and never auto-selects a missing parent", () => {
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre(["dnb"], {
        unknown: ["jump_up"],
        dnb: ["jump_up"],
      }),
      { dnb: ["jump_up"] },
    );
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre([], { dnb: ["jump_up"], house: ["future_house"] }),
      {},
    );
    assert.deepEqual(buildGenreFilterClauses([], { dnb: ["jump_up"] }), []);
  });

  it("handles null, undefined, and malformed state as broad / empty", () => {
    assert.deepEqual(sanitizeSelectedSubgenresByGenre(null, undefined), {});
    assert.deepEqual(sanitizeSelectedSubgenresByGenre(undefined, null), {});
    assert.deepEqual(sanitizeSelectedSubgenresByGenre("dnb", { dnb: ["jump_up"] }), {});
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre(["dnb"], ["jump_up"]),
      {},
    );
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre([null, 123, "dnb"], {
        dnb: [null, 12, "jump_up"],
      }),
      { dnb: ["jump_up"] },
    );
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre(["dnb", "house"], undefined),
      {},
    );
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre(["dnb"], { dnb: [] }),
      {},
    );
  });

  it("accepts Bassline 4x4, House future_house, and UKG garage", () => {
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre(["bassline"], { bassline: ["4x4"] }),
      { bassline: ["4x4"] },
    );
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre(["house"], { house: ["future_house"] }),
      { house: ["future_house"] },
    );
    assert.deepEqual(
      sanitizeSelectedSubgenresByGenre(["ukg"], { ukg: ["garage"] }),
      { ukg: ["garage"] },
    );
  });
});

describe("buildGenreFilterClauses", () => {
  it("parent only → broad clause", () => {
    assert.deepEqual(buildGenreFilterClauses(["dnb"], {}), [
      { parent: "dnb", subgenres: [] },
    ]);
    assert.deepEqual(buildGenreFilterClauses(["dnb"], undefined), [
      { parent: "dnb", subgenres: [] },
    ]);
    assert.deepEqual(buildGenreFilterClauses(["dnb"], { dnb: [] }), [
      { parent: "dnb", subgenres: [] },
    ]);
  });

  it("DnB + jump_up → refined clause", () => {
    assert.deepEqual(
      buildGenreFilterClauses(["dnb"], { dnb: ["jump_up"] }),
      [{ parent: "dnb", subgenres: ["jump_up"] }],
    );
  });

  it("DnB + jump_up + neuro retains both children", () => {
    assert.deepEqual(
      buildGenreFilterClauses(["dnb"], { dnb: ["neuro", "jump_up"] }),
      [{ parent: "dnb", subgenres: ["jump_up", "neuro"] }],
    );
  });

  it("DnB refined + House broad → mixed structure", () => {
    assert.deepEqual(
      buildGenreFilterClauses(["dnb", "house"], { dnb: ["jump_up", "neuro"] }),
      [
        { parent: "dnb", subgenres: ["jump_up", "neuro"] },
        { parent: "house", subgenres: [] },
      ],
    );
  });

  it("NULL/undefined/empty child state keeps selected parents broad", () => {
    assert.deepEqual(buildGenreFilterClauses(["dnb", "house"], null), [
      { parent: "dnb", subgenres: [] },
      { parent: "house", subgenres: [] },
    ]);
  });
});

describe("subgenre filter query serialisation", () => {
  it("serialises sanitized pairs deterministically", () => {
    const a = serializeSubgenreFilterQuery(["house", "dnb"], {
      house: ["bass_house"],
      dnb: ["neuro", "jump_up"],
    });
    const b = serializeSubgenreFilterQuery(["dnb", "house"], {
      dnb: ["jump_up", "neuro"],
      house: ["bass_house"],
    });
    assert.equal(a, "dnb:jump_up,dnb:neuro,house:bass_house");
    assert.equal(b, a);
  });

  it("omits empty parents, orphans, labels, and invalid children", () => {
    assert.equal(
      serializeSubgenreFilterQuery(["dnb", "house"], {
        dnb: ["jump_up", "Jump Up"],
        house: [],
        ukg: ["garage"],
      }),
      "dnb:jump_up",
    );
    assert.equal(serializeSubgenreFilterQuery(["dnb"], {}), "");
  });

  it("serialise then parse produces equivalent sanitized state", () => {
    const selected = ["dnb", "house"];
    const raw = {
      dnb: ["neuro", "jump_up", "jump_up"],
      house: ["bass_house"],
      ukg: ["garage"],
    };
    const sanitized = sanitizeSelectedSubgenresByGenre(selected, raw);
    const wire = serializeSubgenreFilterQuery(selected, raw);
    assert.deepEqual(parseSubgenreFilterQuery(wire, selected), sanitized);
  });
});

describe("subgenre filter query parsing", () => {
  it("parses parent:child pairs against selected parents", () => {
    assert.deepEqual(
      parseSubgenreFilterQuery(
        "dnb:jump_up,dnb:neuro,house:bass_house",
        ["dnb", "house"],
      ),
      {
        dnb: ["jump_up", "neuro"],
        house: ["bass_house"],
      },
    );
  });

  it("ignores malformed query segments without throwing", () => {
    const selected = ["dnb", "house"];
    const raw =
      "jump_up,dnb:,:jump_up,unknown:thing,house:jump_up,dnb:Jump Up,dnb:jump_up,dnb:foo:bar";
    assert.deepEqual(parseSubgenreFilterQuery(raw, selected), {
      dnb: ["jump_up"],
    });
    assert.deepEqual(parseSubgenreFilterQueryLoose("jump_up"), {});
    assert.deepEqual(parseSubgenreFilterQueryLoose("dnb:"), {});
    assert.deepEqual(parseSubgenreFilterQueryLoose(":jump_up"), {});
    assert.doesNotThrow(() => parseSubgenreFilterQuery(null, selected));
    assert.deepEqual(parseSubgenreFilterQuery(undefined, selected), {});
  });
});

describe("applySelectedGenresToSubgenreState", () => {
  it("parent deselect clears its children and preserves other parents' children", () => {
    const current = {
      dnb: ["jump_up"],
      house: ["bass_house"],
    };
    assert.deepEqual(applySelectedGenresToSubgenreState(["house"], current), {
      house: ["bass_house"],
    });
    assert.deepEqual(applySelectedGenresToSubgenreState(["dnb"], current), {
      dnb: ["jump_up"],
    });
  });

  it("All / empty parents clears all child state", () => {
    assert.deepEqual(
      applySelectedGenresToSubgenreState([], {
        dnb: ["jump_up"],
        house: ["bass_house"],
      }),
      {},
    );
  });
});

describe("postMatchesGenreFilter safety net", () => {
  it("parent-only includes NULL children and excludes other parents", () => {
    assert.equal(
      postMatchesGenreFilter({ genre: "DnB", subgenre: null }, ["dnb"], {}),
      true,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "dnb", subgenre: undefined }, ["dnb"], {}),
      true,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "House", subgenre: null }, ["dnb"], {}),
      false,
    );
  });

  it("refined parent keeps listed children and excludes others and NULL", () => {
    const children = { dnb: ["jump_up", "neuro"] };
    assert.equal(
      postMatchesGenreFilter({ genre: "DnB", subgenre: "jump_up" }, ["dnb"], children),
      true,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "DnB", subgenre: "neuro" }, ["dnb"], children),
      true,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "DnB", subgenre: "liquid" }, ["dnb"], children),
      false,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "DnB", subgenre: null }, ["dnb"], children),
      false,
    );
  });

  it("mixed refined + broad parents behave correctly", () => {
    const children = { dnb: ["jump_up"] };
    const selected = ["dnb", "house"];
    assert.equal(
      postMatchesGenreFilter({ genre: "DnB", subgenre: "jump_up" }, selected, children),
      true,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "DnB", subgenre: "neuro" }, selected, children),
      false,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "House", subgenre: null }, selected, children),
      true,
    );
    assert.equal(
      postMatchesGenreFilter({ genre: "House", subgenre: "bass_house" }, selected, children),
      true,
    );
  });
});

describe("toggleSelectedSubgenre", () => {
  it("adds a stable child ID under a selected parent", () => {
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], {}, "dnb", "jump_up"),
      { dnb: ["jump_up"] },
    );
  });

  it("removes a selected child ID", () => {
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], { dnb: ["jump_up", "neuro"] }, "dnb", "jump_up"),
      { dnb: ["neuro"] },
    );
  });

  it("removing the final child leaves the parent broad", () => {
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], { dnb: ["jump_up"] }, "dnb", "jump_up"),
      {},
    );
  });

  it("does not auto-select a parent from a child action", () => {
    assert.deepEqual(
      toggleSelectedSubgenre(["house"], {}, "dnb", "jump_up"),
      {},
    );
  });

  it("rejects labels and wrong-parent children", () => {
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], {}, "dnb", "Jump Up"),
      {},
    );
    assert.deepEqual(
      toggleSelectedSubgenre(["dnb"], { dnb: ["jump_up"] }, "dnb", "future_house"),
      { dnb: ["jump_up"] },
    );
  });
});

describe("taxonomy reuse", () => {
  it("reuses shared post-subgenre validation instead of duplicating lists", () => {
    assert.match(filterSrc, /from "\.\/post-subgenre"/);
    assert.match(filterSrc, /from "\.\/report-genre"/);
    assert.match(filterSrc, /isValidSubgenre/);
    assert.match(filterSrc, /normalizeCanonicalGenreId/);
    assert.doesNotMatch(filterSrc, /POST_SUBGENRES_BY_PARENT/);
    assert.doesNotMatch(filterSrc, /jump_up/);
    assert.doesNotMatch(filterSrc, /SELECT /);
    assert.doesNotMatch(filterSrc, /lower\(p\.genre\)/);
  });
});
