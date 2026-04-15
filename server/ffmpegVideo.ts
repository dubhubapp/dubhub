import { execFile, spawn } from "child_process";

/** Fit inside 1920×1920 box; keeps vertical/horizontal aspect ratio, no stretch. */
export const FEED_SCALE_FILTER =
  "scale=w=1920:h=1920:force_original_aspect_ratio=decrease";

const BASE_ENCODE_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-crf",
  "26",
  "-profile:v",
  "high",
  "-level",
  "4.1",
  "-pix_fmt",
  "yuv420p",
  "-vf",
  FEED_SCALE_FILTER,
  "-g",
  "60",
  "-keyint_min",
  "30",
  "-sc_threshold",
  "0",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
] as const;

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn("ffmpeg", args);
    let stderr = "";
    ffmpegProcess.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    ffmpegProcess.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-4000)}`));
    });
    ffmpegProcess.on("error", (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}

export function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        const v = parseFloat(stdout.trim());
        if (!Number.isFinite(v)) {
          reject(new Error("Invalid duration from ffprobe"));
          return;
        }
        resolve(v);
      },
    );
  });
}

export function buildCompressOnlyArgs(inputPath: string, outputPath: string): string[] {
  return ["-y", "-i", inputPath, ...BASE_ENCODE_ARGS, outputPath];
}

export function buildTrimCompressArgs(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number,
): string[] {
  return [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    inputPath,
    "-t",
    String(durationSec),
    ...BASE_ENCODE_ARGS,
    outputPath,
  ];
}
