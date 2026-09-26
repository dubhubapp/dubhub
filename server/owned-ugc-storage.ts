/**
 * Storage path resolution + removal for owned UGC (posts / releases).
 * Used by storage-aware delete helpers and (later) account deletion jobs.
 *
 * Not a generic “delete any Supabase URL” utility — approved buckets only,
 * with expected owner UUID prefix checks where applicable.
 */

import { PROFILE_UPLOADS_BUCKET, PROFILE_UPLOADS_PUBLIC_PATH } from "./profileMediaUrl";
import { POST_THUMBNAILS_BUCKET, POST_THUMBNAILS_PUBLIC_PATH } from "./postThumbnailUrl";
import { RELEASE_ARTWORKS_BUCKET, RELEASE_ARTWORKS_PUBLIC_PATH } from "./releaseArtworkUrl";

export { PROFILE_UPLOADS_BUCKET } from "./profileMediaUrl";
export { POST_THUMBNAILS_BUCKET } from "./postThumbnailUrl";
export { RELEASE_ARTWORKS_BUCKET } from "./releaseArtworkUrl";

export const VIDEOS_BUCKET = "videos" as const;
export const VIDEOS_PUBLIC_PATH = `/storage/v1/object/public/${VIDEOS_BUCKET}/`;

export const OWNED_UGC_STORAGE_BUCKETS = [
  VIDEOS_BUCKET,
  POST_THUMBNAILS_BUCKET,
  RELEASE_ARTWORKS_BUCKET,
  PROFILE_UPLOADS_BUCKET,
] as const;

export type OwnedUgcStorageBucket = (typeof OWNED_UGC_STORAGE_BUCKETS)[number];

export type OwnedStorageObjectRef = {
  bucket: OwnedUgcStorageBucket;
  path: string;
};

const BUCKET_PUBLIC_PATH: Record<OwnedUgcStorageBucket, string> = {
  [VIDEOS_BUCKET]: VIDEOS_PUBLIC_PATH,
  [POST_THUMBNAILS_BUCKET]: POST_THUMBNAILS_PUBLIC_PATH,
  [RELEASE_ARTWORKS_BUCKET]: RELEASE_ARTWORKS_PUBLIC_PATH,
  [PROFILE_UPLOADS_BUCKET]: PROFILE_UPLOADS_PUBLIC_PATH,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Shared defaults under profile_uploads — never removable via owned helpers. */
export function isProtectedSharedProfileAssetPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, "");
  return (
    normalized === "users/default_user_avatar.png" ||
    normalized === "artists/default_artist_avatar.png" ||
    normalized.endsWith("/default_user_avatar.png") ||
    normalized.endsWith("/default_artist_avatar.png")
  );
}

/**
 * True when object path is owned by expectedOwnerId for the given bucket.
 * - videos / post-thumbnails / release-artworks: `{ownerId}/…`
 * - profile_uploads: `users|{ownerId}.png`, `artists|{ownerId}.png`, banners,
 *   or `{ownerId}/…` (server upload-profile-picture convention)
 */
export function pathBelongsToOwner(
  bucket: OwnedUgcStorageBucket,
  path: string,
  expectedOwnerId: string,
): boolean {
  if (!isUuid(expectedOwnerId)) return false;
  const normalized = path.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return false;

  if (bucket === PROFILE_UPLOADS_BUCKET) {
    if (isProtectedSharedProfileAssetPath(normalized)) return false;
    if (normalized.startsWith(`${expectedOwnerId}/`)) return true;
    if (normalized === `users/${expectedOwnerId}.png`) return true;
    if (normalized === `artists/${expectedOwnerId}.png`) return true;
    if (normalized === `users/${expectedOwnerId}_banner.png`) return true;
    if (normalized === `artists/${expectedOwnerId}_banner.png`) return true;
    return false;
  }

  return normalized.startsWith(`${expectedOwnerId}/`);
}

function extractObjectPathFromUrl(
  url: URL,
  bucket: OwnedUgcStorageBucket,
): string | null {
  const marker = BUCKET_PUBLIC_PATH[bucket];
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return null;
  const raw = url.pathname.slice(idx + marker.length);
  if (!raw) return null;
  return raw
    .split("/")
    .map(decodePathSegment)
    .filter((p) => p.length > 0)
    .join("/");
}

function detectBucketFromRelativePath(
  path: string,
  allowed: ReadonlySet<OwnedUgcStorageBucket>,
): OwnedUgcStorageBucket | null {
  for (const bucket of OWNED_UGC_STORAGE_BUCKETS) {
    if (!allowed.has(bucket)) continue;
    const prefix = `${bucket}/`;
    if (path === bucket || path.startsWith(prefix)) {
      return bucket;
    }
  }
  return null;
}

export type ResolveOwnedStorageObjectArgs = {
  urlOrPath: string | null | undefined;
  expectedOwnerId: string;
  allowedBuckets: readonly OwnedUgcStorageBucket[];
  /** When set, only this bucket is considered (faster / stricter). */
  preferredBucket?: OwnedUgcStorageBucket;
};

