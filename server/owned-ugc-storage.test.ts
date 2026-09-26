import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import {
  POST_THUMBNAILS_BUCKET,
  PROFILE_UPLOADS_BUCKET,
  RELEASE_ARTWORKS_BUCKET,
  VIDEOS_BUCKET,
  isProtectedSharedProfileAssetPath,
  pathBelongsToOwner,
  resolveOwnedStorageObject,
  removeOwnedStorageObject,
} from "./owned-ugc-storage";

const SUPABASE_HOST = "example.supabase.co";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function publicUrl(bucket: string, objectPath: string): string {
  return `https://${SUPABASE_HOST}/storage/v1/object/public/${bucket}/${objectPath}`;
}

describe("owned-ugc-storage path resolution", () => {
  let previousUrl: string | undefined;

  before(() => {
    previousUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
  });

  after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
  });

  it("resolves valid video public URL with owner prefix", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: publicUrl(VIDEOS_BUCKET, `${OWNER}/processed_1.mp4`),
      expectedOwnerId: OWNER,
      allowedBuckets: [VIDEOS_BUCKET],
      preferredBucket: VIDEOS_BUCKET,
    });
    assert.deepEqual(ref, {
      bucket: VIDEOS_BUCKET,
      path: `${OWNER}/processed_1.mp4`,
    });
  });

  it("resolves relative release artwork path", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: `${OWNER}/art.jpg`,
      expectedOwnerId: OWNER,
      allowedBuckets: [RELEASE_ARTWORKS_BUCKET],
      preferredBucket: RELEASE_ARTWORKS_BUCKET,
    });
    assert.deepEqual(ref, {
      bucket: RELEASE_ARTWORKS_BUCKET,
      path: `${OWNER}/art.jpg`,
    });
  });

  it("resolves bucket-prefixed relative path", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: `${POST_THUMBNAILS_BUCKET}/${OWNER}/thumb_1.jpg`,
      expectedOwnerId: OWNER,
      allowedBuckets: [POST_THUMBNAILS_BUCKET],
    });
    assert.deepEqual(ref, {
      bucket: POST_THUMBNAILS_BUCKET,
      path: `${OWNER}/thumb_1.jpg`,
    });
  });

  it("rejects wrong bucket", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: publicUrl(VIDEOS_BUCKET, `${OWNER}/x.mp4`),
      expectedOwnerId: OWNER,
      allowedBuckets: [POST_THUMBNAILS_BUCKET],
      preferredBucket: POST_THUMBNAILS_BUCKET,
    });
    assert.equal(ref, null);
  });

  it("rejects wrong owner prefix", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: publicUrl(VIDEOS_BUCKET, `${OTHER}/x.mp4`),
      expectedOwnerId: OWNER,
      allowedBuckets: [VIDEOS_BUCKET],
      preferredBucket: VIDEOS_BUCKET,
    });
    assert.equal(ref, null);
  });

  it("rejects foreign host", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: `https://evil.example/storage/v1/object/public/${VIDEOS_BUCKET}/${OWNER}/x.mp4`,
      expectedOwnerId: OWNER,
      allowedBuckets: [VIDEOS_BUCKET],
      preferredBucket: VIDEOS_BUCKET,
    });
    assert.equal(ref, null);
  });

  it("rejects malformed URL", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: "not a url",
      expectedOwnerId: OWNER,
      allowedBuckets: [VIDEOS_BUCKET],
      preferredBucket: VIDEOS_BUCKET,
    });
    assert.equal(ref, null);
  });

  it("rejects legacy /videos/ local paths", () => {
    const ref = resolveOwnedStorageObject({
      urlOrPath: "/videos/processed_legacy.mp4",
      expectedOwnerId: OWNER,
      allowedBuckets: [VIDEOS_BUCKET],
      preferredBucket: VIDEOS_BUCKET,
    });
    assert.equal(ref, null);
  });

  it("rejects default/shared profile assets", () => {
    assert.equal(isProtectedSharedProfileAssetPath("users/default_user_avatar.png"), true);
    const ref = resolveOwnedStorageObject({
      urlOrPath: publicUrl(PROFILE_UPLOADS_BUCKET, "users/default_user_avatar.png"),
      expectedOwnerId: OWNER,
      allowedBuckets: [PROFILE_UPLOADS_BUCKET],
      preferredBucket: PROFILE_UPLOADS_BUCKET,
    });
    assert.equal(ref, null);
  });

  it("accepts profile avatar path conventions", () => {
    assert.equal(
      pathBelongsToOwner(PROFILE_UPLOADS_BUCKET, `artists/${OWNER}.png`, OWNER),
      true,
    );
    assert.equal(
      pathBelongsToOwner(PROFILE_UPLOADS_BUCKET, `users/${OWNER}_banner.png`, OWNER),
      true,
    );
    assert.equal(
      pathBelongsToOwner(PROFILE_UPLOADS_BUCKET, `${OWNER}/profile_1.png`, OWNER),
      true,
    );
  });

  it("treats missing storage object as idempotent success", async () => {
    const result = await removeOwnedStorageObject(
      { bucket: VIDEOS_BUCKET, path: `${OWNER}/gone.mp4` },
      async () => ({ error: { message: "Object not found", statusCode: "404" } }),
    );
    assert.deepEqual(result, { ok: true, alreadyMissing: true });
  });

  it("reports retryable failure for unexpected storage errors", async () => {
    const result = await removeOwnedStorageObject(
      { bucket: RELEASE_ARTWORKS_BUCKET, path: `${OWNER}/art.jpg` },
      async () => ({ error: { message: "timeout", statusCode: "500" } }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.retryable, true);
    }
  });
});
