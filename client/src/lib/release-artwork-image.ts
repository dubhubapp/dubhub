import { apiUrl } from "@/lib/apiBase";

/** Explicit list so iOS can transcode HEIC into a compatible type. Do not add image/heic. */
export const RELEASE_ARTWORK_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const RELEASE_ARTWORK_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
export const RELEASE_ARTWORK_MAX_PIXELS = 60_000_000;
export const RELEASE_ARTWORK_MAX_LONG_EDGE = 2048;
export const RELEASE_ARTWORK_JPEG_QUALITY = 0.85;
export const RELEASE_ARTWORK_JPEG_RETRY_QUALITY = 0.75;
export const RELEASE_ARTWORK_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;

export type ArtworkFailureKind =
  | "too_large"
  | "unsupported"
  | "conversion"
  | "network"
  | "server";

export type ArtworkRaster = {
  width: number;
  height: number;
  hasAlpha: boolean;
};

export type ArtworkEncodeOptions = {
  mime: "image/jpeg" | "image/png";
  quality?: number;
  width: number;
  height: number;
};

export type ArtworkCodec = {
  inspect: (file: File) => Promise<ArtworkRaster>;
  encode: (file: File, raster: ArtworkRaster, options: ArtworkEncodeOptions) => Promise<Blob>;
  dispose?: () => void;
};

export type ArtworkFailureCopy = {
  title: string;
  description: string;
};

const TOO_LARGE: ArtworkFailureCopy = {
  title: "This image is too large",
  description: "Choose a smaller photo.",
};

const UNSUPPORTED: ArtworkFailureCopy = {
  title: "This photo isn’t supported",
  description: "Choose a JPEG, PNG, or another photo from your library.",
};

const CONVERSION: ArtworkFailureCopy = {
  title: "Couldn’t use this photo",
  description: "Try a different image.",
};

const NETWORK: ArtworkFailureCopy = {
  title: "Couldn’t upload artwork",
  description: "Check your connection and try again.",
};

const SERVER: ArtworkFailureCopy = {
  title: "Couldn’t upload artwork",
  description: "Try again in a moment.",
};

export function artworkFailureCopy(kind: ArtworkFailureKind): ArtworkFailureCopy {
  switch (kind) {
    case "too_large":
      return TOO_LARGE;
    case "unsupported":
      return UNSUPPORTED;
    case "conversion":
      return CONVERSION;
    case "network":
      return NETWORK;
    case "server":
      return SERVER;
  }
}

export type ReleaseArtworkToast = ArtworkFailureCopy & { variant?: "destructive" } | { title: string };

export function scaledArtworkSize(
  width: number,
  height: number,
  maxLongEdge = RELEASE_ARTWORK_MAX_LONG_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };
  if (width >= height) {
    return {
      width: maxLongEdge,
      height: Math.max(1, Math.round((height * maxLongEdge) / width)),
    };
  }
  return {
    width: Math.max(1, Math.round((width * maxLongEdge) / height)),
    height: maxLongEdge,
  };
}

type CompatibleKind = "jpeg" | "png" | "webp" | "gif";

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * MIME wins when it is a compatible image type, so an iOS-transcoded JPEG
 * is processed even if the filename still ends in .heic.
 * A real image/heic or image/heif file is unsupported and is not decoded.
 */
export function classifyReleaseArtworkFile(file: {
  type: string;
  name: string;
  size: number;
}): { ok: true; kind: CompatibleKind } | { ok: false; failure: "too_large" | "unsupported" } {
  if (file.size > RELEASE_ARTWORK_SOURCE_MAX_BYTES) return { ok: false, failure: "too_large" };

  const type = file.type.trim().toLowerCase();
  const ext = extensionOf(file.name);

  if (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence"
  ) {
    return { ok: false, failure: "unsupported" };
  }

  if (type === "image/jpeg" || type === "image/jpg") return { ok: true, kind: "jpeg" };
  if (type === "image/png") return { ok: true, kind: "png" };
  if (type === "image/webp") return { ok: true, kind: "webp" };
  if (type === "image/gif") return { ok: true, kind: "gif" };

  if (type === "" || type === "application/octet-stream") {
    if (ext === "heic" || ext === "heif") return { ok: false, failure: "unsupported" };
    if (ext === "jpg" || ext === "jpeg") return { ok: true, kind: "jpeg" };
    if (ext === "png") return { ok: true, kind: "png" };
    if (ext === "webp") return { ok: true, kind: "webp" };
    if (ext === "gif") return { ok: true, kind: "gif" };
  }

  if (ext === "heic" || ext === "heif") return { ok: false, failure: "unsupported" };
  return { ok: false, failure: "unsupported" };
}

