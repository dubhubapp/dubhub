/**
 * Compensate Auth-created / claim-failed signup: delete only a freshly created,
 * still-unconfirmed Auth user bound to the age-gate ticket timing.
 * Never logs DOB or ticket plaintext.
 */

import type { Pool } from "pg";
import {
  emailBindingsMatch,
  PENDING_CLAIM_AUTH_MAX_AGE_MS,
  unsealAgeGateTicket,
} from "./age-gate-ticket";
import { isUuid } from "./pending-demographics";

/** Ticket may precede Auth create by a small clock skew window. */
const TICKET_BEFORE_USER_SLACK_MS = 120_000;

export type AbandonUnconfirmedSignupResult = {
  ok: boolean;
  code:
    | "ok"
    | "invalid_request"
    | "secret_unavailable"
    | "ticket_invalid"
    | "ticket_tampered"
    | "auth_user_not_found"
    | "auth_user_not_eligible"
    | "has_demographics"
    | "ticket_replay"
    | "unavailable";
  httpStatus: number;
};

export type AbandonAuthUser = {
  id: string;
  created_at: string;
  email_confirmed_at: string | null;
  /** Auth user's email — binding check only. Never logged. */
  email: string | null;
};

export type AbandonDeps = {
  pool: Pool;
  getTicketKey: () => Buffer | null;
  nowMs?: () => number;
  /** Required in production route — Admin getUserById. */
  getAuthUserById: (userId: string) => Promise<AbandonAuthUser | null>;
  /** Required in production route — Admin deleteUser. */
  deleteAuthUser: (userId: string) => Promise<{ ok: boolean }>;
};

/**
 * Safe compensation after signUp succeeded but pending-demographics claim failed.
 */
export async function abandonUnconfirmedSignup(
  deps: AbandonDeps,
  input: { userId: unknown; ticket: unknown },
): Promise<AbandonUnconfirmedSignupResult> {
  if (!isUuid(input.userId) || typeof input.ticket !== "string") {
    return { ok: false, code: "invalid_request", httpStatus: 400 };
  }
  const userId = input.userId;
  const ticket = input.ticket;
  if (ticket.length < 16 || ticket.length > 2048) {
    return { ok: false, code: "ticket_invalid", httpStatus: 400 };
  }

  const key = deps.getTicketKey();
  if (!key) {
    return { ok: false, code: "secret_unavailable", httpStatus: 503 };
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  const unsealed = unsealAgeGateTicket({
    ticket,
    key,
    nowMs,
    allowExpired: true,
  });
  if (!unsealed.ok) {
    if (unsealed.code === "tampered") {
      return { ok: false, code: "ticket_tampered", httpStatus: 400 };
    }
    return { ok: false, code: "ticket_invalid", httpStatus: 400 };
  }

  const authUser = await deps.getAuthUserById(userId);
  if (!authUser) {
    return { ok: false, code: "auth_user_not_found", httpStatus: 404 };
  }

  // Ticket must belong to this Auth user's signup email — never delete on mismatch.
  if (!emailBindingsMatch(unsealed.payload.emailBinding, authUser.email)) {
    return { ok: false, code: "auth_user_not_eligible", httpStatus: 403 };
  }

  if (authUser.email_confirmed_at) {
    return { ok: false, code: "auth_user_not_eligible", httpStatus: 403 };
  }

  const createdAtMs = Date.parse(authUser.created_at);
  if (!Number.isFinite(createdAtMs)) {
    return { ok: false, code: "auth_user_not_eligible", httpStatus: 403 };
  }
  if (nowMs - createdAtMs > PENDING_CLAIM_AUTH_MAX_AGE_MS) {
    return { ok: false, code: "auth_user_not_eligible", httpStatus: 403 };
  }

  const { iat, exp, jti } = unsealed.payload;
  if (iat > createdAtMs + TICKET_BEFORE_USER_SLACK_MS) {
    return { ok: false, code: "auth_user_not_eligible", httpStatus: 403 };
  }
  if (createdAtMs > exp) {
    return { ok: false, code: "auth_user_not_eligible", httpStatus: 403 };
  }

  try {
    const pending = await deps.pool.query(
      `SELECT 1 FROM public.pending_signup_demographics WHERE user_id = $1::uuid LIMIT 1`,
      [userId],
    );
    const finalRow = await deps.pool.query(
      `SELECT 1 FROM public.user_demographics WHERE user_id = $1::uuid LIMIT 1`,
      [userId],
    );
    if ((pending.rowCount ?? 0) > 0 || (finalRow.rowCount ?? 0) > 0) {
      return { ok: false, code: "has_demographics", httpStatus: 409 };
    }

    const consumed = await deps.pool.query<{ user_id: string }>(
      `SELECT user_id FROM public.age_gate_consumed_tickets WHERE ticket_id = $1::uuid LIMIT 1`,
      [jti],
    );
    if ((consumed.rowCount ?? 0) > 0) {
      if (consumed.rows[0]!.user_id !== userId) {
        return { ok: false, code: "ticket_replay", httpStatus: 409 };
      }
    } else {
      try {
        await deps.pool.query(
          `INSERT INTO public.age_gate_consumed_tickets (ticket_id, user_id)
           VALUES ($1::uuid, $2::uuid)`,
          [jti, userId],
        );
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "23505") {
          return { ok: false, code: "ticket_replay", httpStatus: 409 };
        }
        throw err;
      }
    }

    const deleted = await deps.deleteAuthUser(userId);
    if (!deleted.ok) {
      console.error("[abandon-unconfirmed-signup] deleteUser failed");
      return { ok: false, code: "unavailable", httpStatus: 503 };
    }

    return { ok: true, code: "ok", httpStatus: 200 };
  } catch (err) {
    console.error("[abandon-unconfirmed-signup] failed", {
      code: (err as { code?: string })?.code ?? "unknown",
    });
    return { ok: false, code: "unavailable", httpStatus: 503 };
  }
}
