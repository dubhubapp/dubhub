import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import { MAX_VIDEO_UPLOAD_BYTES } from "@shared/video-upload";
import {
  RELEASE_ARTWORK_MAX_BYTES,
  RELEASE_ARTWORK_UNSUPPORTED_IMAGE_ERROR,
  releaseArtworkBytesMatchDeclaredType,
  releaseArtworkMulterMiddleware,
  releaseArtworkSignatureMiddleware,
} from "./release-artwork-upload";

const routesSrc = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const indexSrc = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

function productionStyleErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  if (res.headersSent) return _next(err);
  res.status(status).json({
    success: false,
    error: message,
    type: err.constructor?.name || "Error",
  });
}

async function startArtworkApp(): Promise<{
  server: Server;
  origin: string;
  handlerCalls: number;
  storageUploads: number;
  globalErrors: number;
}> {
  const app = express();
  const state = { handlerCalls: 0, storageUploads: 0, globalErrors: 0 };

  app.post(
    "/api/releases/upload-artwork",
    releaseArtworkMulterMiddleware,
    releaseArtworkSignatureMiddleware,
    (req, res) => {
    state.handlerCalls += 1;
    // Stand-in for the route handler's Supabase upload. It runs only if Multer calls next().
    state.storageUploads += 1;
    res.json({
      path: `artist/${Date.now()}.jpg`,
      size: req.file?.size ?? null,
      mimetype: req.file?.mimetype ?? null,
    });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    state.globalErrors += 1;
    productionStyleErrorHandler(err, req, res, next);
  });

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    get handlerCalls() {
      return state.handlerCalls;
    },
    get storageUploads() {
      return state.storageUploads;
    },
    get globalErrors() {
      return state.globalErrors;
    },
  };
}

function artworkFile(bytes: number, type: string, filename: string): File {
  return new File([Buffer.alloc(bytes)], filename, { type });
}

function fileWithPrefix(prefix: Buffer, totalBytes: number, type: string, filename: string): File {
  const buffer = Buffer.alloc(Math.max(totalBytes, prefix.length));
  prefix.copy(buffer);
  return new File([buffer], filename, { type });
}

const JPEG_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_PREFIX = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF89_PREFIX = Buffer.from("GIF89a", "ascii");
const GIF87_PREFIX = Buffer.from("GIF87a", "ascii");

function webpPrefix(): Buffer {
  const buffer = Buffer.alloc(12);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  return buffer;
}

async function postArtwork(origin: string, file: File) {
  const form = new FormData();
  form.append("artwork", file);
  return fetch(`${origin}/api/releases/upload-artwork`, { method: "POST", body: form });
}

