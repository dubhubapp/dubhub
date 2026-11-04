/**
 * Pure Canvas wave math + draw helpers for Artist Tools paywall décor.
 * No React. Continuous travelling-wave deformation (no CSS path transforms).
 */

export const PAYWALL_SOUNDWAVE_VIEW_W = 390;
export const PAYWALL_SOUNDWAVE_VIEW_H = 220;
export const PAYWALL_SOUNDWAVE_CONTOUR_COUNT = 10;
/** Target cadence — rAF still used; we skip frames to ~30fps. */
export const PAYWALL_SOUNDWAVE_TARGET_FPS = 30;
export const PAYWALL_SOUNDWAVE_FRAME_MS = 1000 / PAYWALL_SOUNDWAVE_TARGET_FPS;
/** Cap backing-store density for WKWebView cost. */
export const PAYWALL_SOUNDWAVE_DPR_CAP = 2;

/** Pass 1 static SVG path data — fallback artwork. */
export const PAYWALL_SOUNDWAVE_STATIC_PATHS = [
  "M 420 -8 C 348 18 292 42 248 72 C 198 108 152 148 96 178 C 58 198 22 214 -12 226",
  "M 428 6 C 356 32 300 56 256 86 C 206 122 160 160 104 190 C 66 210 28 224 -8 236",
  "M 436 20 C 364 46 308 70 264 100 C 214 136 168 172 112 202 C 74 220 36 234 0 246",
  "M 444 34 C 372 60 316 84 272 114 C 222 150 176 184 120 214 C 82 232 44 244 8 256",
  "M 452 48 C 380 74 324 98 280 128 C 230 164 184 196 128 226 C 90 242 52 254 16 266",
  "M 460 62 C 388 88 332 112 288 142 C 238 178 192 208 136 238 C 98 254 60 264 24 276",
  "M 468 76 C 396 102 340 126 296 156 C 246 192 200 220 144 250 C 106 264 68 274 32 286",
  "M 476 90 C 404 116 348 140 304 170 C 254 206 208 232 152 262 C 114 276 76 284 40 296",
  "M 484 104 C 412 130 356 154 312 184 C 262 220 216 244 160 274 C 122 286 84 294 48 306",
  "M 492 118 C 420 144 364 168 320 198 C 270 234 224 256 168 286 C 130 298 92 304 56 316",
] as const;

export type SoundwavePoint = { x: number; y: number };

/**
 * Baseline contour matching Pass 1 diagonal composition (viewBox space).
 * `u` ∈ [0, 1] travels upper-right → lower-left.
 */
export function paywallSoundwaveBaseline(
  contourIndex: number,
  u: number,
): SoundwavePoint {
  const i = contourIndex;
  const t = Math.min(1, Math.max(0, u));
  const startX = 420;
  const startY = -8 + i * 14;
  const endX = -12 + i * 6.8;
  const endY = 226 + i * 9;
  // Soft quadratic bow (organic, not equaliser spikes).
  const ctrlX = startX + (endX - startX) * 0.42 - 18;
  const ctrlY = startY + (endY - startY) * 0.38 + 22;
  const omt = 1 - t;
  return {
    x: omt * omt * startX + 2 * omt * t * ctrlX + t * t * endX,
    y: omt * omt * startY + 2 * omt * t * ctrlY + t * t * endY,
  };
}

/**
 * Travelling-wave offset (px in viewBox space) along the local normal.
 * Continuous in `timeSec` — no loop keyframe reset.
 */
export function paywallSoundwaveDeform(
  along: number,
  contourIndex: number,
  timeSec: number,
): number {
  const phaseShare = contourIndex * 0.11;
  const primary =
    5.0 * Math.sin(0.019 * along - 1.05 * timeSec + phaseShare);
  const secondary =
    1.6 * Math.sin(0.043 * along - 0.62 * timeSec + 1.7 + phaseShare * 0.5);
  return primary + secondary;
}

