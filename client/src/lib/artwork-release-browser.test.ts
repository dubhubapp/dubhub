import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  shouldShowSavedReleaseCountdownIndicator,
} from "@/lib/home-widget-countdown-icon";
import {
  ARTWORK_ATTRACT_MAX_MOVE_PX,
  ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS,
  ARTWORK_EMBLA_DURATION,
  ARTWORK_SCALE_MIN,
  ARTWORK_SCALE_SELECTED,
  ARTWORK_SECTION_TOP_PAD_CLASS,
  ARTWORK_SETTLE_ALIGN_THRESHOLD_PX,
  ARTWORK_SETTLE_IDLE_FALLBACK_MS,
  artworkOpacityFromCentreDistance,
  artworkRenderedReleaseIds,
  artworkScaleFromCentreDistance,
  buildArtworkReleaseSequence,
  findNearestCentreIndex,
  findNearestCentreIndexWithHysteresis,
  findNearestRealReleaseFromCentres,
  isArtworkViewSupported,
  mapEmblaSnapIndexToRealIndex,
  resolveArtworkAmbienceUrl,
  resolveArtworkEffectiveLayout,
  resolveArtworkEmblaOptions,
  resolveArtworkMetadataIndex,
  resolveArtworkReleaseIdFromSnap,
  resolveArtworkRestoreIndex,
  resolveArtworkVisibleMetadataIndex,
  shouldAlignSettledCentre,
  shouldCommitArtworkAmbience,
  shouldCommitArtworkSessionSelection,
  shouldCommitArtworkVisibleMetadata,
  shouldEnableArtworkLoop,
  shouldPlayArtworkCrossingHaptic,
  shouldPersistArtworkSessionOnSettle,
  shouldPlayArtworkSettleHapticAfterCrossing,
  shouldRunArtworkBootstrap,
  shouldStartArtworkCentreAttraction,
  shouldUpdateArtworkAmbience,
  shouldUpdateArtworkCommittedTarget,
  wrapArtworkRealIndex,
} from "@/lib/artwork-release-browser";

const here = dirname(fileURLToPath(import.meta.url));
const artworkBrowserSrc = readFileSync(
  join(here, "../components/artwork-release-browser.tsx"),
  "utf8",
);
const detailButtonSrc = readFileSync(
  join(here, "../components/home-widget-selection-button.tsx"),
  "utf8",
);
const listCardSrc = readFileSync(
  join(here, "../components/release-feed-card.tsx"),
  "utf8",
);

describe("Artwork B.2 crossing haptics", () => {
  it("nearest index 0 → 1 → one crossing event", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 0, nextIndex: 1 }),
      true,
    );
  });

  it("repeated nearest index 1 → no repeated event", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 1, nextIndex: 1 }),
      false,
    );
  });

  it("1 → 2 → one new event", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 1, nextIndex: 2 }),
      true,
    );
  });

  it("suppress blocks crossing during restore", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({
        previousIndex: 0,
        nextIndex: 1,
        suppress: true,
      }),
      false,
    );
  });

  it("crossing throttle interval is set for rhythmic fast flicks", () => {
    assert.ok(ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS >= 45);
    assert.ok(ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS <= 100);
  });
});

describe("Artwork B.2 hysteresis", () => {
  it("oscillation near midpoint does not flip without clear advantage", () => {
    assert.equal(
      findNearestCentreIndexWithHysteresis({
        scrollLeft: 100,
        viewportWidth: 200,
        itemCentres: [100, 300],
        currentIndex: 0,
      }),
      0,
    );
    assert.equal(
      findNearestCentreIndexWithHysteresis({
        scrollLeft: 160,
        viewportWidth: 200,
        itemCentres: [100, 300],
        currentIndex: 0,
      }),
      1,
    );
  });

  it("raw nearest still works without hysteresis helper", () => {
    assert.equal(
      findNearestCentreIndex({
        scrollLeft: 200,
        viewportWidth: 200,
        itemCentres: [100, 300, 500],
      }),
      1,
    );
  });
});

