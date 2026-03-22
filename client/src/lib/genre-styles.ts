import type { CSSProperties } from "react";

/**
 * Single source of truth for genre labels and colours — keep in sync with GenreFilter UI.
 */
export type GenreEntry = {
  id: string;
  label: string;
  /** Tailwind text colour class when used on the genre background */
  textClass: string;
  bgColor: string;
};

export const GENRE_ENTRIES: readonly GenreEntry[] = [
  { id: "dnb", label: "DnB", textClass: "text-white", bgColor: "#8f57b3" },
  { id: "ukg", label: "UKG", textClass: "text-white", bgColor: "#77c961" },
  { id: "dubstep", label: "Dubstep", textClass: "text-white", bgColor: "#b0271d" },
  { id: "bassline", label: "Bassline", textClass: "text-white", bgColor: "#3c72f5" },
  { id: "house", label: "House", textClass: "text-black", bgColor: "#fdb436" },
  { id: "techno", label: "Techno", textClass: "text-white", bgColor: "#e882cf" },
  { id: "trance", label: "Trance", textClass: "text-black", bgColor: "#93e1de" },
  { id: "other", label: "Other", textClass: "text-white", bgColor: "#7e7e7e" },
] as const;

const UNKNOWN_BG = "#7e7e7e";

export function getGenreLabel(genreId: string): string {
  return GENRE_ENTRIES.find((g) => g.id === genreId)?.label ?? "Unknown";
}

/** Map stored genre (e.g. "DnB", "dnb") to canonical id. */
export function resolveGenreId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  if (GENRE_ENTRIES.some((g) => g.id === key)) return key;
  const byLabel = GENRE_ENTRIES.find((g) => g.label.toLowerCase() === key);
  return byLabel?.id ?? null;
}

export function getGenreChipStyle(raw: string | null | undefined): {
  label: string;
  bgColor: string;
  textClass: string;
} {
  const id = resolveGenreId(raw);
  if (id) {
    const g = GENRE_ENTRIES.find((e) => e.id === id)!;
    return { label: g.label, bgColor: g.bgColor, textClass: g.textClass };
  }
  const display = raw?.trim();
  if (display) {
    return { label: display, bgColor: UNKNOWN_BG, textClass: "text-white" };
  }
  return { label: "Unknown", bgColor: UNKNOWN_BG, textClass: "text-white" };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) {
    return { r: 126, g: 126, b: 126 };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** WCAG relative luminance of sRGB colour (0–1). */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Lighter tint in the same hue (toward white) — used for pill text on every genre. */
function mixTowardWhite(r: number, g: number, b: number, t: number) {
  return {
    r: Math.round(r + (255 - r) * t),
    g: Math.round(g + (255 - g) * t),
    b: Math.round(b + (255 - b) * t),
  };
}

/**
 * One recipe for every genre: hue varies, structure is identical (tinted fill, same-hue glow,
 * lighter same-hue text). `textClass` is ignored for rendering — filter UI may still use it.
 */
export function getGenreGlowPillStyle(bgColor: string, _textClass: string): CSSProperties {
  const { r, g, b } = hexToRgb(bgColor);
  const lum = relativeLuminance(r, g, b);

  /** Slightly deepen very bright brand hues so the fill stays saturated (not washed grey) on video. */
  const depth = lum > 0.52 ? 0.88 : lum > 0.38 ? 0.94 : 1;
  const br = Math.min(255, Math.round(r * depth));
  const bg = Math.min(255, Math.round(g * depth));
  const bb = Math.min(255, Math.round(b * depth));

  const topA = 0.52;
  const botA = 0.4;
  /** Slightly more toward white on bright hues so text stays readable on the tinted fill. */
  const textMix = lum > 0.52 ? 0.58 : lum > 0.35 ? 0.5 : 0.48;
  const text = mixTowardWhite(br, bg, bb, textMix);

  const borderR = Math.min(255, Math.round(br * 1.08));
  const borderG = Math.min(255, Math.round(bg * 1.08));
  const borderB = Math.min(255, Math.round(bb * 1.08));

  const shadow = `
    0 0 0 1px rgba(255,255,255,0.1),
    0 0 14px rgba(${r},${g},${b},0.68),
    0 0 30px rgba(${r},${g},${b},0.42),
    0 0 48px rgba(${r},${g},${b},0.18),
    inset 0 1px 0 rgba(255,255,255,0.2)
  `
    .replace(/\s+/g, " ")
    .trim();

  return {
    color: `rgb(${text.r},${text.g},${text.b})`,
    fontWeight: 600,
    background: `linear-gradient(180deg, rgba(${br},${bg},${bb},${topA}), rgba(${Math.round(br * 0.82)},${Math.round(bg * 0.82)},${Math.round(bb * 0.82)},${botA}))`,
    border: `1px solid rgba(${borderR},${borderG},${borderB},0.55)`,
    boxShadow: shadow,
    textShadow: `
      0 0 10px rgba(${r},${g},${b},0.55),
      0 0 18px rgba(${r},${g},${b},0.25),
      0 1px 2px rgba(0,0,0,0.45)
    `
      .replace(/\s+/g, " ")
      .trim(),
  };
}
