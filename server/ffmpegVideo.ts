import { execFile, spawn } from "child_process";
import fs from "fs";

/**
 * Fit inside 1920×1920 without ever enlarging: each side is capped by source (min(iw,1920)) so
 * 720×1280 stays 720×1280; 2160×3840 still downscales to 1080×1920.
 */
export const FEED_SCALE_FILTER =
  "scale=w=min(iw\\,1920):h=min(ih\\,1920):force_original_aspect_ratio=decrease";

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
    ffmpegProcess.on("close", (code, signal) => {
      if (code === 0) resolve();
      else if (code == null)
        reject(
          new Error(
            `FFmpeg stopped without exit code (signal ${signal ?? "unknown"}): ${stderr.slice(-4000)}`,
          ),
        );
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

/** Match feed/native scale cap (~1080p class); avoids pointless server re-encode for client-trimmed H.264. */
const PRETRIMMED_SKIP_MAX_LONG_EDGE_PX = 1920;

/** When ffprobe reports per-stream `bit_rate` on the video stream, re-encode above this (bps). */
const PRETRIMMED_SKIP_MAX_VIDEO_BITRATE = 8_000_000;

/**
 * Whole-file container average: (fileSizeBytes * 8) / durationSec.
 * Higher than {@link PRETRIMMED_SKIP_MAX_VIDEO_BITRATE} so normal 1080p iPhone trims skip Railway transcode;
 * capped (~15 Mbps) to limit beta feed egress/storage vs a fully permissive container ceiling.
 */
const PRETRIMMED_SKIP_MAX_AVG_BITS_PER_SEC = 15_000_000;

export type PretrimmedCompressSkipReason =
  | "probe_failed"
  | "not_mp4_like"
  | "not_h264_video"
  | "audio_present_not_aac"
  | "resolution_too_large"
  | "video_bitrate_too_high"
  | "file_average_bitrate_too_high"
  | "pretrimmed_h264_aac_ok";

export type PretrimmedCompressSkipContext = {
  durationSec: number;
  fileSizeBytes: number;
};

export type PretrimmedCompressSkipProbeDetails = {
  durationSec: number | null;
  fileSizeBytes: number | null;
  avgBitsPerSec: number | null;
  maxAvgBitsPerSec: number;
  videoBitRate: number | null;
  maxVideoBitrate: number;
};

export type PretrimmedCompressSkipResult = {
  skip: boolean;
  reason: PretrimmedCompressSkipReason;
  probeDetails: PretrimmedCompressSkipProbeDetails;
};

type StreamProbe = {
  codec_type?: string;
  codec_name?: string;
  width?: unknown;
  height?: unknown;
  bit_rate?: unknown;
};

function computeContainerAvgBitsPerSec(ctx?: PretrimmedCompressSkipContext): number | null {
  if (ctx == null) return null;
  const d = ctx.durationSec;
  const sz = ctx.fileSizeBytes;
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(sz) || sz <= 0) return null;
  return (sz * 8) / d;
}

function baseProbeDetails(ctx?: PretrimmedCompressSkipContext): PretrimmedCompressSkipProbeDetails {
  return {
    durationSec:
      ctx != null && Number.isFinite(ctx.durationSec) && ctx.durationSec > 0 ? ctx.durationSec : null,
    fileSizeBytes:
      ctx != null && Number.isFinite(ctx.fileSizeBytes) && ctx.fileSizeBytes > 0
        ? ctx.fileSizeBytes
        : null,
    avgBitsPerSec: computeContainerAvgBitsPerSec(ctx),
    maxAvgBitsPerSec: PRETRIMMED_SKIP_MAX_AVG_BITS_PER_SEC,
    videoBitRate: null,
    maxVideoBitrate: PRETRIMMED_SKIP_MAX_VIDEO_BITRATE,
  };
}

function parseVideoStreamBitrate(v: StreamProbe): number | null {
  const brRaw = v.bit_rate;
  if (brRaw == null || String(brRaw).trim() === "") return null;
  const parsedBr = Number.parseInt(String(brRaw).trim(), 10);
  return Number.isFinite(parsedBr) ? parsedBr : null;
}

function logPretrimmedCompressSkipProbe(
  inputPath: string,
  skip: boolean,
  reason: PretrimmedCompressSkipReason,
  probeDetails: PretrimmedCompressSkipProbeDetails,
): void {
  const inputFile =
    inputPath.includes("/") || inputPath.includes("\\")
      ? inputPath.replace(/^.*[/\\]/, "")
      : inputPath;
  console.log("[pretrimmed_compress_skip]", {
    inputFile,
    skip,
    reason,
    durationSec: probeDetails.durationSec,
    fileSizeBytes: probeDetails.fileSizeBytes,
    avgBitsPerSec: probeDetails.avgBitsPerSec,
    maxAvgBitsPerSec: probeDetails.maxAvgBitsPerSec,
    videoBitRate: probeDetails.videoBitRate,
    maxVideoBitrate: probeDetails.maxVideoBitrate,
  });
}

export async function probePretrimmedCompressSkip(
  inputPath: string,
  ctx?: PretrimmedCompressSkipContext,
): Promise<PretrimmedCompressSkipResult> {
  await ensureFfprobeAvailable();
  let probe: FfprobeRunResult;
  try {
    probe = await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,bit_rate",
      "-of",
      "json",
      inputPath,
    ]);
  } catch {
    const probeDetails = baseProbeDetails(ctx);
    logPretrimmedCompressSkipProbe(inputPath, false, "probe_failed", probeDetails);
    return { skip: false, reason: "probe_failed", probeDetails };
  }

  if (probe.exitCode !== 0 || !probe.stdout.trim()) {
    const probeDetails = baseProbeDetails(ctx);
    logPretrimmedCompressSkipProbe(inputPath, false, "probe_failed", probeDetails);
    return { skip: false, reason: "probe_failed", probeDetails };
  }

  let streams: StreamProbe[];
  try {
    streams = (
      JSON.parse(probe.stdout.trim()) as {
        streams?: StreamProbe[];
      }
    ).streams ?? [];
  } catch {
    const probeDetails = baseProbeDetails(ctx);
    logPretrimmedCompressSkipProbe(inputPath, false, "probe_failed", probeDetails);
    return { skip: false, reason: "probe_failed", probeDetails };
  }

  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");

  const details = baseProbeDetails(ctx);
  if (v) {
    details.videoBitRate = parseVideoStreamBitrate(v);
  }

  if (!v || String(v.codec_name).toLowerCase() !== "h264") {
    logPretrimmedCompressSkipProbe(inputPath, false, "not_h264_video", details);
    return { skip: false, reason: "not_h264_video", probeDetails: details };
  }

  const w = Number(v.width);
  const h = Number(v.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    logPretrimmedCompressSkipProbe(inputPath, false, "probe_failed", details);
    return { skip: false, reason: "probe_failed", probeDetails: details };
  }

  if (Math.max(w, h) > PRETRIMMED_SKIP_MAX_LONG_EDGE_PX) {
    logPretrimmedCompressSkipProbe(inputPath, false, "resolution_too_large", details);
    return { skip: false, reason: "resolution_too_large", probeDetails: details };
  }

  if (
    details.avgBitsPerSec != null &&
    details.avgBitsPerSec > PRETRIMMED_SKIP_MAX_AVG_BITS_PER_SEC
  ) {
    logPretrimmedCompressSkipProbe(inputPath, false, "file_average_bitrate_too_high", details);
    return { skip: false, reason: "file_average_bitrate_too_high", probeDetails: details };
  }

  if (
    details.videoBitRate != null &&
    details.videoBitRate > PRETRIMMED_SKIP_MAX_VIDEO_BITRATE
  ) {
    logPretrimmedCompressSkipProbe(inputPath, false, "video_bitrate_too_high", details);
    return { skip: false, reason: "video_bitrate_too_high", probeDetails: details };
  }

  if (a && String(a.codec_name).toLowerCase() !== "aac") {
    logPretrimmedCompressSkipProbe(inputPath, false, "audio_present_not_aac", details);
    return { skip: false, reason: "audio_present_not_aac", probeDetails: details };
  }

  logPretrimmedCompressSkipProbe(inputPath, true, "pretrimmed_h264_aac_ok", details);
  return { skip: true, reason: "pretrimmed_h264_aac_ok", probeDetails: details };
}

export function isMp4LikeClientVideo(mimetype: string, extension: string): boolean {
  const mt = mimetype.toLowerCase();
  const ext = extension.toLowerCase().replace(/^\./, "");
  const mp4Mime = mt === "video/mp4" || mt === "video/quicktime" || mt === "video/x-quicktime";
  const mp4Ext = ext === "mp4" || ext === "mov";
  return mp4Mime || mp4Ext;
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
