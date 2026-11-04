/**
 * Canvas soundwave math + source contracts (no per-frame React state).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PAYWALL_SOUNDWAVE_CONTOUR_COUNT,
  PAYWALL_SOUNDWAVE_STATIC_PATHS,
  paywallSoundwaveBaseline,
  paywallSoundwaveDeform,
  paywallSoundwaveSampleContour,
  prefersPaywallSoundwaveReducedMotion,
} from "./verified-artist-tools-paywall-soundwave-canvas";

const here = dirname(fileURLToPath(import.meta.url));
const componentSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall-soundwave.tsx"),
  "utf8",
);
const canvasLibSrc = readFileSync(
  join(here, "./verified-artist-tools-paywall-soundwave-canvas.ts"),
  "utf8",
);

describe("paywall soundwave canvas math", () => {
  it("keeps ten static Pass 1 paths and ten canvas contours", () => {
    assert.equal(PAYWALL_SOUNDWAVE_STATIC_PATHS.length, 10);
    assert.equal(PAYWALL_SOUNDWAVE_CONTOUR_COUNT, 10);
  });

  it("samples continuous travelling-wave deformation without a fixed cycle reset", () => {
    const a = paywallSoundwaveDeform(40, 2, 1.0);
    const b = paywallSoundwaveDeform(40, 2, 1.0 + 1e-4);
    assert.ok(Number.isFinite(a));
    assert.ok(Number.isFinite(b));
    // Tiny time delta → tiny geometry change (continuous, not jumping).
    assert.ok(Math.abs(b - a) < 0.05);

    const pts0 = paywallSoundwaveSampleContour(0, 0);
    const pts1 = paywallSoundwaveSampleContour(0, 0.5);
    assert.equal(pts0.length, pts1.length);
    let moved = 0;
    for (let i = 0; i < pts0.length; i++) {
      moved += Math.hypot(pts1[i]!.x - pts0[i]!.x, pts1[i]!.y - pts0[i]!.y);
    }
    assert.ok(moved > 1, "contours should change shape over time");
  });

  it("keeps neighbouring baselines coherent and diagonal", () => {
    const p0 = paywallSoundwaveBaseline(0, 0);
    const p9 = paywallSoundwaveBaseline(9, 0);
    assert.ok(p0.x > 300);
    assert.ok(p9.y > p0.y);
    const mid0 = paywallSoundwaveBaseline(0, 0.5);
    const mid1 = paywallSoundwaveBaseline(1, 0.5);
    assert.ok(Math.abs(mid1.y - mid0.y) < 30);
  });

  it("respects reduced-motion helper", () => {
    assert.equal(
      prefersPaywallSoundwaveReducedMotion(() => ({ matches: true }) as MediaQueryList),
      true,
    );
    assert.equal(
      prefersPaywallSoundwaveReducedMotion(() => ({ matches: false }) as MediaQueryList),
      false,
    );
  });
});

describe("paywall soundwave canvas component contracts", () => {
  it("uses rAF with cleanup and never setStates inside the animation frame", () => {
    assert.match(componentSrc, /requestAnimationFrame/);
    assert.match(componentSrc, /cancelAnimationFrame/);
    assert.match(componentSrc, /visibilitychange/);
    assert.match(componentSrc, /IntersectionObserver|ResizeObserver/);
    assert.match(componentSrc, /prefers-reduced-motion/);
    assert.match(componentSrc, /data-testid="paywall-soundwave-canvas"/);
    assert.match(componentSrc, /data-testid="paywall-soundwave-static"/);
    assert.match(componentSrc, /pointer-events-none/);
    assert.match(componentSrc, /aria-hidden="true"/);

    // No setState inside the rAF callback body.
    const frameFn = componentSrc.match(
      /const frame = \([\s\S]*?\n    \};/,
    )?.[0];
    assert.ok(frameFn, "expected frame callback");
    assert.doesNotMatch(frameFn, /setUseStatic|setState|useState/);
    assert.match(frameFn, /paint\(/);

    // Mutual exclusion: canvas XOR static in render.
    assert.match(
      componentSrc,
      /useStatic \? \([\s\S]*PaywallSoundwaveStaticSvg[\s\S]*\) : \([\s\S]*canvas/,
    );
  });

  it("keeps drawing helpers free of React and CSS transform animation", () => {
    assert.doesNotMatch(canvasLibSrc, /from "react"|requestAnimationFrame|@keyframes/);
    assert.doesNotMatch(componentSrc, /vat-paywall-soundwave-path|vat-paywall-soundwave-layer/);
    assert.doesNotMatch(componentSrc, /framer-motion/);
  });
});
