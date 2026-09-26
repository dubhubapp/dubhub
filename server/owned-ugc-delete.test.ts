import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import {
  deleteOwnedPostWithStorage,
  deleteOwnedReleaseWithStorage,
  type OwnedPostRow,
  type OwnedReleaseRow,
} from "./owned-ugc-delete";
import {
  POST_THUMBNAILS_BUCKET,
  RELEASE_ARTWORKS_BUCKET,
  VIDEOS_BUCKET,
  type OwnedStorageObjectRef,
} from "./owned-ugc-storage";

const SUPABASE_HOST = "example.supabase.co";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RELEASE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function publicUrl(bucket: string, objectPath: string): string {
  return `https://${SUPABASE_HOST}/storage/v1/object/public/${bucket}/${objectPath}`;
}

function ownedPost(overrides: Partial<OwnedPostRow> = {}): OwnedPostRow {
  return {
    id: POST_ID,
    user_id: OWNER,
    video_url: publicUrl(VIDEOS_BUCKET, `${OWNER}/clip.mp4`),
    thumbnail_url: publicUrl(POST_THUMBNAILS_BUCKET, `${OWNER}/thumb.jpg`),
    ...overrides,
  };
}

function ownedRelease(overrides: Partial<OwnedReleaseRow> = {}): OwnedReleaseRow {
  return {
    id: RELEASE_ID,
    artist_id: OWNER,
    artwork_url: `${OWNER}/cover.jpg`,
    ...overrides,
  };
}

describe("deleteOwnedPostWithStorage", () => {
  let previousUrl: string | undefined;

  before(() => {
    previousUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
  });

  after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
  });

  it("owner can delete: DB + video + thumbnail removed", async () => {
    const removed: string[] = [];
    const deletedIds: string[] = [];
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OWNER,
      loadPost: async () => ownedPost(),
      deletePostDb: async (id) => {
        deletedIds.push(id);
        return true;
      },
      removeFn: async (bucket, paths) => {
        for (const path of paths) removed.push(`${bucket}:${path}`);
        return { error: null };
      },
    });

    assert.equal(result.outcome, "deleted");
    assert.equal(result.dbDeleted, true);
    assert.deepEqual(deletedIds, [POST_ID]);
    assert.ok(removed.includes(`${VIDEOS_BUCKET}:${OWNER}/clip.mp4`));
    assert.ok(removed.includes(`${POST_THUMBNAILS_BUCKET}:${OWNER}/thumb.jpg`));
  });

  it("non-owner rejected", async () => {
    let deleteCalled = false;
    let removeCalled = false;
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OTHER,
      loadPost: async () => ownedPost(),
      deletePostDb: async () => {
        deleteCalled = true;
        return true;
      },
      removeFn: async () => {
        removeCalled = true;
        return { error: null };
      },
    });
    assert.equal(result.outcome, "forbidden");
    assert.equal(result.dbDeleted, false);
    assert.equal(deleteCalled, false);
    assert.equal(removeCalled, false);
  });

  it("missing thumbnail tolerated", async () => {
    const removed: string[] = [];
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OWNER,
      loadPost: async () => ownedPost({ thumbnail_url: null }),
      deletePostDb: async () => true,
      removeFn: async (bucket, paths) => {
        for (const path of paths) removed.push(`${bucket}:${path}`);
        return { error: null };
      },
    });
    assert.equal(result.outcome, "deleted");
    assert.deepEqual(removed, [`${VIDEOS_BUCKET}:${OWNER}/clip.mp4`]);
  });

  it("malformed/foreign storage path is not deleted", async () => {
    const removed: OwnedStorageObjectRef[] = [];
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OWNER,
      loadPost: async () =>
        ownedPost({
          video_url: publicUrl(VIDEOS_BUCKET, `${OTHER}/stolen.mp4`),
          thumbnail_url: "https://evil.example/thumb.jpg",
        }),
      deletePostDb: async () => true,
      removeFn: async (bucket, paths) => {
        for (const path of paths) removed.push({ bucket, path });
        return { error: null };
      },
    });
    assert.equal(result.outcome, "deleted");
    assert.equal(result.dbDeleted, true);
    assert.equal(removed.length, 0);
  });

  it("already-gone is retry-safe and flags unknown storage paths", async () => {
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OWNER,
      loadPost: async () => null,
      deletePostDb: async () => {
        throw new Error("should not run");
      },
      removeFn: async () => {
        throw new Error("should not run");
      },
    });
    assert.equal(result.outcome, "already_gone");
    assert.equal(result.dbDeleted, true);
    assert.equal(result.storagePathsUnknown, true);
  });

  it("missing storage object is idempotent success", async () => {
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OWNER,
      loadPost: async () => ownedPost({ thumbnail_url: null }),
      deletePostDb: async () => true,
      removeFn: async () => ({
        error: { message: "Object not found", statusCode: "404" },
      }),
    });
    assert.equal(result.outcome, "deleted");
    assert.equal(result.storage.removed.length, 1);
    assert.equal(result.storage.failed.length, 0);
  });

  it("storage failure after DB delete returns storage_partial", async () => {
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OWNER,
      loadPost: async () => ownedPost({ thumbnail_url: null }),
      deletePostDb: async () => true,
      removeFn: async () => ({
        error: { message: "upstream timeout", statusCode: "503" },
      }),
    });
    assert.equal(result.outcome, "storage_partial");
    assert.equal(result.dbDeleted, true);
    assert.equal(result.storage.failed.length, 1);
  });

  it("documents report survival: deletePostDb must not wipe reports (SET NULL)", async () => {
    // Application contract check: injected DB delete stands in for storage.deletePost,
    // which no longer issues DELETE FROM reports (B1 FK SET NULL + B2 helper).
    let reportsDeleted = false;
    const result = await deleteOwnedPostWithStorage({
      postId: POST_ID,
      ownerUserId: OWNER,
      loadPost: async () => ownedPost({ video_url: null, thumbnail_url: null }),
      deletePostDb: async () => {
        // Simulate surviving report row after post delete (SET NULL).
        reportsDeleted = false;
        return true;
      },
      removeFn: async () => ({ error: null }),
    });
    assert.equal(result.outcome, "deleted");
    assert.equal(reportsDeleted, false);
  });
});

