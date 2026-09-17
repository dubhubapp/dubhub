import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, beforeEach, describe, it } from "node:test";
import express from "express";
import { registerAgeGateRoutes } from "./age-gate-route";
import {
  ageGateRateLimiter,
  createAgeGateRateLimiter,
} from "./age-gate-rate-limit";
import {
  formatApiAccessLogResponseSuffix,
  redactSensitiveApiLogFields,
  shouldOmitApiResponseBodyFromLog,
} from "./api-access-log";

/** Synthetic DOBs relative to real "today" — use fixed ages via evaluate tests;
 * endpoint tests use clearly adult / child / invalid strings. */
const ADULT_DOB = "1995-06-15";
const CHILD_DOB = "2018-01-01";
const INVALID_DOB = "2026-02-30";

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

  it("eligible adult: 200 { eligible: true } — no DOB/age echoed", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: ADULT_DOB }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body, { eligible: true });
    assert.equal("age" in body, false);
    assert.equal("dateOfBirth" in body, false);
    assert.equal("ageYears" in body, false);
    const raw = JSON.stringify(body);
    assert.doesNotMatch(raw, /1995/);
    assert.doesNotMatch(raw, /age/i);
  });

  it("under-13: 403 minimum_age_not_met — no DOB/age", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: CHILD_DOB }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body, {
      eligible: false,
      code: "minimum_age_not_met",
    });
    const raw = JSON.stringify(body);
    assert.doesNotMatch(raw, /2018/);
    assert.equal("age" in body, false);
    assert.equal("dateOfBirth" in body, false);
  });

  it("invalid DOB: 400 invalid_date_of_birth — no echo", async () => {
    const { server, origin } = await startAgeGateServer();
    servers.push(server);
    const res = await fetch(`${origin}/api/auth/age-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: INVALID_DOB }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body, {
      eligible: false,
      code: "invalid_date_of_birth",
    });
    assert.doesNotMatch(JSON.stringify(body), /2026-02-30/);
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
    const body = await res.json();
    assert.deepEqual(body, {
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
    if (!blocked.allowed) assert.ok(blocked.retryAfterSec >= 1);
  });
});

describe("api access log — age-gate redaction", () => {
  it("omits response body for /api/auth/age-gate", () => {
    assert.equal(shouldOmitApiResponseBodyFromLog("/api/auth/age-gate"), true);
    const suffix = formatApiAccessLogResponseSuffix("/api/auth/age-gate", {
      eligible: true,
      dateOfBirth: "1995-06-15",
      age: 31,
    });
    assert.equal(suffix, " :: [body omitted]");
    assert.doesNotMatch(suffix, /1995/);
    assert.doesNotMatch(suffix, /age/);
  });

  it("still logs other API response bodies (with sensitive key redaction)", () => {
    assert.equal(shouldOmitApiResponseBodyFromLog("/api/auth/check-email"), false);
    const suffix = formatApiAccessLogResponseSuffix("/api/users", {
      ok: true,
      dateOfBirth: "1995-06-15",
    });
    assert.match(suffix, /\[redacted\]/);
    assert.doesNotMatch(suffix, /1995-06-15/);
  });

  it("redactSensitiveApiLogFields strips DOB/age/ticket keys", () => {
    const redacted = redactSensitiveApiLogFields({
      dateOfBirth: "1995-06-15",
      ageYears: 31,
      ticket: "secret",
      eligible: true,
    }) as Record<string, unknown>;
    assert.equal(redacted.dateOfBirth, "[redacted]");
    assert.equal(redacted.ageYears, "[redacted]");
    assert.equal(redacted.ticket, "[redacted]");
    assert.equal(redacted.eligible, true);
  });
});
