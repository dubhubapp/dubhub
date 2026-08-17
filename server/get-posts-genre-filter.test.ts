import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseSubgenreFilterQuery } from "@shared/home-feed-subgenre-filter";
import {
  normalizeGetPostsParentGenres,
  planGetPostsGenreWhere,
} from "./get-posts-genre-filter";

const here = dirname(fileURLToPath(import.meta.url));
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const plannerSrc = readFileSync(join(here, "get-posts-genre-filter.ts"), "utf8");

describe("planGetPostsGenreWhere", () => {
  it("no parents → no genre/subgenre restriction", () => {
    assert.deepEqual(planGetPostsGenreWhere([], undefined), { kind: "unrestricted" });
    assert.deepEqual(planGetPostsGenreWhere([], { dnb: ["jump_up"] }), {
      kind: "unrestricted",
    });
  });

  it("subgenres with no genres does not filter", () => {
    const parsed = parseSubgenreFilterQuery("dnb:jump_up", []);
    assert.deepEqual(parsed, {});
    assert.deepEqual(planGetPostsGenreWhere([], parsed), { kind: "unrestricted" });
    assert.deepEqual(
      planGetPostsGenreWhere(undefined, { dnb: ["jump_up"] }),
      { kind: "unrestricted" },
    );
  });

  it("DnB parent only → current broad parent predicate", () => {
    assert.deepEqual(planGetPostsGenreWhere(["dnb"], {}), {
      kind: "parent_in",
      parents: ["dnb"],
    });
    assert.deepEqual(planGetPostsGenreWhere(["dnb"], undefined), {
      kind: "parent_in",
      parents: ["dnb"],
    });
    assert.deepEqual(planGetPostsGenreWhere(["dnb"], { dnb: [] }), {
      kind: "parent_in",
      parents: ["dnb"],
    });
    assert.deepEqual(normalizeGetPostsParentGenres(["dnb", "all", ""]), ["dnb"]);
  });

  it("DnB parent only includes NULL children conceptually", () => {
    const plan = planGetPostsGenreWhere(["dnb"], {});
    assert.equal(plan.kind, "parent_in");
    if (plan.kind === "parent_in") {
      assert.deepEqual(plan.parents, ["dnb"]);
    }
    assert.doesNotMatch(JSON.stringify(plan), /subgenre/);
  });

  it("DnB + jump_up → parent AND child predicate", () => {
    assert.deepEqual(planGetPostsGenreWhere(["dnb"], { dnb: ["jump_up"] }), {
      kind: "parent_clauses",
      clauses: [{ parent: "dnb", subgenres: ["jump_up"] }],
    });
  });

  it("DnB + jump_up + neuro → child IN both", () => {
    assert.deepEqual(
      planGetPostsGenreWhere(["dnb"], { dnb: ["neuro", "jump_up"] }),
      {
        kind: "parent_clauses",
        clauses: [{ parent: "dnb", subgenres: ["jump_up", "neuro"] }],
      },
    );
  });

  it("DnB refined + House broad → correct OR clauses", () => {
    assert.deepEqual(
      planGetPostsGenreWhere(["dnb", "house"], { dnb: ["jump_up", "neuro"] }),
      {
        kind: "parent_clauses",
        clauses: [
          { parent: "dnb", subgenres: ["jump_up", "neuro"] },
          { parent: "house", subgenres: [] },
        ],
      },
    );
  });

  it("DnB refined + House refined → correct clauses", () => {
    assert.deepEqual(
      planGetPostsGenreWhere(["dnb", "house"], {
        dnb: ["jump_up"],
        house: ["bass_house"],
      }),
      {
        kind: "parent_clauses",
        clauses: [
          { parent: "dnb", subgenres: ["jump_up"] },
          { parent: "house", subgenres: ["bass_house"] },
        ],
      },
    );
  });

  it("wrong-parent child dropped", () => {
    assert.deepEqual(
      planGetPostsGenreWhere(["dnb"], { dnb: ["bass_house"] }),
      { kind: "parent_in", parents: ["dnb"] },
    );
  });

  it("unknown child dropped", () => {
    assert.deepEqual(
      planGetPostsGenreWhere(["dnb"], { dnb: ["not_a_real_subgenre"] }),
      { kind: "parent_in", parents: ["dnb"] },
    );
  });

  it("orphan child ignored", () => {
    assert.deepEqual(
      planGetPostsGenreWhere(["house"], { dnb: ["jump_up"], house: [] }),
      { kind: "parent_in", parents: ["house"] },
    );
  });

  it("malformed subgenres query does not throw", () => {
    assert.doesNotThrow(() => {
      parseSubgenreFilterQuery("jump_up,dnb:,:jump_up,dnb:Jump Up", ["dnb"]);
    });
    const parsed = parseSubgenreFilterQuery(
      "jump_up,dnb:,:jump_up,unknown:thing,house:jump_up,dnb:Jump Up",
      ["dnb", "house"],
    );
    assert.deepEqual(planGetPostsGenreWhere(["dnb", "house"], parsed), {
      kind: "parent_in",
      parents: ["dnb", "house"],
    });
  });

  it("Bassline + 4x4 accepted", () => {
    assert.deepEqual(planGetPostsGenreWhere(["bassline"], { bassline: ["4x4"] }), {
      kind: "parent_clauses",
      clauses: [{ parent: "bassline", subgenres: ["4x4"] }],
    });
  });

  it("House + future_house accepted", () => {
    assert.deepEqual(
      planGetPostsGenreWhere(["house"], { house: ["future_house"] }),
      {
        kind: "parent_clauses",
        clauses: [{ parent: "house", subgenres: ["future_house"] }],
      },
    );
  });
});

