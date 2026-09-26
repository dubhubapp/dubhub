import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextFunction, Response } from "express";
import { after, describe, it } from "node:test";
import express from "express";
import { isAccountDeletionEnabled } from "./account-deletion-enabled";
import { reauthWithEmailPassword } from "./account-deletion-reauth";
import { forgetMailerLiteSubscriberByEmail } from "./mailerlite-forget";
import {
  finalizeAccountDeletion,
  READY_FOR_EXTERNAL_CLEANUP_STAGE,
  type AccountDeletionJobRow,
  type AccountDeletionJobStore,
} from "./account-deletion";
import {
  registerDeleteAccountRoutes,
  type DeleteAccountRouteDeps,
} from "./delete-account-route";
import type { AuthenticatedRequest } from "./authMiddleware";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMAIL = "throwaway@example.com";

function readyJob(overrides: Partial<AccountDeletionJobRow> = {}): AccountDeletionJobRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "job-1",
    userId: USER,
    status: "running",
    currentStage: READY_FOR_EXTERNAL_CLEANUP_STAGE,
    failureCode: null,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  };
}

function createMemoryJobStore(
  seed: AccountDeletionJobRow[] = [],
): AccountDeletionJobStore & { rows: AccountDeletionJobRow[] } {
  const rows = seed.map((r) => ({ ...r }));
  return {
    rows,
    async findLatestForUser(userId) {
      return rows.filter((r) => r.userId === userId).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0] ?? null;
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
    async insertPending() {
      throw new Error("not used");
    },
    async markRunning(jobId, stage, now) {
      const row = rows.find((r) => r.id === jobId)!;
      row.status = "running";
      row.currentStage = stage;
      row.updatedAt = now;
      return { ...row };
    },
    async setStage(jobId, stage, now) {
      const row = rows.find((r) => r.id === jobId)!;
      row.currentStage = stage;
      row.updatedAt = now;
      return { ...row };
    },
    async markFailed(jobId, stage, failureCode, failureReason, now) {
      const row = rows.find((r) => r.id === jobId)!;
      row.status = "failed";
      row.currentStage = stage;
      row.failureCode = failureCode;
      row.failureReason = failureReason;
      row.updatedAt = now;
      return { ...row };
    },
    async markCompleted(jobId, now) {
      const row = rows.find((r) => r.id === jobId)!;
      row.status = "completed";
      row.currentStage = "completed";
      row.completedAt = now;
      row.updatedAt = now;
      return { ...row };
    },
  };
}

describe("isAccountDeletionEnabled", () => {
  it("defaults to false when unset", () => {
    assert.equal(isAccountDeletionEnabled({}), false);
    assert.equal(isAccountDeletionEnabled({ ACCOUNT_DELETION_ENABLED: "" }), false);
    assert.equal(isAccountDeletionEnabled({ ACCOUNT_DELETION_ENABLED: "false" }), false);
    assert.equal(isAccountDeletionEnabled({ ACCOUNT_DELETION_ENABLED: "1" }), false);
  });

  it("enables only for exact true", () => {
    assert.equal(isAccountDeletionEnabled({ ACCOUNT_DELETION_ENABLED: "true" }), true);
    assert.equal(isAccountDeletionEnabled({ ACCOUNT_DELETION_ENABLED: "TRUE" }), true);
  });
});

describe("reauthWithEmailPassword", () => {
  it("rejects missing email", async () => {
    const r = await reauthWithEmailPassword({
      email: null,
      password: "x",
      deps: { signInWithPassword: async () => ({ error: null }) },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "no_email");
  });

  it("maps invalid credentials to wrong_password", async () => {
    const r = await reauthWithEmailPassword({
      email: EMAIL,
      password: "bad",
      deps: {
        signInWithPassword: async () => ({
          error: { message: "Invalid login credentials" },
        }),
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "wrong_password");
  });

  it("succeeds on clean sign-in", async () => {
    const r = await reauthWithEmailPassword({
      email: EMAIL,
      password: "good",
      deps: { signInWithPassword: async () => ({ error: null }) },
    });
    assert.equal(r.ok, true);
  });
});

describe("forgetMailerLiteSubscriberByEmail", () => {
  it("treats missing API key as success not_configured", async () => {
    const r = await forgetMailerLiteSubscriberByEmail(EMAIL, { apiKey: null });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.outcome, "not_configured");
  });

  it("treats 404 subscriber as already_absent", async () => {
    const r = await forgetMailerLiteSubscriberByEmail(EMAIL, {
      apiKey: "test-key",
      fetchFn: async () =>
        new Response(null, { status: 404 }) as unknown as Response,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.outcome, "already_absent");
  });

  it("returns error on forget failure without throwing", async () => {
    let calls = 0;
    const r = await forgetMailerLiteSubscriberByEmail(EMAIL, {
      apiKey: "test-key",
      fetchFn: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ data: { id: "sub-1" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }) as unknown as Response;
        }
        return new Response(null, { status: 500 }) as unknown as Response;
      },
    });
    assert.equal(r.ok, false);
  });
});