describe("Artwork B.2 settle haptic dedupe", () => {
  it("final settle same as last crossed index → no duplicate haptic", () => {
    assert.equal(
      shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: 4,
        lastCrossedIndex: 4,
        previousSettledId: "A",
        nextSettledId: "E",
      }),
      false,
    );
  });

  it("settle without prior crossing still haptics on id change", () => {
    assert.equal(
      shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: 1,
        lastCrossedIndex: null,
        previousSettledId: "A",
        nextSettledId: "B",
      }),
      true,
    );
  });

  it("button navigation does not duplicate a crossing tick", () => {
    assert.equal(
      shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: 1,
        lastCrossedIndex: 1,
        previousSettledId: "A",
        nextSettledId: "B",
        fromButton: true,
      }),
      false,
    );
  });

  it("restoration / suppress → no haptic", () => {
    assert.equal(
      shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: 0,
        lastCrossedIndex: null,
        previousSettledId: null,
        nextSettledId: "A",
        suppress: true,
      }),
      false,
    );
    assert.equal(
      shouldRunArtworkBootstrap({ phase: "pending", userHasInteracted: false }),
      true,
    );
  });
});

describe("Artwork C soft settle", () => {
  it("residual within tiny tolerance → no correction", () => {
    assert.equal(shouldAlignSettledCentre({ offsetPx: 4 }), false);
    assert.equal(shouldAlignSettledCentre({ offsetPx: ARTWORK_SETTLE_ALIGN_THRESHOLD_PX }), false);
  });

  it("outside tolerance → one settle needed", () => {
    assert.equal(shouldAlignSettledCentre({ offsetPx: 18 }), true);
    assert.ok(ARTWORK_SETTLE_ALIGN_THRESHOLD_PX <= 12);
    assert.ok(ARTWORK_SETTLE_IDLE_FALLBACK_MS >= 400);
  });

  it("settle target = nearest real release", () => {
    assert.equal(
      findNearestCentreIndex({
        scrollLeft: 210,
        viewportWidth: 200,
        itemCentres: [100, 300, 500],
      }),
      1,
    );
  });
});

describe("Artwork C scale", () => {
  it("centre distance 0 → full scale", () => {
    assert.equal(
      artworkScaleFromCentreDistance({ offsetPx: 0, slideWidthPx: 300 }),
      ARTWORK_SCALE_SELECTED,
    );
  });

  it("one slide away interpolates to min scale (subtle, not 0.82)", () => {
    const scale = artworkScaleFromCentreDistance({
      offsetPx: 300,
      slideWidthPx: 300,
    });
    assert.equal(scale, ARTWORK_SCALE_MIN);
    assert.ok(ARTWORK_SCALE_MIN >= 0.94);
    assert.ok(ARTWORK_SCALE_MIN <= 0.98);
  });

  it("opacity eases with distance", () => {
    assert.equal(
      artworkOpacityFromCentreDistance({ offsetPx: 0, slideWidthPx: 300 }),
      1,
    );
    assert.ok(
      artworkOpacityFromCentreDistance({ offsetPx: 300, slideWidthPx: 300 }) < 1,
    );
  });
});

