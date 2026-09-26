import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  feedMediaIntrinsicFromNaturalSize,
  resolveFeedVideoObjectFit,
  resolveHomeFeedForegroundObjectFit,
} from "@/lib/home-feed-video-object-fit";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

/** Typical phone feed stage (portrait). */
const STAGE = { w: 390, h: 844 };

const LANDSCAPE = { w: 1920, h: 1080 };
const SQUARE_WIDE = { w: 1200, h: 1000 };
const IMMERSIVE_PORTRAIT = { w: 1080, h: 1920 };
const PORTRAIT_4_5 = { w: 1080, h: 1350 };

describe("HOME-FEED-VIDEO-OBJECT-FIT — provisional poster fit", () => {
  it("A: no video dims + no poster dims + Home → cover", () => {
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: null,
        stageSize: STAGE,
        homeFeedPosterFallback: true,
        embeddedFeed: false,
      }),
      "cover",
    );
  });

  it("B: no video dims + landscape poster → contain", () => {
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: LANDSCAPE,
        stageSize: STAGE,
        homeFeedPosterFallback: true,
        embeddedFeed: false,
      }),
      "contain",
    );
  });

  it("C: no video dims + square-wide poster → contain", () => {
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: SQUARE_WIDE,
        stageSize: STAGE,
        homeFeedPosterFallback: true,
        embeddedFeed: false,
      }),
      "contain",
    );
  });

  it("D: no video dims + immersive portrait poster → cover (same as resolver)", () => {
    const expected = resolveFeedVideoObjectFit(
      IMMERSIVE_PORTRAIT.w,
      IMMERSIVE_PORTRAIT.h,
      STAGE.w,
      STAGE.h,
    );
    assert.equal(expected, "cover");
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: IMMERSIVE_PORTRAIT,
        stageSize: STAGE,
        homeFeedPosterFallback: true,
        embeddedFeed: false,
      }),
      expected,
    );
  });

  it("E: landscape poster then landscape video → contain → contain", () => {
    const provisional = resolveHomeFeedForegroundObjectFit({
      videoIntrinsic: null,
      posterIntrinsic: LANDSCAPE,
      stageSize: STAGE,
      homeFeedPosterFallback: true,
      embeddedFeed: false,
    });
    const settled = resolveHomeFeedForegroundObjectFit({
      videoIntrinsic: LANDSCAPE,
      posterIntrinsic: LANDSCAPE,
      stageSize: STAGE,
      homeFeedPosterFallback: true,
      embeddedFeed: false,
    });
    assert.equal(provisional, "contain");
    assert.equal(settled, "contain");
  });

  it("F: landscape poster overridden by portrait video metadata", () => {
    const provisional = resolveHomeFeedForegroundObjectFit({
      videoIntrinsic: null,
      posterIntrinsic: LANDSCAPE,
      stageSize: STAGE,
      homeFeedPosterFallback: true,
      embeddedFeed: false,
    });
    const settled = resolveHomeFeedForegroundObjectFit({
      videoIntrinsic: IMMERSIVE_PORTRAIT,
      posterIntrinsic: LANDSCAPE,
      stageSize: STAGE,
      homeFeedPosterFallback: true,
      embeddedFeed: false,
    });
    assert.equal(provisional, "contain");
    assert.equal(settled, "cover");
  });

  it("G: non-Home / embedded ignore poster and keep contain fallback", () => {
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: LANDSCAPE,
        stageSize: STAGE,
        homeFeedPosterFallback: false,
        embeddedFeed: false,
      }),
      "contain",
    );
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: LANDSCAPE,
        stageSize: STAGE,
        homeFeedPosterFallback: true,
        embeddedFeed: true,
      }),
      "contain",
    );
  });

  it("H: poster intrinsic is URL-scoped (stale dims do not apply after poster change)", () => {
    const stored = { url: "https://cdn.example/a.jpg", w: LANDSCAPE.w, h: LANDSCAPE.h };
    const currentUrl = "https://cdn.example/b.jpg";
    const active =
      stored.url === currentUrl ? { w: stored.w, h: stored.h } : null;
    assert.equal(active, null);
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: active,
        stageSize: STAGE,
        homeFeedPosterFallback: true,
        embeddedFeed: false,
      }),
      "cover",
    );

    const matching =
      stored.url === "https://cdn.example/a.jpg" ? { w: stored.w, h: stored.h } : null;
    assert.deepEqual(matching, LANDSCAPE);
  });

  it("rejects zero / incomplete natural sizes", () => {
    assert.equal(feedMediaIntrinsicFromNaturalSize(0, 1080), null);
    assert.equal(feedMediaIntrinsicFromNaturalSize(1920, 0), null);
    assert.deepEqual(feedMediaIntrinsicFromNaturalSize(1920, 1080), LANDSCAPE);
  });

  it("portrait 4:5 still goes through the single resolver", () => {
    const viaResolver = resolveFeedVideoObjectFit(
      PORTRAIT_4_5.w,
      PORTRAIT_4_5.h,
      STAGE.w,
      STAGE.h,
    );
    assert.equal(
      resolveHomeFeedForegroundObjectFit({
        videoIntrinsic: null,
        posterIntrinsic: PORTRAIT_4_5,
        stageSize: STAGE,
        homeFeedPosterFallback: true,
        embeddedFeed: false,
      }),
      viaResolver,
    );
  });
});

describe("HOME-FEED-VIDEO-OBJECT-FIT — VideoCard wiring", () => {
  it("uses shared provisional fit helper and captures poster natural size from the feed img", () => {
    assert.match(videoCardSrc, /resolveHomeFeedForegroundObjectFit/);
    assert.match(videoCardSrc, /feedMediaIntrinsicFromNaturalSize/);
    assert.match(videoCardSrc, /capturePosterIntrinsicFromImg/);
    assert.match(videoCardSrc, /posterIntrinsic\.url !== displayPosterUrl/);
    assert.match(videoCardSrc, /onLoad=\{\(e\) => capturePosterIntrinsicFromImg\(e\.currentTarget\)\}/);
    assert.doesNotMatch(videoCardSrc, /function resolveFeedVideoObjectFit\(/);
  });
});
