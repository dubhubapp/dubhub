function hexToRgbForGradient(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Smooth horizontal gradient in a genre hue; used for rep progress fill. */
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

export function whiteRepProgressGradient(): string {
  return "linear-gradient(90deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,1) 50%, rgba(241,245,249,0.95) 100%)";
}

/** Base fill colour under the rep gradient — aligned with leaderboard progress bars. */
export function repProgressBarBaseColor(hexColor: string | null | undefined): string {
  const h = (hexColor ?? "").replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) return "#ffffff";
  return `#${h}`;
}

/** Soft genre-tinted glow on the rep fill — aligned with leaderboard progress bars. */
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