export function paywallSoundwaveSampleContour(
  contourIndex: number,
  timeSec: number,
  samples = 56,
): SoundwavePoint[] {
  const pts: SoundwavePoint[] = [];
  let prev: SoundwavePoint | null = null;
  let along = 0;
  for (let s = 0; s <= samples; s++) {
    const u = s / samples;
    const base = paywallSoundwaveBaseline(contourIndex, u);
    if (prev) {
      const dx = base.x - prev.x;
      const dy = base.y - prev.y;
      along += Math.hypot(dx, dy);
    }
    // Approximate tangent from neighbouring baseline samples.
    const u0 = Math.max(0, u - 0.01);
    const u1 = Math.min(1, u + 0.01);
    const a = paywallSoundwaveBaseline(contourIndex, u0);
    const b = paywallSoundwaveBaseline(contourIndex, u1);
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const d = paywallSoundwaveDeform(along, contourIndex, timeSec);
    pts.push({ x: base.x + nx * d, y: base.y + ny * d });
    prev = base;
  }
  return pts;
}

export function resolvePaywallSoundwaveStrokeColor(color: string): string {
  const c = color.trim();
  if (!c || c === "transparent") return "rgba(158, 176, 204, 0.16)";
  return c;
}

/** Map viewBox → CSS pixel canvas space (object-fit: cover from top-right). */
export function mapPaywallSoundwaveViewToCanvas(
  pt: SoundwavePoint,
  cssW: number,
  cssH: number,
): SoundwavePoint {
  const scale = Math.max(cssW / PAYWALL_SOUNDWAVE_VIEW_W, cssH / PAYWALL_SOUNDWAVE_VIEW_H);
  const drawW = PAYWALL_SOUNDWAVE_VIEW_W * scale;
  const drawH = PAYWALL_SOUNDWAVE_VIEW_H * scale;
  // xMaxYMin slice → align right + top.
  const ox = cssW - drawW;
  const oy = 0;
  return {
    x: ox + pt.x * scale,
    y: oy + pt.y * scale,
  };
}

export function createPaywallSoundwaveFadeGradient(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  strokeColor: string,
): CanvasGradient {
  const grad = ctx.createLinearGradient(cssW, 0, cssW * 0.08, cssH * 0.92);
  // Approximate Pass 1 SVG stop opacities using stroke currentColor.
  grad.addColorStop(0, strokeColor);
  grad.addColorStop(0.42, withCanvasAlpha(strokeColor, 0.55));
  grad.addColorStop(0.78, withCanvasAlpha(strokeColor, 0.18));
  grad.addColorStop(1, withCanvasAlpha(strokeColor, 0));
  return grad;
}

function withCanvasAlpha(color: string, alpha: number): string {
  // rgb/rgba/hex/#rrggbbaa — prefer canvas-friendly rgba when parseable.
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    color,
  );
  if (rgb) {
    const base = Number(rgb[4] ?? 1);
    return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${base * alpha})`;
  }
  // Fallback: globalAlpha is set by caller path; return color unchanged.
  return color;
}

export function drawPaywallSoundwaveFrame(
  ctx: CanvasRenderingContext2D,
  args: {
    cssW: number;
    cssH: number;
    dpr: number;
    timeSec: number;
    strokeColor: string;
    /** When true, deform amplitude is zero (static baseline). */
    staticPose?: boolean;
  },
): void {
  const { cssW, cssH, dpr, timeSec, strokeColor, staticPose } = args;
  if (cssW <= 0 || cssH <= 0) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.lineWidth = 0.95;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = createPaywallSoundwaveFadeGradient(
    ctx,
    cssW,
    cssH,
    resolvePaywallSoundwaveStrokeColor(strokeColor),
  );

  const t = staticPose ? 0 : timeSec;
  for (let i = 0; i < PAYWALL_SOUNDWAVE_CONTOUR_COUNT; i++) {
    const samples = paywallSoundwaveSampleContour(
      i,
      staticPose ? 0 : t,
    );
    // Zero deform for true static: sample at t=0 still has phase offset —
    // when staticPose, draw undeformed baseline.
    ctx.beginPath();
    for (let s = 0; s < samples.length; s++) {
      const raw = staticPose
        ? paywallSoundwaveBaseline(i, s / (samples.length - 1))
        : samples[s]!;
      const p = mapPaywallSoundwaveViewToCanvas(raw, cssW, cssH);
      if (s === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

export function prefersPaywallSoundwaveReducedMotion(
  matchMediaFn: ((query: string) => MediaQueryList) | undefined = typeof window !==
  "undefined"
    ? window.matchMedia.bind(window)
    : undefined,
): boolean {
  if (typeof matchMediaFn !== "function") return false;
  try {
    return matchMediaFn("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
