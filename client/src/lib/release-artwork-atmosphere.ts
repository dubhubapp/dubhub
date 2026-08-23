/**
 * Release Detail artwork → atmosphere colour (C4B / C4B.1).
 * Client-only, tiny canvas sample, fail-soft → branded blue/navy.
 * Modes: artwork | neutral (pale/gray) | brand (no art / failure).
 */

export type AtmosphereRgb = { r: number; g: number; b: number };

export type AtmosphereMode = "artwork" | "neutral" | "brand";

export type AtmosphereResult = {
  rgb: AtmosphereRgb;
  mode: AtmosphereMode;
};

export const RELEASE_ATMOSPHERE_SAMPLE_SIZE = 24 as const;
export const RELEASE_ATMOSPHERE_SAMPLE_MAX = 32 as const;

/** Deep navy — lower-page / blend anchor. */
export const RELEASE_ATMOSPHERE_NAVY_RGB: AtmosphereRgb = {
  r: 15,
  g: 19,
  b: 36,
};

/**
 * Branded top accent (darkened dub hub blue) for no-artwork / failure.
 * CSS brand mode layers additional blue wash; this drives the shared CSS var.
 */
export const RELEASE_ATMOSPHERE_BRAND_RGB: AtmosphereRgb = {
  r: 12,
  g: 58,
  b: 120,
};

/** @deprecated Use RELEASE_ATMOSPHERE_BRAND_RGB / NAVY — kept for call-site clarity. */
export const RELEASE_ATMOSPHERE_FALLBACK_RGB = RELEASE_ATMOSPHERE_BRAND_RGB;

export const RELEASE_ATMOSPHERE_BRAND_RESULT: AtmosphereResult = {
  rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB },
  mode: "brand",
};

/** Chromatic artwork normalisation (C4B.2 — stronger top personality). */
export const RELEASE_ATMOSPHERE_LIGHTNESS_MIN = 0.17;
export const RELEASE_ATMOSPHERE_LIGHTNESS_MAX = 0.34;
export const RELEASE_ATMOSPHERE_SATURATION_MIN = 0.35;
export const RELEASE_ATMOSPHERE_SATURATION_MAX = 0.72;
export const RELEASE_ATMOSPHERE_NAVY_BLEND = 0.12;

/** Neutral (pale/gray) atmosphere band. */
export const RELEASE_ATMOSPHERE_NEUTRAL_L_MIN = 0.16;
export const RELEASE_ATMOSPHERE_NEUTRAL_L_MAX = 0.24;
export const RELEASE_ATMOSPHERE_NEUTRAL_S_MIN = 0.1;
export const RELEASE_ATMOSPHERE_NEUTRAL_S_MAX = 0.28;
export const RELEASE_ATMOSPHERE_NEUTRAL_NAVY_BLEND = 0.28;
/** Cool blue-gray hue when source is effectively achromatic. */
export const RELEASE_ATMOSPHERE_NEUTRAL_COOL_HUE = 0.58;

/** Pixel thresholds. */
export const RELEASE_ATMOSPHERE_ALPHA_MIN = 16;
/** Soft near-white — still eligible for neutral path (not hard chromatic reject alone). */
export const RELEASE_ATMOSPHERE_NEAR_WHITE_L = 0.92;
export const RELEASE_ATMOSPHERE_NEAR_BLACK_L = 0.06;
export const RELEASE_ATMOSPHERE_GRAY_SAT_MAX = 0.14;
export const RELEASE_ATMOSPHERE_USEFUL_SAT_MIN = 0.16;
export const RELEASE_ATMOSPHERE_USEFUL_L_MIN = 0.12;
export const RELEASE_ATMOSPHERE_USEFUL_L_MAX = 0.82;
export const RELEASE_ATMOSPHERE_MIN_BUCKET_SHARE = 0.08;

const CACHE_MAX = 64;
const resultCache = new Map<string, AtmosphereResult>();
const inflight = new Map<string, Promise<AtmosphereResult>>();

export function releaseAtmosphereCssVarValue(rgb: AtmosphereRgb): string {
  return `${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)}`;
}

export function clearReleaseAtmosphereCacheForTests(): void {
  resultCache.clear();
  inflight.clear();
}

