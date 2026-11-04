import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RELEASE_ARTWORK_ACCEPT,
  RELEASE_ARTWORK_JPEG_QUALITY,
  RELEASE_ARTWORK_JPEG_RETRY_QUALITY,
  RELEASE_ARTWORK_MAX_LONG_EDGE,
  RELEASE_ARTWORK_MAX_PIXELS,
  RELEASE_ARTWORK_OUTPUT_MAX_BYTES,
  RELEASE_ARTWORK_SOURCE_MAX_BYTES,
  artworkFailureCopy,
  classifyReleaseArtworkFile,
  mapArtworkResponseFailure,
  mapArtworkThrownFailure,
  pickReleaseArtwork,
  postReleaseArtwork,
  prepareReleaseArtwork,
  scaledArtworkSize,
  type ArtworkCodec,
  type ArtworkEncodeOptions,
  type ArtworkRaster,
} from "./release-artwork-image";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const heroSrc = readFileSync(join(here, "../components/release-form-hero.tsx"), "utf8");
const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const helperSrc = readFileSync(join(here, "./release-artwork-image.ts"), "utf8");

function fileOf(bytes: number, type: string, name: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function blobOf(bytes: number, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

function codec(options: {
  raster?: ArtworkRaster;
  blobs?: Blob[];
  inspect?: ArtworkCodec["inspect"];
}): { codec: ArtworkCodec; encodes: ArtworkEncodeOptions[]; inspects: number } {
  const encodes: ArtworkEncodeOptions[] = [];
  let inspects = 0;
  let blobIndex = 0;
  const blobs = options.blobs ?? [blobOf(1000, "image/jpeg")];
  return {
    encodes,
    get inspects() {
      return inspects;
    },
    codec: {
      inspect: options.inspect ?? (async () => {
        inspects += 1;
        return options.raster ?? { width: 1000, height: 800, hasAlpha: false };
      }),
      encode: async (_file, _raster, encodeOptions) => {
        encodes.push(encodeOptions);
        const blob = blobs[Math.min(blobIndex, blobs.length - 1)];
        blobIndex += 1;
        return blob;
      },
    },
  };
}

describe("release artwork classification and limits", () => {
  it("refuses a source over 50 MB before decode", async () => {
    const seen = codec({});
    const file = fileOf(RELEASE_ARTWORK_SOURCE_MAX_BYTES + 1, "image/jpeg", "big.jpg");
    const result = await prepareReleaseArtwork(file, seen.codec);
    assert.deepEqual(result, { ok: false, failure: "too_large" });
    assert.equal(seen.inspects, 0);
    assert.equal(artworkFailureCopy("too_large").title, "This image is too large");
    assert.equal(artworkFailureCopy("too_large").description, "Choose a smaller photo.");
  });

  it("allows a source of exactly 50 MB to be inspected", async () => {
    const seen = codec({ raster: { width: 100, height: 100, hasAlpha: false } });
    const file = fileOf(RELEASE_ARTWORK_SOURCE_MAX_BYTES, "image/jpeg", "edge.jpg");
    const result = await prepareReleaseArtwork(file, seen.codec);
    assert.equal(result.ok, true);
    assert.equal(seen.inspects, 1);
  });

  it("refuses images above 60 megapixels", async () => {
    const seen = codec({ raster: { width: 10_000, height: 6_001, hasAlpha: false } });
    assert.ok(10_000 * 6_001 > RELEASE_ARTWORK_MAX_PIXELS);
    const result = await prepareReleaseArtwork(fileOf(1000, "image/jpeg", "huge.jpg"), seen.codec);
    assert.deepEqual(result, { ok: false, failure: "too_large" });
    assert.equal(seen.encodes.length, 0);
  });

  it("keeps a 48 MP image valid", async () => {
    const width = 8064;
    const height = 6048;
    assert.ok(width * height < RELEASE_ARTWORK_MAX_PIXELS);
    const seen = codec({
      raster: { width, height, hasAlpha: false },
      blobs: [blobOf(200_000, "image/jpeg")],
    });
    const result = await prepareReleaseArtwork(fileOf(8_000_000, "image/jpeg", "pro.jpg"), seen.codec);
    assert.equal(result.ok, true);
    assert.equal(seen.encodes.length, 1);
    assert.equal(Math.max(seen.encodes[0].width, seen.encodes[0].height), RELEASE_ARTWORK_MAX_LONG_EDGE);
  });

  it("re-encodes a small in-range JPEG instead of uploading the original bytes", async () => {
    const seen = codec({
      raster: { width: 1600, height: 1600, hasAlpha: false },
      blobs: [blobOf(80_000, "image/jpeg")],
    });
    const file = fileOf(400_000, "image/jpeg", "cover.jpeg");
    const result = await prepareReleaseArtwork(file, seen.codec);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(seen.encodes.length, 1);
    assert.equal(seen.encodes[0].mime, "image/jpeg");
    assert.equal(seen.encodes[0].quality, RELEASE_ARTWORK_JPEG_QUALITY);
    assert.deepEqual(
      { width: seen.encodes[0].width, height: seen.encodes[0].height },
      { width: 1600, height: 1600 },
    );
    assert.equal(result.file.name, "artwork.jpg");
    assert.equal(result.file.type, "image/jpeg");
    assert.notEqual(result.file.size, file.size);
  });

  it("resizes a large JPEG to a 2048 long edge and preserves aspect ratio", async () => {
    const seen = codec({
      raster: { width: 4000, height: 2000, hasAlpha: false },
      blobs: [blobOf(300_000, "image/jpeg")],
    });
    const result = await prepareReleaseArtwork(fileOf(3_000_000, "image/jpeg", "wide.jpg"), seen.codec);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(scaledArtworkSize(4000, 2000), { width: 2048, height: 1024 });
    assert.deepEqual(
      { width: seen.encodes[0].width, height: seen.encodes[0].height },
      { width: 2048, height: 1024 },
    );
    assert.equal(seen.encodes[0].mime, "image/jpeg");
    assert.equal(seen.encodes[0].quality, RELEASE_ARTWORK_JPEG_QUALITY);
    assert.equal(result.file.name, "artwork.jpg");
    assert.equal(result.file.type, "image/jpeg");
    assert.ok(Math.abs(4000 / 2000 - seen.encodes[0].width / seen.encodes[0].height) < 0.001);
  });

  it("retries JPEG once at 0.75 and fails if the file is still over 8 MB", async () => {
    const over = blobOf(RELEASE_ARTWORK_OUTPUT_MAX_BYTES + 1, "image/jpeg");
    const retried = codec({
      raster: { width: 3000, height: 3000, hasAlpha: false },
      blobs: [over, blobOf(500_000, "image/jpeg")],
    });
    const ok = await prepareReleaseArtwork(fileOf(4_000_000, "image/jpeg", "a.jpg"), retried.codec);
    assert.equal(ok.ok, true);
    assert.equal(retried.encodes[1].quality, RELEASE_ARTWORK_JPEG_RETRY_QUALITY);

    const stillOver = codec({
      raster: { width: 3000, height: 3000, hasAlpha: false },
      blobs: [over, over],
    });
    const failed = await prepareReleaseArtwork(fileOf(4_000_000, "image/jpeg", "b.jpg"), stillOver.codec);
    assert.deepEqual(failed, { ok: false, failure: "too_large" });
    assert.equal(stillOver.encodes.length, 2);
  });

  it("writes a PNG when the image has alpha, including WebP and GIF", async () => {
    for (const type of ["image/png", "image/webp", "image/gif"] as const) {
      const seen = codec({
        raster: { width: 800, height: 600, hasAlpha: true },
        blobs: [blobOf(20_000, "image/png")],
      });
      const result = await prepareReleaseArtwork(fileOf(50_000, type, "alpha"), seen.codec);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.file.type, "image/png");
      assert.equal(result.file.name, "artwork.png");
      assert.equal(seen.encodes.length, 1);
      assert.equal(seen.encodes[0].mime, "image/png");
    }
  });

  it("writes a JPEG still for opaque WebP and GIF", async () => {
    for (const type of ["image/webp", "image/gif"] as const) {
      const seen = codec({
        raster: { width: 900, height: 900, hasAlpha: false },
        blobs: [blobOf(20_000, "image/jpeg")],
      });
      const result = await prepareReleaseArtwork(fileOf(80_000, type, "still"), seen.codec);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.file.type, "image/jpeg");
      assert.equal(result.file.name, "artwork.jpg");
      assert.notEqual(result.file.type, "image/gif");
      assert.notEqual(result.file.type, "image/webp");
    }
  });

  it("rejects raw HEIC and HEIF without decoding", async () => {
    for (const sample of [
      { type: "image/heic", name: "photo.heic" },
      { type: "image/heif", name: "photo.heif" },
      { type: "", name: "photo.HEIC" },
    ]) {
      const seen = codec({});
      const result = await prepareReleaseArtwork(fileOf(2000, sample.type, sample.name), seen.codec);
      assert.deepEqual(result, { ok: false, failure: "unsupported" });
      assert.equal(seen.inspects, 0);
    }
    assert.equal(artworkFailureCopy("unsupported").title, "This photo isn’t supported");
    assert.equal(
      artworkFailureCopy("unsupported").description,
      "Choose a JPEG, PNG, or another photo from your library.",
    );
  });

  it("still processes a JPEG that iOS transcoded from HEIC", () => {
    const classified = classifyReleaseArtworkFile({
      type: "image/jpeg",
      name: "IMG.HEIC",
      size: 2_000_000,
    });
    assert.deepEqual(classified, { ok: true, kind: "jpeg" });
  });
});