describe("POST /api/releases/upload-artwork size limit", () => {
  const servers: Server[] = [];

  after(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    );
  });

  it("accepts an image over the old 5MB cap and under 20MB, then reaches the handler", async () => {
    const app = await startArtworkApp();
    servers.push(app.server);
    const size = 6 * 1024 * 1024;
    assert.ok(size > 5 * 1024 * 1024);
    assert.ok(size < RELEASE_ARTWORK_MAX_BYTES);

    const res = await postArtwork(app.origin, fileWithPrefix(JPEG_PREFIX, size, "image/jpeg", "camera-roll.jpg"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { path: string; size: number; mimetype: string };
    assert.equal(body.size, size);
    assert.equal(body.mimetype, "image/jpeg");
    assert.match(body.path, /\.jpg$/);
    assert.equal(app.handlerCalls, 1);
    assert.equal(app.storageUploads, 1);
    assert.equal(app.globalErrors, 0);
  });

  it("returns 413 for artwork over 20MB and does not upload to storage", async () => {
    const app = await startArtworkApp();
    servers.push(app.server);

    const res = await postArtwork(
      app.origin,
      artworkFile(RELEASE_ARTWORK_MAX_BYTES + 1, "image/jpeg", "too-big.jpg"),
    );
    assert.equal(res.status, 413);
    const body = (await res.json()) as { success: boolean; error: string };
    assert.deepEqual(body, { success: false, error: "Artwork is too large" });
    assert.equal(app.handlerCalls, 0);
    assert.equal(app.storageUploads, 0);
    assert.equal(app.globalErrors, 0);
  });

  it("returns 400 for HEIC without using the global error handler", async () => {
    const app = await startArtworkApp();
    servers.push(app.server);

    const res = await postArtwork(app.origin, artworkFile(32, "image/heic", "photo.heic"));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { success: boolean; error: string };
    assert.deepEqual(body, {
      success: false,
      error: RELEASE_ARTWORK_UNSUPPORTED_IMAGE_ERROR,
    });
    assert.equal(app.handlerCalls, 0);
    assert.equal(app.storageUploads, 0);
    assert.equal(app.globalErrors, 0);
  });

  it("accepts PNG, GIF, and WebP signatures and rejects a mismatched body", async () => {
    const app = await startArtworkApp();
    servers.push(app.server);

    for (const sample of [
      { prefix: PNG_PREFIX, type: "image/png", name: "a.png" },
      { prefix: GIF89_PREFIX, type: "image/gif", name: "a.gif" },
      { prefix: GIF87_PREFIX, type: "image/gif", name: "b.gif" },
      { prefix: webpPrefix(), type: "image/webp", name: "a.webp" },
    ]) {
      const res = await postArtwork(app.origin, fileWithPrefix(sample.prefix, 32, sample.type, sample.name));
      assert.equal(res.status, 200, sample.type);
    }

    const uploadsBeforeMismatch = app.storageUploads;
    const mismatch = await postArtwork(
      app.origin,
      fileWithPrefix(PNG_PREFIX, 32, "image/jpeg", "fake.jpg"),
    );
    assert.equal(mismatch.status, 400);
    assert.equal(app.storageUploads, uploadsBeforeMismatch);
    assert.equal(app.globalErrors, 0);
    const body = (await mismatch.json()) as { success: boolean; error: string };
    assert.deepEqual(body, {
      success: false,
      error: RELEASE_ARTWORK_UNSUPPORTED_IMAGE_ERROR,
    });
    assert.equal(JSON.stringify(body).includes("stack"), false);

    assert.equal(releaseArtworkBytesMatchDeclaredType("image/jpeg", JPEG_PREFIX), true);
    assert.equal(releaseArtworkBytesMatchDeclaredType("image/png", PNG_PREFIX), true);
    assert.equal(releaseArtworkBytesMatchDeclaredType("image/gif", GIF87_PREFIX), true);
    assert.equal(releaseArtworkBytesMatchDeclaredType("image/gif", GIF89_PREFIX), true);
    assert.equal(releaseArtworkBytesMatchDeclaredType("image/webp", webpPrefix()), true);
    assert.equal(releaseArtworkBytesMatchDeclaredType("image/jpeg", PNG_PREFIX), false);
    assert.equal(releaseArtworkBytesMatchDeclaredType("image/heic", JPEG_PREFIX), false);
    assert.equal(releaseArtworkBytesMatchDeclaredType("image/jpeg", Buffer.alloc(0)), false);
  });

  it("leaves profile, video, and the global error handler limits unchanged", () => {
    assert.equal(RELEASE_ARTWORK_MAX_BYTES, 20 * 1024 * 1024);
    assert.equal(MAX_VIDEO_UPLOAD_BYTES, 50 * 1024 * 1024);

    assert.match(
      routesSrc,
      /app\.post\("\/api\/releases\/upload-artwork", withSupabaseUser, releaseArtworkMulterMiddleware, releaseArtworkSignatureMiddleware, async/,
    );
    assert.match(routesSrc, /supabase\.storage\.from\('release-artworks'\)\.upload\(/);
    assert.doesNotMatch(routesSrc, /fileSize:\s*5 \* 1024 \* 1024/);
    assert.match(routesSrc, /fileSize:\s*10 \* 1024 \* 1024,\s*\/\/ 10MB limit for images/);
    assert.match(routesSrc, /fileSize:\s*MAX_VIDEO_UPLOAD_BYTES/);
    assert.doesNotMatch(indexSrc, /LIMIT_FILE_SIZE/);
    assert.match(indexSrc, /const status = err\.status \|\| err\.statusCode \|\| 500/);
  });
});
