/**
 * Internal account-deletion orchestrator (Phase B3).
 *
 * Runs DB + Storage cleanup for one userId, advances account_deletion_jobs,
 * and STOPS at `ready_for_external_cleanup` — no Auth, MailerLite, or RC wipe.
 *
 * Invoke only from server/tests. No HTTP exposure.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { supabase } from "./supabaseClient";
import {
  collectOwnedAccountStorage,
  deleteOwnedPostWithStorage,
  deleteOwnedReleaseWithStorage,
  type CollectOwnedAccountStorageResult,
  type OwnedUgcDeleteResult,
} from "./owned-ugc-delete";
import {
  POST_THUMBNAILS_BUCKET,
  PROFILE_UPLOADS_BUCKET,
  RELEASE_ARTWORKS_BUCKET,
  VIDEOS_BUCKET,
  pathBelongsToOwner,
  removeOwnedStorageObjects,
  type OwnedStorageObjectRef,
  type OwnedUgcStorageBucket,
  type StorageRemoveFn,
} from "./owned-ugc-storage";

export const ACCOUNT_DELETION_STAGES = [
  "collect_storage",
  "shared_refs",
  "releases",
  "posts",
  "comments",
  "user_rows",
  "storage",
  "ready_for_external_cleanup",
] as const;

export type AccountDeletionStage = (typeof ACCOUNT_DELETION_STAGES)[number];

export const READY_FOR_EXTERNAL_CLEANUP_STAGE =
  "ready_for_external_cleanup" as const;

export type AccountDeletionJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type AccountDeletionJobRow = {
  id: string;
  userId: string;
  status: AccountDeletionJobStatus;
  currentStage: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type AccountDeletionJobResult = {
  outcome:
    | "ready_for_external_cleanup"
    | "already_ready"
    | "already_completed"
    | "failed"
    | "invalid_user";
  job: AccountDeletionJobRow | null;
  collectedStorage: CollectOwnedAccountStorageResult | null;
  /** Non-PII diagnostics for tests/ops */
  stageReached: AccountDeletionStage | null;
  failureCode: string | null;
};

export type AccountDeletionDeps = {
  collectStorage?: (
    userId: string,
  ) => Promise<CollectOwnedAccountStorageResult>;
  listOwnedReleaseIds?: (userId: string) => Promise<string[]>;
  listOwnedPostIds?: (userId: string) => Promise<string[]>;
  deleteRelease?: (args: {
    releaseId: string;
    ownerArtistId: string;
    removeFn?: StorageRemoveFn;
  }) => Promise<OwnedUgcDeleteResult>;
  deletePost?: (args: {
    postId: string;
    ownerUserId: string;
    removeFn?: StorageRemoveFn;
  }) => Promise<OwnedUgcDeleteResult>;
  clearSharedIdentityRefs?: (userId: string) => Promise<void>;
  deleteUserCommentsOnOthersPosts?: (userId: string) => Promise<void>;
  cleanupUserRows?: (userId: string) => Promise<void>;
  sweepStorage?: (args: {
    userId: string;
    collected: CollectOwnedAccountStorageResult;
    removeFn?: StorageRemoveFn;
  }) => Promise<{ ok: true } | { ok: false; code: string; reason: string }>;
  removeFn?: StorageRemoveFn;
  now?: () => Date;
  /** Job store — defaults to live Postgres account_deletion_jobs */
  jobs?: AccountDeletionJobStore;
};

