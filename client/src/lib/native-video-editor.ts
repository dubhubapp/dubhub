import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { dubhubVideoDebugLog } from "@/lib/video-debug";

export type NativeVideoInfo = {
  durationMs: number;
  width: number;
  height: number;
  fileSize: number | null;
  mimeType: string | null;
};

export type NativeTrimResult = NativeVideoInfo & {
  outputUri: string;
};

export type NativeThumbnailResult = {
  thumbnailUri: string;
  width: number;
  height: number;
};

type DubHubVideoEditorPlugin = {
  getVideoInfo(options: { sourceUri: string }): Promise<NativeVideoInfo>;
  trimVideo(options: {
    sourceUri: string;
    startMs: number;
    endMs: number;
  }): Promise<NativeTrimResult>;
  generateThumbnail(options: {
    sourceUri: string;
    atMs?: number;
  }): Promise<NativeThumbnailResult>;
};

const DubHubVideoEditor = registerPlugin<DubHubVideoEditorPlugin>("DubHubVideoEditor");

export function isNativeIosVideoEditorPath(): boolean {
  return Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
}

/** Rejects if `promise` does not settle in time (safety valve if native export hangs). */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });
}

function preview(v: unknown, len = 120): string | null {
  return typeof v === "string" ? v.slice(0, len) : null;
}

