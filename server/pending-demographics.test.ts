import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Pool, QueryResult } from "pg";
import {
  claimPendingDemographics,
  migratePendingDemographicsForUser,
} from "./pending-demographics";
import { sealAgeGateTicket } from "./age-gate-ticket";

const here = dirname(fileURLToPath(import.meta.url));
const migrationSrc = readFileSync(
  join(here, "../supabase/migrations/20260917200000_user_demographics_pending.sql"),
  "utf8",
);
const migration3bSrc = readFileSync(
  join(here, "../supabase/migrations/20260918120000_complete_new_user_demographics.sql"),
  "utf8",
);
const schemaSrc = readFileSync(join(here, "../supabase-schema.md"), "utf8");
const publicProfilesSrc = readFileSync(
  join(here, "../supabase/migrations/20260917180000_public_profiles_view.sql"),
  "utf8",
);
const pendingTsSrc = readFileSync(join(here, "pending-demographics.ts"), "utf8");

const TEST_KEY = Buffer.alloc(32, 7);
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JTI = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JTI_OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOB = "1995-06-15";
const NOW = 1_700_000_000_000;
const CLAIM_EXTRA = { countryCode: "GB", gender: "male" } as const;

type State = {
  consumed: Map<string, string>;
  pending: Map<string, { dob: string; ticket_id: string; country_code: string; gender: string }>;
  final: Set<string>;
  /** When set, second write of a fresh claim throws — proves no partial commit. */
  failPendingInsert?: boolean;
  rpcCalls: number;
};

/**
 * Mirrors public.claim_pending_signup_demographics atomically in-process.
 * Fresh claim applies consumed+pending together or not at all.
 */
function runClaimRpc(
  state: State,
  userId: string,
  ticketId: string,
  dob: string,
  countryCode: string,
  gender: string,
): string {
  state.rpcCalls += 1;

  if (state.final.has(userId)) {
    const owner = state.consumed.get(ticketId);
    if (owner === userId) return "ok";
    return "user_already_has_demographics";
  }

  const consumedOwner = state.consumed.get(ticketId);
  if (consumedOwner) {
    if (consumedOwner !== userId) return "ticket_replay";
    const pending = state.pending.get(userId);
    if (pending) {
      if (pending.ticket_id !== ticketId) return "conflict";
      return "ok";
    }
    state.pending.set(userId, { dob, ticket_id: ticketId, country_code: countryCode, gender });
    return "ok";
  }

  const pendingExisting = state.pending.get(userId);
  if (pendingExisting) {
    if (pendingExisting.ticket_id === ticketId) {
      state.consumed.set(ticketId, userId);
      return "ok";
    }
    return "conflict";
  }

  // Fresh claim — atomic: both or neither
  if (state.failPendingInsert) {
    // Simulate unique_violation on pending after consumed would have been written:
    // real SQL aborts the whole function; mock must not leave consumed.
    return "unavailable_simulated"; // caller maps via throw
  }

  for (const [, p] of state.pending) {
    if (p.ticket_id === ticketId) {
      // Would raise unique_violation on pending.ticket_id — abort both
      throw Object.assign(new Error("duplicate pending ticket"), { code: "23505" });
    }
  }

  state.consumed.set(ticketId, userId);
  state.pending.set(userId, { dob, ticket_id: ticketId, country_code: countryCode, gender });
  return "ok";
}

function mockPool(state: State): Pool {
  const queryImpl = async (
    text: string,
    params?: unknown[],
  ): Promise<QueryResult> => {
    const sql = text.replace(/\s+/g, " ").trim();

    if (sql.includes("claim_pending_signup_demographics")) {
      const userId = String(params?.[0]);
      const ticketId = String(params?.[1]);
      const dob = String(params?.[2]);
      const countryCode = String(params?.[3]);
      const gender = String(params?.[4]);
      if (state.failPendingInsert) {
        // Prove: throwing mid-claim leaves no partial state
        const beforeConsumed = new Map(state.consumed);
        const beforePending = new Map(state.pending);
        try {
          // Attempt that must not persist
          state.consumed.set(ticketId, userId);
          throw Object.assign(new Error("pending insert failed"), {
            code: "23505",
          });
        } catch (err) {
          state.consumed.clear();
          for (const [k, v] of beforeConsumed) state.consumed.set(k, v);
          state.pending.clear();
          for (const [k, v] of beforePending) state.pending.set(k, v);
          throw err;
        }
      }
      const status = runClaimRpc(state, userId, ticketId, dob, countryCode, gender);
      if (status === "unavailable_simulated") {
        throw Object.assign(new Error("simulated"), { code: "23505" });
      }
      return {
        rows: [{ claim_pending_signup_demographics: status }],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      };
    }

    if (sql.includes("WITH moved AS") && sql.includes("pending_signup_demographics")) {
      const userId = String(params?.[0]);
      const pending = state.pending.get(userId);
      if (!pending) {
        return { rows: [], rowCount: 0, command: "DELETE", oid: 0, fields: [] };
      }
      state.pending.delete(userId);
      if (!state.final.has(userId)) {
        state.final.add(userId);
        return {
          rows: [{ user_id: userId }],
          rowCount: 1,
          command: "INSERT",
          oid: 0,
          fields: [],
        };
      }
      return { rows: [], rowCount: 0, command: "INSERT", oid: 0, fields: [] };
    }

    throw new Error(`unexpected SQL in mock: ${sql.slice(0, 120)}`);
  };

  return {
    query: queryImpl,
  } as unknown as Pool;
}