describe("getPosts genre WHERE wiring", () => {
  it("existing identification predicate remains independent", () => {
    assert.match(storageSrc, /AND \$\{genreWhere\}/);
    assert.match(storageSrc, /AND \$\{identificationWhere\}/);
    const whereBlock = storageSrc.match(
      /WHERE COALESCE\(p\.verification_status[\s\S]*?\$\{orderBy\}/,
    )?.[0];
    assert.ok(whereBlock);
    assert.match(whereBlock, /\$\{genreWhere\}/);
    assert.match(whereBlock, /\$\{identificationWhere\}/);
    assert.match(whereBlock, /\$\{trendingWindowWhere\}/);
    assert.match(whereBlock, /\$\{cursorWhere\}/);
  });

  it("ranking / ORDER BY source remains unchanged", () => {
    assert.match(
      storageSrc,
      /sortMode === "newest"\s*\n\s*\? sql`ORDER BY p\.created_at DESC, p\.id DESC`/,
    );
    assert.match(
      storageSrc,
      /sortMode === "trending"\s*\n\s*\? sql`ORDER BY \$\{trendScoreExpr\} DESC, p\.created_at DESC, p\.id DESC`/,
    );
    assert.match(
      storageSrc,
      /sql`ORDER BY likes_count DESC, p\.created_at DESC, p\.id DESC`/,
    );
  });

  it("cursor/LIMIT occur after WHERE rather than client post-filtering", () => {
    const getPostsFn = storageSrc.match(
      /async getPosts\([\s\S]*?^  async getPost\(/m,
    )?.[0];
    assert.ok(getPostsFn);
    const query = getPostsFn.match(
      /const result = await db\.execute\(sql`[\s\S]*?LIMIT \$\{pageLimit \+ 1\}/,
    )?.[0];
    assert.ok(query);
    const genreAt = query.indexOf("${genreWhere}");
    const orderAt = query.indexOf("${orderBy}");
    const limitAt = query.indexOf("LIMIT ${pageLimit + 1}");
    assert.ok(genreAt >= 0 && orderAt > genreAt && limitAt > orderAt);
    assert.doesNotMatch(getPostsFn, /mappedItems\.filter\(/);
    assert.doesNotMatch(getPostsFn, /pageRows\.filter\([^)]*genre/);
    assert.doesNotMatch(getPostsFn, /pageRows\.filter\([^)]*subgenre/);
  });

  it("parent-only SQL path keeps lower(p.genre) IN", () => {
    assert.match(storageSrc, /planGetPostsGenreWhere\(/);
    assert.match(storageSrc, /kind === "parent_in"/);
    assert.match(
      storageSrc,
      /sql`lower\(p\.genre\) IN \(\$\{sql\.join\(genrePlan\.parents\.map\(\(g\) => sql`\$\{g\}`\), sql`, `\)\}\)`/,
    );
  });

  it("refined SQL path uses parent equality and p.subgenre IN", () => {
    assert.match(storageSrc, /kind === "parent_clauses"/);
    assert.match(storageSrc, /lower\(p\.genre\) = \$\{clause\.parent\}/);
    assert.match(storageSrc, /p\.subgenre IN \(/);
    assert.match(storageSrc, /sql` OR `/);
  });

  it("planner has no SQL and reuses shared sanitiser", () => {
    assert.match(plannerSrc, /sanitizeSelectedSubgenresByGenre/);
    assert.match(plannerSrc, /buildGenreFilterClauses/);
    assert.doesNotMatch(plannerSrc, /sql`/);
    assert.doesNotMatch(plannerSrc, /SELECT /);
  });
});

describe("GET /api/posts subgenres query parsing", () => {
  it("parses optional subgenres with the shared sanitiser", () => {
    assert.match(routesSrc, /parseSubgenreFilterQuery/);
    assert.match(routesSrc, /req\.query\.subgenres/);
    assert.match(routesSrc, /subgenres: selectedSubgenresByGenre/);
    assert.doesNotMatch(routesSrc, /POST_SUBGENRES_BY_PARENT/);
  });
});
