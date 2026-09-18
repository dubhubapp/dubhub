import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import {
  ageGateClientIp,
  ageGateRateLimiter,
} from "./age-gate-rate-limit";
import { tryResolveAgeGateTicketKey } from "./age-gate-ticket";
import {
  claimPendingDemographics,
  cleanupExpiredPendingDemographics,
  migratePendingDemographicsForUser,
} from "./pending-demographics";
import { abandonUnconfirmedSignup } from "./abandon-unconfirmed-signup";
import {
  withSupabaseUser,
  type AuthenticatedRequest,
} from "./authMiddleware";
import { pool } from "./db";
import { supabase, supabaseAdminEnabled } from "./supabaseClient";

const claimBodySchema = z.object({
  userId: z.string().uuid(),
  ticket: z.string().min(16).max(2048),
});

const abandonBodySchema = claimBodySchema;

function ticketKeyOrNull(): Buffer | null {
  const resolved = tryResolveAgeGateTicketKey();
  return resolved.ok ? resolved.key : null;
}

async function fetchAuthUserByIdAdmin(userId: string): Promise<{
  id: string;
  created_at: string;
  email_confirmed_at: string | null;
  email: string | null;
} | null> {
  if (!supabaseAdminEnabled) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const u = data.user;
  return {
    id: u.id,
    created_at: u.created_at,
    email_confirmed_at: u.email_confirmed_at ?? null,
    email: u.email ?? null,
  };
}

/**
 * Claim + ensure-demographics endpoints (server/DB/Admin Auth).
 */
export function registerPendingDemographicsRoutes(
  app: Express,
  deps?: { pool?: Pool },
): void {
  const dbPool = deps?.pool ?? pool;

  app.post("/api/auth/pending-demographics", async (req: Request, res: Response) => {
    const ip = ageGateClientIp(req);
    const limit = ageGateRateLimiter.check(`claim:${ip}`);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      return res.status(429).json({ ok: false, code: "rate_limited" });
    }

    if (!supabaseAdminEnabled) {
      return res.status(503).json({ ok: false, code: "unavailable" });
    }

    const parsed = claimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, code: "invalid_request" });
    }

    const outcome = await claimPendingDemographics(
      {
        pool: dbPool,
        getTicketKey: ticketKeyOrNull,
        getAuthUserById: fetchAuthUserByIdAdmin,
      },
      parsed.data,
    );

    if (!outcome.ok) {
      return res.status(outcome.httpStatus).json({
        ok: false,
        code: outcome.code,
      });
    }

    return res.status(200).json({ ok: true });
  });

  /**
   * Compensate: Auth signUp succeeded but pending-demographics claim failed.
   * Deletes only a fresh unconfirmed Auth user bound to ticket timing.
   */
  app.post(
    "/api/auth/abandon-unconfirmed-signup",
    async (req: Request, res: Response) => {
      const ip = ageGateClientIp(req);
      const limit = ageGateRateLimiter.check(`abandon:${ip}`);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSec));
        return res.status(429).json({ ok: false, code: "rate_limited" });
      }

      if (!supabaseAdminEnabled) {
        return res.status(503).json({ ok: false, code: "unavailable" });
      }

      const parsed = abandonBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, code: "invalid_request" });
      }

      const outcome = await abandonUnconfirmedSignup(
        {
          pool: dbPool,
          getTicketKey: ticketKeyOrNull,
          getAuthUserById: async (id) => {
            const { data, error } = await supabase.auth.admin.getUserById(id);
            if (error || !data?.user) return null;
            return {
              id: data.user.id,
              created_at: data.user.created_at,
              email_confirmed_at: data.user.email_confirmed_at ?? null,
              email: data.user.email ?? null,
            };
          },
          deleteAuthUser: async (id) => {
            const { error } = await supabase.auth.admin.deleteUser(id);
            return { ok: !error };
          },
        },
        parsed.data,
      );

      if (!outcome.ok) {
        return res.status(outcome.httpStatus).json({
          ok: false,
          code: outcome.code,
        });
      }

      return res.status(200).json({ ok: true });
    },
  );

  /**
   * Authenticated safety net: pending → user_demographics for the session user.
   * Phase 3 SignIn should call once after successful profile load.
   */
  app.post(
    "/api/auth/ensure-demographics",
    withSupabaseUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, code: "not_authenticated" });
      }
      const outcome = await migratePendingDemographicsForUser(dbPool, userId);
      if (!outcome.ok) {
        return res.status(503).json({ ok: false, code: outcome.code });
      }
      return res.status(200).json({
        ok: true,
        migrated: outcome.migrated,
      });
    },
  );
}

/** Railway cron — deletes expired pending rows only (never logs DOB). */
export async function runPendingDemographicsCleanupJob(
  dbPool: Pool = pool,
): Promise<void> {
  const result = await cleanupExpiredPendingDemographics(dbPool);
  if (!result.ok) {
    console.error("[Cron] pending demographics cleanup failed");
    return;
  }
  if (result.deleted > 0) {
    console.log(
      `[Cron] pending demographics cleanup deleted=${result.deleted}`,
    );
  }
}