function artworkFile(blob: Blob, mime: "image/jpeg" | "image/png"): File {
  const name = mime === "image/png" ? "artwork.png" : "artwork.jpg";
  return new File([blob], name, { type: mime });
}

export async function prepareReleaseArtwork(
  file: File,
  codec: ArtworkCodec,
): Promise<{ ok: true; file: File } | { ok: false; failure: ArtworkFailureKind }> {
  const classified = classifyReleaseArtworkFile(file);
  if (!classified.ok) return { ok: false, failure: classified.failure };

  let raster: ArtworkRaster;
  try {
    raster = await codec.inspect(file);
    if (!(raster.width > 0) || !(raster.height > 0)) {
      return { ok: false, failure: "conversion" };
    }
    if (raster.width * raster.height > RELEASE_ARTWORK_MAX_PIXELS) {
      return { ok: false, failure: "too_large" };
    }

    const size = scaledArtworkSize(raster.width, raster.height);
    const mime: "image/jpeg" | "image/png" = raster.hasAlpha ? "image/png" : "image/jpeg";

    const encode = async (quality?: number) => {
      const blob = await codec.encode(file, raster, {
        mime,
        quality,
        width: size.width,
        height: size.height,
      });
      return artworkFile(blob, mime);
    };

    if (mime === "image/png") {
      const png = await encode();
      if (png.size > RELEASE_ARTWORK_OUTPUT_MAX_BYTES) {
        return { ok: false, failure: "too_large" };
      }
      return { ok: true, file: png };
    }

    let jpeg = await encode(RELEASE_ARTWORK_JPEG_QUALITY);
    if (jpeg.size > RELEASE_ARTWORK_OUTPUT_MAX_BYTES) {
      jpeg = await encode(RELEASE_ARTWORK_JPEG_RETRY_QUALITY);
    }
    if (jpeg.size > RELEASE_ARTWORK_OUTPUT_MAX_BYTES) {
      return { ok: false, failure: "too_large" };
    }
    return { ok: true, file: jpeg };
  } catch {
    return { ok: false, failure: "conversion" };
  } finally {
    codec.dispose?.();
  }
}

export function mapArtworkThrownFailure(error: unknown): ArtworkFailureKind {
  if (error instanceof TypeError) return "network";
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "network";
  }
  return "server";
}

export async function mapArtworkResponseFailure(res: Response): Promise<ArtworkFailureKind> {
  if (res.status === 413) return "too_large";
  let error = "";
  try {
    const text = await res.text();
    if (text) {
      try {
        const data = JSON.parse(text) as { error?: unknown; message?: unknown };
        error = [data?.error, data?.message].filter((value) => typeof value === "string").join(" ");
      } catch {
        error = "";
      }
    }
  } catch {
    error = "";
  }
  if (/invalid file type|supported image|unsupported/i.test(error)) return "unsupported";
  return "server";
}