describe("finalizeAccountDeletion", () => {
  it("MailerLite failure still proceeds to Auth delete", async () => {
    const store = createMemoryJobStore([readyJob()]);
    let authCalled = false;
    const result = await finalizeAccountDeletion({
      userId: USER,
      email: EMAIL,
      job: store.rows[0]!,
      deps: {
        jobs: store,
        adminEnabled: true,
        forgetMailerLite: async () => ({
          ok: false,
          outcome: "error",
          code: "forget_failed",
        }),
        deleteAuthUser: async () => {
          authCalled = true;
          return { ok: true };
        },
      },
    });
    assert.equal(authCalled, true);
    assert.equal(result.outcome, "deleted");
    assert.equal(result.authDeleted, true);
    assert.equal(store.rows[0]!.status, "completed");
  });

  it("missing MailerLite subscriber is okay", async () => {
    const store = createMemoryJobStore([readyJob()]);
    const result = await finalizeAccountDeletion({
      userId: USER,
      email: EMAIL,
      job: store.rows[0]!,
      deps: {
        jobs: store,
        adminEnabled: true,
        forgetMailerLite: async () => ({
          ok: true,
          outcome: "already_absent",
        }),
        deleteAuthUser: async () => ({ ok: true }),
      },
    });
    assert.equal(result.outcome, "deleted");
    assert.equal(result.mailerLiteOutcome, "already_absent");
  });

  it("Auth failure marks job failed and leaves account", async () => {
    const store = createMemoryJobStore([readyJob()]);
    const result = await finalizeAccountDeletion({
      userId: USER,
      email: EMAIL,
      job: store.rows[0]!,
      deps: {
        jobs: store,
        adminEnabled: true,
        forgetMailerLite: async () => ({ ok: true, outcome: "forgotten" }),
        deleteAuthUser: async () => ({ ok: false, code: "auth_delete_failed" }),
      },
    });
    assert.equal(result.outcome, "auth_delete_failed");
    assert.equal(result.authDeleted, false);
    assert.equal(store.rows[0]!.status, "failed");
    assert.equal(store.rows[0]!.currentStage, "auth");
  });

  it("Auth success completes job", async () => {
    const store = createMemoryJobStore([readyJob()]);
    const order: string[] = [];
    const result = await finalizeAccountDeletion({
      userId: USER,
      email: EMAIL,
      job: store.rows[0]!,
      deps: {
        jobs: store,
        adminEnabled: true,
        forgetMailerLite: async () => {
          order.push("mailerlite");
          return { ok: true, outcome: "forgotten" };
        },
        deleteAuthUser: async () => {
          order.push("auth");
          return { ok: true };
        },
      },
    });
    assert.deepEqual(order, ["mailerlite", "auth"]);
    assert.equal(result.outcome, "deleted");
    assert.equal(store.rows[0]!.status, "completed");
    assert.equal(store.rows[0]!.currentStage, "completed");
  });

  it("post-auth job finalize failure returns special outcome with authDeleted", async () => {
    const store = createMemoryJobStore([readyJob()]);
    store.markCompleted = async () => {
      throw new Error("db_down");
    };
    const result = await finalizeAccountDeletion({
      userId: USER,
      email: EMAIL,
      job: store.rows[0]!,
      deps: {
        jobs: store,
        adminEnabled: true,
        forgetMailerLite: async () => ({ ok: true, outcome: "forgotten" }),
        deleteAuthUser: async () => ({ ok: true }),
      },
    });
    assert.equal(result.outcome, "deleted_job_finalize_failed");
    assert.equal(result.authDeleted, true);
  });
});

async function startDeleteAccountServer(
  deps: DeleteAccountRouteDeps,
): Promise<{ server: Server; origin: string }> {
  const app = express();
  app.use(express.json());
  registerDeleteAccountRoutes(app, deps);
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function authedAs(
  userId: string,
  email: string,
): DeleteAccountRouteDeps["auth"] {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.dbUser = {
      id: userId,
      username: "test",
      email,
    };
    req.supabaseUser = { id: userId, email };
    next();
  };
}

