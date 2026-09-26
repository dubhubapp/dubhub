/**
 * Storage-aware owned post / release deletion helpers (Phase B2).
 *
 * Ordering: capture Storage refs → DB delete → Storage remove.
 * DB and Storage are not one transaction; Storage failures are reported as retryable.
 *
 * Does not implement full account deletion, Auth wipe, MailerLite, or profile asset deletion.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { supabase } from "./supabaseClient";
import {
  POST_THUMBNAILS_BUCKET,
  PROFILE_UPLOADS_BUCKET,
  RELEASE_ARTWORKS_BUCKET,
  VIDEOS_BUCKET,
  resolveOwnedStorageObject,
  removeOwnedStorageObjects,
  type OwnedStorageObjectRef,
  type StorageCleanupReport,
  type StorageRemoveFn,
} from "./owned-ugc-storage";

export type OwnedUgcDeleteOutcome =
  | "deleted"
  | "already_gone"
  | "forbidden"
  | "db_failed"
  | "storage_partial";

export type OwnedUgcDeleteResult = {
  outcome: OwnedUgcDeleteOutcome;
  /** True when the DB row is gone after this call (deleted now or already missing). */
  dbDeleted: boolean;
  /**
   * When the DB row is already gone, Storage paths cannot be rediscovered from DB.
   * Callers with a prior collect step can still retry Storage separately.
   */
  storagePathsUnknown: boolean;
  storage: StorageCleanupReport;
};

export type CollectOwnedAccountStorageResult = {
  userId: string;
  postVideos: OwnedStorageObjectRef[];
  postThumbnails: OwnedStorageObjectRef[];
  releaseArtworks: OwnedStorageObjectRef[];
  /** Collection only in B2 — do not delete via post/release helpers. */
  profileAssets: OwnedStorageObjectRef[];
  unresolved: Array<{ kind: string; id: string; raw: string }>;
};

const emptyStorageReport = (): StorageCleanupReport => ({
  attempted: [],
  removed: [],
  failed: [],
});

export type OwnedPostRow = {
  id: string;
  user_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
};

export type OwnedReleaseRow = {
  id: string;
  artist_id: string;
  artwork_url: string | null;
};

export type DeletePostDbFn = (postId: string) => Promise<boolean>;
export type DeleteReleaseDbFn = (
  releaseId: string,
  ownerId: string,
) => Promise<boolean>;
export type LoadOwnedPostFn = (postId: string) => Promise<OwnedPostRow | null>;
export type LoadOwnedReleaseFn = (
  releaseId: string,
) => Promise<OwnedReleaseRow | null>;
export type PostStillExistsFn = (postId: string) => Promise<boolean>;
export type ReleaseStillExistsFn = (releaseId: string) => Promise<boolean>;

async function defaultStorageRemove(
  bucket: OwnedStorageObjectRef["bucket"],
  paths: string[],
): Promise<{ error: { message?: string; statusCode?: string | number } | null }> {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (!error) return { error: null };
  return {
    error: {
      message: error.message,
      statusCode: (error as { statusCode?: string | number }).statusCode,
    },
  };
}

function resolvePostMediaRefs(args: {
  ownerUserId: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
}): OwnedStorageObjectRef[] {
  const refs: OwnedStorageObjectRef[] = [];
  const video = resolveOwnedStorageObject({
    urlOrPath: args.videoUrl,
    expectedOwnerId: args.ownerUserId,
    allowedBuckets: [VIDEOS_BUCKET],
    preferredBucket: VIDEOS_BUCKET,
  });
  if (video) refs.push(video);

  const thumb = resolveOwnedStorageObject({
    urlOrPath: args.thumbnailUrl,
    expectedOwnerId: args.ownerUserId,
    allowedBuckets: [POST_THUMBNAILS_BUCKET],
    preferredBucket: POST_THUMBNAILS_BUCKET,
  });
  if (thumb) refs.push(thumb);

  return refs;
}

function resolveReleaseArtworkRef(args: {
  ownerArtistId: string;
  artworkUrl: string | null;
}): OwnedStorageObjectRef | null {
  return resolveOwnedStorageObject({
    urlOrPath: args.artworkUrl,
    expectedOwnerId: args.ownerArtistId,
    allowedBuckets: [RELEASE_ARTWORKS_BUCKET],
    preferredBucket: RELEASE_ARTWORKS_BUCKET,
  });
}