function recentAuth(userId: string, email = "alice@example.com") {
  return {
    id: userId,
    created_at: new Date(NOW - 60_000).toISOString(),
    email_confirmed_at: null as string | null,
    email,
  };
}

async function sealTicket(jti = JTI, email = "alice@example.com") {
  const sealed = sealAgeGateTicket({
    dateOfBirth: DOB,
    email,
    key: TEST_KEY,
    nowMs: NOW,
    jti,
  });
  assert.equal(sealed.ok, true);
  if (!sealed.ok) throw new Error("seal failed");
  return sealed.ticket;
}

describe("claimPendingDemographics (atomic RPC)", () => {
  it("rejects nonexistent Auth user (no RPC)", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => null,
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "auth_user_not_found");
    assert.equal(state.rpcCalls, 0);
  });

  it("rejects Auth users older than claim window (no RPC)", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => ({
          id: USER_A,
          created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
          email_confirmed_at: null,
          email: "alice@example.com",
        }),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "auth_user_not_eligible");
    assert.equal(state.rpcCalls, 0);
  });

  it("ticket email A + Auth email A → claim succeeds", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket(JTI, "alice@example.com");
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A, "alice@example.com"),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, true);
    assert.equal(state.rpcCalls, 1);
    assert.equal(state.pending.get(USER_A)?.country_code, "GB");
    assert.equal(state.pending.get(USER_A)?.gender, "male");
  });

  it("rejects fake country ZZ and invalid gender before RPC", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const badCountry = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, countryCode: "ZZ", gender: "male" },
    );
    assert.equal(badCountry.ok, false);
    assert.equal(badCountry.code, "invalid_request");
    assert.equal(state.rpcCalls, 0);

    const badGender = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, countryCode: "GB", gender: "nonbinary" },
    );
    assert.equal(badGender.ok, false);
    assert.equal(badGender.code, "invalid_request");
    assert.equal(state.rpcCalls, 0);
  });

  it("prefer_not_to_say gender is accepted", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      {
        userId: USER_A,
        ticket,
        countryCode: "US",
        gender: "prefer_not_to_say",
      },
    );
    assert.equal(result.ok, true);
    assert.equal(state.pending.get(USER_A)?.gender, "prefer_not_to_say");
    assert.equal(state.pending.get(USER_A)?.country_code, "US");
  });

  it("ticket email A + Auth email B → claim rejected (no RPC / no consume)", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket(JTI, "alice@example.com");
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A, "bob@example.com"),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "auth_user_not_eligible");
    assert.equal(state.rpcCalls, 0);
    assert.equal(state.consumed.size, 0);
    assert.equal(state.pending.size, 0);
  });

  it("case/trim: ticket for Alice@ matches alice@ Auth email", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket(JTI, "  Alice@Example.COM ");
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A, "alice@example.com"),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, true);
  });

  it("normal claim creates consumed + pending together", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, true);
    assert.equal(state.rpcCalls, 1);
    assert.equal(state.consumed.get(JTI), USER_A);
    assert.deepEqual(state.pending.get(USER_A), {
      dob: DOB,
      ticket_id: JTI,
      country_code: "GB",
      gender: "male",
    });
  });

  it("same-user retry is idempotent", async () => {
    const state: State = {
      consumed: new Map([[JTI, USER_A]]),
      pending: new Map([
        [
          USER_A,
          { dob: DOB, ticket_id: JTI, country_code: "GB", gender: "male" },
        ],
      ]),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, true);
    assert.equal(state.rpcCalls, 1);
  });

  it("same ticket different user → ticket_replay", async () => {
    const state: State = {
      consumed: new Map([[JTI, USER_A]]),
      pending: new Map([
        [USER_A, { dob: DOB, ticket_id: JTI, country_code: "GB", gender: "male" }],
      ]),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_B),
        nowMs: () => NOW,
      },
      { userId: USER_B, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "ticket_replay");
  });

  it("user already pending with different ticket → conflict", async () => {
    const state: State = {
      consumed: new Map([[JTI_OTHER, USER_A]]),
      pending: new Map([[USER_A, { dob: DOB, ticket_id: JTI_OTHER }]]),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket(JTI);
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "conflict");
  });

  it("user already final → user_already_has_demographics", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set([USER_A]),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "user_already_has_demographics");
  });

  it("simulated pending failure leaves no partial consumed/pending state", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      failPendingInsert: true,
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "unavailable");
    assert.equal(state.consumed.size, 0);
    assert.equal(state.pending.size, 0);
  });

  it("response codes never include DOB strings", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const ticket = await sealTicket();
    const result = await claimPendingDemographics(
      {
        pool: mockPool(state),
        getTicketKey: () => TEST_KEY,
        getAuthUserById: async () => recentAuth(USER_A),
        nowMs: () => NOW,
      },
      { userId: USER_A, ticket, ...CLAIM_EXTRA },
    );
    assert.doesNotMatch(JSON.stringify(result), /1995/);
  });
});

