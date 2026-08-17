import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { serializeSubgenreFilterQuery } from "@shared/home-feed-subgenre-filter";

const here = dirname(fileURLToPath(import.meta.url));
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const genreFilterSrc = readFileSync(join(here, "../components/genre-filter.tsx"), "utf8");

describe("home subgenre filter wiring", () => {
  it("defaults child state from session bootstrap and sanitises on parent change", () => {
    assert.match(homeSrc, /selectedSubgenresByGenre/);
    assert.match(homeSrc, /feedSessionBootstrap\.selectedSubgenresByGenre/);
    assert.match(homeSrc, /applySelectedGenresToSubgenreState/);
    assert.match(homeSrc, /const handleGenresChange = useCallback/);
    assert.match(homeSrc, /onGenresChange=\{handleGenresChange\}/);
    assert.doesNotMatch(homeSrc, /onGenresChange=\{setSelectedGenres\}/);
  });

  it("serialises child refinements into GET /api/posts and omits empty subgenres", () => {
    assert.match(homeSrc, /serializeSubgenreFilterQuery\(selectedGenres, selectedSubgenresByGenre\)/);
    assert.match(homeSrc, /if \(subgenresKey\) \{\s*params\.append\("subgenres", subgenresKey\)/s);
    assert.equal(serializeSubgenreFilterQuery(["dnb"], {}), "");
    assert.equal(
      serializeSubgenreFilterQuery(["dnb"], { dnb: ["neuro", "jump_up"] }),
      "dnb:jump_up,dnb:neuro",
    );
  });

  it("query identity includes deterministic subgenresKey", () => {
    assert.match(
      homeSrc,
      /queryKey: \["\/api\/posts", \{ genresKey, subgenresKey, identification: identificationFilter, sortMode \}/,
    );
    const a = serializeSubgenreFilterQuery(["dnb"], { dnb: ["jump_up"] });
    const b = serializeSubgenreFilterQuery(["dnb"], { dnb: ["neuro"] });
    assert.notEqual(a, b);
  });

  it("uiPosts safety filter uses shared genre-filter matcher", () => {
    assert.match(homeSrc, /postMatchesGenreFilter\(post, selectedGenres, selectedSubgenresByGenre\)/);
    assert.doesNotMatch(
      homeSrc,
      /selectedGenres\.includes\(\(post\.genre \?\? ""\)\.toString\(\)\.trim\(\)\.toLowerCase\(\)\)/,
    );
  });

  it("feed chrome reset identity includes child-filter state", () => {
    assert.match(
      homeSrc,
      /const feedChromeKey = `\$\{sortMode\}\\0\$\{identificationFilter\}\\0\$\{genresKey\}\\0\$\{subgenresKey\}`/,
    );
    assert.match(homeSrc, /prevFeedChromeKeyRef\.current = feedChromeKey/);
    assert.match(homeSrc, /\[sortMode, identificationFilter, genresKey, subgenresKey\]/);
  });

  it("deep-link neutralisation clears children", () => {
    assert.match(
      homeSrc,
      /if \(selectedGenres\.length > 0\) setSelectedGenres\(\[\]\);\s*setSelectedSubgenresByGenre\(\{\}\);/s,
    );
  });

  it("Random path that clears genres also clears children", () => {
    assert.match(
      homeSrc,
      /setSelectedGenres\(\[\]\);\s*setSelectedSubgenresByGenre\(\{\}\);/s,
    );
    assert.match(homeSrc, /\[sortMode, genresKey, subgenresKey\]/);
  });

  it("pull-to-refresh does not clear children", () => {
    const pull = homeSrc.match(
      /const handleHomeFeedPullRefresh = useCallback\(async \(\) => \{[\s\S]*?\}, \[refetchPosts, toast\]\);/,
    )?.[0];
    assert.ok(pull);
    assert.match(pull, /refetchPosts\(\)/);
    assert.doesNotMatch(pull, /setSelectedGenres/);
    assert.doesNotMatch(pull, /setSelectedSubgenresByGenre/);
  });

  it("Discover receives child filter state from Home", () => {
    assert.match(homeSrc, /selectedSubgenresByGenre=\{selectedSubgenresByGenre\}/);
    assert.match(homeSrc, /onSubgenresChange=\{handleSubgenresChange\}/);
    assert.match(genreFilterSrc, /selectedSubgenresByGenre/);
    assert.match(genreFilterSrc, /onSubgenresChange/);
    assert.match(genreFilterSrc, /getDiscoverSubgenreGroups/);
  });
});