describe("Artwork C.1 Embla loop contract", () => {
  it("real release sequence contains no manual loop clones", () => {
    assert.deepEqual(artworkRenderedReleaseIds(["a", "b", "c"]), ["a", "b", "c"]);
    assert.deepEqual(
      buildArtworkReleaseSequence({
        featured: [{ id: "a" }],
        outToday: [],
        datedRest: [{ id: "b" }, { id: "c" }],
        comingSoon: [],
      }).map((r) => r.id),
      ["a", "b", "c"],
    );
  });

  it("1-release loop disabled; 2-release stays linear; 3+ loops", () => {
    assert.equal(shouldEnableArtworkLoop(0), false);
    assert.equal(shouldEnableArtworkLoop(1), false);
    assert.equal(shouldEnableArtworkLoop(2), false);
    assert.equal(shouldEnableArtworkLoop(3), true);
    assert.equal(shouldEnableArtworkLoop(4), true);
    assert.equal(resolveArtworkEmblaOptions({ realCount: 1, startIndex: 0 }).loop, false);
    assert.equal(resolveArtworkEmblaOptions({ realCount: 2, startIndex: 0 }).loop, false);
    assert.equal(resolveArtworkEmblaOptions({ realCount: 3, startIndex: 0 }).loop, true);
  });

  it("Embla selected snap maps to the real release", () => {
    assert.equal(mapEmblaSnapIndexToRealIndex(0, 3), 0);
    assert.equal(mapEmblaSnapIndexToRealIndex(2, 3), 2);
    assert.equal(mapEmblaSnapIndexToRealIndex(99, 3), 2);
    assert.equal(mapEmblaSnapIndexToRealIndex(-1, 3), 0);
    assert.equal(
      resolveArtworkReleaseIdFromSnap({ snapIndex: 2, releaseIds: ["a", "b", "c"] }),
      "c",
    );
  });

  it("loop last → first and first → last resolve correct real ids", () => {
    const ids = ["a", "b", "c"];
    assert.equal(
      resolveArtworkReleaseIdFromSnap({
        snapIndex: wrapArtworkRealIndex({ index: 2, realCount: 3, delta: 1, loop: true }),
        releaseIds: ids,
      }),
      "a",
    );
    assert.equal(
      resolveArtworkReleaseIdFromSnap({
        snapIndex: wrapArtworkRealIndex({ index: 0, realCount: 3, delta: -1, loop: true }),
        releaseIds: ids,
      }),
      "c",
    );
  });

  it("haptic last → first is one logical crossing; no clone duplicate", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 2, nextIndex: 0 }),
      true,
    );
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 0, nextIndex: 2 }),
      true,
    );
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 0, nextIndex: 0 }),
      false,
    );
    assert.equal(
      shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: 0,
        lastCrossedIndex: 0,
        previousSettledId: "c",
        nextSettledId: "a",
      }),
      false,
    );
  });

  it("metadata and ambience follow real selected/settled ids", () => {
    assert.equal(
      resolveArtworkReleaseIdFromSnap({ snapIndex: 1, releaseIds: ["a", "b", "c"] }),
      "b",
    );
    assert.equal(
      shouldUpdateArtworkAmbience({
        previousSettledId: "c",
        nextSettledId: "a",
      }),
      true,
    );
    assert.equal(
      shouldUpdateArtworkAmbience({
        previousSettledId: "a",
        nextSettledId: "a",
      }),
      false,
    );
  });

  it("Detail after many loop rotations still resolves the real id", () => {
    const ids = ["a", "b", "c"];
    const afterManyCycles = 2 + 3 * 11;
    assert.equal(
      resolveArtworkReleaseIdFromSnap({
        snapIndex: mapEmblaSnapIndexToRealIndex(afterManyCycles % ids.length, ids.length),
        releaseIds: ids,
      }),
      "c",
    );
  });

  it("session restore resolves the real release index", () => {
    assert.equal(
      resolveArtworkRestoreIndex({
        releaseIds: ["a", "b", "c"],
        preferredReleaseId: "c",
      }),
      2,
    );
    assert.equal(
      resolveArtworkEmblaOptions({ realCount: 3, startIndex: 2 }).startIndex,
      2,
    );
  });

  it("Prev/Next wrap only when loop is enabled", () => {
    assert.equal(
      wrapArtworkRealIndex({ index: 2, realCount: 3, delta: 1, loop: true }),
      0,
    );
    assert.equal(
      wrapArtworkRealIndex({ index: 0, realCount: 3, delta: -1, loop: true }),
      2,
    );
    assert.equal(
      wrapArtworkRealIndex({ index: 1, realCount: 2, delta: 1, loop: false }),
      1,
    );
    assert.equal(
      wrapArtworkRealIndex({ index: 0, realCount: 2, delta: -1, loop: false }),
      0,
    );
    assert.equal(
      wrapArtworkRealIndex({ index: 0, realCount: 1, delta: 1, loop: false }),
      0,
    );
  });

  it("dragFree is active; skipSnaps is not relied on", () => {
    const opts = resolveArtworkEmblaOptions({ realCount: 4, startIndex: 0 });
    assert.equal(opts.dragFree, true);
    assert.equal(opts.skipSnaps, false);
    assert.equal(opts.align, "center");
    assert.equal(opts.containScroll, false);
    assert.equal(opts.duration, ARTWORK_EMBLA_DURATION);
    assert.equal(opts.slidesToScroll, 1);
    assert.equal(
      resolveArtworkEmblaOptions({ realCount: 3, startIndex: 0, reducedMotion: true }).duration,
      1,
    );
  });
});