export type AccountDeletionJobStore = {
  findLatestForUser: (userId: string) => Promise<AccountDeletionJobRow | null>;
  findActiveForUser: (userId: string) => Promise<AccountDeletionJobRow | null>;
  insertPending: (userId: string, now: Date) => Promise<AccountDeletionJobRow>;
  markRunning: (
    jobId: string,
    stage: string,
    now: Date,
  ) => Promise<AccountDeletionJobRow>;
  setStage: (
    jobId: string,
    stage: string,
    now: Date,
  ) => Promise<AccountDeletionJobRow>;
  markFailed: (
    jobId: string,
    stage: string,
    failureCode: string,
    failureReason: string,
    now: Date,
  ) => Promise<AccountDeletionJobRow>;
  /** Service-role update after Auth delete — no user JWT required. */
  markCompleted: (
    jobId: string,
    now: Date,
  ) => Promise<AccountDeletionJobRow>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function mapJobRow(row: Record<string, unknown>): AccountDeletionJobRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: row.status as AccountDeletionJobStatus,
    currentStage:
      typeof row.current_stage === "string" ? row.current_stage : null,
    failureCode:
      typeof row.failure_code === "string" ? row.failure_code : null,
    failureReason:
      typeof row.failure_reason === "string" ? row.failure_reason : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at))
      : null,
  };
}

