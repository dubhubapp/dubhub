import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { INPUT_LIMITS } from "@shared/input-limits";
import {
  INVALID_SUBGENRE_CODE,
  mapStoredSubgenre,
  parseCreatePostSubgenre,
} from "./post-subgenre";

const here = dirname(fileURLToPath(import.meta.url));
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");

describe("parseCreatePostSubgenre", () => {
  it("omitted child -> NULL/accepted", () => {
    assert.deepEqual(parseCreatePostSubgenre("DnB", undefined), {
      ok: true,
      subgenre: null,
    });
  });

  it("null -> NULL/accepted", () => {
    assert.deepEqual(parseCreatePostSubgenre("DnB", null), {
      ok: true,
      subgenre: null,
    });
  });

  it("whitespace -> NULL/accepted", () => {
    assert.deepEqual(parseCreatePostSubgenre("DnB", ""), {
      ok: true,
      subgenre: null,
    });
    assert.deepEqual(parseCreatePostSubgenre("DnB", "   "), {
      ok: true,
      subgenre: null,
    });
  });

  it("DnB + jump_up -> accepted", () => {
    assert.deepEqual(parseCreatePostSubgenre("DnB", "jump_up"), {
      ok: true,
      subgenre: "jump_up",
    });
    assert.deepEqual(parseCreatePostSubgenre("dnb", "jump_up"), {
      ok: true,
      subgenre: "jump_up",
    });
  });

  it("House + jump_up -> rejected", () => {
    const result = parseCreatePostSubgenre("House", "jump_up");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, INVALID_SUBGENRE_CODE);
      assert.equal(result.message, "Invalid subgenre");
    }
  });

  it('DnB + "Jump Up" label is rejected', () => {
    const result = parseCreatePostSubgenre("DnB", "Jump Up");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, INVALID_SUBGENRE_CODE);
  });

  it("unknown child -> rejected", () => {
    const result = parseCreatePostSubgenre("DnB", "not_a_real_subgenre");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, INVALID_SUBGENRE_CODE);
  });

  it("unknown parent + child -> rejected", () => {
    const result = parseCreatePostSubgenre("Unknown", "jump_up");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, INVALID_SUBGENRE_CODE);
  });

  it("valid 4x4 under Bassline -> accepted", () => {
    assert.deepEqual(parseCreatePostSubgenre("Bassline", "4x4"), {
      ok: true,
      subgenre: "4x4",
    });
  });

  it("valid future_house under House -> accepted", () => {
    assert.deepEqual(parseCreatePostSubgenre("House", "future_house"), {
      ok: true,
      subgenre: "future_house",
    });
  });

  it("rejects over-limit child strings", () => {
    const tooLong = "x".repeat(INPUT_LIMITS.postSubgenre + 1);
    const result = parseCreatePostSubgenre("DnB", tooLong);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, INVALID_SUBGENRE_CODE);
  });
});

describe("mapStoredSubgenre serialisation", () => {
  it("NULL rows serialise safely", () => {
    assert.equal(mapStoredSubgenre(null), null);
    assert.equal(mapStoredSubgenre(undefined), null);
    assert.equal(mapStoredSubgenre(""), null);
    assert.equal(mapStoredSubgenre("   "), null);
  });

  it("persisted child IDs pass through", () => {
    assert.equal(mapStoredSubgenre("jump_up"), "jump_up");
    assert.equal(mapStoredSubgenre("future_house"), "future_house");
    assert.equal(mapStoredSubgenre("4x4"), "4x4");
  });
});

describe("create/read/moderator SQL contracts", () => {
  it("createPost insert includes subgenre", () => {
    assert.match(
      storageSrc,
      /INSERT INTO posts \([^)]*genre,\s*subgenre,/s,
    );
  });

  it("getPost and feed/list selects include p.subgenre", () => {
    assert.match(storageSrc, /async getPosts\(\s*limit[\s\S]*?p\.subgenre,/);
    assert.match(storageSrc, /async getPost\(id: string[\s\S]*?p\.subgenre,/);
    assert.match(storageSrc, /async getUserPostsWithDetails\([\s\S]*?p\.subgenre,/);
    assert.match(storageSrc, /async getUserLikedPosts\([\s\S]*?p\.subgenre,/);
    assert.match(storageSrc, /async getPostsByArtist\([\s\S]*?p\.subgenre,/);
    assert.match(storageSrc, /async getEligiblePostsForArtist\([\s\S]*?p\.subgenre,/);
  });

  it("mapped post contracts include subgenre", () => {
    assert.match(storageSrc, /subgenre: mapStoredSubgenre\(row\.subgenre\)/);
  });

  it("moderator correct-genre always clears subgenre", () => {
    assert.match(
      routesSrc,
      /UPDATE posts SET genre = \$\{canonicalGenre\}, subgenre = NULL WHERE id = \$\{report\.reported_post_id\}/,
    );
  });

  it("parent-only genre filter keeps lower(p.genre) IN when no children are active", () => {
    assert.match(storageSrc, /planGetPostsGenreWhere\(/);
    assert.match(storageSrc, /kind === "parent_in"/);
    assert.match(storageSrc, /sql`lower\(p\.genre\) IN/);
  });
});