describe("migratePendingDemographicsForUser", () => {
  it("moves pending into final and is idempotent", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map([
        [USER_A, { dob: DOB, ticket_id: JTI, country_code: "GB", gender: "male" }],
      ]),
      final: new Set(),
      rpcCalls: 0,
    };
    const pool = mockPool(state);
    const first = await migratePendingDemographicsForUser(pool, USER_A);
    assert.equal(first.ok, true);
    assert.equal(first.migrated, true);
    assert.equal(state.pending.has(USER_A), false);
    assert.equal(state.final.has(USER_A), true);

    const second = await migratePendingDemographicsForUser(pool, USER_A);
    assert.equal(second.ok, true);
    assert.equal(second.migrated, false);
  });

  it("legacy user with no pending is unaffected", async () => {
    const state: State = {
      consumed: new Map(),
      pending: new Map(),
      final: new Set(),
      rpcCalls: 0,
    };
    const result = await migratePendingDemographicsForUser(
      mockPool(state),
      USER_A,
    );
    assert.equal(result.ok, true);
    assert.equal(result.migrated, false);
    assert.equal(state.final.has(USER_A), false);
  });
});

describe("claim atomicity + RPC security contract", () => {
  it("server claim uses single claim_pending_signup_demographics RPC", () => {
    assert.match(pendingTsSrc, /claim_pending_signup_demographics/);
    assert.doesNotMatch(
      pendingTsSrc,
      /INSERT INTO public\.age_gate_consumed_tickets/,
    );
    assert.doesNotMatch(
      pendingTsSrc,
      /INSERT INTO public\.pending_signup_demographics/,
    );
  });

  it("migration defines atomic claim RPC with service_role-only EXECUTE", () => {
    assert.match(
      migration3bSrc,
      /CREATE OR REPLACE FUNCTION public\.claim_pending_signup_demographics/,
    );
    assert.match(
      migration3bSrc,
      /GRANT EXECUTE ON FUNCTION public\.claim_pending_signup_demographics\(uuid, uuid, date, text, text, timestamptz\) TO service_role/,
    );
    assert.match(
      migration3bSrc,
      /REVOKE ALL ON FUNCTION public\.claim_pending_signup_demographics\(uuid, uuid, date, text, text, timestamptz\) FROM anon/,
    );
    assert.match(
      migration3bSrc,
      /REVOKE ALL ON FUNCTION public\.claim_pending_signup_demographics\(uuid, uuid, date, text, text, timestamptz\) FROM authenticated/,
    );
    assert.match(
      migration3bSrc,
      /REVOKE ALL ON FUNCTION public\.claim_pending_signup_demographics\(uuid, uuid, date, text, text, timestamptz\) FROM PUBLIC/,
    );
  });

  it("SECURITY DEFINER claim/migrate/ensure use locked search_path", () => {
    assert.match(
      migration3bSrc,
      /claim_pending_signup_demographics[\s\S]*?SET search_path = public, pg_temp/,
    );
    assert.match(
      migration3bSrc,
      /migrate_pending_signup_demographics[\s\S]*?SET search_path = public, pg_temp/,
    );
    assert.match(
      migration3bSrc,
      /ensure_user_demographics_from_pending[\s\S]*?SET search_path = public, pg_temp/,
    );
  });

  it("claim RPC returns status text only (no DOB in RETURNS)", () => {
    assert.match(
      migration3bSrc,
      /claim_pending_signup_demographics\([\s\S]*?RETURNS text/,
    );
    assert.match(migration3bSrc, /never DOB|Returns status only/i);
  });

  it("fresh claim SQL has no exception handler between the two inserts", () => {
    const fnStart = migration3bSrc.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_pending_signup_demographics",
    );
    const fnEnd = migration3bSrc.indexOf(
      "COMMENT ON FUNCTION public.claim_pending_signup_demographics",
    );
    const body = migration3bSrc.slice(fnStart, fnEnd);
    const freshMarker = "-- Fresh claim:";
    const fresh = body.slice(body.indexOf(freshMarker));
    assert.match(fresh, /INSERT INTO public\.age_gate_consumed_tickets/);
    assert.match(fresh, /INSERT INTO public\.pending_signup_demographics/);
    assert.match(fresh, /country_code/);
    assert.match(fresh, /gender/);
    assert.doesNotMatch(fresh, /EXCEPTION/);
  });

  it("pending table + confirmation migrate include country/gender; trigger order documented", () => {
    assert.match(migration3bSrc, /ADD COLUMN IF NOT EXISTS country_code text/);
    assert.match(migration3bSrc, /ADD COLUMN IF NOT EXISTS gender text/);
    assert.match(migration3bSrc, /demographics_completed_at/);
    assert.match(migration3bSrc, /country_prompt_pending = false/);
    assert.match(
      migration3bSrc,
      /alphabetical trigger name order|alphabetical order/i,
    );
    assert.match(
      migration3bSrc,
      /on_auth_user_confirmed < on_auth_user_confirmed_demographics/,
    );
    assert.match(
      migration3bSrc,
      /Phase 2 trigger already installed|already installed/i,
    );
    assert.match(
      migration3bSrc,
      /DROP FUNCTION IF EXISTS public\.complete_new_user_demographics/,
    );
    assert.doesNotMatch(
      migration3bSrc,
      /CREATE OR REPLACE FUNCTION public\.complete_new_user_demographics/,
    );
    // Must not touch auth.users trigger DDL (Supabase Auth ownership → 42501).
    assert.doesNotMatch(
      migration3bSrc,
      /DROP TRIGGER[\s\S]*ON auth\.users/,
    );
    assert.doesNotMatch(
      migration3bSrc,
      /CREATE TRIGGER[\s\S]*ON auth\.users/,
    );
    assert.doesNotMatch(
      migration3bSrc,
      /COMMENT ON TRIGGER[\s\S]*ON auth\.users/,
    );
  });
});