describe("Artwork C.2 settle-only metadata", () => {
  it("Embla select does not commit visible metadata or session", () => {
    assert.equal(shouldCommitArtworkVisibleMetadata("select"), false);
    assert.equal(shouldCommitArtworkSessionSelection("select"), false);
  });

  it("Embla settle commits visible metadata, ambience, and session", () => {
    assert.equal(shouldCommitArtworkVisibleMetadata("settle"), true);
    assert.equal(shouldCommitArtworkSessionSelection("settle"), true);
    assert.equal(
      resolveArtworkMetadataIndex({
        previewIndex: 3,
        settledIndex: 1,
        length: 5,
        preferPreview: false,
      }),
      1,
    );
  });

  it("crossing haptic still allowed on select; settle does not duplicate", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 0, nextIndex: 1 }),
      true,
    );
    assert.equal(
      shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: 1,
        lastCrossedIndex: 1,
        previousSettledId: "a",
        nextSettledId: "b",
      }),
      false,
    );
  });

  it("arrow navigation metadata waits for committed target, not select", () => {
    assert.equal(shouldCommitArtworkVisibleMetadata("select"), false);
    assert.equal(shouldCommitArtworkVisibleMetadata("commit"), true);
    assert.equal(shouldCommitArtworkSessionSelection("commit"), false);
  });

  it("bootstrap restoration sets metadata without haptic", () => {
    assert.equal(shouldCommitArtworkVisibleMetadata("bootstrap"), true);
    assert.equal(
      shouldPlayArtworkCrossingHaptic({
        previousIndex: 0,
        nextIndex: 2,
        suppress: true,
      }),
      false,
    );
    assert.equal(
      shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: 2,
        lastCrossedIndex: 2,
        previousSettledId: null,
        nextSettledId: "c",
        suppress: true,
      }),
      false,
    );
    assert.equal(
      resolveArtworkRestoreIndex({
        releaseIds: ["a", "b", "c"],
        preferredReleaseId: "c",
      }),
      2,
    );
  });

  it("loop last → first settles to the correct real release", () => {
    assert.equal(
      resolveArtworkReleaseIdFromSnap({
        snapIndex: wrapArtworkRealIndex({ index: 2, realCount: 3, delta: 1, loop: true }),
        releaseIds: ["a", "b", "c"],
      }),
      "a",
    );
  });

  it("post-settle correction is not used; attraction is low-velocity + once", () => {
    assert.equal(
      shouldStartArtworkCentreAttraction({
        pointerDown: false,
        alreadyAttracting: false,
        suppress: false,
        movePx: 2,
        offsetPx: 24,
      }),
      true,
    );
    assert.equal(
      shouldStartArtworkCentreAttraction({
        pointerDown: false,
        alreadyAttracting: true,
        suppress: false,
        movePx: 2,
        offsetPx: 24,
      }),
      false,
    );
    assert.equal(
      shouldStartArtworkCentreAttraction({
        pointerDown: false,
        alreadyAttracting: false,
        suppress: false,
        movePx: 2,
        offsetPx: 4,
      }),
      false,
    );
  });

  it("one release safe; two linear; three+ loop; List/Collaborations unchanged", () => {
    assert.equal(resolveArtworkEmblaOptions({ realCount: 1, startIndex: 0 }).loop, false);
    assert.equal(resolveArtworkEmblaOptions({ realCount: 1, startIndex: 0 }).dragFree, true);
    assert.equal(resolveArtworkEmblaOptions({ realCount: 2, startIndex: 0 }).loop, false);
    assert.equal(resolveArtworkEmblaOptions({ realCount: 3, startIndex: 0 }).loop, true);
    assert.equal(isArtworkViewSupported("collaborations"), false);
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "artwork", view: "collaborations" }),
      "list",
    );
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "list", view: "upcoming" }),
      "list",
    );
  });
});

