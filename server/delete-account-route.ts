/**
 * POST /api/me/delete-account — gated self-serve account deletion.
 *
 * - Feature gate ACCOUNT_DELETION_ENABLED (default false)
 * - userId only from authenticated session
 * - password reauth before any destructive work
 * - orchestrator → MailerLite (best-effort) → Auth admin delete last
 */

import type { Express, NextFunction, Response } from "express";
import { z } from "zod";
import {
  withSupabaseUser,
  type AuthenticatedRequest,
} from "./authMiddleware";
import { isAccountDeletionEnabled } from "./account-deletion-enabled";
import { reauthWithEmailPassword } from "./account-deletion-reauth";
import {
  finalizeAccountDeletion,
  runAccountDeletionJob,
  type AccountDeletionJobResult,
  type FinalizeAccountDeletionResult,
} from "./account-deletion";

const bodySchema = z.object({
  password: z.string().min(1).max(256),
  confirm: z.union([z.literal(true), z.literal("delete")]).optional(),
});

export type DeleteAccountRouteDeps = {
  isEnabled?: () => boolean;
  reauth?: typeof reauthWithEmailPassword;
  runJob?: (userId: string) => Promise<AccountDeletionJobResult>;
  finalize?: (args: {
    userId: string;
    email: string | null | undefined;
    job: NonNullable<AccountDeletionJobResult["job"]>;
  }) => Promise<FinalizeAccountDeletionResult>;
  /** Defaults to withSupabaseUser — inject a stub in unit tests. */
  auth?: (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => void | Promise<void>;
};

function jsonError(
  res: Response,
  status: number,
  code: string,
  message?: string,
) {
  return res.status(status).json({
    ok: false,
    code,
    ...(message ? { message } : {}),
  });
}

export function registerDeleteAccountRoutes(
  app: Express,
  deps: DeleteAccountRouteDeps = {},
): void {
  const auth = deps.auth ?? withSupabaseUser;

  app.post(
    "/api/me/delete-account",
    auth,
    async (req: AuthenticatedRequest, res: Response) => {
      const enabled = (deps.isEnabled ?? isAccountDeletionEnabled)();
      if (!enabled) {
        return jsonError(res, 403, "feature_disabled");
      }

      const userId = req.dbUser?.id ?? req.supabaseUser?.id;
      if (!userId) {
        return jsonError(res, 401, "not_authenticated");
      }

      // Reject any attempt to select another account via body
      const rawBody = req.body as Record<string, unknown> | undefined;
      if (
        rawBody &&
        (rawBody.userId != null ||
          rawBody.user_id != null ||
          rawBody.targetUserId != null)
      ) {
        return jsonError(res, 400, "invalid_request");
      }

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return jsonError(res, 400, "password_required");
      }

      const email =
        req.supabaseUser?.email ?? req.dbUser?.email ?? null;

      const reauth = deps.reauth ?? reauthWithEmailPassword;
      const reauthResult = await reauth({
        email,
        password: parsed.data.password,
      });

      if (!reauthResult.ok) {
        if (reauthResult.code === "wrong_password") {
          return jsonError(res, 403, "wrong_password");
        }
        if (reauthResult.code === "no_email") {
          return jsonError(res, 422, "email_password_required");
        }
        return jsonError(res, 503, "reauth_unavailable");
      }

      const runJob = deps.runJob ?? ((id: string) => runAccountDeletionJob(id));
      const jobResult = await runJob(userId);

      if (
        jobResult.outcome === "already_completed" &&
        jobResult.job
      ) {
        return res.status(200).json({
          ok: true,
          code: "already_deleted",
          authDeleted: true,
        });
      }

      if (
        jobResult.outcome !== "ready_for_external_cleanup" &&
        jobResult.outcome !== "already_ready"
      ) {
        return jsonError(res, 500, "internal_cleanup_failed");
      }

      if (!jobResult.job) {
        return jsonError(res, 500, "internal_cleanup_failed");
      }

      const finalize =
        deps.finalize ??
        ((args) =>
          finalizeAccountDeletion({
            userId: args.userId,
            email: args.email,
            job: args.job,
          }));

      const final = await finalize({
        userId,
        email,
        job: jobResult.job,
      });

      if (final.outcome === "deleted" || final.outcome === "already_completed") {
        return res.status(200).json({
          ok: true,
          code: "deleted",
          authDeleted: true,
        });
      }

      if (final.outcome === "deleted_job_finalize_failed") {
        // Auth is gone — client must hard-reset; ops reconcile job row
        return res.status(200).json({
          ok: true,
          code: "deleted_job_finalize_failed",
          authDeleted: true,
        });
      }

      if (final.outcome === "admin_unavailable") {
        return jsonError(res, 503, "admin_unavailable");
      }

      if (final.outcome === "auth_delete_failed") {
        return jsonError(res, 500, "auth_delete_failed");
      }

      return jsonError(res, 500, "internal_cleanup_failed");
    },
  );
}