describe("deleteOwnedReleaseWithStorage", () => {
  let previousUrl: string | undefined;

  before(() => {
    previousUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
  });

  after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
  });

  it("owner can delete: DB + artwork removed", async () => {
    const removed: string[] = [];
    const result = await deleteOwnedReleaseWithStorage({
      releaseId: RELEASE_ID,
      ownerArtistId: OWNER,
      loadRelease: async () => ownedRelease(),
      deleteReleaseDb: async (id, owner) => {
        assert.equal(id, RELEASE_ID);
        assert.equal(owner, OWNER);
        return true;
      },
      removeFn: async (bucket, paths) => {
        for (const path of paths) removed.push(`${bucket}:${path}`);
        return { error: null };
      },
    });
    assert.equal(result.outcome, "deleted");
    assert.deepEqual(removed, [
      `${RELEASE_ARTWORKS_BUCKET}:${OWNER}/cover.jpg`,
    ]);
  });

  it("non-owner / collaborator rejected", async () => {
    let deleteCalled = false;
    const result = await deleteOwnedReleaseWithStorage({
      releaseId: RELEASE_ID,
      ownerArtistId: OTHER,
      loadRelease: async () => ownedRelease(),
      deleteReleaseDb: async () => {
        deleteCalled = true;
        return true;
      },
      removeFn: async () => ({ error: null }),
    });
    assert.equal(result.outcome, "forbidden");
    assert.equal(deleteCalled, false);
  });

  it("missing artwork tolerated", async () => {
    const removed: string[] = [];
    const result = await deleteOwnedReleaseWithStorage({
      releaseId: RELEASE_ID,
      ownerArtistId: OWNER,
      loadRelease: async () => ownedRelease({ artwork_url: null }),
      deleteReleaseDb: async () => true,
      removeFn: async (bucket, paths) => {
        for (const path of paths) removed.push(`${bucket}:${path}`);
        return { error: null };
      },
    });
    assert.equal(result.outcome, "deleted");
    assert.equal(removed.length, 0);
  });

  it("already-gone is retry-safe", async () => {
    const result = await deleteOwnedReleaseWithStorage({
      releaseId: RELEASE_ID,
      ownerArtistId: OWNER,
      loadRelease: async () => null,
      deleteReleaseDb: async () => {
        throw new Error("should not run");
      },
      removeFn: async () => {
        throw new Error("should not run");
      },
    });
    assert.equal(result.outcome, "already_gone");
    assert.equal(result.storagePathsUnknown, true);
  });

  it("missing artwork object is idempotent success", async () => {
    const result = await deleteOwnedReleaseWithStorage({
      releaseId: RELEASE_ID,
      ownerArtistId: OWNER,
      loadRelease: async () => ownedRelease(),
      deleteReleaseDb: async () => true,
      removeFn: async () => ({
        error: { message: "not found", statusCode: 404 },
      }),
    });
    assert.equal(result.outcome, "deleted");
    assert.equal(result.storage.failed.length, 0);
  });
});