describe("Artwork C ambience", () => {
  it("background source changes only on settled id", () => {
    assert.equal(
      shouldUpdateArtworkAmbience({
        previousSettledId: "a",
        nextSettledId: "a",
      }),
      false,
    );
    assert.equal(
      shouldUpdateArtworkAmbience({
        previousSettledId: "a",
        nextSettledId: "b",
      }),
      true,
    );
  });

  it("malformed artwork → no ambience url", () => {
    assert.equal(resolveArtworkAmbienceUrl(null), null);
    assert.equal(resolveArtworkAmbienceUrl("  "), null);
    assert.equal(resolveArtworkAmbienceUrl("https://cdn.example/art.jpg"), "https://cdn.example/art.jpg");
  });
});

describe("Artwork C preservation", () => {
  it("Collaborations still forces List; sequence helper unchanged", () => {
    assert.equal(isArtworkViewSupported("collaborations"), false);
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "artwork", view: "collaborations" }),
      "list",
    );
    assert.deepEqual(
      buildArtworkReleaseSequence({
        featured: [],
        outToday: [],
        datedRest: [{ id: "a" }],
        comingSoon: [{ id: "c", isComingSoon: true }],
      }).map((r) => r.id),
      ["a", "c"],
    );
  });

  it("empty / one release restore safe", () => {
    assert.equal(
      resolveArtworkRestoreIndex({ releaseIds: [], preferredReleaseId: "x" }),
      0,
    );
    assert.equal(
      resolveArtworkRestoreIndex({ releaseIds: ["only"], preferredReleaseId: null }),
      0,
    );
  });
});

