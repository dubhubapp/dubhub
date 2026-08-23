/**
 * C4B.2 — release atmosphere vibrancy + first-paint flicker contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RELEASE_ATMOSPHERE_BRAND_RGB,
  RELEASE_ATMOSPHERE_LIGHTNESS_MAX,
  RELEASE_ATMOSPHERE_LIGHTNESS_MIN,
  RELEASE_ATMOSPHERE_NAVY_BLEND,
  RELEASE_ATMOSPHERE_SAMPLE_SIZE,
  RELEASE_ATMOSPHERE_SATURATION_MAX,
  RELEASE_ATMOSPHERE_SATURATION_MIN,
  atmosphereLightness01,
  atmosphereResultFromRgba,
  atmosphereSaturation01,
  bootstrapReleaseAtmosphere,
  clearReleaseAtmosphereCacheForTests,
  normaliseAtmosphereRgb,
  peekReleaseAtmosphereCache,
  resolveReleaseArtworkAtmosphere,
  rgbToHsl,
  seedReleaseAtmosphereCacheForTests,
} from "@/lib/release-artwork-atmosphere";

const here = dirname(fileURLToPath(import.meta.url));
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const utilSrc = readFileSync(join(here, "./release-artwork-atmosphere.ts"), "utf8");

function rgbaFill(
  w: number,
  h: number,
  rgba: [number, number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = rgba[0];
    out[i + 1] = rgba[1];
    out[i + 2] = rgba[2];
    out[i + 3] = rgba[3];
  }
  return out;
}

describe("C4B.2 vibrancy normalisation", () => {
  it("uses stronger sat/light and lower navy blend", () => {
    assert.equal(RELEASE_ATMOSPHERE_LIGHTNESS_MIN, 0.17);
    assert.equal(RELEASE_ATMOSPHERE_LIGHTNESS_MAX, 0.34);
    assert.equal(RELEASE_ATMOSPHERE_SATURATION_MIN, 0.35);
    assert.equal(RELEASE_ATMOSPHERE_SATURATION_MAX, 0.72);
    assert.equal(RELEASE_ATMOSPHERE_NAVY_BLEND, 0.12);
    assert.equal(RELEASE_ATMOSPHERE_SAMPLE_SIZE, 24);
  });

  it("keeps red / yellow / purple / blue within safe bounds and recognisable", () => {
    const cases: Array<{
      name: string;
      rgb: { r: number; g: number; b: number };
      hueCheck: (h: number) => boolean;
    }> = [
      {
        name: "red",
        rgb: { r: 255, g: 30, b: 30 },
        hueCheck: (h) => h < 0.08 || h > 0.92,
      },
      {
        name: "yellow",
        rgb: { r: 255, g: 210, b: 40 },
        hueCheck: (h) => h > 0.1 && h < 0.2,
      },
      {
        name: "purple",
        rgb: { r: 160, g: 40, b: 220 },
        hueCheck: (h) => h > 0.7 && h < 0.9,
      },
      {
        name: "blue",
        rgb: { r: 30, g: 100, b: 255 },
        hueCheck: (h) => h > 0.55 && h < 0.72,
      },
    ];
    for (const c of cases) {
      const out = normaliseAtmosphereRgb(c.rgb);
      const { h, s, l } = rgbToHsl(out.r, out.g, out.b);
      assert.ok(
        l >= RELEASE_ATMOSPHERE_LIGHTNESS_MIN - 0.05 &&
          l <= RELEASE_ATMOSPHERE_LIGHTNESS_MAX + 0.08,
        `${c.name} L ${l}`,
      );
      assert.ok(
        s >= RELEASE_ATMOSPHERE_SATURATION_MIN - 0.12 &&
          s <= RELEASE_ATMOSPHERE_SATURATION_MAX + 0.1,
        `${c.name} S ${s}`,
      );
      assert.ok(c.hueCheck(h), `${c.name} hue ${h}`);
      assert.ok(atmosphereSaturation01(out) > 0.28, `${c.name} still saturated`);
    }
  });

  it("yellow stays more gold than muddy gray", () => {
    const out = normaliseAtmosphereRgb({ r: 240, g: 190, b: 30 });
    const { h, s } = rgbToHsl(out.r, out.g, out.b);
    assert.ok(h > 0.1 && h < 0.2, `gold hue ${h}`);
    assert.ok(s > 0.35, `gold sat ${s}`);
  });
});

describe("C4B.2 first-paint bootstrap", () => {
  beforeEach(() => clearReleaseAtmosphereCacheForTests());

  it("no artwork → brand ready instant", () => {
    const boot = bootstrapReleaseAtmosphere(null);
    assert.equal(boot.mode, "brand");
    assert.equal(boot.ready, true);
    assert.equal(boot.instant, true);
    assert.deepEqual(boot.rgb, RELEASE_ATMOSPHERE_BRAND_RGB);
  });

  it("uncached artwork → branded premium fallback, not legacy/plain", () => {
    const boot = bootstrapReleaseAtmosphere("https://example.invalid/c4b2-cold.png");
    assert.equal(boot.mode, "brand");
    assert.equal(boot.ready, false);
    assert.equal(boot.instant, false);
    assert.deepEqual(boot.rgb, RELEASE_ATMOSPHERE_BRAND_RGB);
  });

  it("cached artwork → synchronous artwork mode + instant", () => {
    const url = "https://cdn.example/c4b2-art.png";
    const derived = atmosphereResultFromRgba(
      rgbaFill(8, 8, [220, 50, 40, 255]),
    );
    assert.equal(derived.mode, "artwork");
    seedReleaseAtmosphereCacheForTests(url, derived);
    const boot = bootstrapReleaseAtmosphere(url);
    assert.equal(boot.ready, true);
    assert.equal(boot.instant, true);
    assert.equal(boot.mode, "artwork");
    assert.deepEqual(boot.rgb, derived.rgb);
    assert.equal(peekReleaseAtmosphereCache(url)?.mode, "artwork");
  });

  it("cached neutral → instant neutral", () => {
    const url = "https://cdn.example/c4b2-pale.png";
    const neutral = atmosphereResultFromRgba(
      rgbaFill(8, 8, [250, 250, 250, 255]),
    );
    assert.equal(neutral.mode, "neutral");
    seedReleaseAtmosphereCacheForTests(url, neutral);
    const boot = bootstrapReleaseAtmosphere(url);
    assert.equal(boot.mode, "neutral");
    assert.equal(boot.instant, true);
    assert.equal(boot.ready, true);
  });

  it("extraction failure → brand (not neutral)", async () => {
    const url = "https://example.invalid/c4b2-fail.png";
    const result = await resolveReleaseArtworkAtmosphere(url);
    assert.equal(result.mode, "brand");
    assert.deepEqual(result.rgb, RELEASE_ATMOSPHERE_BRAND_RGB);
  });
});

describe("C4B.2 presentation / flicker guards", () => {
  it("root canvas has premium fallback + instant path independent of async", () => {
    assert.match(
      cssSrc,
      /\.dark \.dubhub-app-release-detail-canvas \{[\s\S]*?background-color: #0f1324/,
    );
    assert.match(cssSrc, /rgba\(10, 131, 255/);
    assert.match(cssSrc, /data-atmosphere-instant="true"/);
    assert.match(cssSrc, /transition: none/);
    assert.match(cssSrc, /0\.94\) 0%/);
    assert.match(cssSrc, /transition: opacity 200ms/);
    assert.match(detailSrc, /atmosphereInstant/);
    assert.match(detailSrc, /data-atmosphere-instant/);
    assert.match(detailSrc, /bootstrapReleaseAtmosphere/);
    assert.match(detailSrc, /artworkAtmosphereUrl/);
    assert.match(utilSrc, /instant: cached\.mode === "artwork"/);
    assert.ok(atmosphereLightness01(atmosphereResultFromRgba(rgbaFill(4, 4, [255, 255, 255, 255])).rgb) < 0.35);
  });
});
