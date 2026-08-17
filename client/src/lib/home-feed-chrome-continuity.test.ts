import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { postMatchesGenreFilter } from "@shared/home-feed-subgenre-filter";
import {
  shouldPreserveHomeFeedActivePostOnChromeChange,
  shouldReconcilePreservedHomeFeedActivePost,
} from "./home-feed-chrome-continuity";

const here = dirname(fileURLToPath(import.meta.url));
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const continuitySrc = readFileSync(join(here, "./home-feed-chrome-continuity.ts"), "utf8");

describe("home feed chrome continuity — preserve vs reset", () => {
  it("at top + active A + placeholder first row A → preserve", () => {
    assert.equal(
      shouldPreserveHomeFeedActivePostOnChromeChange({
        activePostId: "A",
        firstEligiblePostId: "A",
        viewportAtTop: true,
      }),
      true,
    );
  });

  it("at top + active A + new placeholder does not contain A → reset/suppress", () => {
    assert.equal(
      shouldPreserveHomeFeedActivePostOnChromeChange({
        activePostId: "A",
        firstEligiblePostId: null,
        viewportAtTop: true,
      }),
      false,
    );
  });

  it("at top + active A + placeholder first row B → reset/suppress", () => {
    assert.equal(
      shouldPreserveHomeFeedActivePostOnChromeChange({
        activePostId: "A",
        firstEligiblePostId: "B",
        viewportAtTop: true,
      }),
      false,
    );
  });

  it("mid-feed + active A + placeholder first row A → restart-to-top (do not preserve)", () => {
    assert.equal(
      shouldPreserveHomeFeedActivePostOnChromeChange({
        activePostId: "A",
        firstEligiblePostId: "A",
        viewportAtTop: false,
      }),
      false,
    );
  });

  it("does not preserve merely because A still exists later in the list", () => {
    assert.equal(
      shouldPreserveHomeFeedActivePostOnChromeChange({
        activePostId: "A",
        firstEligiblePostId: "B",
        viewportAtTop: true,
      }),
      false,
    );
  });
});

describe("home feed chrome continuity — real-data reconciliation", () => {
  it("real result first row still A → keep preserved active A", () => {
    assert.equal(
      shouldReconcilePreservedHomeFeedActivePost({
        isPlaceholderData: false,
        activePostId: "A",
        firstEligiblePostId: "A",
      }),
      false,
    );
  });

  it("real result first row becomes B → reconciliation to B is required", () => {
    assert.equal(
      shouldReconcilePreservedHomeFeedActivePost({
        isPlaceholderData: false,
        activePostId: "A",
        firstEligiblePostId: "B",
      }),
      true,
    );
  });

  it("does not reconcile away from A while placeholder data is still showing", () => {
    assert.equal(
      shouldReconcilePreservedHomeFeedActivePost({
        isPlaceholderData: true,
        activePostId: "A",
        firstEligiblePostId: "B",
      }),
      false,
    );
  });
});

describe("home feed chrome continuity — subgenre safety via uiPosts matcher", () => {
  it("subgenre refinement retaining A is eligible for preservation", () => {
    const postA = { id: "A", genre: "DnB", subgenre: "jump_up" };
    const matches = postMatchesGenreFilter(postA, ["dnb"], { dnb: ["jump_up"] });
    assert.equal(matches, true);
    assert.equal(
      shouldPreserveHomeFeedActivePostOnChromeChange({
        activePostId: "A",
        firstEligiblePostId: matches ? postA.id : null,
        viewportAtTop: true,
      }),
      true,
    );
  });

  it("subgenre refinement excluding A is not preserved", () => {
    const postA = { id: "A", genre: "DnB", subgenre: null };
    const matches = postMatchesGenreFilter(postA, ["dnb"], { dnb: ["jump_up"] });
    assert.equal(matches, false);
    assert.equal(
      shouldPreserveHomeFeedActivePostOnChromeChange({
        activePostId: "A",
        firstEligiblePostId: matches ? postA.id : null,
        viewportAtTop: true,
      }),
      false,
    );
  });
});

describe("home feed chrome continuity — Home wiring contract", () => {
  it("same-first preservation does not prevent queryKey/request change", () => {
    assert.match(
      homeSrc,
      /queryKey: \["\/api\/posts", \{ genresKey, subgenresKey, identification: identificationFilter, sortMode \}/,
    );
    assert.match(homeSrc, /if \(selectedGenres\.length > 0\) \{\s*params\.append\("genres", selectedGenres\.join\(","\)\)/s);
    assert.match(homeSrc, /shouldPreserveHomeFeedActivePostOnChromeChange/);
  });

  it("skips chrome reset pending only for the preserve branch; suppression still exists", () => {
    assert.match(homeSrc, /const suppressPlaceholderFeedRows =/);
    assert.match(homeSrc, /feedChromeResetPending &&/);
    assert.match(homeSrc, /Boolean\(isPlaceholderData\)/);
    assert.match(homeSrc, /setFeedChromeResetPending\(true\)/);
    assert.match(homeSrc, /setActivePostId\(null\)/);
    assert.match(homeSrc, /feedChromeContinuityPendingRef/);
    assert.match(homeSrc, /shouldReconcilePreservedHomeFeedActivePost/);
  });

  it("uses existing first-post snap semantics for viewport-at-top", () => {
    assert.match(homeSrc, /isHomeFeedSnappedToFirstPost\(el\)/);
  });

  it("does not modify VideoCard source or playback files", () => {
    assert.doesNotMatch(continuitySrc, /video-card/);
    assert.doesNotMatch(continuitySrc, /mediaEpoch/);
    assert.match(videoCardSrc, /const videoDomKey = `\$\{post\.id\}-/);
    assert.match(homeSrc, /key=\{post\.id\}/);
    assert.doesNotMatch(homeSrc, /mediaEpoch=\{genresKey\}/);
    assert.doesNotMatch(homeSrc, /mediaEpoch=\{feedChromeKey\}/);
  });
});