export const postgresAccountDeletionJobStore: AccountDeletionJobStore = {
  async findLatestForUser(userId) {
    const result = await db.execute(sql`
      SELECT id, user_id, status, current_stage, failure_code, failure_reason,
             created_at, updated_at, completed_at
      FROM account_deletion_jobs
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    return rows[0] ? mapJobRow(rows[0]) : null;
  },

  async findActiveForUser(userId) {
    const result = await db.execute(sql`
      SELECT id, user_id, status, current_stage, failure_code, failure_reason,
             created_at, updated_at, completed_at
      FROM account_deletion_jobs
      WHERE user_id = ${userId}
        AND status IN ('pending', 'running')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    return rows[0] ? mapJobRow(rows[0]) : null;
  },

  async insertPending(userId, now) {
    const result = await db.execute(sql`
      INSERT INTO account_deletion_jobs (user_id, status, current_stage, created_at, updated_at)
      VALUES (${userId}, 'pending', 'collect_storage', ${now.toISOString()}, ${now.toISOString()})
      RETURNING id, user_id, status, current_stage, failure_code, failure_reason,
                created_at, updated_at, completed_at
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    if (!rows[0]) throw new Error("account_deletion_job_insert_failed");
    return mapJobRow(rows[0]);
  },

  async markRunning(jobId, stage, now) {
    const result = await db.execute(sql`
      UPDATE account_deletion_jobs
      SET status = 'running',
          current_stage = ${stage},
          failure_code = NULL,
          failure_reason = NULL,
          updated_at = ${now.toISOString()}
      WHERE id = ${jobId}
      RETURNING id, user_id, status, current_stage, failure_code, failure_reason,
                created_at, updated_at, completed_at
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    if (!rows[0]) throw new Error("account_deletion_job_mark_running_failed");
    return mapJobRow(rows[0]);
  },

  async setStage(jobId, stage, now) {
    const result = await db.execute(sql`
      UPDATE account_deletion_jobs
      SET current_stage = ${stage},
          updated_at = ${now.toISOString()}
      WHERE id = ${jobId}
      RETURNING id, user_id, status, current_stage, failure_code, failure_reason,
                created_at, updated_at, completed_at
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    if (!rows[0]) throw new Error("account_deletion_job_set_stage_failed");
    return mapJobRow(rows[0]);
  },

  async markFailed(jobId, stage, failureCode, failureReason, now) {
    const result = await db.execute(sql`
      UPDATE account_deletion_jobs
      SET status = 'failed',
          current_stage = ${stage},
          failure_code = ${failureCode},
          failure_reason = ${failureReason},
          updated_at = ${now.toISOString()}
      WHERE id = ${jobId}
      RETURNING id, user_id, status, current_stage, failure_code, failure_reason,
                created_at, updated_at, completed_at
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    if (!rows[0]) throw new Error("account_deletion_job_mark_failed_failed");
    return mapJobRow(rows[0]);
  },

  async markCompleted(jobId, now) {
    const result = await db.execute(sql`
      UPDATE account_deletion_jobs
      SET status = 'completed',
          current_stage = 'completed',
          failure_code = NULL,
          failure_reason = NULL,
          completed_at = ${now.toISOString()},
          updated_at = ${now.toISOString()}
      WHERE id = ${jobId}
      RETURNING id, user_id, status, current_stage, failure_code, failure_reason,
                created_at, updated_at, completed_at
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    if (!rows[0]) throw new Error("account_deletion_job_mark_completed_failed");
    return mapJobRow(rows[0]);
  },
};

/** Clear identity credits on OTHER users' posts; preserve identification outcomes. */
export async function clearSharedIdentityRefs(userId: string): Promise<void> {
  await db.execute(sql`
    UPDATE posts
    SET verified_by = NULL
    WHERE verified_by = ${userId}
      AND user_id IS DISTINCT FROM ${userId}
  `);

  await db.execute(sql`
    UPDATE posts
    SET verified_comment_id = NULL
    WHERE verified_comment_id IN (
      SELECT id FROM comments WHERE user_id = ${userId}
    )
    AND user_id IS DISTINCT FROM ${userId}
  `);

  await db.execute(sql`
    UPDATE posts
    SET artist_verified_by = NULL
    WHERE artist_verified_by = ${userId}
      AND user_id IS DISTINCT FROM ${userId}
  `);

  // No FK on artist_id — remove tags that identify this artist on any post
  await db.execute(sql`
    DELETE FROM artist_video_tags WHERE artist_id = ${userId}
  `);

  // Collaborator on another artist's release: remove row only (owner release survives)
  await db.execute(sql`
    DELETE FROM release_collaborators WHERE artist_id = ${userId}
  `);

  await db.execute(sql`
    UPDATE release_collaborators
    SET invited_by = NULL
    WHERE invited_by = ${userId}
  `);
}

/**
 * Hard-delete comments by user on others' posts after reparenting replies,
 * so comments_parent_id CASCADE does not wipe other users' replies.
 */
export async function deleteUserCommentsOnOthersPosts(
  userId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE comments
    SET parent_id = NULL
    WHERE parent_id IN (SELECT id FROM comments WHERE user_id = ${userId})
  `);

  await db.execute(sql`
    DELETE FROM comments
    WHERE user_id = ${userId}
      AND (
        post_id IS NULL
        OR post_id NOT IN (SELECT id FROM posts WHERE user_id = ${userId})
      )
  `);
}

/**
 * No-FK leftovers + moderation identity anonymisation.
 * Live evidence (read-only audit):
 * - post_likes.user_id — no FK → DELETE
 * - notifications.artist_id — no FK → DELETE (recipient inbox)
 * - artist_video_tags.artist_id — no FK → DELETE (also in shared_refs)
 * - moderator_actions.moderator_id — no FK, nullable → SET NULL (preserve case)
 * - leaderboard_stats.user_id — no FK → DELETE
 * - artist_leaderboard_stats.artist_id — no FK → DELETE
 * CASCADE later (Auth/profile): comment_votes, feedback, alerts, push, prefs, karma, ledger, …
 * Reports: untouched (B1 SET NULL).
 */
export async function cleanupNoFkUserRows(userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM post_likes WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM notifications WHERE artist_id = ${userId}`);
  await db.execute(sql`DELETE FROM artist_video_tags WHERE artist_id = ${userId}`);
  await db.execute(sql`
    UPDATE moderator_actions
    SET moderator_id = NULL
    WHERE moderator_id = ${userId}
  `);
  await db.execute(sql`DELETE FROM leaderboard_stats WHERE user_id = ${userId}`);
  await db.execute(sql`
    DELETE FROM artist_leaderboard_stats WHERE artist_id = ${userId}
  `);
}

function dedupeRefs(refs: OwnedStorageObjectRef[]): OwnedStorageObjectRef[] {
  const seen = new Set<string>();
  const out: OwnedStorageObjectRef[] = [];
  for (const ref of refs) {
    const key = `${ref.bucket}:${ref.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/** Deterministic profile path candidates (no DB required after profile row may change). */
export function profileUploadPathCandidates(
  userId: string,
): OwnedStorageObjectRef[] {
  const paths = [
    `users/${userId}.png`,
    `artists/${userId}.png`,
    `users/${userId}_banner.png`,
    `artists/${userId}_banner.png`,
  ];
  return paths
    .filter((path) => pathBelongsToOwner(PROFILE_UPLOADS_BUCKET, path, userId))
    .map((path) => ({ bucket: PROFILE_UPLOADS_BUCKET, path }));
}

/**
 * List objects under `{userId}/` in a bucket (prefix sweep).
 * Recommended over persisting collected JSON across restarts.
 */
export async function listUserPrefixedStorageObjects(args: {
  userId: string;
  bucket: OwnedUgcStorageBucket;
  listFn?: (
    bucket: OwnedUgcStorageBucket,
    prefix: string,
  ) => Promise<string[]>;
}): Promise<OwnedStorageObjectRef[]> {
  const listFn =
    args.listFn ??
    (async (bucket, prefix) => {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
      });
      if (error || !data) return [];
      return data
        .map((item) => item.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
        .map((name) => `${prefix}/${name}`);
    });

  const objectPaths = await listFn(args.bucket, args.userId);
  return objectPaths
    .filter((path) => pathBelongsToOwner(args.bucket, path, args.userId))
    .map((path) => ({ bucket: args.bucket, path }));
}

export async function sweepOwnedAccountStorage(args: {
  userId: string;
  collected: CollectOwnedAccountStorageResult;
  removeFn?: StorageRemoveFn;
  listPrefixed?: (
    bucket: OwnedUgcStorageBucket,
    userId: string,
  ) => Promise<OwnedStorageObjectRef[]>;
}): Promise<{ ok: true } | { ok: false; code: string; reason: string }> {
  const removeFn = args.removeFn;
  if (!removeFn) {
    return {
      ok: false,
      code: "storage_remove_unavailable",
      reason: "storage_remove_fn_required",
    };
  }

  const listPrefixed =
    args.listPrefixed ??
    (async (bucket, userId) =>
      listUserPrefixedStorageObjects({ userId, bucket }));

  const prefixBuckets: OwnedUgcStorageBucket[] = [
    VIDEOS_BUCKET,
    POST_THUMBNAILS_BUCKET,
    RELEASE_ARTWORKS_BUCKET,
    PROFILE_UPLOADS_BUCKET,
  ];

  const prefixed: OwnedStorageObjectRef[] = [];
  for (const bucket of prefixBuckets) {
    prefixed.push(...(await listPrefixed(bucket, args.userId)));
  }

  const refs = dedupeRefs([
    ...args.collected.postVideos,
    ...args.collected.postThumbnails,
    ...args.collected.releaseArtworks,
    ...args.collected.profileAssets,
    ...profileUploadPathCandidates(args.userId),
    ...prefixed,
  ]);

  const report = await removeOwnedStorageObjects(refs, removeFn);
  if (report.failed.length > 0) {
    return {
      ok: false,
      code: "storage_cleanup_partial",
      reason: `failed_objects_${report.failed.length}`,
    };
  }
  return { ok: true };
}

async function defaultListOwnedReleaseIds(userId: string): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT id FROM releases WHERE artist_id = ${userId}
  `);
  return ((result as { rows?: Array<{ id?: string }> }).rows ?? [])
    .map((r) => r.id)
    .filter((id): id is string => typeof id === "string");
}

async function defaultListOwnedPostIds(userId: string): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT id FROM posts WHERE user_id = ${userId}
  `);
  return ((result as { rows?: Array<{ id?: string }> }).rows ?? [])
    .map((r) => r.id)
    .filter((id): id is string => typeof id === "string");
}

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

/**
 * Acquire or reuse a job row for userId.
 * Does not create a second active job (partial unique index).
 */
export async function acquireAccountDeletionJob(
  userId: string,
  store: AccountDeletionJobStore,
  now: Date,
): Promise<
  | { kind: "use"; job: AccountDeletionJobRow }
  | { kind: "already_completed"; job: AccountDeletionJobRow }
  | { kind: "already_ready"; job: AccountDeletionJobRow }
> {
  const latest = await store.findLatestForUser(userId);
  if (latest?.status === "completed") {
    return { kind: "already_completed", job: latest };
  }
  if (
    latest?.status === "running" &&
    latest.currentStage === READY_FOR_EXTERNAL_CLEANUP_STAGE
  ) {
    return { kind: "already_ready", job: latest };
  }

  const active = await store.findActiveForUser(userId);
  if (active) {
    const running = await store.markRunning(
      active.id,
      active.currentStage ?? "collect_storage",
      now,
    );
    return { kind: "use", job: running };
  }

  if (latest?.status === "failed") {
    const running = await store.markRunning(latest.id, "collect_storage", now);
    return { kind: "use", job: running };
  }

  try {
    const pending = await store.insertPending(userId, now);
    const running = await store.markRunning(pending.id, "collect_storage", now);
    return { kind: "use", job: running };
  } catch (error) {
    // Unique active index race — reuse the winner
    const raced = await store.findActiveForUser(userId);
    if (raced) {
      const running = await store.markRunning(
        raced.id,
        raced.currentStage ?? "collect_storage",
        now,
      );
      return { kind: "use", job: running };
    }
    throw error;
  }
}

/**
 * Internal orchestrator. Stops before Auth / MailerLite / RC.
 */
export async function runAccountDeletionJob(
  userId: string,
  deps: AccountDeletionDeps = {},
): Promise<AccountDeletionJobResult> {
  if (!isUuid(userId)) {
    return {
      outcome: "invalid_user",
      job: null,
      collectedStorage: null,
      stageReached: null,
      failureCode: "invalid_user_id",
    };
  }

  const store = deps.jobs ?? postgresAccountDeletionJobStore;
  const nowFn = deps.now ?? (() => new Date());
  let now = nowFn();

  const acquired = await acquireAccountDeletionJob(userId, store, now);
  if (acquired.kind === "already_completed") {
    return {
      outcome: "already_completed",
      job: acquired.job,
      collectedStorage: null,
      stageReached: null,
      failureCode: null,
    };
  }
  if (acquired.kind === "already_ready") {
    return {
      outcome: "already_ready",
      job: acquired.job,
      collectedStorage: null,
      stageReached: READY_FOR_EXTERNAL_CLEANUP_STAGE,
      failureCode: null,
    };
  }

  let job = acquired.job;
  const removeFn = deps.removeFn ?? defaultStorageRemove;

  const fail = async (
    stage: AccountDeletionStage,
    code: string,
    reason: string,
    collected: CollectOwnedAccountStorageResult | null,
  ): Promise<AccountDeletionJobResult> => {
    now = nowFn();
    job = await store.markFailed(job!.id, stage, code, reason, now);
    return {
      outcome: "failed",
      job,
      collectedStorage: collected,
      stageReached: stage,
      failureCode: code,
    };
  };

  const advance = async (stage: AccountDeletionStage) => {
    now = nowFn();
    job = await store.setStage(job!.id, stage, now);
  };

  let collected: CollectOwnedAccountStorageResult | null = null;

  try {
    // ----- collect_storage -----
    await advance("collect_storage");
    const collect = deps.collectStorage ?? collectOwnedAccountStorage;
    collected = await collect(userId);

    // ----- shared_refs -----
    await advance("shared_refs");
    const clearShared = deps.clearSharedIdentityRefs ?? clearSharedIdentityRefs;
    await clearShared(userId);

    // ----- releases -----
    await advance("releases");
    const listReleases = deps.listOwnedReleaseIds ?? defaultListOwnedReleaseIds;
    const deleteRelease =
      deps.deleteRelease ??
      ((args) =>
        deleteOwnedReleaseWithStorage({
          releaseId: args.releaseId,
          ownerArtistId: args.ownerArtistId,
          removeFn: args.removeFn,
        }));
    for (const releaseId of await listReleases(userId)) {
      const result = await deleteRelease({
        releaseId,
        ownerArtistId: userId,
        removeFn,
      });
      if (result.outcome === "forbidden" || result.outcome === "db_failed") {
        return fail("releases", "release_delete_failed", result.outcome, collected);
      }
      if (result.outcome === "storage_partial") {
        return fail(
          "releases",
          "release_storage_partial",
          "storage_partial",
          collected,
        );
      }
    }

    // ----- posts -----
    await advance("posts");
    const listPosts = deps.listOwnedPostIds ?? defaultListOwnedPostIds;
    const deletePost =
      deps.deletePost ??
      ((args) =>
        deleteOwnedPostWithStorage({
          postId: args.postId,
          ownerUserId: args.ownerUserId,
          removeFn: args.removeFn,
        }));
    for (const postId of await listPosts(userId)) {
      const result = await deletePost({
        postId,
        ownerUserId: userId,
        removeFn,
      });
      if (result.outcome === "forbidden" || result.outcome === "db_failed") {
        return fail("posts", "post_delete_failed", result.outcome, collected);
      }
      if (result.outcome === "storage_partial") {
        return fail("posts", "post_storage_partial", "storage_partial", collected);
      }
    }

    // ----- comments -----
    await advance("comments");
    const deleteComments =
      deps.deleteUserCommentsOnOthersPosts ?? deleteUserCommentsOnOthersPosts;
    await deleteComments(userId);

    // ----- user_rows -----
    await advance("user_rows");
    const cleanupRows = deps.cleanupUserRows ?? cleanupNoFkUserRows;
    await cleanupRows(userId);

    // ----- storage -----
    await advance("storage");
    const sweep =
      deps.sweepStorage ??
      ((a) =>
        sweepOwnedAccountStorage({
          userId: a.userId,
          collected: a.collected,
          removeFn: a.removeFn,
        }));
    const sweepResult = await sweep({
      userId,
      collected,
      removeFn,
    });
    if (!sweepResult.ok) {
      return fail("storage", sweepResult.code, sweepResult.reason, collected);
    }

    // ----- stop boundary -----
    await advance(READY_FOR_EXTERNAL_CLEANUP_STAGE);

    return {
      outcome: "ready_for_external_cleanup",
      job,
      collectedStorage: collected,
      stageReached: READY_FOR_EXTERNAL_CLEANUP_STAGE,
      failureCode: null,
    };
  } catch (error) {
    const stage = (job.currentStage as AccountDeletionStage) || "collect_storage";
    console.error("[runAccountDeletionJob] unexpected failure", {
      userId,
      stage,
      // Never log raw error payloads that may include PII
      message: error instanceof Error ? error.name : "unknown_error",
    });
    return fail(stage, "unexpected_error", "orchestrator_exception", collected);
  }
}

export type FinalizeAccountDeletionDeps = {
  jobs?: AccountDeletionJobStore;
  forgetMailerLite?: (email: string) => Promise<{
    ok: boolean;
    outcome: string;
    code?: string;
  }>;
  deleteAuthUser?: (userId: string) => Promise<{ ok: boolean; code?: string }>;
  adminEnabled?: boolean;
  now?: () => Date;
};

export type FinalizeAccountDeletionResult = {
  outcome:
    | "deleted"
    | "deleted_job_finalize_failed"
    | "already_completed"
    | "auth_delete_failed"
    | "admin_unavailable"
    | "not_ready";
  job: AccountDeletionJobRow | null;
  /** Non-PII MailerLite diagnostic */
  mailerLiteOutcome: string;
  authDeleted: boolean;
};

/**
 * After orchestrator reaches ready_for_external_cleanup:
 * MailerLite (best-effort) → Auth admin delete (last) → job completed.
 * Never stores email/password on the job row.
 */
export async function finalizeAccountDeletion(args: {
  userId: string;
  email: string | null | undefined;
  job: AccountDeletionJobRow;
  deps?: FinalizeAccountDeletionDeps;
}): Promise<FinalizeAccountDeletionResult> {
  const deps = args.deps ?? {};
  const store = deps.jobs ?? postgresAccountDeletionJobStore;
  const nowFn = deps.now ?? (() => new Date());
  let job = args.job;

  if (job.status === "completed") {
    return {
      outcome: "already_completed",
      job,
      mailerLiteOutcome: "skipped",
      authDeleted: true,
    };
  }

  if (
    job.currentStage !== READY_FOR_EXTERNAL_CLEANUP_STAGE ||
    (job.status !== "running" && job.status !== "pending")
  ) {
    return {
      outcome: "not_ready",
      job,
      mailerLiteOutcome: "skipped",
      authDeleted: false,
    };
  }

  const adminEnabled =
    deps.adminEnabled ??
    !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (deps.deleteAuthUser == null && !adminEnabled) {
    const now = nowFn();
    job = await store.markFailed(
      job.id,
      "auth",
      "admin_unavailable",
      "service_role_required",
      now,
    );
    return {
      outcome: "admin_unavailable",
      job,
      mailerLiteOutcome: "skipped",
      authDeleted: false,
    };
  }

  // MailerLite while email still available — failure must not block Auth delete
  let mailerLiteOutcome = "skipped";
  const email =
    typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
  if (email && deps.forgetMailerLite) {
    const ml = await deps.forgetMailerLite(email);
    mailerLiteOutcome = ml.ok
      ? ml.outcome
      : `error:${ml.code ?? ml.outcome}`;
    if (!ml.ok) {
      console.error("[account-deletion] MailerLite forget best-effort failed", {
        outcome: ml.outcome,
        code: ml.code ?? null,
      });
    }
  } else if (email) {
    const { forgetMailerLiteSubscriberByEmail } = await import(
      "./mailerlite-forget"
    );
    const ml = await forgetMailerLiteSubscriberByEmail(email);
    mailerLiteOutcome = ml.ok ? ml.outcome : `error:${ml.code}`;
    if (!ml.ok) {
      console.error("[account-deletion] MailerLite forget best-effort failed", {
        outcome: ml.outcome,
        code: ml.code,
      });
    }
  } else {
    mailerLiteOutcome = "no_email";
  }

  const deleteAuth =
    deps.deleteAuthUser ??
    (async (userId: string) => {
      const { supabaseAdminEnabled, supabase } = await import("./supabaseClient");
      if (!supabaseAdminEnabled) {
        return { ok: false, code: "admin_unavailable" };
      }
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) {
        console.error("[account-deletion] Auth delete failed", {
          code: (error as { status?: number }).status ?? "unknown",
        });
        return { ok: false, code: "auth_delete_failed" };
      }
      return { ok: true };
    });

  const authResult = await deleteAuth(args.userId);
  if (!authResult.ok) {
    const now = nowFn();
    const code = authResult.code ?? "auth_delete_failed";
    job = await store.markFailed(job.id, "auth", code, code, now);
    return {
      outcome:
        code === "admin_unavailable" ? "admin_unavailable" : "auth_delete_failed",
      job,
      mailerLiteOutcome,
      authDeleted: false,
    };
  }

  try {
    const now = nowFn();
    job = await store.markCompleted(job.id, now);
    return {
      outcome: "deleted",
      job,
      mailerLiteOutcome,
      authDeleted: true,
    };
  } catch {
    console.error(
      "[account-deletion] post_auth_job_finalize failed — Auth already deleted; ops reconciliation required",
      { jobId: job.id },
    );
    return {
      outcome: "deleted_job_finalize_failed",
      job,
      mailerLiteOutcome,
      authDeleted: true,
    };
  }
}

/**
 * Future persistence recommendation (DO NOT APPLY without explicit authorisation):
 * Prefer deterministic `{userId}/` Storage.list sweeps over storing collected JSON on
 * account_deletion_jobs. If cross-restart path lists become necessary, propose an
 * additive `account_deletion_storage_objects` table (job_id, bucket, path, status)
 * rather than a free-form JSON column on the jobs table.
 */
export const ACCOUNT_DELETION_STORAGE_PERSISTENCE_NOTE =
  "Use deterministic user-prefix Storage.list for retries; no JSON job columns without authorised migration.";