describe("migration SQL security contract", () => {
  it("defines pending + final + consumed with auth.users FK cascade", () => {
    assert.match(migrationSrc, /pending_signup_demographics/);
    assert.match(migrationSrc, /user_demographics/);
    assert.match(migrationSrc, /age_gate_consumed_tickets/);
    assert.match(migrationSrc, /REFERENCES auth\.users \(id\) ON DELETE CASCADE/);
  });

  it("revokes anon/authenticated and enables RLS without public SELECT", () => {
    assert.match(migrationSrc, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      migrationSrc,
      /REVOKE ALL ON TABLE public\.pending_signup_demographics FROM anon/,
    );
    assert.match(
      migrationSrc,
      /REVOKE ALL ON TABLE public\.user_demographics FROM anon/,
    );
  });

  it("adds isolated confirmation demographics trigger", () => {
    assert.match(migrationSrc, /on_auth_user_confirmed_demographics/);
    assert.doesNotMatch(
      migrationSrc,
      /CREATE OR REPLACE FUNCTION public\.handle_user_confirmed/,
    );
  });

  it("public_profiles / profiles stay free of DOB/gender columns", () => {
    assert.doesNotMatch(publicProfilesSrc, /date_of_birth|gender/);
    const profilesHeading = schemaSrc.indexOf("## profiles\n");
    const publicProfilesHeading = schemaSrc.indexOf("## public_profiles\n");
    assert.ok(profilesHeading >= 0 && publicProfilesHeading > profilesHeading);
    const profilesTable = schemaSrc.slice(profilesHeading, publicProfilesHeading);
    assert.doesNotMatch(profilesTable, /date_of_birth|\bgender\b/);
  });
});
