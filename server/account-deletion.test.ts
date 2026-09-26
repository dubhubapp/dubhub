import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNT_DELETION_STAGES,
  READY_FOR_EXTERNAL_CLEANUP_STAGE,
  acquireAccountDeletionJob,
  profileUploadPathCandidates,
  runAccountDeletionJob,
  type AccountDeletionJobRow,
  type AccountDeletionJobStore,
} from "./account-deletion";
import type { CollectOwnedAccountStorageResult } from "./owned-ugc-delete";
import {
  POST_THUMBNAILS_BUCKET,
  PROFILE_UPLOADS_BUCKET,
  RELEASE_ARTWORKS_BUCKET,
  VIDEOS_BUCKET,
  type OwnedStorageObjectRef,
} from "./owned-ugc-storage";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function emptyCollected(
  overrides: Partial<CollectOwnedAccountStorageResult> = {},
): CollectOwnedAccountStorageResult {
  return {
    userId: USER,
    postVideos: [],
    postThumbnails: [],
    releaseArtworks: [],
    profileAssets: [],
    unresolved: [],
    ...overrides,
  };
}

function createMemoryJobStore(): AccountDeletionJobStore & {
  rows: AccountDeletionJobRow[];
} {
  const rows: AccountDeletionJobRow[] = [];
  let seq = 0;

  const store: AccountDeletionJobStore & { rows: AccountDeletionJobRow[] } = {
    rows,
    async findLatestForUser(userId) {
      const mine = rows.filter((r) => r.userId === userId);
      return mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    },
    async findActiveForUser(userId) {
      return (
        rows.find(
          (r) =>
            r.userId === userId &&
            (r.status === "pending" || r.status === "running"),
        ) ?? null
      );
    },
    async insertPending(userId, now) {
      const active = rows.some(
        (r) =>
          r.userId === userId &&
          (r.status === "pending" || r.status === "running"),
      );
      if (active) {
        const err = new Error("duplicate_active");
        (err as { code?: string }).code = "23505";
        throw err;
      }
      const row: AccountDeletionJobRow = {
        id: `job-${++seq}`,
        userId,
        status: "pending",
        currentStage: "collect_storage",
        failureCode: null,
        failureReason: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      rows.push(row);
      return { ...row };
    },
    async markRunning(jobId, stage, now) {
      const row = rows.find((r) => r.id === jobId);
      if (!row) throw new Error("missing");
      row.status = "running";
      row.currentStage = stage;
      row.failureCode = null;
      row.failureReason = null;
      row.updatedAt = now;
      return { ...row };
    },
    async setStage(jobId, stage, now) {
      const row = rows.find((r) => r.id === jobId);
      if (!row) throw new Error("missing");
      row.currentStage = stage;
      row.updatedAt = now;
      return { ...row };
    },
    async markFailed(jobId, stage, failureCode, failureReason, now) {
      const row = rows.find((r) => r.id === jobId);
      if (!row) throw new Error("missing");
      row.status = "failed";
      row.currentStage = stage;
      row.failureCode = failureCode;
      row.failureReason = failureReason;
      row.updatedAt = now;
      return { ...row };
    },
    async markCompleted(jobId, now) {
      const row = rows.find((r) => r.id === jobId);
      if (!row) throw new Error("missing");
      row.status = "completed";
      row.currentStage = "completed";
      row.failureCode = null;
      row.failureReason = null;
      row.completedAt = now;
      row.updatedAt = now;
      return { ...row };
    },
  };
  return store;
}

describe("account deletion stages", () => {
  it("defines ordered stages ending at ready_for_external_cleanup", () => {
    assert.deepEqual([...ACCOUNT_DELETION_STAGES], [
      "collect_storage",
      "shared_refs",
      "releases",
      "posts",
      "comments",
      "user_rows",
      "storage",
      "ready_for_external_cleanup",
    ]);
    assert.equal(
      ACCOUNT_DELETION_STAGES[ACCOUNT_DELETION_STAGES.length - 1],
      READY_FOR_EXTERNAL_CLEANUP_STAGE,
    );
  });
});

describe("acquireAccountDeletionJob", () => {
  it("creates pending then running job", async () => {
    const store = createMemoryJobStore();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const acquired = await acquireAccountDeletionJob(USER, store, t0);
    assert.equal(acquired.kind, "use");
    if (acquired.kind !== "use") return;
    assert.equal(acquired.job.status, "running");
    assert.equal(acquired.job.currentStage, "collect_storage");
    assert.equal(store.rows.length, 1);
  });

  it("reuses active job instead of duplicating", async () => {
    const store = createMemoryJobStore();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const first = await acquireAccountDeletionJob(USER, store, t0);
    const t1 = new Date("2026-01-01T00:01:00.000Z");
    const second = await acquireAccountDeletionJob(USER, store, t1);
    assert.equal(store.rows.length, 1);
    assert.equal(first.kind, "use");
    assert.equal(second.kind, "use");
    if (first.kind === "use" && second.kind === "use") {
      assert.equal(first.job.id, second.job.id);
      assert.ok(second.job.updatedAt.getTime() >= t1.getTime());
    }
  });

  it("returns already_completed for completed jobs", async () => {
    const store = createMemoryJobStore();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    store.rows.push({
      id: "done-1",
      userId: USER,
      status: "completed",
      currentStage: READY_FOR_EXTERNAL_CLEANUP_STAGE,
      failureCode: null,
      failureReason: null,
      createdAt: t0,
      updatedAt: t0,
      completedAt: t0,
    });
    const acquired = await acquireAccountDeletionJob(USER, store, t0);
    assert.equal(acquired.kind, "already_completed");
  });

  it("returns already_ready when stopped at external boundary", async () => {
    const store = createMemoryJobStore();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    store.rows.push({
      id: "ready-1",
      userId: USER,
      status: "running",
      currentStage: READY_FOR_EXTERNAL_CLEANUP_STAGE,
      failureCode: null,
      failureReason: null,
      createdAt: t0,
      updatedAt: t0,
      completedAt: null,
    });
    const acquired = await acquireAccountDeletionJob(USER, store, t0);
    assert.equal(acquired.kind, "already_ready");
  });

  it("retries failed jobs from collect_storage", async () => {
    const store = createMemoryJobStore();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    store.rows.push({
      id: "fail-1",
      userId: USER,
      status: "failed",
      currentStage: "storage",
      failureCode: "storage_cleanup_partial",
      failureReason: "failed_objects_1",
      createdAt: t0,
      updatedAt: t0,
      completedAt: null,
    });
    const t1 = new Date("2026-01-01T00:05:00.000Z");
    const acquired = await acquireAccountDeletionJob(USER, store, t1);
    assert.equal(acquired.kind, "use");
    if (acquired.kind !== "use") return;
    assert.equal(acquired.job.id, "fail-1");
    assert.equal(acquired.job.status, "running");
    assert.equal(acquired.job.currentStage, "collect_storage");
    assert.equal(acquired.job.failureCode, null);
  });
});

describe("runAccountDeletionJob", () => {
  it("advances stages and stops before Auth with ready_for_external_cleanup", async () => {
    const store = createMemoryJobStore();
    const stages: string[] = [];
    let clock = 0;
    const now = () => new Date(Date.UTC(2026, 0, 1, 0, clock++, 0));

    const sharedClears: string[] = [];
    const commentDeletes: string[] = [];
    const rowCleanups: string[] = [];
    const deletedReleases: string[] = [];
    const deletedPosts: string[] = [];
    const removed: string[] = [];

    const videoRef: OwnedStorageObjectRef = {
      bucket: VIDEOS_BUCKET,
      path: `${USER}/clip.mp4`,
    };
    const thumbRef: OwnedStorageObjectRef = {
      bucket: POST_THUMBNAILS_BUCKET,
      path: `${USER}/thumb.jpg`,
    };
    const artRef: OwnedStorageObjectRef = {
      bucket: RELEASE_ARTWORKS_BUCKET,
      path: `${USER}/art.jpg`,
    };
    const avatarRef: OwnedStorageObjectRef = {
      bucket: PROFILE_UPLOADS_BUCKET,
      path: `users/${USER}.png`,
    };

    const result = await runAccountDeletionJob(USER, {
      jobs: store,
      now,
      collectStorage: async () => {
        stages.push("collect_storage");
        return emptyCollected({
          postVideos: [videoRef],
          postThumbnails: [thumbRef],
          releaseArtworks: [artRef],
          profileAssets: [avatarRef],
        });
      },
      clearSharedIdentityRefs: async (id) => {
        stages.push("shared_refs");
        sharedClears.push(id);
      },
      listOwnedReleaseIds: async () => ["rel-1"],
      deleteRelease: async ({ releaseId }) => {
        stages.push("releases");
        deletedReleases.push(releaseId);
        return {
          outcome: "deleted",
          dbDeleted: true,
          storagePathsUnknown: false,
          storage: { attempted: [artRef], removed: [artRef], failed: [] },
        };
      },
      listOwnedPostIds: async () => ["post-1"],
      deletePost: async ({ postId }) => {
        stages.push("posts");
        deletedPosts.push(postId);
        return {
          outcome: "deleted",
          dbDeleted: true,
          storagePathsUnknown: false,
          storage: {
            attempted: [videoRef, thumbRef],
            removed: [videoRef, thumbRef],
            failed: [],
          },
        };
      },
      deleteUserCommentsOnOthersPosts: async (id) => {
        stages.push("comments");
        commentDeletes.push(id);
      },
      cleanupUserRows: async (id) => {
        stages.push("user_rows");
        rowCleanups.push(id);
      },
      sweepStorage: async ({ collected }) => {
        stages.push("storage");
        assert.equal(collected.postVideos.length, 1);
        assert.equal(collected.profileAssets.length, 1);
        for (const ref of [
          ...collected.postVideos,
          ...collected.postThumbnails,
          ...collected.releaseArtworks,
          ...collected.profileAssets,
        ]) {
          removed.push(`${ref.bucket}:${ref.path}`);
        }
        return { ok: true };
      },
    });

    assert.equal(result.outcome, "ready_for_external_cleanup");
    assert.equal(result.stageReached, READY_FOR_EXTERNAL_CLEANUP_STAGE);
    assert.equal(result.job?.status, "running");
    assert.equal(result.job?.currentStage, READY_FOR_EXTERNAL_CLEANUP_STAGE);
    assert.equal(result.job?.completedAt, null);
    assert.deepEqual(sharedClears, [USER]);
    assert.deepEqual(deletedReleases, ["rel-1"]);
    assert.deepEqual(deletedPosts, ["post-1"]);
    assert.deepEqual(commentDeletes, [USER]);
    assert.deepEqual(rowCleanups, [USER]);
    assert.ok(removed.includes(`${VIDEOS_BUCKET}:${USER}/clip.mp4`));
    assert.ok(removed.includes(`${PROFILE_UPLOADS_BUCKET}:users/${USER}.png`));

    // Stage transitions recorded on job with advancing updated_at
    assert.ok(result.job);
    assert.ok(result.job.updatedAt.getTime() > result.job.createdAt.getTime());

    // Unique stages executed in order (releases/posts may appear once each)
    const uniqueOrdered = [...new Set(stages)];
    assert.deepEqual(uniqueOrdered, [
      "collect_storage",
      "shared_refs",
      "releases",
      "posts",
      "comments",
      "user_rows",
      "storage",
    ]);
  });

  it("records non-PII failure and stops on storage_partial from release delete", async () => {
    const store = createMemoryJobStore();
    const result = await runAccountDeletionJob(USER, {
      jobs: store,
      collectStorage: async () => emptyCollected(),
      clearSharedIdentityRefs: async () => {},
      listOwnedReleaseIds: async () => ["rel-1"],
      deleteRelease: async () => ({
        outcome: "storage_partial",
        dbDeleted: true,
        storagePathsUnknown: false,
        storage: {
          attempted: [],
          removed: [],
          failed: [
            {
              bucket: RELEASE_ARTWORKS_BUCKET,
              path: `${USER}/x.jpg`,
              message: "timeout",
            },
          ],
        },
      }),
      listOwnedPostIds: async () => {
        throw new Error("posts should not run");
      },
    });

    assert.equal(result.outcome, "failed");
    assert.equal(result.failureCode, "release_storage_partial");
    assert.equal(result.job?.status, "failed");
    assert.equal(result.job?.currentStage, "releases");
    assert.equal(result.job?.failureCode, "release_storage_partial");
    assert.doesNotMatch(result.job?.failureReason ?? "", /@|password|token/i);
  });

  it("retry after failure resumes and reaches ready boundary", async () => {
    const store = createMemoryJobStore();
    let releaseAttempts = 0;

    const deps = {
      jobs: store,
      collectStorage: async () => emptyCollected(),
      clearSharedIdentityRefs: async () => {},
      listOwnedReleaseIds: async () => ["rel-1"],
      deleteRelease: async () => {
        releaseAttempts += 1;
        if (releaseAttempts === 1) {
          return {
            outcome: "storage_partial" as const,
            dbDeleted: true,
            storagePathsUnknown: false,
            storage: {
              attempted: [],
              removed: [],
              failed: [
                {
                  bucket: RELEASE_ARTWORKS_BUCKET,
                  path: `${USER}/x.jpg`,
                  message: "timeout",
                },
              ],
            },
          };
        }
        return {
          outcome: "already_gone" as const,
          dbDeleted: true,
          storagePathsUnknown: true,
          storage: { attempted: [], removed: [], failed: [] },
        };
      },
      listOwnedPostIds: async () => [],
      deleteUserCommentsOnOthersPosts: async () => {},
      cleanupUserRows: async () => {},
      sweepStorage: async () => ({ ok: true as const }),
    };

    const first = await runAccountDeletionJob(USER, deps);
    assert.equal(first.outcome, "failed");

    const second = await runAccountDeletionJob(USER, deps);
    assert.equal(second.outcome, "ready_for_external_cleanup");
    assert.equal(store.rows.length, 1);
    assert.equal(second.job?.id, first.job?.id);
  });

  it("rejects invalid user id without creating a job", async () => {
    const store = createMemoryJobStore();
    const result = await runAccountDeletionJob("not-a-uuid", { jobs: store });
    assert.equal(result.outcome, "invalid_user");
    assert.equal(store.rows.length, 0);
  });

  it("noop when already ready_for_external_cleanup", async () => {
    const store = createMemoryJobStore();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    store.rows.push({
      id: "ready-2",
      userId: USER,
      status: "running",
      currentStage: READY_FOR_EXTERNAL_CLEANUP_STAGE,
      failureCode: null,
      failureReason: null,
      createdAt: t0,
      updatedAt: t0,
      completedAt: null,
    });
    const result = await runAccountDeletionJob(USER, {
      jobs: store,
      collectStorage: async () => {
        throw new Error("should not collect");
      },
    });
    assert.equal(result.outcome, "already_ready");
  });

  it("documents shared-id / moderation / survival contracts via injected stages", async () => {
    const store = createMemoryJobStore();
    const events: string[] = [];

    await runAccountDeletionJob(USER, {
      jobs: store,
      collectStorage: async () => emptyCollected(),
      clearSharedIdentityRefs: async () => {
        // Contract: clear credits on OTHER posts; preserve identification outcomes.
        events.push("clear_verified_by");
        events.push("clear_verified_comment_id");
        events.push("clear_artist_verified_by");
        events.push("preserve_title_status_flags");
        events.push("delete_artist_video_tags");
        events.push("delete_collab_rows_only");
      },
      listOwnedReleaseIds: async () => [],
      listOwnedPostIds: async () => [],
      deleteUserCommentsOnOthersPosts: async () => {
        events.push("reparent_then_delete_own_comments");
      },
      cleanupUserRows: async () => {
        events.push("delete_post_likes");
        events.push("delete_notification_inbox");
        events.push("null_moderator_actions_moderator_id");
        events.push("preserve_reports");
        events.push("delete_leaderboard_stats");
      },
      sweepStorage: async () => ({ ok: true }),
    });

    assert.ok(events.includes("preserve_title_status_flags"));
    assert.ok(events.includes("preserve_reports"));
    assert.ok(events.includes("null_moderator_actions_moderator_id"));
    assert.ok(events.includes("delete_collab_rows_only"));
    assert.ok(!events.includes("delete_other_users_posts"));
  });
});

describe("profileUploadPathCandidates", () => {
  it("only returns owner-scoped profile paths", () => {
    const refs = profileUploadPathCandidates(USER);
    assert.ok(refs.every((r) => r.bucket === PROFILE_UPLOADS_BUCKET));
    assert.ok(refs.every((r) => r.path.includes(USER)));
    assert.ok(!refs.some((r) => r.path.includes(OTHER)));
    assert.ok(!refs.some((r) => r.path.includes("default_")));
  });
});

describe("stop boundary guarantees", () => {
  it("never marks job completed in B3", async () => {
    const store = createMemoryJobStore();
    const result = await runAccountDeletionJob(USER, {
      jobs: store,
      collectStorage: async () => emptyCollected(),
      clearSharedIdentityRefs: async () => {},
      listOwnedReleaseIds: async () => [],
      listOwnedPostIds: async () => [],
      deleteUserCommentsOnOthersPosts: async () => {},
      cleanupUserRows: async () => {},
      sweepStorage: async () => ({ ok: true }),
    });
    assert.equal(result.outcome, "ready_for_external_cleanup");
    assert.equal(result.job?.status, "running");
    assert.notEqual(result.job?.status, "completed");
    // Auth / MailerLite not part of this module's success path
    assert.equal(result.job?.currentStage, READY_FOR_EXTERNAL_CLEANUP_STAGE);
  });
});