export function getReleaseAtmosphereCacheSizeForTests(): number {
  return resultCache.size;
}

/** Test-only: seed cache for synchronous bootstrap assertions. */
export function seedReleaseAtmosphereCacheForTests(
  artworkUrl: string,
  result: AtmosphereResult,
): void {
  const url = artworkUrl.trim();
  if (!url) return;
  cacheSet(url, { rgb: { ...result.rgb }, mode: result.mode });
}

/** Synchronous cache peek — no extraction. */
export function peekReleaseAtmosphereCache(
  artworkUrl: string | null | undefined,
): AtmosphereResult | null {
  if (typeof artworkUrl !== "string") return null;
  const url = artworkUrl.trim();
  if (!url) return null;
  const hit = resultCache.get(url);
  return hit ? { rgb: { ...hit.rgb }, mode: hit.mode } : null;
}

/**
 * First-paint bootstrap: brand if no URL; cached result if known; else brand pending.
 * `instant` — skip ::before opacity transition (cached artwork/neutral).
 */
export function bootstrapReleaseAtmosphere(
  artworkUrl: string | null | undefined,
): AtmosphereResult & { ready: boolean; instant: boolean } {
  if (typeof artworkUrl !== "string" || !artworkUrl.trim()) {
    return {
      rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB },
      mode: "brand",
      ready: true,
      instant: true,
    };
  }
  const cached = peekReleaseAtmosphereCache(artworkUrl);
  if (cached) {
    return {
      ...cached,
      ready: true,
      instant: cached.mode === "artwork" || cached.mode === "neutral",
    };
  }
  return {
    rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB },
    mode: "brand",
    ready: false,
    instant: false,
  };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      break;
    case gn:
      h = ((bn - rn) / d + 2) / 6;
      break;
    default:
      h = ((rn - gn) / d + 4) / 6;
      break;
  }
  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): AtmosphereRgb {
  if (s === 0) {
    const v = clampByte(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: clampByte(hue2rgb(p, q, h + 1 / 3) * 255),
    g: clampByte(hue2rgb(p, q, h) * 255),
    b: clampByte(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

export function isTransparentOrUnusablePixel(a: number): boolean {
  return a < RELEASE_ATMOSPHERE_ALPHA_MIN;
}

/** Chromatic path: reject near-white / near-black / gray. */
export function isRejectedAtmospherePixel(
  r: number,
  g: number,
  b: number,
  a: number,
): boolean {
  if (isTransparentOrUnusablePixel(a)) return true;
  const { s, l } = rgbToHsl(r, g, b);
  if (l >= RELEASE_ATMOSPHERE_NEAR_WHITE_L) return true;
  if (l <= RELEASE_ATMOSPHERE_NEAR_BLACK_L) return true;
  if (s <= RELEASE_ATMOSPHERE_GRAY_SAT_MAX) return true;
  return false;
}

export function isUsefulAtmospherePixel(
  r: number,
  g: number,
  b: number,
  a: number,
): boolean {
  if (isRejectedAtmospherePixel(r, g, b, a)) return false;
  const { s, l } = rgbToHsl(r, g, b);
  if (s < RELEASE_ATMOSPHERE_USEFUL_SAT_MIN) return false;
  if (l < RELEASE_ATMOSPHERE_USEFUL_L_MIN || l > RELEASE_ATMOSPHERE_USEFUL_L_MAX) {
    return false;
  }
  return true;
}

function bucketKey(h: number, s: number, l: number): string {
  const hueBucket = Math.floor((((h % 1) + 1) % 1) * 12);
  const satBucket = s < 0.35 ? 0 : s < 0.55 ? 1 : 2;
  const lightBucket = l < 0.35 ? 0 : l < 0.55 ? 1 : 2;
  return `${hueBucket}:${satBucket}:${lightBucket}`;
}

/**
 * Pure representative chromatic pick. Null → try neutral path.
 */
export function pickRepresentativeRgbFromRgba(
  data: Uint8ClampedArray | Uint8Array,
): AtmosphereRgb | null {
  type Acc = {
    weight: number;
    r: number;
    g: number;
    b: number;
    count: number;
  };
  const buckets = new Map<string, Acc>();
  let useful = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (!isUsefulAtmospherePixel(r, g, b, a)) continue;
    useful += 1;
    const hsl = rgbToHsl(r, g, b);
    const midL = 1 - Math.abs(hsl.l - 0.42) * 1.6;
    const weight = Math.max(0.15, hsl.s * Math.max(0.2, midL));
    const key = bucketKey(hsl.h, hsl.s, hsl.l);
    const prev = buckets.get(key);
    if (prev) {
      prev.weight += weight;
      prev.r += r * weight;
      prev.g += g * weight;
      prev.b += b * weight;
      prev.count += 1;
    } else {
      buckets.set(key, {
        weight,
        r: r * weight,
        g: g * weight,
        b: b * weight,
        count: 1,
      });
    }
  }

  if (useful === 0 || buckets.size === 0) return null;

  let best: Acc | null = null;
  for (const [, acc] of buckets) {
    const share = acc.count / useful;
    if (share < RELEASE_ATMOSPHERE_MIN_BUCKET_SHARE && buckets.size > 1) continue;
    if (!best || acc.weight > best.weight) best = acc;
  }
  if (!best) {
    for (const [, acc] of buckets) {
      if (!best || acc.weight > best.weight) best = acc;
    }
  }
  if (!best || best.weight <= 0) return null;
  return {
    r: clampByte(best.r / best.weight),
    g: clampByte(best.g / best.weight),
    b: clampByte(best.b / best.weight),
  };
}

/**
 * Average opaque pixels for pale/white/gray artwork (includes near-white).
 */
export function pickNeutralRgbFromRgba(
  data: Uint8ClampedArray | Uint8Array,
): AtmosphereRgb | null {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3]!;
    if (isTransparentOrUnusablePixel(a)) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const { l } = rgbToHsl(r, g, b);
    // Skip pure black voids; keep whites and mid grays.
    if (l <= RELEASE_ATMOSPHERE_NEAR_BLACK_L) continue;
    rSum += r;
    gSum += g;
    bSum += b;
    n += 1;
  }
  if (n < 4) return null;
  return {
    r: clampByte(rSum / n),
    g: clampByte(gSum / n),
    b: clampByte(bSum / n),
  };
}

export function normaliseAtmosphereRgb(raw: AtmosphereRgb): AtmosphereRgb {
  const hsl = rgbToHsl(raw.r, raw.g, raw.b);
  let s = clamp01(hsl.s);
  let l = clamp01(hsl.l);

  s = Math.max(
    RELEASE_ATMOSPHERE_SATURATION_MIN,
    Math.min(RELEASE_ATMOSPHERE_SATURATION_MAX, s),
  );
  l = Math.max(
    RELEASE_ATMOSPHERE_LIGHTNESS_MIN,
    Math.min(RELEASE_ATMOSPHERE_LIGHTNESS_MAX, l),
  );
  // Prefer a slightly richer mid — helps gold/amber stay vivid vs muddy.
  l = l * 0.88 + 0.24 * 0.12;
  s = Math.min(RELEASE_ATMOSPHERE_SATURATION_MAX, s * 1.04);

  const vivid = hslToRgb(hsl.h, s, l);
  const navy = RELEASE_ATMOSPHERE_NAVY_RGB;
  const blend = RELEASE_ATMOSPHERE_NAVY_BLEND;
  return {
    r: clampByte(vivid.r * (1 - blend) + navy.r * blend),
    g: clampByte(vivid.g * (1 - blend) + navy.g * blend),
    b: clampByte(vivid.b * (1 - blend) + navy.b * blend),
  };
}

/** Dark cool silver / blue-gray / muted tint from pale or grayscale source. */
export function normaliseNeutralAtmosphereRgb(raw: AtmosphereRgb): AtmosphereRgb {
  const hsl = rgbToHsl(raw.r, raw.g, raw.b);
  let h = hsl.h;
  let s = clamp01(hsl.s);
  if (s < 0.06) {
    h = RELEASE_ATMOSPHERE_NEUTRAL_COOL_HUE;
    s = 0.14;
  } else {
    s = Math.max(
      RELEASE_ATMOSPHERE_NEUTRAL_S_MIN,
      Math.min(RELEASE_ATMOSPHERE_NEUTRAL_S_MAX, s * 0.85 + 0.08),
    );
  }
  let l = Math.max(
    RELEASE_ATMOSPHERE_NEUTRAL_L_MIN,
    Math.min(RELEASE_ATMOSPHERE_NEUTRAL_L_MAX, 0.2),
  );
  // Retain a hint of source lightness bias without going bright.
  l = clamp01(l * 0.85 + Math.min(0.22, hsl.l * 0.12));

  const tone = hslToRgb(h, s, l);
  const navy = RELEASE_ATMOSPHERE_NAVY_RGB;
  const blend = RELEASE_ATMOSPHERE_NEUTRAL_NAVY_BLEND;
  return {
    r: clampByte(tone.r * (1 - blend) + navy.r * blend),
    g: clampByte(tone.g * (1 - blend) + navy.g * blend),
    b: clampByte(tone.b * (1 - blend) + navy.b * blend),
  };
}

export function atmosphereLightness01(rgb: AtmosphereRgb): number {
  return rgbToHsl(rgb.r, rgb.g, rgb.b).l;
}

export function atmosphereSaturation01(rgb: AtmosphereRgb): number {
  return rgbToHsl(rgb.r, rgb.g, rgb.b).s;
}

/** Pure pipeline: chromatic → neutral → brand. */
export function atmosphereResultFromRgba(
  data: Uint8ClampedArray | Uint8Array,
): AtmosphereResult {
  const chromatic = pickRepresentativeRgbFromRgba(data);
  if (chromatic) {
    return { rgb: normaliseAtmosphereRgb(chromatic), mode: "artwork" };
  }
  const neutral = pickNeutralRgbFromRgba(data);
  if (neutral) {
    return { rgb: normaliseNeutralAtmosphereRgb(neutral), mode: "neutral" };
  }
  return {
    rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB },
    mode: "brand",
  };
}