describe("release artwork upload errors and preview rollback", () => {
  const previous = {
    previousPreviewUrl: "blob:previous",
    previousArtworkPath: "artist/existing.jpg",
  };

  function readyCodec(): ArtworkCodec {
    return codec({
      raster: { width: 1200, height: 1200, hasAlpha: false },
      blobs: [blobOf(10_000, "image/jpeg")],
    }).codec;
  }

  it("maps HTTP 413 to the too-large copy and restores the previous artwork", async () => {
    const revoked: string[] = [];
    const previews: string[] = [];
    const result = await pickReleaseArtwork({
      file: fileOf(2_000_000, "image/jpeg", "big.jpg"),
      accessToken: "token",
      ...previous,
      codec: readyCodec(),
      createPreviewUrl: () => "blob:new",
      revokePreviewUrl: (url) => revoked.push(url),
      onPreview: (url) => previews.push(url),
      fetchImpl: async () => new Response(JSON.stringify({ error: "Artwork is too large" }), { status: 413 }),
    });
    assert.equal(result.previewUrl, "blob:previous");
    assert.equal(result.artworkPath, "artist/existing.jpg");
    assert.deepEqual(previews, ["blob:new"]);
    assert.deepEqual(revoked, ["blob:new"]);
    assert.equal(result.toast.title, "This image is too large");
    assert.equal("description" in result.toast ? result.toast.description : "", "Choose a smaller photo.");
    assert.equal("variant" in result.toast ? result.toast.variant : undefined, "destructive");
  });

  it("maps a network failure to the connection copy", async () => {
    const thrown = mapArtworkThrownFailure(new TypeError("Failed to fetch"));
    assert.equal(thrown, "network");
    assert.equal(artworkFailureCopy("network").description, "Check your connection and try again.");

    const result = await pickReleaseArtwork({
      file: fileOf(1000, "image/jpeg", "a.jpg"),
      accessToken: "token",
      ...previous,
      codec: readyCodec(),
      createPreviewUrl: () => "blob:new",
      revokePreviewUrl: () => undefined,
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    assert.equal(result.previewUrl, previous.previousPreviewUrl);
    assert.equal(result.artworkPath, previous.previousArtworkPath);
    assert.equal(result.toast.title, "Couldn’t upload artwork");
    assert.equal("description" in result.toast ? result.toast.description : "", "Check your connection and try again.");
  });

  it("maps a generic 5xx to the non-technical upload copy and hides the body", async () => {
    const kind = await mapArtworkResponseFailure(
      new Response(JSON.stringify({ error: "boom", details: "Error: stack\n at routes.ts" }), { status: 500 }),
    );
    assert.equal(kind, "server");
    const result = await pickReleaseArtwork({
      file: fileOf(1000, "image/jpeg", "a.jpg"),
      accessToken: "token",
      ...previous,
      codec: readyCodec(),
      createPreviewUrl: () => "blob:new",
      revokePreviewUrl: () => undefined,
      fetchImpl: async () => new Response("Internal Server Error stack", { status: 500 }),
    });
    assert.equal(result.toast.title, "Couldn’t upload artwork");
    assert.equal("description" in result.toast ? result.toast.description : "", "Try again in a moment.");
    assert.equal(JSON.stringify(result.toast).includes("stack"), false);
    assert.equal(result.artworkPath, previous.previousArtworkPath);
  });

  it("maps the server unsupported-image 400 to the unsupported copy", async () => {
    const kind = await mapArtworkResponseFailure(
      new Response(
        JSON.stringify({
          success: false,
          error: "This file isn’t a supported image",
          details: "Error: stack",
        }),
        { status: 400 },
      ),
    );
    assert.equal(kind, "unsupported");
    assert.equal(artworkFailureCopy(kind).title, "This photo isn’t supported");
    assert.equal(
      artworkFailureCopy(kind).description,
      "Choose a JPEG, PNG, or another photo from your library.",
    );
  });

  it("uploads the processed file, not the original picker file", async () => {
    const processed = fileOf(1200, "image/jpeg", "artwork.jpg");
    const sent: File[] = [];
    const response = await postReleaseArtwork(processed, "token", async (_url, init) => {
      const body = init?.body;
      assert.ok(body instanceof FormData);
      const artwork = body.get("artwork");
      assert.ok(artwork instanceof File);
      sent.push(artwork);
      return new Response(JSON.stringify({ path: "artist/1.jpg" }), { status: 200 });
    });
    assert.equal(response.status, 200);
    assert.equal(sent[0], processed);
    assert.equal(sent[0].name, "artwork.jpg");
    assert.equal(sent[0].type, "image/jpeg");
  });
});

describe("release artwork create and edit wiring", () => {
  it("uses one helper, the explicit accept list, rollback, and the same success toast", () => {
    assert.equal(RELEASE_ARTWORK_ACCEPT, "image/jpeg,image/png,image/webp,image/gif");
    assert.match(createSrc, /accept=\{RELEASE_ARTWORK_ACCEPT\}/);
    assert.match(editSrc, /accept=\{RELEASE_ARTWORK_ACCEPT\}/);
    assert.doesNotMatch(createSrc, /accept="image\/\*"/);
    assert.doesNotMatch(editSrc, /accept="image\/\*"/);
    assert.match(profileSrc, /accept="image\/\*"/);

    for (const src of [createSrc, editSrc]) {
      assert.match(src, /pickReleaseArtwork\(/);
      assert.match(src, /input\.value = ""/);
      assert.match(src, /previousPreviewUrl: artworkPreviewUrl/);
      assert.match(src, /previousArtworkPath: artworkPath/);
      assert.match(src, /setArtworkPreviewUrl\(result\.previewUrl\)/);
      assert.match(src, /setArtworkPath\(result\.artworkPath\)/);
      assert.match(src, /toast\(result\.toast\)/);
      assert.doesNotMatch(src, /form\.append\(\s*"artwork"/);
    }
    assert.match(helperSrc, /form\.append\("artwork", file\)/);
    assert.match(helperSrc, /title: "Artwork updated"/);
    assert.match(heroSrc, /aria-busy=\{uploading\}/);
    assert.match(heroSrc, /aria-label=\{artworkUrl \? "Change artwork" : "Add artwork"\}/);
  });
});