/**
 * Resolve a DB-stored public URL or relative path to an owned Storage object.
 * Returns null for malformed, foreign, unprotected, or non-owned refs.
 */
export function resolveOwnedStorageObject(
  args: ResolveOwnedStorageObjectArgs,
): OwnedStorageObjectRef | null {
  const { expectedOwnerId, preferredBucket } = args;
  if (!isUuid(expectedOwnerId)) return null;

  if (typeof args.urlOrPath !== "string") return null;
  const trimmed = args.urlOrPath.trim();
  if (!trimmed) return null;

  const allowed = new Set(
    preferredBucket ? [preferredBucket] : args.allowedBuckets,
  );
  if (preferredBucket && !args.allowedBuckets.includes(preferredBucket)) {
    return null;
  }

  const supabaseBase = process.env.SUPABASE_URL?.replace(/\/$/, "");

  // Absolute URL
  if (/^https?:\/\//i.test(trimmed)) {
    if (!supabaseBase) return null;
    let parsed: URL;
    let expectedHost: string;
    try {
      parsed = new URL(trimmed);
      expectedHost = new URL(supabaseBase).host;
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.host !== expectedHost) return null;

    const candidates = preferredBucket
      ? [preferredBucket]
      : [...args.allowedBuckets];

    for (const bucket of candidates) {
      if (!allowed.has(bucket)) continue;
      const objectPath = extractObjectPathFromUrl(parsed, bucket);
      if (!objectPath) continue;
      if (bucket === PROFILE_UPLOADS_BUCKET && isProtectedSharedProfileAssetPath(objectPath)) {
        return null;
      }
      if (!pathBelongsToOwner(bucket, objectPath, expectedOwnerId)) return null;
      return { bucket, path: objectPath };
    }
    return null;
  }

  // Legacy local video path (not Supabase Storage) — not deletable here
  if (trimmed.startsWith("/videos/")) {
    return null;
  }

  // Relative storage path: either `bucket/owner/...` or `owner/...` with preferredBucket
  const withoutLeading = trimmed.replace(/^\/+/, "");
  const detected = detectBucketFromRelativePath(withoutLeading, allowed);
  if (detected) {
    const objectPath = withoutLeading.slice(detected.length + 1);
    if (!objectPath) return null;
    if (detected === PROFILE_UPLOADS_BUCKET && isProtectedSharedProfileAssetPath(objectPath)) {
      return null;
    }
    if (!pathBelongsToOwner(detected, objectPath, expectedOwnerId)) return null;
    return { bucket: detected, path: objectPath };
  }

  if (preferredBucket && allowed.has(preferredBucket)) {
    if (
      preferredBucket === PROFILE_UPLOADS_BUCKET &&
      isProtectedSharedProfileAssetPath(withoutLeading)
    ) {
      return null;
    }
    if (!pathBelongsToOwner(preferredBucket, withoutLeading, expectedOwnerId)) {
      return null;
    }
    return { bucket: preferredBucket, path: withoutLeading };
  }

  return null;
}

export type RemoveStorageObjectResult =
  | { ok: true; alreadyMissing: boolean }
  | { ok: false; retryable: true; message: string };

export type StorageRemoveFn = (
  bucket: OwnedUgcStorageBucket,
  paths: string[],
) => Promise<{ error: { message?: string; statusCode?: string | number } | null }>;

/**
 * Remove one Storage object. Missing object → idempotent success.
 */
export async function removeOwnedStorageObject(
  ref: OwnedStorageObjectRef,
  removeFn: StorageRemoveFn,
): Promise<RemoveStorageObjectResult> {
  if (ref.bucket === PROFILE_UPLOADS_BUCKET && isProtectedSharedProfileAssetPath(ref.path)) {
    return { ok: false, retryable: true, message: "refused_protected_shared_asset" };
  }

  const { error } = await removeFn(ref.bucket, [ref.path]);
  if (!error) {
    return { ok: true, alreadyMissing: false };
  }

  const status = String(error.statusCode ?? "");
  const message = (error.message ?? "").toLowerCase();
  const missing =
    status === "404" ||
    status === "400" ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("no such file");

  if (missing) {
    return { ok: true, alreadyMissing: true };
  }

  return {
    ok: false,
    retryable: true,
    message: error.message ?? "storage_remove_failed",
  };
}

export type StorageCleanupReport = {
  attempted: OwnedStorageObjectRef[];
  removed: OwnedStorageObjectRef[];
  failed: Array<OwnedStorageObjectRef & { message: string }>;
};

export async function removeOwnedStorageObjects(
  refs: OwnedStorageObjectRef[],
  removeFn: StorageRemoveFn,
): Promise<StorageCleanupReport> {
  const attempted: OwnedStorageObjectRef[] = [];
  const removed: OwnedStorageObjectRef[] = [];
  const failed: Array<OwnedStorageObjectRef & { message: string }> = [];

  // Dedupe by bucket+path
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.bucket}:${ref.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attempted.push(ref);
    const result = await removeOwnedStorageObject(ref, removeFn);
    if (result.ok) {
      removed.push(ref);
    } else {
      failed.push({ ...ref, message: result.message });
    }
  }

  return { attempted, removed, failed };
}
