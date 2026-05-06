import { execFile, spawn } from "child_process";
import fs from "fs";

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

let ffprobeChecked = false;
let ffprobeAvailable = false;

type FfprobeRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

function parsePositiveDuration(input: unknown): number | null {
  const v = typeof input === "number" ? input : parseFloat(String(input ?? "").trim());
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function safeFileSize(filePath: string): number | null {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

function runFfprobe(args: string[]): Promise<FfprobeRunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";
    let resolved = false;

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      if (resolved) return;
      reject(err);
    });
    proc.on("close", (code, signal) => {
      resolved = true;
      resolve({ stdout, stderr, exitCode: code, signal });
    });
  });
}

export async function ensureFfprobeAvailable(): Promise<void> {
  if (ffprobeChecked) {
    if (!ffprobeAvailable) {
      throw new Error("ffprobe is unavailable in PATH");
    }
    return;
  }
  ffprobeChecked = true;
  await new Promise<void>((resolve, reject) => {
    execFile("ffprobe", ["-version"], (err, stdout, stderr) => {
      if (err) {
        ffprobeAvailable = false;
        const details = {
          message: err.message,
          code: (err as NodeJS.ErrnoException).code ?? null,
          errno: (err as NodeJS.ErrnoException).errno ?? null,
          stdout: stdout?.trim().slice(0, 400) || null,
          stderr: stderr?.trim().slice(0, 400) || null,
        };
        console.error("[ffprobe] missing or not executable", details);
        reject(new Error(`[ffprobe] missing or not executable: ${details.message}`));
        return;
      }
      ffprobeAvailable = true;
      const firstLine = stdout.trim().split("\n")[0] || "unknown version";
      console.log("[ffprobe] available:", firstLine);
      resolve();
    });
  });
}

export async function probeDurationSeconds(filePath: string): Promise<number> {
  await ensureFfprobeAvailable();
  const fileSize = safeFileSize(filePath);

  let firstAttempt: FfprobeRunResult;
  try {
    firstAttempt = await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error("[ffprobe] format duration probe failed to start", {
      filePath,
      fileSize,
      message: e.message,
      code: e.code ?? null,
      errno: e.errno ?? null,
    });
    throw err;
  }

  const formatDuration = parsePositiveDuration(firstAttempt.stdout);
  if (firstAttempt.exitCode === 0 && formatDuration != null) {
    return formatDuration;
  }

  let jsonAttempt: FfprobeRunResult;
  try {
    jsonAttempt = await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=duration",
      "-of",
      "json",
      filePath,
    ]);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error("[ffprobe] json duration probe failed to start", {
      filePath,
      fileSize,
      message: e.message,
      code: e.code ?? null,
      errno: e.errno ?? null,
      firstAttempt,
    });
    throw err;
  }

  let streamOrFormatDuration: number | null = null;
  if (jsonAttempt.exitCode === 0) {
    try {
      const parsed = JSON.parse(jsonAttempt.stdout) as {
        format?: { duration?: unknown };
        streams?: Array<{ duration?: unknown }>;
      };
      streamOrFormatDuration =
        parsePositiveDuration(parsed.format?.duration) ??
        parsed.streams?.map((s) => parsePositiveDuration(s.duration)).find((v) => v != null) ??
        null;
    } catch {
      streamOrFormatDuration = null;
    }
  }

  if (streamOrFormatDuration != null) {
    return streamOrFormatDuration;
  }

  const diagnostic = {
    filePath,
    fileSize,
    firstAttempt: {
      exitCode: firstAttempt.exitCode,
      signal: firstAttempt.signal,
      stdout: firstAttempt.stdout.trim().slice(0, 1000),
      stderr: firstAttempt.stderr.trim().slice(0, 2000),
    },
    jsonAttempt: {
      exitCode: jsonAttempt.exitCode,
      signal: jsonAttempt.signal,
      stdout: jsonAttempt.stdout.trim().slice(0, 2000),
      stderr: jsonAttempt.stderr.trim().slice(0, 2000),
    },
  };
  console.error("[ffprobe] unable to derive finite positive duration", diagnostic);
  throw new Error("Invalid duration from ffprobe");
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
