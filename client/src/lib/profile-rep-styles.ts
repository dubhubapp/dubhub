function hexToRgbForGradient(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** WCAG-ish relative luminance (0–1) for genre-aware gradient stops. */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function mixTowardWhite(r: number, g: number, b: number, t: number) {
  return {
    r: Math.min(255, Math.round(r + (255 - r) * t)),
    g: Math.min(255, Math.round(g + (255 - g) * t)),
    b: Math.min(255, Math.round(b + (255 - b) * t)),
  };
}

/** Smooth horizontal gradient in a genre hue; used for profile rep progress fill. */
export function repProgressGradientFromGenreBg(bgHex: string): string {
  const t = hexToRgbForGradient(bgHex);
  if (!t) {
    return "linear-gradient(90deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,1) 45%, rgba(248,250,252,0.92) 100%)";
  }
  const { r, g, b } = t;
  const start = `rgb(${Math.round(r * 0.58)}, ${Math.round(g * 0.58)}, ${Math.round(b * 0.58)})`;
  const mid = bgHex;
  const end = `rgb(${Math.round(r + (255 - r) * 0.34)}, ${Math.round(g + (255 - g) * 0.34)}, ${Math.round(b + (255 - b) * 0.34)})`;
  return `linear-gradient(90deg, ${start} 0%, ${mid} 52%, ${end} 100%)`;
}

/**
 * Premium leaderboard fill: darker → canonical → soft light → brighter leading edge.
 * Tuned by luminance so House/Trance stay controlled and Dubstep/Other stay readable.
 * CSS-only — no glow, no motion.
 */
export function repProgressPremiumGradientFromGenreBg(bgHex: string): string {
  const t = hexToRgbForGradient(bgHex);
  if (!t) {
    return "linear-gradient(90deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.95) 52%, rgba(248,250,252,1) 88%, rgba(255,255,255,1) 100%)";
  }
  const { r, g, b } = t;
  const lum = relativeLuminance(r, g, b);
  // Bright genres (House/Trance): softer darken + restrained edge. Dark (Dubstep/Other): deeper start + clearer edge.
  const startMul = lum > 0.52 ? 0.72 : lum > 0.28 ? 0.58 : 0.5;
  const softMix = lum > 0.52 ? 0.18 : lum > 0.28 ? 0.28 : 0.34;
  const edgeMix = lum > 0.52 ? 0.32 : lum > 0.28 ? 0.42 : 0.5;
  const start = `rgb(${Math.round(r * startMul)}, ${Math.round(g * startMul)}, ${Math.round(b * startMul)})`;
  const soft = mixTowardWhite(r, g, b, softMix);
  const edge = mixTowardWhite(r, g, b, edgeMix);
  return `linear-gradient(90deg, ${start} 0%, ${bgHex} 48%, rgb(${soft.r},${soft.g},${soft.b}) 86%, rgb(${edge.r},${edge.g},${edge.b}) 100%)`;
}

export function whiteRepProgressGradient(): string {
  return "linear-gradient(90deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,1) 50%, rgba(241,245,249,0.95) 100%)";
}

/** Base fill colour under the rep gradient — aligned with leaderboard progress bars. */
export function repProgressBarBaseColor(hexColor: string | null | undefined): string {
  const h = (hexColor ?? "").replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) return "#ffffff";
  return `#${h}`;
}

/** Soft genre-tinted glow on the rep fill — profile overview; leaderboard no longer uses this. */
export function repGenreGlowShadow(hexColor: string | null | undefined): string {
  const h = (hexColor ?? "").replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) {
    return "0 0 10px rgba(255,255,255,0.35)";
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `0 0 12px rgba(${r}, ${g}, ${b}, 0.45)`;
}
