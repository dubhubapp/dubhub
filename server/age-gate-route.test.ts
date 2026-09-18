import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import { randomBytes } from "node:crypto";
import { registerAgeGateRoutes } from "./age-gate-route";
import {
  ageGateRateLimiter,
  createAgeGateRateLimiter,
} from "./age-gate-rate-limit";
import {
  formatApiAccessLogResponseSuffix,
  shouldOmitApiResponseBodyFromLog,
} from "./api-access-log";
import {
  decodeAgeGateTicketSecret,
  hashSignupEmailBinding,
  unsealAgeGateTicket,
} from "./age-gate-ticket";
import { normalizeSignupEmail } from "@shared/signup-email";

const ADULT_DOB = "1995-06-15";
const CHILD_DOB = "2018-01-01";
const INVALID_DOB = "2026-02-30";
const EMAIL = "alice@example.com";

/** Deterministic test secret (32 bytes base64) — not for production. */
const TEST_SECRET_B64 = randomBytes(32).toString("base64");

async function startAgeGateServer(): Promise<{ server: Server; origin: string }> {
  const app = express();
  app.use(express.json());
  registerAgeGateRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

describe("POST /api/auth/age-gate", () => {
  const servers: Server[] = [];
  let prevSecret: string | undefined;

  before(() => {
    prevSecret = process.env.AGE_GATE_TICKET_SECRET;
    process.env.AGE_GATE_TICKET_SECRET = TEST_SECRET_B64;
  });

  after(() => {
    if (prevSecret === undefined) delete process.env.AGE_GATE_TICKET_SECRET;
    else process.env.AGE_GATE_TICKET_SECRET = prevSecret;
  });

  beforeEach(() => {
    ageGateRateLimiter.reset();
  });

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

  it("eligible adult: 200 with opaque ticket — no DOB/email/age echoed", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: ADULT_DOB, email: EMAIL }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.eligible, true);
    assert.equal(typeof body.ticket, "string");
    assert.match(String(body.ticket), /^v2\./);
    assert.equal("age" in body, false);
    assert.equal("dateOfBirth" in body, false);
    assert.equal("email" in body, false);
    assert.equal("emailBinding" in body, false);
    const raw = JSON.stringify(body);
    assert.doesNotMatch(raw, /1995/);
    assert.doesNotMatch(raw, /alice/i);
    assert.doesNotMatch(raw, /"age"/i);

    const key = decodeAgeGateTicketSecret(TEST_SECRET_B64);
    const open = unsealAgeGateTicket({
      ticket: String(body.ticket),
      key,
    });
    assert.equal(open.ok, true);
    if (open.ok) {
      assert.equal(open.payload.dob, ADULT_DOB);
      assert.equal(
        open.payload.emailBinding,
        hashSignupEmailBinding(normalizeSignupEmail(EMAIL)!),
      );
    }
  });

  it("under-13: 403 — no ticket", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: CHILD_DOB, email: EMAIL }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body, {
      eligible: false,
      code: "minimum_age_not_met",
    });
    assert.equal("ticket" in body, false);
  });

  it("invalid DOB: 400 — no ticket", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: INVALID_DOB, email: EMAIL }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body, {
      eligible: false,
      code: "invalid_date_of_birth",
    });
  });

  it("missing email: 400", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: ADULT_DOB }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      eligible: false,
      code: "invalid_date_of_birth",
    });
  });

  it("missing body: 400 invalid_date_of_birth", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      eligible: false,
      code: "invalid_date_of_birth",
    });
  });

  it("rate limits repeated requests from same IP", async () => {
    const limiter = createAgeGateRateLimiter({
      windowMs: 60_000,
      maxRequests: 3,
    });
    assert.equal(limiter.check("1.2.3.4").allowed, true);
    assert.equal(limiter.check("1.2.3.4").allowed, true);
    assert.equal(limiter.check("1.2.3.4").allowed, true);
    const blocked = limiter.check("1.2.3.4");
    assert.equal(blocked.allowed, false);
  });
});

describe("api access log — age-gate / claim omit", () => {
  it("omits response body for age-gate and pending-demographics", () => {
    assert.equal(shouldOmitApiResponseBodyFromLog("/api/auth/age-gate"), true);
    assert.equal(
      shouldOmitApiResponseBodyFromLog("/api/auth/pending-demographics"),
      true,
    );
    assert.equal(
      shouldOmitApiResponseBodyFromLog("/api/auth/ensure-demographics"),
      true,
    );
    const suffix = formatApiAccessLogResponseSuffix("/api/auth/age-gate", {
      eligible: true,
      ticket: "v2.secret",
      dateOfBirth: "1995-06-15",
      email: "alice@example.com",
    });
    assert.equal(suffix, " :: [body omitted]");
    assert.doesNotMatch(suffix, /1995|v2\.secret|alice/);
  });
});
