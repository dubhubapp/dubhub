/**
 * Client-side peak extraction for trim waveform. Used when WaveSurfer's
 * fetch + decodeAudioData path yields an unusable canvas (common gaps on some
 * iPhone camera-roll multiplexed files in WebKit).
 */

import type WaveSurfer from "wavesurfer.js";

export type TrimMonoPeaksResult = {
  /** Normalized 0..1 peak envelope, one value per bar. */
  peaks: number[];
  durationSec: number;
};

/** Detect near-silent / missing decode — real clips should exceed this easily. */
const FLAT_PEAK_THRESHOLD = 1e-4;

function downsampleMonoMaxAbs(channel: Float32Array, barCount: number): number[] {
  const blocks = Math.max(32, Math.min(barCount, Math.max(32, Math.floor(channel.length / 48))));
  const samplesPerBlock = channel.length / blocks;
  const raw: number[] = [];
  for (let i = 0; i < blocks; i++) {
    const start = Math.floor(i * samplesPerBlock);
    const end = Math.floor((i + 1) * samplesPerBlock);
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, Math.abs(channel[j]));
    raw.push(max);
  }
  let peak = 0;
  for (const p of raw) peak = Math.max(peak, p);
  if (peak < 1e-10) return raw.map(() => 0);
  return raw.map((p) => p / peak);
}

/**
 * Fetch URL and decode with a default sample-rate AudioContext (not WaveSurfer's 8000 Hz constructor),
 * which is slightly more reliable for some MP4/AAC muxes in Safari.
 */
export async function tryDecodeMediaUrlToMonoPeaks(
  url: string,
  barCount: number,
  timeoutMs: number,
  init?: RequestInit,
): Promise<TrimMonoPeaksResult | null> {
  const ctrl = new AbortController();
  const tid = window.setTimeout(() => ctrl.abort(), timeoutMs);
  if (init?.signal) {
    if (init.signal.aborted) {
      window.clearTimeout(tid);
      return null;
    }
    init.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ctx = new AudioContext();
    let audio: AudioBuffer;
    try {
      audio = await ctx.decodeAudioData(buf.slice(0));
    } finally {
      void ctx.close();
    }
    if (!audio.length || audio.numberOfChannels < 1) return null;

    let best = downsampleMonoMaxAbs(audio.getChannelData(0), barCount);
    let maxBest = Math.max(...best);
    for (let c = 1; c < audio.numberOfChannels; c++) {
      const cand = downsampleMonoMaxAbs(audio.getChannelData(c), barCount);
      const m = Math.max(...cand);
      if (m > maxBest) {
        maxBest = m;
        best = cand;
      }
    }
    if (maxBest < FLAT_PEAK_THRESHOLD) return null;

    const durationSec = audio.duration;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
    return { peaks: best, durationSec };
  } catch {
    return null;
  } finally {
    window.clearTimeout(tid);
  }
}

export function isFlatAudioBuffer(buffer: AudioBuffer | null): boolean {
  if (!buffer || buffer.length === 0 || buffer.numberOfChannels < 1) return true;
  let max = 0;
  const total = buffer.length;
  const step = Math.max(1, Math.floor(total / 12_000));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i += step) {
      max = Math.max(max, Math.abs(ch[i]));
    }
  }
  return max < FLAT_PEAK_THRESHOLD;
}

/**
 * Deterministic pseudo-peaks for WaveSurfer's bar renderer when decode is flat/missing.
 * Draws through the same canvas path as real audio — no separate DOM “synthetic strip”.
 */
export function neutralWaveformPeaksNormalized(barCount: number, seedKey: string): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedKey.length; i++) {
    h ^= seedKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.max(256, Math.min(8192, barCount));
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= i * 374761393;
    h = Math.imul(h, 2654435761);
    const u = (h >>> 0) / 0x100000000;
    const wave = Math.sin(i * 0.11 + u * 6.283) * 0.5 + 0.5;
    const amp = 0.22 + u * 0.72;
    raw.push(wave * amp);
  }
  const mx = Math.max(...raw, 1e-6);
  return raw.map((x) => x / mx);
}

/**
 * WaveSurfer progress uses `currentTime / getDuration()`. On iPhone camera-roll,
 * `HTMLMediaElement.duration` is often NaN/0 while `seekable` is correct — then
 * `getDuration()` can be wrong and `renderProgress` gets NaN (no playhead).
 * Re-stamp decoded peaks with the authoritative media timeline length.
 */
export function realignWaveSurferDecodedDuration(ws: WaveSurfer, targetDurationSec: number): boolean {
  if (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0) return false;
  const cur = ws.getDuration();
  if (Number.isFinite(cur) && cur > 0 && Math.abs(cur - targetDurationSec) < 0.08) {
    return false;
  }
  try {
    const decoded = ws.getDecodedData();
    if (!decoded) return false;
    const peaks = ws.exportPeaks({ maxLength: 8192 });
    ws.setOptions({ peaks, duration: targetDurationSec });
    return true;
  } catch {
    return false;
  }
}

/** WaveSurfer keeps `updateProgress` internal; needed after duration realign / trim edits. */
export function wavesurferRepaintPlayhead(ws: WaveSurfer, timeSeconds?: number): void {
  const w = ws as unknown as { updateProgress?: (t?: number) => number };
  w.updateProgress?.(timeSeconds);
}
