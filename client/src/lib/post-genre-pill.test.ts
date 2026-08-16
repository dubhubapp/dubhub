import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getGenreChipStyle } from "@/lib/genre-styles";
import {
  genrePillMemoFieldsDiffer,
  getGenrePillAriaLabel,
  getGenrePillParentStyle,
  getGenrePillVisibleLabel,
  resolveTrustedSubgenreLabel,
  toggleGenrePillDisplay,
} from "./post-genre-pill";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

describe("genre pill trusted subgenre resolution", () => {
  it("null subgenre keeps parent-only non-interactive behaviour", () => {
    assert.equal(resolveTrustedSubgenreLabel("Dubstep", null), null);
    assert.equal(resolveTrustedSubgenreLabel("Dubstep", undefined), null);
    assert.equal(resolveTrustedSubgenreLabel("Dubstep", ""), null);
    assert.equal(
      getGenrePillVisibleLabel("Dubstep", null, "subgenre"),
      "Dubstep",
    );
  });

  it("unknown subgenre falls back safely", () => {
    assert.equal(resolveTrustedSubgenreLabel("Dubstep", "not_a_real_subgenre"), null);
    assert.equal(resolveTrustedSubgenreLabel("Dubstep", "Jump Up"), null);
    assert.equal(resolveTrustedSubgenreLabel("House", "brostep"), null);
  });

  it('Dubstep + brostep resolves visible child label "Brostep"', () => {
    assert.equal(resolveTrustedSubgenreLabel("Dubstep", "brostep"), "Brostep");
    assert.equal(resolveTrustedSubgenreLabel("dubstep", "brostep"), "Brostep");
  });

  it("style is still derived from parent Dubstep, not the child", () => {
    const parent = getGenrePillParentStyle("Dubstep");
    const dubstep = getGenreChipStyle("Dubstep");
    assert.equal(parent.bgColor, dubstep.bgColor);
    assert.equal(parent.label, "Dubstep");
    assert.notEqual(parent.label, "Brostep");
  });

  it("initial state is parent genre", () => {
    const child = resolveTrustedSubgenreLabel("Dubstep", "brostep");
    assert.equal(getGenrePillVisibleLabel("Dubstep", child, "parent"), "Dubstep");
  });

  it("toggle state changes parent → child then child → parent", () => {
    const child = resolveTrustedSubgenreLabel("Dubstep", "brostep");
    const afterFirst = toggleGenrePillDisplay("parent");
    assert.equal(afterFirst, "subgenre");
    assert.equal(getGenrePillVisibleLabel("Dubstep", child, afterFirst), "Brostep");
    const afterSecond = toggleGenrePillDisplay(afterFirst);
    assert.equal(afterSecond, "parent");
    assert.equal(getGenrePillVisibleLabel("Dubstep", child, afterSecond), "Dubstep");
  });

  it("does not display the stored ID directly", () => {
    const child = resolveTrustedSubgenreLabel("Dubstep", "brostep");
    assert.notEqual(child, "brostep");
    assert.equal(
      getGenrePillVisibleLabel("Dubstep", child, "subgenre"),
      "Brostep",
    );
    assert.notEqual(
      getGenrePillVisibleLabel("Dubstep", child, "subgenre"),
      "brostep",
    );
  });

  it("swap affordance does not change stored or display label resolution", () => {
    const child = resolveTrustedSubgenreLabel("Dubstep", "brostep");
    assert.equal(child, "Brostep");
    assert.equal(getGenrePillVisibleLabel("Dubstep", child, "parent"), "Dubstep");
    assert.equal(getGenrePillVisibleLabel("Dubstep", child, "subgenre"), "Brostep");
    assert.equal(getGenrePillVisibleLabel("Dubstep", null, "subgenre"), "Dubstep");
    assert.equal(
      getGenrePillVisibleLabel("Bassline", resolveTrustedSubgenreLabel("Bassline", "4x4"), "subgenre"),
      "4x4",
    );
  });
});

