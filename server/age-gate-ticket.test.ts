import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { normalizeSignupEmail } from "@shared/signup-email";
import {
  AGE_GATE_TICKET_TTL_MS,
  AGE_GATE_TICKET_VERSION,
  decodeAgeGateTicketSecret,
  emailBindingFromRawEmail,
  emailBindingsMatch,
  hashSignupEmailBinding,
  sealAgeGateTicket,
  unsealAgeGateTicket,
} from "./age-gate-ticket";

/** Deterministic 32-byte test key (not a production secret). */
const TEST_KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);
const DOB = "1995-06-15";
const EMAIL = "alice@example.com";

describe("age-gate ticket AES-256-GCM", () => {
  it("decodes base64 / hex / utf8 32-byte secrets", () => {
    const raw = randomBytes(32);
    assert.equal(decodeAgeGateTicketSecret(raw.toString("base64")).length, 32);
    assert.equal(decodeAgeGateTicketSecret(raw.toString("hex")).length, 32);
    assert.equal(
      decodeAgeGateTicketSecret("abcdefghijklmnopqrstuvwxyz012345").length,
      32,
    );
    assert.throws(() => decodeAgeGateTicketSecret("too-short"));
  });

  it("seals eligible ticket opaque — no plaintext DOB/email/binding in envelope", () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000,
      jti: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    assert.match(sealed.ticket, /^v2\./);
    assert.doesNotMatch(sealed.ticket, /1995/);
    assert.doesNotMatch(sealed.ticket, /06-15/);
    assert.doesNotMatch(sealed.ticket, /dob/i);
    assert.doesNotMatch(sealed.ticket, /alice/i);
    assert.doesNotMatch(sealed.ticket, /example\.com/i);
    assert.equal(sealed.ticket.includes(sealed.payload.emailBinding), false);
    assert.equal(sealed.payload.jti, "11111111-1111-4111-8111-111111111111");
    assert.equal(sealed.payload.v, AGE_GATE_TICKET_VERSION);
    assert.equal(
      sealed.payload.emailBinding,
      hashSignupEmailBinding(normalizeSignupEmail(EMAIL)!),
    );
  });

  it("round-trips unseal with emailBinding", () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    const open = unsealAgeGateTicket({
      ticket: sealed.ticket,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000 + 60_000,
    });
    assert.equal(open.ok, true);
    if (!open.ok) return;
    assert.equal(open.payload.dob, DOB);
    assert.equal(open.payload.v, 2);
    assert.equal(
      open.payload.emailBinding,
      createHash("sha256").update("alice@example.com", "utf8").digest("hex"),
    );
  });

  it("rejects one-byte tamper", () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    const parts = sealed.ticket.split(".");
    const ct = parts[2]!;
    const flipped =
      ct[0] === "A" ? "B" + ct.slice(1) : "A" + ct.slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${flipped}.${parts[3]}`;
    const open = unsealAgeGateTicket({
      ticket: tampered,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000,
    });
    assert.equal(open.ok, false);
    if (!open.ok) assert.equal(open.code, "tampered");
  });

  it("rejects expired ticket", () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000,
      ttlMs: AGE_GATE_TICKET_TTL_MS,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    const open = unsealAgeGateTicket({
      ticket: sealed.ticket,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000 + AGE_GATE_TICKET_TTL_MS + 1,
    });
    assert.equal(open.ok, false);
    if (!open.ok) assert.equal(open.code, "expired");
  });

  it("rejects malformed / legacy v1 envelopes", () => {
    for (const ticket of [
      "",
      "v1",
      "v1.a.b.c",
      "v2.a.b.c",
      "not-a-ticket",
      "v2...",
    ]) {
      const open = unsealAgeGateTicket({
        ticket,
        key: TEST_KEY,
        nowMs: 1_700_000_000_000,
      });
      assert.equal(open.ok, false);
    }
  });

  it("rejects wrong secret", () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL,
      key: TEST_KEY,
      nowMs: 1_700_000_000_000,
    });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    const open = unsealAgeGateTicket({
      ticket: sealed.ticket,
      key: OTHER_KEY,
      nowMs: 1_700_000_000_000,
    });
    assert.equal(open.ok, false);
    if (!open.ok) assert.equal(open.code, "tampered");
  });

  it("issues unique ticket ids by default", () => {
    const a = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL,
      key: TEST_KEY,
    });
    const b = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: EMAIL,
      key: TEST_KEY,
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.notEqual(a.payload.jti, b.payload.jti);
  });

  it("case/trim normalization binds identically", () => {
    const a = emailBindingFromRawEmail("  Alice@Example.COM ");
    const b = emailBindingFromRawEmail("alice@example.com");
    assert.ok(a && b);
    assert.equal(a, b);
    assert.equal(emailBindingsMatch(a!, "ALICE@EXAMPLE.COM"), true);
    assert.equal(emailBindingsMatch(a!, "bob@example.com"), false);
  });

  it("rejects seal without valid email", () => {
    const sealed = sealAgeGateTicket({
      dateOfBirth: DOB,
      email: "not-an-email",
      key: TEST_KEY,
    });
    assert.equal(sealed.ok, false);
    if (!sealed.ok) assert.equal(sealed.code, "invalid_email");
  });
});
