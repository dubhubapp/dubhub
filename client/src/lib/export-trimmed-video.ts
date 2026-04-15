import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { Capacitor } from "@capacitor/core";
import {
  MAX_CLIP_DURATION_SECONDS,
  MAX_VIDEO_UPLOAD_BYTES,
} from "@shared/video-upload";
/* Vite resolves from `client/` root; core lives in repo `node_modules`. */
import ffmpegCoreJs from "../../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js?url";
import ffmpegCoreWasm from "../../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url";
import { dubhubVideoDebugLog } from "@/lib/video-debug";

/**
 * Lighter scale than final feed (server does full quality). Speeds up mobile wasm encode fallback.
 */
const MOBILE_INTERMEDIATE_SCALE =
  "scale=w=1280:h=1280:force_original_aspect_ratio=decrease";

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

function logResource(message: string, payload?: Record<string, unknown>) {
  dubhubVideoDebugLog("[DubHub][PostFlow][resource]", message, payload);
}

function logDispose(message: string, payload?: Record<string, unknown>) {
  dubhubVideoDebugLog("[DubHub][PostFlow][dispose]", message, payload);
}

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) {
    logResource("ffmpeg singleton reused", { retained: true });
    return ffmpegSingleton;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      logResource("ffmpeg singleton create start");
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: ffmpegCoreJs,
        wasmURL: ffmpegCoreWasm,
      });
      ffmpegSingleton = ffmpeg;
      logResource("ffmpeg singleton loaded", { retained: true });
      return ffmpeg;
    })();
  }
  return loadPromise;
}

export function getTrimExportResourceState(): { ffmpegRetained: boolean; loadInFlight: boolean } {
  return {
    ffmpegRetained: !!ffmpegSingleton,
    loadInFlight: !!loadPromise && !ffmpegSingleton,
  };
}

export async function disposeTrimExportResources(reason: string): Promise<void> {
  const ffmpeg = ffmpegSingleton;
  const hadLoadPromise = !!loadPromise;
  if (!ffmpeg && !hadLoadPromise) {
    logDispose("dispose export resources noop", { reason });
    return;
  }
  logDispose("dispose export resources start", {
    reason,
    ffmpegRetainedBefore: !!ffmpeg,
    hadLoadPromise,
  });
  try {
    if (ffmpeg) {
      const maybeTerminate = (ffmpeg as unknown as { terminate?: () => void }).terminate;
      if (typeof maybeTerminate === "function") {
        maybeTerminate.call(ffmpeg);
      }
    }
  } catch {
    /* ignore */
  } finally {
    ffmpegSingleton = null;
    loadPromise = null;
  }
  logDispose("dispose export resources done", { reason });
}

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0) return "mp4";
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
}

async function safeDelete(ffmpeg: FFmpeg, name: string) {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    /* ignore */
  }
}

async function runLightEncode(
  ffmpeg: FFmpeg,
  inName: string,
  outName: string,
  startSec: number,
  durationSec: number,
) {
  await ffmpeg.exec([
    "-y",
    "-ss",
    String(startSec),
    "-i",
    inName,
    "-t",
    String(durationSec),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    MOBILE_INTERMEDIATE_SCALE,
    "-g",
    "120",
    "-keyint_min",
    "60",
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
    outName,
  ]);
}

/**
 * 1) Try stream copy with input-seek (`-ss` before `-i`) — usually a few seconds, no full re-encode.
 * 2) If that fails or output is invalid / too large, fall back to light H.264/AAC encode (still seeks before `-i`).
 */
export async function exportTrimmedClip(options: {
  sourceBlobUrl: string;
  sourceFileName: string;
  startSec: number;
  durationSec: number;
}): Promise<Blob> {
  const { sourceBlobUrl, sourceFileName, startSec, durationSec } = options;

  if (durationSec <= 0 || durationSec > MAX_CLIP_DURATION_SECONDS + 0.001) {
    throw new Error(`Clip must be between 0 and ${MAX_CLIP_DURATION_SECONDS} seconds.`);
  }
  if (startSec < 0) {
    throw new Error("Invalid trim start.");
  }

  const ffmpeg = await getFfmpeg();
  logResource("exportTrimmedClip start", {
    sourceFileName,
    startSec,
    durationSec,
    ffmpegRetained: !!ffmpegSingleton,
  });
  const ext = extFromName(sourceFileName);
  const inName = `src.${ext}`;
  const outName = "trim_export.mp4";

  const sourceBytes = await fetchFile(sourceBlobUrl);
  await ffmpeg.writeFile(inName, sourceBytes);
  logResource("ffmpeg input written", {
    inName,
    sourceBytes: (sourceBytes as any)?.byteLength ?? null,
  });

  try {
    try {
      await ffmpeg.exec([
        "-y",
        "-ss",
        String(startSec),
        "-i",
        inName,
        "-t",
        String(durationSec),
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        outName,
      ]);
      const copyData = await ffmpeg.readFile(outName);
      await safeDelete(ffmpeg, outName);

      if (
        copyData instanceof Uint8Array &&
        copyData.byteLength > 2048 &&
        copyData.byteLength <= MAX_VIDEO_UPLOAD_BYTES
      ) {
        const out = new Blob([copyData], { type: "video/mp4" });
        logResource("exportTrimmedClip copy path success", {
          bytes: out.size,
        });
        return out;
      }
    } catch {
      await safeDelete(ffmpeg, outName);
    }

    await safeDelete(ffmpeg, outName);
    await runLightEncode(ffmpeg, inName, outName, startSec, durationSec);
    const encData = await ffmpeg.readFile(outName);
    await safeDelete(ffmpeg, outName);

    if (!(encData instanceof Uint8Array)) {
      throw new Error("Export produced invalid output.");
    }
    if (encData.byteLength > MAX_VIDEO_UPLOAD_BYTES) {
      throw new Error(
        `Exported clip is still over ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB. Try a shorter selection.`,
      );
    }
    const out = new Blob([encData], { type: "video/mp4" });
    logResource("exportTrimmedClip encode path success", {
      bytes: out.size,
    });
    return out;
  } finally {
    await safeDelete(ffmpeg, inName);
    await safeDelete(ffmpeg, outName);
    const shouldDisposeImmediately = Capacitor.isNativePlatform();
    if (shouldDisposeImmediately) {
      await disposeTrimExportResources("native-export-finally");
    } else {
      logResource("ffmpeg retained after export (non-native)", { retained: true });
    }
  }
}
