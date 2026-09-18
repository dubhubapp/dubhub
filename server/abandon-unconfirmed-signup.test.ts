import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool, QueryResult } from "pg";
import { abandonUnconfirmedSignup } from "./abandon-unconfirmed-signup";
import { sealAgeGateTicket } from "./age-gate-ticket";
import { shouldOmitApiResponseBodyFromLog } from "./api-access-log";

const TEST_KEY = Buffer.alloc(32, 7);
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JTI = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOB = "1995-06-15";
const NOW = 1_700_000_000_000;
const EMAIL_A = "alice@example.com";
const EMAIL_B = "bob@example.com";

function mockPool(state: {
  consumed: Map<string, string>;
  pending: Set<string>;
  final: Set<string>;
}): Pool {
  return {
    query: async (text: string, params?: unknown[]): Promise<QueryResult> => {
      const sql = text.replace(/\s+/g, " ");
      if (sql.includes("pending_signup_demographics")) {
        const id = String(params?.[0]);
        const hit = state.pending.has(id);
        return {
          rows: hit ? [{ "?column?": 1 }] : [],
          rowCount: hit ? 1 : 0,
          command: "SELECT",
          oid: 0,
          fields: [],
        };
      }
      if (sql.includes("user_demographics")) {
        const id = String(params?.[0]);
        const hit = state.final.has(id);
        return {
          rows: hit ? [{ "?column?": 1 }] : [],
          rowCount: hit ? 1 : 0,
          command: "SELECT",
          oid: 0,
          fields: [],
        };
      }
      if (sql.includes("FROM public.age_gate_consumed_tickets")) {
        const ticketId = String(params?.[0]);
        const owner = state.consumed.get(ticketId);
        return {
          rows: owner ? [{ user_id: owner }] : [],
          rowCount: owner ? 1 : 0,
          command: "SELECT",
          oid: 0,
          fields: [],
        };
      }
      if (sql.includes("INSERT INTO public.age_gate_consumed_tickets")) {
        const ticketId = String(params?.[0]);
        const userId = String(params?.[1]);
        if (state.consumed.has(ticketId)) {
          throw Object.assign(new Error("dup"), { code: "23505" });
        }
        state.consumed.set(ticketId, userId);
        return { rows: [], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
      }
      throw new Error(`unexpected: ${sql.slice(0, 80)}`);
    },
  } as unknown as Pool;
}

describe("abandonUnconfirmedSignup", () => {
  it("deletes fresh unconfirmed Auth user after failed claim (same email)", async () => {
    const state = {
      consumed: new Map<string, string>(),
      pending: new Set<string>(),
      final: new Set<string>(),
    };
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL_A,
      key: TEST_KEY,
      nowMs: NOW - 60_000,
      jti: JTI,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;

    let deleted: string | null = null;
    const result = await abandonUnconfirmedSignup(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        nowMs: () => NOW,
        getAuthUserById: async () => ({
          id: USER_A,
          created_at: new Date(NOW - 30_000).toISOString(),
          email_confirmed_at: null,
          email: EMAIL_A,
        }),
        deleteAuthUser: async (id) => {
          deleted = id;
          return { ok: true };
        },
      },
      { userId: USER_A, ticket: sealed.ticket },
    );
    assert.equal(result.ok, true);
    assert.equal(deleted, USER_A);
    assert.equal(state.consumed.get(JTI), USER_A);
  });

  it("email A ticket NEVER deletes email B Auth user", async () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL_A,
      key: TEST_KEY,
      nowMs: NOW - 60_000,
      jti: JTI,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;

    let deleteCalls = 0;
    const result = await abandonUnconfirmedSignup(
      {
        pool: mockPool({
          consumed: new Map(),
          pending: new Set(),
          final: new Set(),
        }),
        getTicketKey: () => TEST_KEY,
        nowMs: () => NOW,
        getAuthUserById: async () => ({
          id: USER_B,
          created_at: new Date(NOW - 30_000).toISOString(),
          email_confirmed_at: null,
          email: EMAIL_B,
        }),
        deleteAuthUser: async () => {
          deleteCalls += 1;
          return { ok: true };
        },
      },
      { userId: USER_B, ticket: sealed.ticket },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "auth_user_not_eligible");
    assert.equal(deleteCalls, 0);
  });

  it("case/trim: ticket for Alice@ matches alice@ Auth email", async () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: "  Alice@Example.COM ",
      key: TEST_KEY,
      nowMs: NOW - 60_000,
      jti: JTI,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    let deleted: string | null = null;
    const result = await abandonUnconfirmedSignup(
      {
        pool: mockPool({
          consumed: new Map(),
          pending: new Set(),
          final: new Set(),
        }),
        getTicketKey: () => TEST_KEY,
        nowMs: () => NOW,
        getAuthUserById: async () => ({
          id: USER_A,
          created_at: new Date(NOW - 30_000).toISOString(),
          email_confirmed_at: null,
          email: "alice@example.com",
        }),
        deleteAuthUser: async (id) => {
          deleted = id;
          return { ok: true };
        },
      },
      { userId: USER_A, ticket: sealed.ticket },
    );
    assert.equal(result.ok, true);
    assert.equal(deleted, USER_A);
  });

  it("refuses confirmed users", async () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL_A,
      key: TEST_KEY,
      nowMs: NOW - 60_000,
      jti: JTI,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    let deleteCalls = 0;
    const result = await abandonUnconfirmedSignup(
      {
        pool: mockPool({
          consumed: new Map(),
          pending: new Set(),
          final: new Set(),
        }),
        getTicketKey: () => TEST_KEY,
        nowMs: () => NOW,
        getAuthUserById: async () => ({
          id: USER_A,
          created_at: new Date(NOW - 30_000).toISOString(),
          email_confirmed_at: new Date(NOW - 10_000).toISOString(),
          email: EMAIL_A,
        }),
        deleteAuthUser: async () => {
          deleteCalls += 1;
          return { ok: true };
        },
      },
      { userId: USER_A, ticket: sealed.ticket },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "auth_user_not_eligible");
    assert.equal(deleteCalls, 0);
  });

  it("refuses ticket minted after Auth user create (attack timing)", async () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL_A,
      key: TEST_KEY,
      nowMs: NOW,
      jti: JTI,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    let deleteCalls = 0;
    const result = await abandonUnconfirmedSignup(
      {
        pool: mockPool({
          consumed: new Map(),
          pending: new Set(),
          final: new Set(),
        }),
        getTicketKey: () => TEST_KEY,
        nowMs: () => NOW + 1_000,
        getAuthUserById: async () => ({
          id: USER_A,
          created_at: new Date(NOW - 10 * 60_000).toISOString(),
          email_confirmed_at: null,
          email: EMAIL_A,
        }),
        deleteAuthUser: async () => {
          deleteCalls += 1;
          return { ok: true };
        },
      },
      { userId: USER_A, ticket: sealed.ticket },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "auth_user_not_eligible");
    assert.equal(deleteCalls, 0);
  });

  it("refuses when pending demographics already exist", async () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL_A,
      key: TEST_KEY,
      nowMs: NOW - 60_000,
      jti: JTI,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    let deleteCalls = 0;
    const result = await abandonUnconfirmedSignup(
      {
        pool: mockPool({
          consumed: new Map(),
          pending: new Set([USER_A]),
          final: new Set(),
        }),
        getTicketKey: () => TEST_KEY,
        nowMs: () => NOW,
        getAuthUserById: async () => ({
          id: USER_A,
          created_at: new Date(NOW - 30_000).toISOString(),
          email_confirmed_at: null,
          email: EMAIL_A,
        }),
        deleteAuthUser: async () => {
          deleteCalls += 1;
          return { ok: true };
        },
      },
      { userId: USER_A, ticket: sealed.ticket },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "has_demographics");
    assert.equal(deleteCalls, 0);
  });

  it("refuses ticket already consumed by another user", async () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL_A,
      key: TEST_KEY,
      nowMs: NOW - 60_000,
      jti: JTI,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    let deleteCalls = 0;
    const result = await abandonUnconfirmedSignup(
      {
        pool: mockPool({
          consumed: new Map([[JTI, USER_B]]),
          pending: new Set(),
          final: new Set(),
        }),
        getTicketKey: () => TEST_KEY,
        nowMs: () => NOW,
        getAuthUserById: async () => ({
          id: USER_A,
          created_at: new Date(NOW - 30_000).toISOString(),
          email_confirmed_at: null,
          email: EMAIL_A,
        }),
        deleteAuthUser: async () => {
          deleteCalls += 1;
          return { ok: true };
        },
      },
      { userId: USER_A, ticket: sealed.ticket },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "ticket_replay");
    assert.equal(deleteCalls, 0);
  });
});

describe("abandon route logging omit", () => {
  it("omits abandon endpoint response body", () => {
    assert.equal(
      shouldOmitApiResponseBodyFromLog("/api/auth/abandon-unconfirmed-signup"),
      true,
    );
  });
});
