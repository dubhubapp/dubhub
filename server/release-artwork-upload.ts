import type { NextFunction, Request, Response } from "express";
import multer from "multer";

/** Route-specific cap for release artwork. memoryStorage — do not raise further here. */
export const RELEASE_ARTWORK_MAX_BYTES = 20 * 1024 * 1024;

export const RELEASE_ARTWORK_UNSUPPORTED_IMAGE_ERROR = "This file isn’t a supported image";

const JPEG_TYPES = new Set(["image/jpeg", "image/jpg"]);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  if (bytes.length < end) return "";
  return Buffer.from(bytes.subarray(start, end)).toString("ascii");
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isGif(bytes: Uint8Array): boolean {
  const header = ascii(bytes, 0, 6);
  return header === "GIF87a" || header === "GIF89a";
}

function isWebp(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
}

/** Magic-byte check only. Does not decode the image. */
export function releaseArtworkBytesMatchDeclaredType(mimetype: string, bytes: Uint8Array): boolean {
  const type = mimetype.trim().toLowerCase();
  if (JPEG_TYPES.has(type)) return isJpeg(bytes);
  if (type === "image/png") return startsWith(bytes, PNG_SIGNATURE);
  if (type === "image/gif") return isGif(bytes);
  if (type === "image/webp") return isWebp(bytes);
  return false;
}

export function releaseArtworkSignatureMiddleware(req: Request, res: Response, next: NextFunction) {
  const file = req.file;
  if (!file) return next();
  if (!releaseArtworkBytesMatchDeclaredType(file.mimetype, file.buffer)) {
    return res.status(400).json({
      success: false,
      error: RELEASE_ARTWORK_UNSUPPORTED_IMAGE_ERROR,
    });
  }
  next();
}

export const releaseArtworkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RELEASE_ARTWORK_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Only image files are allowed."));
  },
});

/**
 * Same narrow Multer wrapper as `/api/upload-video`.
 * LIMIT_FILE_SIZE and a rejected artwork MIME are answered here.
 */
export function releaseArtworkMulterMiddleware(req: Request, res: Response, next: NextFunction) {
  releaseArtworkUpload.single("artwork")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          error: "Artwork is too large",
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        error: RELEASE_ARTWORK_UNSUPPORTED_IMAGE_ERROR,
      });
    }
    next();
  });
}
