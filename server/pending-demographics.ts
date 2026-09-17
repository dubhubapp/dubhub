/**
 * Private pending / final demographics persistence (server-only).
 * Never logs DOB or ticket plaintext.
 *
 * Claim DB writes go through public.claim_pending_signup_demographics(...) so
 * consumed-ticket + pending row commit atomically (or not at all).
 */

import type { Pool } from "pg";
import { evaluateDateOfBirth } from "@shared/age-gate";
import {
  PENDING_CLAIM_AUTH_MAX_AGE_MS,
  PENDING_DEMOGRAPHICS_RETENTION_MS,
  unsealAgeGateTicket,
} from "./age-gate-ticket";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClaimPendingDemographicsCode =
  | "ok"
  | "invalid_request"
  | "secret_unavailable"
  | "ticket_invalid"
  | "ticket_expired"
  | "ticket_tampered"
  | "minimum_age_not_met"
  | "auth_user_not_found"
  | "auth_user_not_eligible"
  | "ticket_replay"
  | "user_already_has_demographics"
  | "conflict"
  | "unavailable";

export type ClaimPendingDemographicsResult = {
  ok: boolean;
  code: ClaimPendingDemographicsCode;
  httpStatus: number;
};

export type MigratePendingResult = {
  ok: boolean;
  migrated: boolean;
  code: "ok" | "unavailable" | "not_authenticated";
};

type AuthUserSnapshot = {
  id: string;
  created_at: string;
  email_confirmed_at: string | null;
};

export type PendingDemographicsDeps = {
  pool: Pool;
  getTicketKey: () => Buffer | null;
  getAuthUserById: (userId: string) => Promise<AuthUserSnapshot | null>;
  nowMs?: () => number;
  claimAuthMaxAgeMs?: number;
  pendingRetentionMs?: number;
};

const RPC_STATUS_HTTP: Record<string, { ok: boolean; httpStatus: number }> = {
  ok: { ok: true, httpStatus: 200 },
  invalid_request: { ok: false, httpStatus: 400 },
  ticket_replay: { ok: false, httpStatus: 409 },
  conflict: { ok: false, httpStatus: 409 },
  user_already_has_demographics: { ok: false, httpStatus: 409 },
};