describe("genre pill memo fields", () => {
  it("responds to genre changes", () => {
    assert.equal(
      genrePillMemoFieldsDiffer(
        { genre: "Dubstep", subgenre: "brostep" },
        { genre: "House", subgenre: "brostep" },
      ),
      true,
    );
  });

  it("responds to subgenre changes", () => {
    assert.equal(
      genrePillMemoFieldsDiffer(
        { genre: "Dubstep", subgenre: null },
        { genre: "Dubstep", subgenre: "brostep" },
      ),
      true,
    );
    assert.equal(
      genrePillMemoFieldsDiffer(
        { genre: "Dubstep", subgenre: "brostep" },
        { genre: "Dubstep", subgenre: "riddim" },
      ),
      true,
    );
  });

  it("existing genre-only equality remains unchanged when fields match", () => {
    assert.equal(
      genrePillMemoFieldsDiffer(
        { genre: "Dubstep", subgenre: null },
        { genre: "Dubstep", subgenre: null },
      ),
      false,
    );
  });
});

describe("genre pill accessibility copy", () => {
  it("describes parent and child without exposing stored IDs", () => {
    const parent = getGenrePillAriaLabel("Dubstep", "Brostep", "parent");
    const child = getGenrePillAriaLabel("Dubstep", "Brostep", "subgenre");
    assert.match(parent, /Genre Dubstep/);
    assert.match(parent, /Sub-genre Brostep/);
    assert.doesNotMatch(parent, /brostep/);
    assert.match(child, /Showing sub-genre Brostep/);
    assert.match(child, /genre Dubstep/);
    assert.doesNotMatch(child, /brostep/);
  });
});

describe("video-card genre pill wiring", () => {
  it("keeps a non-interactive span when there is no trusted subgenre", () => {
    assert.match(videoCardSrc, /data-testid="post-genre-tag"/);
    assert.match(videoCardSrc, /trustedSubgenreLabel \? \(/);
    assert.match(videoCardSrc, /<span\s+data-testid="post-genre-tag"/);
    assert.match(videoCardSrc, /<button\s+type="button"/);
  });

  it("styles the pill from post.genre and stops playback/parent handlers", () => {
    assert.match(videoCardSrc, /getGenreChipStyle\(post\.genre\)/);
    assert.doesNotMatch(videoCardSrc, /getGenreChipStyle\(post\.subgenre\)/);
    assert.match(videoCardSrc, /e\.stopPropagation\(\)/);
    assert.match(videoCardSrc, /genrePillMemoFieldsDiffer\(prev\.post, next\.post\)/);
    assert.doesNotMatch(videoCardSrc, /Chevron/);
    assert.doesNotMatch(videoCardSrc, /aria-haspopup/);
  });

  it("shows a decorative swap affordance only on the trusted-subgenre button", () => {
    const buttonBlock = videoCardSrc.match(
      /trustedSubgenreLabel \? \([\s\S]*?<\/button>/,
    )?.[0] ?? "";
    const spanBlock = videoCardSrc.match(
      /<span\s+data-testid="post-genre-tag"[\s\S]*?<\/span>/,
    )?.[0] ?? "";
    assert.ok(buttonBlock.includes("ArrowLeftRight"), "swap icon in interactive pill");
    assert.match(buttonBlock, /\{genrePillVisibleLabel\}\s*<ArrowLeftRight/);
    assert.match(buttonBlock, /data-testid="post-genre-swap-affordance"/);
    assert.match(buttonBlock, /aria-hidden/);
    assert.match(buttonBlock, /pointer-events-none/);
    assert.doesNotMatch(buttonBlock, /tabIndex/);
    assert.doesNotMatch(spanBlock, /ArrowLeftRight/);
    assert.doesNotMatch(spanBlock, /post-genre-swap-affordance/);
  });
});