function errorMessageFromUnknown(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extFromName(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return "mp4";
  const ext = fileName.slice(i + 1).toLowerCase();
  // Camera roll can provide .m4v; keep it explicit for source materialization.
  if (ext === "m4v") return "m4v";
  return ext || "mp4";
}

/**
 * Native iOS plugin expects a readable file URI. Current picker flow stores blob URLs,
 * so materialize to app Cache and pass the native URI.
 */
export async function materializeSourceUriForNativeEditor(input: {
  sourceUri: string;
  fileName: string;
}): Promise<string> {
  try {
    const { sourceUri, fileName } = input;
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "source-file-shape", {
      isNativeIos: isNativeIosVideoEditorPath(),
      fileName: fileName || null,
      ext: extFromName(fileName || ""),
      sourceUriPreview: preview(sourceUri, 80),
      isBlobSource: typeof sourceUri === "string" && sourceUri.startsWith("blob:"),
    });
    if (!isNativeIosVideoEditorPath()) return sourceUri;
    if (!sourceUri.startsWith("blob:")) return sourceUri;

    const ext = extFromName(fileName);
    const path = `dubhub-native-editor/src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "writeFile-start", {
      path,
      sourceUriPreview: preview(sourceUri, 80),
      ext,
    });
    const res = await fetch(sourceUri);
    if (!res.ok) {
      throw new Error(`Failed to read source blob (${res.status})`);
    }
    const blob = await res.blob();
    const totalBytes = blob.size;
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      throw new Error("Source blob has invalid size");
    }
    // Large assets (notably camera-roll .m4v) can crash WebView when fully base64-encoded
    // in one pass. Write in chunks to reduce peak JS memory pressure.
    // IMPORTANT: chunk size must be divisible by 3 so base64 chunks can be appended safely.
    const CHUNK_BYTES = 768 * 1024; // 786432, divisible by 3
    let wroteAny = false;
    let offset = 0;
    while (offset < totalBytes) {
      const end = Math.min(offset + CHUNK_BYTES, totalBytes);
      const chunk = blob.slice(offset, end);
      const ab = await chunk.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const b64 = toBase64(bytes);
      if (!wroteAny) {
        await Filesystem.writeFile({
          path,
          data: b64,
          directory: Directory.Cache,
          recursive: true,
        });
        wroteAny = true;
      } else {
        await Filesystem.appendFile({
          path,
          data: b64,
          directory: Directory.Cache,
        });
      }
      offset = end;
    }
    if (!wroteAny) {
      throw new Error("No source chunks were written");
    }
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "writeFile-success", {
      path,
      bytes: totalBytes,
    });
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "getUri-start", { path });
    const uriRes = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    const nativeUri = (uriRes as { uri?: string } | null)?.uri;
    if (!nativeUri || typeof nativeUri !== "string") {
      throw new Error("Filesystem.getUri returned no uri");
    }
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "getUri-success", {
      nativeUriPreview: preview(nativeUri, 120),
      bytes: totalBytes,
    });
    return nativeUri;
  } catch (e) {
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "fatal-js-exception-guard", {
      stage: "materializeSourceUriForNativeEditor",
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function nativeTrimVideo(options: {
  sourceUri: string;
  startMs: number;
  endMs: number;
}): Promise<NativeTrimResult> {
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "trimVideo start", {
    sourceUriPreview: preview(options.sourceUri, 120),
    startMs: options.startMs,
    endMs: options.endMs,
  });
  let out: NativeTrimResult;
  try {
    out = await DubHubVideoEditor.trimVideo(options);
  } catch (e) {
    const message = errorMessageFromUnknown(e);
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "trim-handoff-failure", {
      stage: "nativeTrimVideo",
      message,
    });
    throw new Error(`Native trim failed: ${message}`);
  }
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "trimVideo response", out as any);
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "trimVideo done", {
    outputUriPreview: preview((out as { outputUri?: string } | null)?.outputUri, 120),
    durationMs: out.durationMs,
    width: out.width,
    height: out.height,
  });
  return out;
}

export async function nativeGenerateThumbnail(options: {
  sourceUri: string;
  atMs?: number;
}): Promise<NativeThumbnailResult> {
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "generateThumbnail start", {
    sourceUriPreview: preview(options.sourceUri, 120),
    atMs: options.atMs ?? null,
  });
  let out: NativeThumbnailResult;
  try {
    out = await DubHubVideoEditor.generateThumbnail(options);
  } catch (e) {
    const message = errorMessageFromUnknown(e);
    throw new Error(`Native thumbnail failed: ${message}`);
  }
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "generateThumbnail response", out as any);
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "generateThumbnail done", {
    thumbnailUriPreview: preview((out as { thumbnailUri?: string } | null)?.thumbnailUri, 120),
    width: out.width,
    height: out.height,
  });
  return out;
}

export async function nativeGetVideoInfo(options: { sourceUri: string }): Promise<NativeVideoInfo> {
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "getVideoInfo start", {
    sourceUriPreview: preview(options.sourceUri, 120),
  });
  let out: NativeVideoInfo;
  try {
    out = await DubHubVideoEditor.getVideoInfo(options);
  } catch (e) {
    const message = errorMessageFromUnknown(e);
    throw new Error(`Native getVideoInfo failed: ${message}`);
  }
  dubhubVideoDebugLog("[DubHub][NativeTrim]", "getVideoInfo response", out as any);
  return out;
}

export function nativePreviewUri(nativeOutputUri: string): string {
  return Capacitor.convertFileSrc(nativeOutputUri);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.includes(",") ? base64.split(",").pop() ?? base64 : base64;
  const binary = atob(normalized);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Fallback reconstruction path for iOS native output URIs when fetch(convertFileSrc(...))
 * fails in WebView. Heavy by design; use only as a last resort.
 */
export async function nativeOutputUriToFileFallback(input: {
  nativeOutputUri: string;
  fileName: string;
  mimeType?: string;
}): Promise<File> {
  const { nativeOutputUri, fileName, mimeType } = input;
  dubhubVideoDebugLog("[DubHub][NativePost]", "any reconstruction path still being used", {
    reason: "filesystem-readFile-fallback",
    nativeOutputUriPreview: preview(nativeOutputUri, 120),
  });
  const out = await Filesystem.readFile({ path: nativeOutputUri });
  const bytes = base64ToUint8Array(out.data as string);
  return new File([bytes], fileName, { type: mimeType || "video/mp4" });
}