describe("POST /api/me/delete-account", () => {
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

  it("unauthenticated → rejected", async () => {
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: (_req, res) => {
        res.status(401).json({ message: "Not authenticated" });
      },
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "x" }),
    });
    assert.equal(res.status, 401);
  });

  it("feature disabled → 403 feature_disabled", async () => {
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => false,
      auth: authedAs(USER, EMAIL),
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "x" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "feature_disabled");
  });

  it("rejects client-supplied userId", async () => {
    let reauthCalled = false;
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: authedAs(USER, EMAIL),
      reauth: async () => {
        reauthCalled = true;
        return { ok: true };
      },
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "x", userId: OTHER }),
    });
    assert.equal(res.status, 400);
    assert.equal(reauthCalled, false);
  });

  it("wrong password → no deletion work", async () => {
    let runJobCalled = false;
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: authedAs(USER, EMAIL),
      reauth: async () => ({ ok: false, code: "wrong_password" }),
      runJob: async () => {
        runJobCalled = true;
        throw new Error("should not run");
      },
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "wrong_password");
    assert.equal(runJobCalled, false);
  });

  it("orchestrator failure → Auth untouched", async () => {
    let finalizeCalled = false;
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: authedAs(USER, EMAIL),
      reauth: async () => ({ ok: true }),
      runJob: async () => ({
        outcome: "failed",
        job: readyJob({ status: "failed", currentStage: "posts" }),
        collectedStorage: null,
        stageReached: "posts",
        failureCode: "post_delete_failed",
      }),
      finalize: async () => {
        finalizeCalled = true;
        return {
          outcome: "deleted",
          job: null,
          mailerLiteOutcome: "skipped",
          authDeleted: true,
        };
      },
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ok" }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "internal_cleanup_failed");
    assert.equal(finalizeCalled, false);
  });

  it("ready_for_external_cleanup → finalisation continues", async () => {
    let finalizeUserId: string | null = null;
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: authedAs(USER, EMAIL),
      reauth: async () => ({ ok: true }),
      runJob: async (userId) => ({
        outcome: "ready_for_external_cleanup",
        job: readyJob({ userId }),
        collectedStorage: null,
        stageReached: READY_FOR_EXTERNAL_CLEANUP_STAGE,
        failureCode: null,
      }),
      finalize: async ({ userId }) => {
        finalizeUserId = userId;
        return {
          outcome: "deleted",
          job: readyJob({ status: "completed", currentStage: "completed" }),
          mailerLiteOutcome: "forgotten",
          authDeleted: true,
        };
      },
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ok", confirm: true }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { code?: string; authDeleted?: boolean };
    assert.equal(body.code, "deleted");
    assert.equal(body.authDeleted, true);
    assert.equal(finalizeUserId, USER);
  });

  it("Auth delete failure → retryable error", async () => {
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: authedAs(USER, EMAIL),
      reauth: async () => ({ ok: true }),
      runJob: async () => ({
        outcome: "already_ready",
        job: readyJob(),
        collectedStorage: null,
        stageReached: READY_FOR_EXTERNAL_CLEANUP_STAGE,
        failureCode: null,
      }),
      finalize: async () => ({
        outcome: "auth_delete_failed",
        job: readyJob({ status: "failed", currentStage: "auth" }),
        mailerLiteOutcome: "forgotten",
        authDeleted: false,
      }),
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ok" }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "auth_delete_failed");
  });

  it("uses authenticated user id only — cannot delete another account", async () => {
    const seenIds: string[] = [];
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: authedAs(USER, EMAIL),
      reauth: async () => ({ ok: true }),
      runJob: async (userId) => {
        seenIds.push(userId);
        return {
          outcome: "ready_for_external_cleanup",
          job: readyJob({ userId }),
          collectedStorage: null,
          stageReached: READY_FOR_EXTERNAL_CLEANUP_STAGE,
          failureCode: null,
        };
      },
      finalize: async ({ userId }) => {
        seenIds.push(userId);
        return {
          outcome: "deleted",
          job: readyJob({ status: "completed" }),
          mailerLiteOutcome: "forgotten",
          authDeleted: true,
        };
      },
    });
    servers.push(server);
    await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ok", user_id: OTHER }),
    });
    // user_id rejected before run
    assert.deepEqual(seenIds, []);

    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ok" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(seenIds, [USER, USER]);
    assert.ok(!seenIds.includes(OTHER));
  });

  it("idempotent already_completed returns authDeleted", async () => {
    const { server, origin } = await startDeleteAccountServer({
      isEnabled: () => true,
      auth: authedAs(USER, EMAIL),
      reauth: async () => ({ ok: true }),
      runJob: async () => ({
        outcome: "already_completed",
        job: readyJob({
          status: "completed",
          currentStage: "completed",
          completedAt: new Date(),
        }),
        collectedStorage: null,
        stageReached: null,
        failureCode: null,
      }),
    });
    servers.push(server);
    const res = await fetch(`${origin}/api/me/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ok" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { code?: string; authDeleted?: boolean };
    assert.equal(body.code, "already_deleted");
    assert.equal(body.authDeleted, true);
  });
});
