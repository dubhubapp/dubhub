/**
 * WaveSurfer v7 mounts canvases inside a closed shadow root. On some iPhone camera-roll
 * clips the decode path completes but nothing visible is painted — detect that here.
 */

const LUMINANCE_SPREAD_THRESHOLD = 7;

function sampleCanvasContrast(canvas: HTMLCanvasElement): number | null {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 4 || h < 4) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const sw = Math.min(96, w - 2);
  const sh = Math.min(Math.max(8, Math.floor(h * 0.55)), h - 2);
  const sx = Math.floor((w - sw) / 2);
  const sy = Math.floor((h - sh) / 2);
  let data: ImageData;
  try {
    data = ctx.getImageData(sx, sy, sw, sh);
  } catch {
    return null;
  }
  const p = data.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < p.length; i += 4) {
    const lum = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
    min = Math.min(min, lum);
    max = Math.max(max, lum);
  }
  return max - min;
}

/**
 * Returns true when WaveSurfer’s waveform canvases show no meaningful paint
 * (blank / flat / missing), so a matched light-DOM fallback should be used.
 */
export function isWaveSurferWaveformCanvasVisuallyBlank(waveformContainer: HTMLElement | null): boolean {
  if (!waveformContainer) return true;
  const host = waveformContainer.firstElementChild as HTMLElement | null;
  const root = host?.shadowRoot;
  if (!root) return true;
  const canvases = root.querySelectorAll("canvas");
  if (canvases.length === 0) return true;
  for (const canvas of canvases) {
    const spread = sampleCanvasContrast(canvas);
    if (spread == null) return true;
    if (spread >= LUMINANCE_SPREAD_THRESHOLD) return false;
  }
  return true;
}