function clientError(
  code: ClaimPendingDemographicsCode,
  httpStatus: number,
): ClaimPendingDemographicsResult {
  return { ok: false, code, httpStatus };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function mapRpcStatus(status: string): ClaimPendingDemographicsResult {
  const mapped = RPC_STATUS_HTTP[status];
  if (!mapped) {
    return clientError("unavailable", 503);
  }
  if (mapped.ok) {
    return { ok: true, code: "ok", httpStatus: 200 };
  }
  return {
    ok: false,
    code: status as ClaimPendingDemographicsCode,
    httpStatus: mapped.httpStatus,
  };
}

/**
 * Claim sealed ticket → private pending_signup_demographics.
 * Pre-email-verification; does not trust UUID alone.
 * Persistence is a single RPC (atomic consumed + pending).
 */
export async function claimPendingDemographics(
  deps: PendingDemographicsDeps,
  input: { userId: unknown; ticket: unknown },
): Promise<ClaimPendingDemographicsResult> {
  if (!isUuid(input.userId) || typeof input.ticket !== "string") {
    return clientError("invalid_request", 400);
  }
  const userId = input.userId;
  const ticket = input.ticket;
  if (ticket.length < 16 || ticket.length > 2048) {
    return clientError("ticket_invalid", 400);
  }

  const key = deps.getTicketKey();
  if (!key) {
    return clientError("secret_unavailable", 503);
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  const unsealed = unsealAgeGateTicket({ ticket, key, nowMs });
  if (!unsealed.ok) {
    if (unsealed.code === "expired") return clientError("ticket_expired", 400);
    if (unsealed.code === "tampered") return clientError("ticket_tampered", 400);
    if (unsealed.code === "secret_unavailable") {
      return clientError("secret_unavailable", 503);
    }
    return clientError("ticket_invalid", 400);
  }

  const payload = unsealed.payload;
  const age = evaluateDateOfBirth(payload.dob, new Date(nowMs));
  if (!age.valid) {
    return clientError("ticket_invalid", 400);
  }
  if (!age.eligible) {
    return clientError("minimum_age_not_met", 403);
  }

  const authUser = await deps.getAuthUserById(userId);
  if (!authUser) {
    return clientError("auth_user_not_found", 404);
  }

  const createdAtMs = Date.parse(authUser.created_at);
  const maxAge = deps.claimAuthMaxAgeMs ?? PENDING_CLAIM_AUTH_MAX_AGE_MS;
  if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > maxAge) {
    return clientError("auth_user_not_eligible", 403);
  }
  if (authUser.email_confirmed_at) {
    const confirmedAge = nowMs - Date.parse(authUser.email_confirmed_at);
    if (!Number.isFinite(confirmedAge) || confirmedAge > maxAge) {
      return clientError("auth_user_not_eligible", 403);
    }
  }

  const retentionMs =
    deps.pendingRetentionMs ?? PENDING_DEMOGRAPHICS_RETENTION_MS;
  const expiresAt = new Date(nowMs + retentionMs);

  try {
    const result = await deps.pool.query<{
      claim_pending_signup_demographics: string;
    }>(
      `SELECT public.claim_pending_signup_demographics(
         $1::uuid,
         $2::uuid,
         $3::date,
         $4::timestamptz
       ) AS claim_pending_signup_demographics`,
      [userId, payload.jti, payload.dob, expiresAt.toISOString()],
    );
    const status = result.rows[0]?.claim_pending_signup_demographics;
    if (typeof status !== "string") {
      return clientError("unavailable", 503);
    }
    return mapRpcStatus(status);
  } catch (err) {
    // Never include DOB / ticket in logs
    console.error("[pending-demographics] claim failed", {
      code: (err as { code?: string })?.code ?? "unknown",
    });
    return clientError("unavailable", 503);
  }
}

/** Idempotent pending → user_demographics (Sign-In safety net / reusable). */
export async function migratePendingDemographicsForUser(
  pool: Pool,
  userId: string,
  confirmedAt: Date = new Date(),
): Promise<MigratePendingResult> {
  if (!isUuid(userId)) {
    return { ok: false, migrated: false, code: "not_authenticated" };
  }
  try {
    const result = await pool.query(
      `WITH moved AS (
         DELETE FROM public.pending_signup_demographics p
         WHERE p.user_id = $1::uuid
         RETURNING p.user_id, p.date_of_birth
       )
       INSERT INTO public.user_demographics (
         user_id, date_of_birth, gender, age_requirement_confirmed_at
       )
       SELECT user_id, date_of_birth, NULL, $2::timestamptz FROM moved
       ON CONFLICT (user_id) DO NOTHING
       RETURNING user_id`,
      [userId, confirmedAt.toISOString()],
    );
    return {
      ok: true,
      migrated: (result.rowCount ?? 0) > 0,
      code: "ok",
    };
  } catch (err) {
    console.error("[pending-demographics] migrate failed", {
      code: (err as { code?: string })?.code ?? "unknown",
    });
    return { ok: false, migrated: false, code: "unavailable" };
  }
}

/** Delete expired pending rows (no DOB in logs). */
export async function cleanupExpiredPendingDemographics(
  pool: Pool,
  now: Date = new Date(),
): Promise<{ ok: boolean; deleted: number }> {
  try {
    const result = await pool.query(
      `DELETE FROM public.pending_signup_demographics
       WHERE expires_at < $1::timestamptz`,
      [now.toISOString()],
    );
    return { ok: true, deleted: result.rowCount ?? 0 };
  } catch (err) {
    console.error("[pending-demographics] cleanup failed", {
      code: (err as { code?: string })?.code ?? "unknown",
    });
    return { ok: false, deleted: 0 };
  }
}