describe("Artwork C.3 geometric crossing + attraction + thumb pad", () => {
  const centres = [
    { realIndex: 0, centre: 100 },
    { realIndex: 1, centre: 300 },
    { realIndex: 2, centre: 500 },
  ];

  it("nearest real release from centre positions", () => {
    assert.equal(
      findNearestRealReleaseFromCentres({
        viewCentre: 310,
        slides: centres,
        currentRealIndex: 0,
        realCount: 3,
      }).realIndex,
      1,
    );
  });

  it("repeated nearest index → no new crossing", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 1, nextIndex: 1 }),
      false,
    );
  });

  it("A → B crossing → one crossing event", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 0, nextIndex: 1 }),
      true,
    );
  });

  it("B → C → one new crossing", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 1, nextIndex: 2 }),
      true,
    );
  });

  it("loop last → first → one crossing", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({ previousIndex: 2, nextIndex: 0 }),
      true,
    );
    assert.equal(
      findNearestRealReleaseFromCentres({
        viewCentre: 100,
        slides: [
          { realIndex: 2, centre: 500 },
          { realIndex: 0, centre: 100 },
          { realIndex: 1, centre: 300 },
        ],
        currentRealIndex: 2,
        realCount: 3,
      }).realIndex,
      0,
    );
  });

  it("hysteresis prevents rapid B/C/B/C oscillation", () => {
    assert.equal(
      findNearestRealReleaseFromCentres({
        viewCentre: 390,
        slides: centres,
        currentRealIndex: 1,
        realCount: 3,
      }).realIndex,
      1,
    );
    assert.equal(
      findNearestRealReleaseFromCentres({
        viewCentre: 470,
        slides: centres,
        currentRealIndex: 1,
        realCount: 3,
      }).realIndex,
      2,
    );
  });

  it("haptic throttle preserves dedupe interval", () => {
    assert.equal(ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS, 55);
  });

  it("metadata is not updated by crossing; only by final selected/settle", () => {
    assert.equal(shouldCommitArtworkVisibleMetadata("select"), false);
    assert.equal(shouldCommitArtworkVisibleMetadata("settle"), true);
    assert.equal(
      resolveArtworkMetadataIndex({
        previewIndex: 2,
        settledIndex: 0,
        length: 3,
        preferPreview: false,
      }),
      0,
    );
  });

  it("restoration emits no crossing haptic", () => {
    assert.equal(
      shouldPlayArtworkCrossingHaptic({
        previousIndex: 0,
        nextIndex: 2,
        suppress: true,
      }),
      false,
    );
  });

  it("programmatic arrow still resolves the correct final release", () => {
    assert.equal(
      wrapArtworkRealIndex({ index: 0, realCount: 3, delta: 1, loop: true }),
      1,
    );
    assert.equal(
      resolveArtworkReleaseIdFromSnap({
        snapIndex: wrapArtworkRealIndex({ index: 2, realCount: 3, delta: 1, loop: true }),
        releaseIds: ["a", "b", "c"],
      }),
      "a",
    );
  });

  it("attraction starts only at low remaining movement, not after a dead stop timer", () => {
    assert.ok(ARTWORK_ATTRACT_MAX_MOVE_PX <= 4);
    assert.equal(
      shouldStartArtworkCentreAttraction({
        pointerDown: true,
        alreadyAttracting: false,
        suppress: false,
        movePx: 1,
        offsetPx: 40,
      }),
      false,
    );
    assert.equal(
      shouldStartArtworkCentreAttraction({
        pointerDown: false,
        alreadyAttracting: false,
        suppress: false,
        movePx: 12,
        offsetPx: 40,
      }),
      false,
    );
    assert.equal(
      shouldStartArtworkCentreAttraction({
        pointerDown: false,
        alreadyAttracting: false,
        suppress: true,
        movePx: 1,
        offsetPx: 40,
      }),
      false,
    );
  });

  it("true loop remains n>=3; 1 safe; 2 linear", () => {
    assert.equal(shouldEnableArtworkLoop(1), false);
    assert.equal(shouldEnableArtworkLoop(2), false);
    assert.equal(shouldEnableArtworkLoop(3), true);
  });

  it("Artwork vertical-spacing token is a responsive clamp, not a width hack", () => {
    assert.match(ARTWORK_SECTION_TOP_PAD_CLASS, /pt-\[clamp\(/);
    assert.match(ARTWORK_SECTION_TOP_PAD_CLASS, /10vh/);
    assert.doesNotMatch(ARTWORK_SECTION_TOP_PAD_CLASS, /1\.25rem/);
  });

  it("List View and Collaborations contracts unchanged", () => {
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "list", view: "upcoming" }),
      "list",
    );
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "artwork", view: "collaborations" }),
      "list",
    );
  });

  it("stored Artwork restores on Upcoming and Past after Collaborations forces List", () => {
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "artwork", view: "collaborations" }),
      "list",
    );
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "artwork", view: "upcoming" }),
      "artwork",
    );
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "artwork", view: "past" }),
      "artwork",
    );
    assert.equal(isArtworkViewSupported("upcoming"), true);
    assert.equal(isArtworkViewSupported("past"), true);
    assert.equal(isArtworkViewSupported("collaborations"), false);
  });
});