function extractFromImageElement(img: HTMLImageElement): AtmosphereResult {
  const size = Math.min(RELEASE_ATMOSPHERE_SAMPLE_MAX, RELEASE_ATMOSPHERE_SAMPLE_SIZE);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB }, mode: "brand" };
  }

  ctx.drawImage(img, 0, 0, size, size);
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, size, size);
  } catch {
    return { rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB }, mode: "brand" };
  }

  return atmosphereResultFromRgba(imageData.data);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("artwork load failed"));
    img.src = url;
  });
}

function cacheSet(url: string, result: AtmosphereResult): void {
  if (resultCache.size >= CACHE_MAX && !resultCache.has(url)) {
    const first = resultCache.keys().next().value;
    if (typeof first === "string") resultCache.delete(first);
  }
  resultCache.set(url, result);
}

/**
 * Resolve atmosphere for an artwork URL.
 * No URL → brand (no extraction). Failures → brand. Never throws.
 */
export async function resolveReleaseArtworkAtmosphere(
  artworkUrl: string | null | undefined,
): Promise<AtmosphereResult> {
  if (typeof artworkUrl !== "string") {
    return { rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB }, mode: "brand" };
  }
  const url = artworkUrl.trim();
  if (!url) {
    return { rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB }, mode: "brand" };
  }

  const cached = resultCache.get(url);
  if (cached) return { rgb: { ...cached.rgb }, mode: cached.mode };

  const pending = inflight.get(url);
  if (pending) return pending.then((r) => ({ rgb: { ...r.rgb }, mode: r.mode }));

  const work = (async (): Promise<AtmosphereResult> => {
    try {
      if (typeof document === "undefined") {
        const fb = { rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB }, mode: "brand" as const };
        cacheSet(url, fb);
        return fb;
      }
      const img = await loadImage(url);
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          /* optional */
        }
      }
      const result = extractFromImageElement(img);
      cacheSet(url, result);
      return result;
    } catch {
      const fb = { rgb: { ...RELEASE_ATMOSPHERE_BRAND_RGB }, mode: "brand" as const };
      cacheSet(url, fb);
      return fb;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, work);
  return work.then((r) => ({ rgb: { ...r.rgb }, mode: r.mode }));
}