async function defaultLoadOwnedPost(postId: string): Promise<OwnedPostRow | null> {
  const fetch = await db.execute(sql`
    SELECT id, user_id, video_url, thumbnail_url
    FROM posts
    WHERE id = ${postId}
    LIMIT 1
  `);
  const rows = (fetch as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  if (rows.length === 0) return null;
  const row = rows[0];
  if (typeof row.id !== "string" || typeof row.user_id !== "string") return null;
  return {
    id: row.id,
    user_id: row.user_id,
    video_url: typeof row.video_url === "string" ? row.video_url : null,
    thumbnail_url: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
  };
}

async function defaultPostStillExists(postId: string): Promise<boolean> {
  const again = await db.execute(sql`
    SELECT 1 FROM posts WHERE id = ${postId} LIMIT 1
  `);
  return ((again as { rows?: unknown[] }).rows ?? []).length > 0;
}

async function defaultLoadOwnedRelease(
  releaseId: string,
): Promise<OwnedReleaseRow | null> {
  const fetch = await db.execute(sql`
    SELECT id, artist_id, artwork_url
    FROM releases
    WHERE id = ${releaseId}
    LIMIT 1
  `);
  const rows = (fetch as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  if (rows.length === 0) return null;
  const row = rows[0];
  if (typeof row.id !== "string" || typeof row.artist_id !== "string") return null;
  return {
    id: row.id,
    artist_id: row.artist_id,
    artwork_url: typeof row.artwork_url === "string" ? row.artwork_url : null,
  };
}

async function defaultReleaseStillExists(releaseId: string): Promise<boolean> {
  const again = await db.execute(sql`
    SELECT 1 FROM releases WHERE id = ${releaseId} LIMIT 1
  `);
  return ((again as { rows?: unknown[] }).rows ?? []).length > 0;
}

/**
 * Delete a post owned by ownerUserId, then remove video/thumbnail Storage objects.
 * ownerUserId must come from authenticated server context (not client body).
 */
export async function deleteOwnedPostWithStorage(args: {
  postId: string;
  ownerUserId: string;
  loadPost?: LoadOwnedPostFn;
  postStillExists?: PostStillExistsFn;
  deletePostDb?: DeletePostDbFn;
  removeFn?: StorageRemoveFn;
}): Promise<OwnedUgcDeleteResult> {
  const loadPost = args.loadPost ?? defaultLoadOwnedPost;
  const postStillExists = args.postStillExists ?? defaultPostStillExists;
  const removeFn = args.removeFn ?? defaultStorageRemove;

  const row = await loadPost(args.postId);

  if (!row) {
    return {
      outcome: "already_gone",
      dbDeleted: true,
      storagePathsUnknown: true,
      storage: emptyStorageReport(),
    };
  }

  if (row.user_id !== args.ownerUserId) {
    return {
      outcome: "forbidden",
      dbDeleted: false,
      storagePathsUnknown: false,
      storage: emptyStorageReport(),
    };
  }

  const mediaRefs = resolvePostMediaRefs({
    ownerUserId: args.ownerUserId,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
  });

  let dbOk = false;
  if (args.deletePostDb) {
    dbOk = await args.deletePostDb(args.postId);
  } else {
    const { storage } = await import("./storage");
    dbOk = await storage.deletePost(args.postId);
  }

  if (!dbOk) {
    const stillThere = await postStillExists(args.postId);
    if (stillThere) {
      return {
        outcome: "db_failed",
        dbDeleted: false,
        storagePathsUnknown: false,
        storage: emptyStorageReport(),
      };
    }
  }

  const storage = await removeOwnedStorageObjects(mediaRefs, removeFn);
  if (storage.failed.length > 0) {
    return {
      outcome: "storage_partial",
      dbDeleted: true,
      storagePathsUnknown: false,
      storage,
    };
  }

  return {
    outcome: "deleted",
    dbDeleted: true,
    storagePathsUnknown: false,
    storage,
  };
}

/**
 * Delete a post by id using the DB owner for Storage ownership checks.
 * For moderator / enforcement paths (caller already authorized separately).
 */
export async function deletePostWithStorageById(args: {
  postId: string;
  loadPost?: LoadOwnedPostFn;
  postStillExists?: PostStillExistsFn;
  deletePostDb?: DeletePostDbFn;
  removeFn?: StorageRemoveFn;
}): Promise<OwnedUgcDeleteResult> {
  const loadPost = args.loadPost ?? defaultLoadOwnedPost;
  const row = await loadPost(args.postId);
  if (!row) {
    return {
      outcome: "already_gone",
      dbDeleted: true,
      storagePathsUnknown: true,
      storage: emptyStorageReport(),
    };
  }
  return deleteOwnedPostWithStorage({
    postId: args.postId,
    ownerUserId: row.user_id,
    loadPost: async () => row,
    postStillExists: args.postStillExists,
    deletePostDb: args.deletePostDb,
    removeFn: args.removeFn,
  });
}

/**
 * Delete an artist-owned release, then remove artwork Storage.
 * Preserves existing deleteRelease DB semantics (ledger survives release delete).
 */
export async function deleteOwnedReleaseWithStorage(args: {
  releaseId: string;
  ownerArtistId: string;
  loadRelease?: LoadOwnedReleaseFn;
  releaseStillExists?: ReleaseStillExistsFn;
  deleteReleaseDb?: DeleteReleaseDbFn;
  removeFn?: StorageRemoveFn;
}): Promise<OwnedUgcDeleteResult> {
  const loadRelease = args.loadRelease ?? defaultLoadOwnedRelease;
  const releaseStillExists = args.releaseStillExists ?? defaultReleaseStillExists;
  const removeFn = args.removeFn ?? defaultStorageRemove;

  const row = await loadRelease(args.releaseId);

  if (!row) {
    return {
      outcome: "already_gone",
      dbDeleted: true,
      storagePathsUnknown: true,
      storage: emptyStorageReport(),
    };
  }

  if (row.artist_id !== args.ownerArtistId) {
    return {
      outcome: "forbidden",
      dbDeleted: false,
      storagePathsUnknown: false,
      storage: emptyStorageReport(),
    };
  }

  const artworkRef = resolveReleaseArtworkRef({
    ownerArtistId: args.ownerArtistId,
    artworkUrl: row.artwork_url,
  });
  const mediaRefs = artworkRef ? [artworkRef] : [];

  let dbOk = false;
  if (args.deleteReleaseDb) {
    dbOk = await args.deleteReleaseDb(args.releaseId, args.ownerArtistId);
  } else {
    const { storage } = await import("./storage");
    dbOk = await storage.deleteRelease(args.releaseId, args.ownerArtistId);
  }

  if (!dbOk) {
    const stillThere = await releaseStillExists(args.releaseId);
    if (stillThere) {
      return {
        outcome: "db_failed",
        dbDeleted: false,
        storagePathsUnknown: false,
        storage: emptyStorageReport(),
      };
    }
  }

  const storage = await removeOwnedStorageObjects(mediaRefs, removeFn);
  if (storage.failed.length > 0) {
    return {
      outcome: "storage_partial",
      dbDeleted: true,
      storagePathsUnknown: false,
      storage,
    };
  }

  return {
    outcome: "deleted",
    dbDeleted: true,
    storagePathsUnknown: false,
    storage,
  };
}

/**
 * Collect Storage refs for a user before account deletion.
 * Does not delete anything. Profile assets are listed only.
 */
export async function collectOwnedAccountStorage(
  userId: string,
): Promise<CollectOwnedAccountStorageResult> {
  const postVideos: OwnedStorageObjectRef[] = [];
  const postThumbnails: OwnedStorageObjectRef[] = [];
  const releaseArtworks: OwnedStorageObjectRef[] = [];
  const profileAssets: OwnedStorageObjectRef[] = [];
  const unresolved: Array<{ kind: string; id: string; raw: string }> = [];

  const postsResult = await db.execute(sql`
    SELECT id, video_url, thumbnail_url
    FROM posts
    WHERE user_id = ${userId}
  `);
  for (const row of (postsResult as { rows?: Array<Record<string, unknown>> }).rows ?? []) {
    const id = String(row.id ?? "");
    const videoUrl = typeof row.video_url === "string" ? row.video_url : null;
    const thumbnailUrl =
      typeof row.thumbnail_url === "string" ? row.thumbnail_url : null;

    if (videoUrl) {
      const ref = resolveOwnedStorageObject({
        urlOrPath: videoUrl,
        expectedOwnerId: userId,
        allowedBuckets: [VIDEOS_BUCKET],
        preferredBucket: VIDEOS_BUCKET,
      });
      if (ref) postVideos.push(ref);
      else unresolved.push({ kind: "post_video", id, raw: videoUrl });
    }
    if (thumbnailUrl) {
      const ref = resolveOwnedStorageObject({
        urlOrPath: thumbnailUrl,
        expectedOwnerId: userId,
        allowedBuckets: [POST_THUMBNAILS_BUCKET],
        preferredBucket: POST_THUMBNAILS_BUCKET,
      });
      if (ref) postThumbnails.push(ref);
      else unresolved.push({ kind: "post_thumbnail", id, raw: thumbnailUrl });
    }
  }

  const releasesResult = await db.execute(sql`
    SELECT id, artwork_url
    FROM releases
    WHERE artist_id = ${userId}
  `);
  for (const row of (releasesResult as { rows?: Array<Record<string, unknown>> }).rows ?? []) {
    const id = String(row.id ?? "");
    const artworkUrl =
      typeof row.artwork_url === "string" ? row.artwork_url : null;
    if (!artworkUrl) continue;
    const ref = resolveReleaseArtworkRef({
      ownerArtistId: userId,
      artworkUrl,
    });
    if (ref) releaseArtworks.push(ref);
    else unresolved.push({ kind: "release_artwork", id, raw: artworkUrl });
  }

  const profileResult = await db.execute(sql`
    SELECT avatar_url, banner_url
    FROM profiles
    WHERE id = ${userId}
    LIMIT 1
  `);
  const profileRow = ((profileResult as { rows?: Array<Record<string, unknown>> }).rows ??
    [])[0];
  if (profileRow) {
    for (const [kind, raw] of [
      ["avatar", profileRow.avatar_url],
      ["banner", profileRow.banner_url],
    ] as const) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const ref = resolveOwnedStorageObject({
        urlOrPath: raw,
        expectedOwnerId: userId,
        allowedBuckets: [PROFILE_UPLOADS_BUCKET],
        preferredBucket: PROFILE_UPLOADS_BUCKET,
      });
      if (ref) profileAssets.push(ref);
      else unresolved.push({ kind: `profile_${kind}`, id: userId, raw });
    }
  }

  return {
    userId,
    postVideos,
    postThumbnails,
    releaseArtworks,
    profileAssets,
    unresolved,
  };
}