describe("Artwork C.4 committed-target metadata + softer attraction", () => {
  it("fast crossing A→B→C does not commit metadata; haptics still occur", () => {
    assert.equal(shouldPlayArtworkCrossingHaptic({ previousIndex: 0, nextIndex: 1 }), true);
    assert.equal(shouldPlayArtworkCrossingHaptic({ previousIndex: 1, nextIndex: 2 }), true);
    assert.equal(shouldCommitArtworkVisibleMetadata("select"), false);
    assert.equal(
      resolveArtworkVisibleMetadataIndex({
        nearestIndex: 2,
        committedIndex: 0,
        settledIndex: 0,
        length: 3,
      }),
      0,
    );
  });

  it("low-velocity attraction chooses C and commits metadata before settle", () => {
    assert.equal(
      shouldStartArtworkCentreAttraction({
        pointerDown: false,
        alreadyAttracting: false,
        suppress: false,
        movePx: 3,
        offsetPx: 40,
      }),
      true,
    );
    assert.equal(
      shouldUpdateArtworkCommittedTarget({
        nextTarget: 2,
        currentCommitted: 0,
        alreadyAttracting: false,
      }),
      true,
    );
    assert.equal(shouldCommitArtworkVisibleMetadata("commit"), true);
    assert.equal(
      resolveArtworkVisibleMetadataIndex({
        nearestIndex: 2,
        committedIndex: 2,
        settledIndex: 0,
        length: 3,
      }),
      2,
    );
  });

  it("session persistence remains old release until settle", () => {
    assert.equal(shouldCommitArtworkSessionSelection("commit"), false);
    assert.equal(shouldCommitArtworkSessionSelection("settle"), true);
    assert.equal(
      shouldPersistArtworkSessionOnSettle({ pointerDown: false, suppress: false }),
      true,
    );
  });

  it("settle C persists C; no duplicate commit for the same target", () => {
    assert.equal(
      shouldUpdateArtworkCommittedTarget({
        nextTarget: 2,
        currentCommitted: 2,
        alreadyAttracting: true,
      }),
      false,
    );
    assert.equal(
      shouldUpdateArtworkCommittedTarget({
        nextTarget: 2,
        currentCommitted: 2,
        alreadyAttracting: false,
      }),
      false,
    );
    assert.equal(
      resolveArtworkReleaseIdFromSnap({ snapIndex: 2, releaseIds: ["a", "b", "c"] }),
      "c",
    );
  });

  it("user re-engages during attraction → no forced stale persistence", () => {
    assert.equal(
      shouldPersistArtworkSessionOnSettle({ pointerDown: true, suppress: false }),
      false,
    );
  });

  it("next attraction can commit D after re-engagement", () => {
    assert.equal(
      shouldUpdateArtworkCommittedTarget({
        nextTarget: 3,
        currentCommitted: 2,
        alreadyAttracting: false,
      }),
      true,
    );
  });

  it("arrow navigation commits target at movement start; persist waits for settle", () => {
    assert.equal(shouldCommitArtworkVisibleMetadata("commit"), true);
    assert.equal(shouldCommitArtworkSessionSelection("commit"), false);
    assert.equal(
      wrapArtworkRealIndex({ index: 0, realCount: 3, delta: 1, loop: true }),
      1,
    );
  });

  it("restoration does not create a fake committed transition", () => {
    assert.equal(shouldCommitArtworkVisibleMetadata("bootstrap"), true);
    assert.equal(
      shouldPlayArtworkCrossingHaptic({
        previousIndex: 0,
        nextIndex: 2,
        suppress: true,
      }),
      false,
    );
    assert.equal(
      resolveArtworkRestoreIndex({
        releaseIds: ["a", "b", "c"],
        preferredReleaseId: "c",
      }),
      2,
    );
  });

  it("loop last→first commits the correct real id", () => {
    const next = wrapArtworkRealIndex({ index: 2, realCount: 3, delta: 1, loop: true });
    assert.equal(
      resolveArtworkReleaseIdFromSnap({ snapIndex: next, releaseIds: ["a", "b", "c"] }),
      "a",
    );
    assert.equal(
      shouldUpdateArtworkCommittedTarget({
        nextTarget: next,
        currentCommitted: 2,
        alreadyAttracting: false,
      }),
      true,
    );
  });

  it("ambience follows committed target, not crossings", () => {
    assert.equal(shouldCommitArtworkAmbience("select"), false);
    assert.equal(shouldCommitArtworkAmbience("commit"), true);
    assert.equal(
      shouldUpdateArtworkAmbience({ previousSettledId: "a", nextSettledId: "c" }),
      true,
    );
  });

  it("attraction threshold is slightly earlier than C.3; duration modestly softer", () => {
    assert.equal(ARTWORK_ATTRACT_MAX_MOVE_PX, 3.25);
    assert.equal(ARTWORK_EMBLA_DURATION, 30);
    assert.equal(ARTWORK_SETTLE_ALIGN_THRESHOLD_PX, 10);
  });

  it("List View and Collaborations remain unchanged", () => {
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "list", view: "upcoming" }),
      "list",
    );
    assert.equal(
      resolveArtworkEffectiveLayout({ requested: "artwork", view: "collaborations" }),
      "list",
    );
  });
});