export async function postReleaseArtwork(
  file: File,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const form = new FormData();
  form.append("artwork", file);
  return fetchImpl(apiUrl("/api/releases/upload-artwork"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
}

export type ReleaseArtworkPickResult = {
  previewUrl: string | null;
  artworkPath: string | null;
  toast: ReleaseArtworkToast;
};

function failureResult(
  previousPreviewUrl: string | null,
  previousArtworkPath: string | null,
  kind: ArtworkFailureKind,
): ReleaseArtworkPickResult {
  return {
    previewUrl: previousPreviewUrl,
    artworkPath: previousArtworkPath,
    toast: { ...artworkFailureCopy(kind), variant: "destructive" },
  };
}

export async function pickReleaseArtwork(args: {
  file: File;
  accessToken: string | null;
  previousPreviewUrl: string | null;
  previousArtworkPath: string | null;
  onPreview?: (url: string) => void;
  codec?: ArtworkCodec;
  fetchImpl?: typeof fetch;
  createPreviewUrl?: (file: File) => string;
  revokePreviewUrl?: (url: string) => void;
}): Promise<ReleaseArtworkPickResult> {
  const codec = args.codec ?? createBrowserArtworkCodec();
  const createPreviewUrl = args.createPreviewUrl ?? ((file) => URL.createObjectURL(file));
  const revokePreviewUrl = args.revokePreviewUrl ?? ((url) => URL.revokeObjectURL(url));

  const prepared = await prepareReleaseArtwork(args.file, codec);
  if (!prepared.ok) {
    return failureResult(args.previousPreviewUrl, args.previousArtworkPath, prepared.failure);
  }

  if (!args.accessToken) {
    return failureResult(args.previousPreviewUrl, args.previousArtworkPath, "server");
  }

  const previewUrl = createPreviewUrl(prepared.file);
  args.onPreview?.(previewUrl);

  let response: Response;
  try {
    response = await postReleaseArtwork(prepared.file, args.accessToken, args.fetchImpl);
  } catch (error) {
    revokePreviewUrl(previewUrl);
    return failureResult(
      args.previousPreviewUrl,
      args.previousArtworkPath,
      mapArtworkThrownFailure(error),
    );
  }

  if (!response.ok) {
    revokePreviewUrl(previewUrl);
    return failureResult(
      args.previousPreviewUrl,
      args.previousArtworkPath,
      await mapArtworkResponseFailure(response),
    );
  }

  let path: string | null = null;
  try {
    const data = (await response.json()) as { path?: unknown };
    if (typeof data?.path === "string" && data.path.trim()) path = data.path.trim();
  } catch {
    path = null;
  }
  if (!path) {
    revokePreviewUrl(previewUrl);
    return failureResult(args.previousPreviewUrl, args.previousArtworkPath, "server");
  }

  if (
    args.previousPreviewUrl &&
    args.previousPreviewUrl.startsWith("blob:") &&
    args.previousPreviewUrl !== previewUrl
  ) {
    revokePreviewUrl(args.previousPreviewUrl);
  }

  return {
    previewUrl,
    artworkPath: path,
    toast: { title: "Artwork updated" },
  };
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    image.src = url;
  });
}

async function sourceHasAlpha(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<boolean> {
  const longEdge = Math.max(width, height);
  const scale = longEdge > 512 ? 512 / longEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) return true;
  }
  return false;
}

function renderArtworkBlob(
  source: CanvasImageSource,
  options: ArtworkEncodeOptions,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d", { alpha: options.mime === "image/png" });
  if (!ctx) return Promise.reject(new Error("canvas"));
  ctx.drawImage(source, 0, 0, options.width, options.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("encode"));
        else resolve(blob);
      },
      options.mime,
      options.quality,
    );
  });
}

export function createBrowserArtworkCodec(): ArtworkCodec {
  let bitmap: ImageBitmap | null = null;
  let drawable: CanvasImageSource | null = null;
  let width = 0;
  let height = 0;

  const close = () => {
    bitmap?.close();
    bitmap = null;
    drawable = null;
  };

  return {
    async inspect(file) {
      close();
      // createImageBitmap / <img> decode only the first GIF frame. Orientation is applied
      // here; canvas export does not copy EXIF or GPS.
      if (typeof createImageBitmap === "function") {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        drawable = bitmap;
        width = bitmap.width;
        height = bitmap.height;
      } else {
        const image = await loadHtmlImage(file);
        drawable = image;
        width = image.naturalWidth;
        height = image.naturalHeight;
      }
      const type = file.type.trim().toLowerCase();
      const hasAlpha =
        type === "image/jpeg" || type === "image/jpg"
          ? false
          : await sourceHasAlpha(drawable, width, height);
      return { width, height, hasAlpha };
    },
    async encode(_file, _raster, options) {
      if (!drawable) throw new Error("decode");
      return renderArtworkBlob(drawable, options);
    },
    dispose: close,
  };
}
