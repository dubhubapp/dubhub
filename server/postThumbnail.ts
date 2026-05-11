import fs from "fs";
import { probeDurationSeconds, runFfmpeg } from "./ffmpegVideo";

/** Mid-clip-ish seek time (seconds) for a stable frame; mirrors Home poster capture intent. */
export function thumbnailSeekSeconds(durationSec: number): number {
  const fallback = 0.25;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return fallback;
  if (durationSec > 2) {
    const mid = durationSec / 2;
    return Math.min(Math.max(mid, 1), durationSec - 1);
  }
  if (durationSec <= 0.15) {
    return durationSec / 2;
  }
  const mid = durationSec / 2;
  const edge = 0.05;
  return Math.min(Math.max(mid, edge), durationSec - edge);
}

/**
 * Extract one JPEG frame from a local video file using ffmpeg.
 * Caller is responsible for unlinking `outputJpegPath` after upload.
 */
export async function extractPostThumbnailJpeg(inputVideoPath: string, outputJpegPath: string): Promise<void> {
  let seekSec = 0.25;
  try {
    const d = await probeDurationSeconds(inputVideoPath);
    seekSec = thumbnailSeekSeconds(d);
  } catch {
    /* keep default seek */
  }

  await runFfmpeg([
    "-y",
    "-ss",
    String(seekSec),
    "-i",
    inputVideoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outputJpegPath,
  ]);

  if (!fs.existsSync(outputJpegPath)) {
    throw new Error("ffmpeg did not write thumbnail file");
  }
  const st = fs.statSync(outputJpegPath);
  if (st.size < 32) {
    throw new Error("thumbnail file too small");
  }
}