describe("Artwork View Countdown status-row indicator", () => {
  const ids = ["rel-a", "rel-b", "rel-c"];

  it("shows CalendarClock only when settled/committed metadata release is the selected Countdown id", () => {
    const metadataIndex = resolveArtworkVisibleMetadataIndex({
      nearestIndex: 2,
      committedIndex: 0,
      settledIndex: 0,
      length: 3,
    });
    assert.equal(ids[metadataIndex], "rel-a");
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: "rel-a",
        cardReleaseId: ids[metadataIndex],
      }),
      true,
    );
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: "rel-c",
        cardReleaseId: ids[metadataIndex],
      }),
      false,
    );
  });

  it("does not follow passing/preview nearest identity", () => {
    const previewNearest = 2;
    const metadataIndex = resolveArtworkVisibleMetadataIndex({
      nearestIndex: previewNearest,
      committedIndex: 1,
      settledIndex: 1,
      length: 3,
    });
    assert.notEqual(ids[metadataIndex], ids[previewNearest]);
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: ids[previewNearest],
        cardReleaseId: ids[metadataIndex],
      }),
      false,
    );
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: ids[metadataIndex],
        cardReleaseId: ids[metadataIndex],
      }),
      true,
    );
  });

  it("renders the shared Countdown badge beside the status pill, not as a floating square", () => {
    const statusRow = artworkBrowserSrc.indexOf('data-testid="artwork-release-status-row"');
    const pill = artworkBrowserSrc.indexOf("<ReleaseStatusPill");
    const indicator = artworkBrowserSrc.indexOf(
      "artwork-countdown-selected-indicator-",
    );
    assert.ok(statusRow > 0);
    assert.ok(pill > statusRow);
    assert.ok(indicator > pill);
    assert.match(artworkBrowserSrc, /artwork-release-status-row[\s\S]*ReleaseStatusPill[\s\S]*CountdownStatusBadge/);
    assert.doesNotMatch(artworkBrowserSrc, /absolute right-1 top-0/);
    assert.doesNotMatch(artworkBrowserSrc, /bg-black\/55/);
    assert.doesNotMatch(artworkBrowserSrc, /text-accent/);
    assert.doesNotMatch(artworkBrowserSrc, /h-6 w-6/);
  });

  it("is a passive decorative badge, not an action", () => {
    assert.match(artworkBrowserSrc, /shouldShowSavedReleaseCountdownIndicator/);
    assert.match(artworkBrowserSrc, /CountdownStatusBadge/);
    assert.doesNotMatch(artworkBrowserSrc, /Add to Countdown/);
    assert.doesNotMatch(artworkBrowserSrc, /In your Countdown/);
    const indicatorBlock = artworkBrowserSrc.slice(
      artworkBrowserSrc.indexOf("countdownSelected ?"),
      artworkBrowserSrc.indexOf(") : null}", artworkBrowserSrc.indexOf("countdownSelected ?")) + 8,
    );
    assert.doesNotMatch(indicatorBlock, /<button/);
    assert.doesNotMatch(indicatorBlock, /onClick/);
    assert.doesNotMatch(indicatorBlock, /tabIndex/);
    assert.doesNotMatch(indicatorBlock, /role="button"/);
  });

  it("does not change Release Detail binary control; List uses the same badge", () => {
    assert.match(detailButtonSrc, /Add to Countdown/);
    assert.match(detailButtonSrc, /resolveHomeWidgetSelectionButtonPresentation/);
    assert.doesNotMatch(detailButtonSrc, /DropdownMenu/);
    assert.match(listCardSrc, /CountdownStatusBadge/);
    assert.doesNotMatch(listCardSrc, /absolute right-0 top-3\.5/);
    assert.doesNotMatch(listCardSrc, /pr-8/);
  });

  it("does not change Artwork carousel configuration", () => {
    const opts = resolveArtworkEmblaOptions({ realCount: 4, startIndex: 0 });
    assert.equal(opts.dragFree, true);
    assert.equal(opts.loop, true);
    assert.equal(opts.duration, ARTWORK_EMBLA_DURATION);
    assert.equal(ARTWORK_EMBLA_DURATION, 30);
    assert.match(artworkBrowserSrc, /useEmblaCarousel\(emblaOptions\)/);
    assert.doesNotMatch(artworkBrowserSrc, /align:\s*"center"/);
  });
});
