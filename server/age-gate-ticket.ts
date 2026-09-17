/**
 * Age-gate sealed ticket — AES-256-GCM (Node crypto).
 *
 * Env: AGE_GATE_TICKET_SECRET
 * Format: exactly 32 bytes of key material as either:
 *   - standard Base64 (44 chars typical for 32 raw bytes), or
 *   - 64-char hex, or
 *   - raw UTF-8 string of length 32
 *
 * Generate (local/Railway):
 *   openssl rand -base64 32
 *
 * Envelope (opaque to clients):
 *   v1.<base64url(iv 12)>.<base64url(ciphertext)>.<base64url(tag 16)>
 *
 * Plaintext JSON (never logged): { v, dob, iat, exp, jti }
 * TTL: 20 minutes — covers age-gate → signup form → signUp → claim.
 * Rotation of AGE_GATE_TICKET_SECRET invalidates all outstanding tickets.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";

export const AGE_GATE_TICKET_VERSION = 1 as const;
export const AGE_GATE_TICKET_TTL_MS = 20 * 60 * 1000;
/** Auth user must have been created within this window to accept a claim. */
export const PENDING_CLAIM_AUTH_MAX_AGE_MS = 30 * 60 * 1000;
/** Pending DOB row TTL after claim (abandoned cleanup). */
export const PENDING_DEMOGRAPHICS_RETENTION_MS = 48 * 60 * 60 * 1000;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export type AgeGateTicketPayload = {
  v: typeof AGE_GATE_TICKET_VERSION;
  dob: string;
  iat: number;
  exp: number;
  jti: string;
};

export type SealTicketResult =
  | { ok: true; ticket: string; payload: AgeGateTicketPayload }
  | { ok: false; code: "secret_unavailable" | "seal_failed" };

export type UnsealTicketResult =
  | { ok: true; payload: AgeGateTicketPayload }
  | {
      ok: false;
      code:
        | "secret_unavailable"
        | "malformed"
        | "tampered"
        | "expired"
        | "invalid_payload";
    };

export class AgeGateTicketSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgeGateTicketSecretError";
  }
}

/** Decode env secret to 32-byte key. Throws AgeGateTicketSecretError if invalid. */
export function decodeAgeGateTicketSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new AgeGateTicketSecretError("AGE_GATE_TICKET_SECRET is empty");
  }

  const asB64 = Buffer.from(trimmed, "base64");
  if (asB64.length === KEY_BYTES) {
    // Reject ambiguous non-base64 that happens to decode to wrong length only;
    // require round-trip for base64-looking secrets when length matches.
    return asB64;
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const asUtf8 = Buffer.from(trimmed, "utf8");
  if (asUtf8.length === KEY_BYTES) {
    return asUtf8;
  }

  throw new AgeGateTicketSecretError(
    "AGE_GATE_TICKET_SECRET must decode to exactly 32 bytes (base64, hex, or utf8)",
  );
}

export function resolveAgeGateTicketKey(
  secretFromEnv: string | undefined = process.env.AGE_GATE_TICKET_SECRET,
): Buffer {
  if (!secretFromEnv || !secretFromEnv.trim()) {
    throw new AgeGateTicketSecretError("AGE_GATE_TICKET_SECRET is not set");
  }
  return decodeAgeGateTicketSecret(secretFromEnv);
}

/** Fail-closed helper for HTTP handlers. */
export function tryResolveAgeGateTicketKey():
  | { ok: true; key: Buffer }
  | { ok: false } {
  try {
    return { ok: true, key: resolveAgeGateTicketKey() };
  } catch {
    return { ok: false };
  }
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer | null {
  if (!s || /[^A-Za-z0-9_-]/.test(s)) return null;
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

export function sealAgeGateTicket(args: {
  dateOfBirth: string;
  key: Buffer;
  nowMs?: number;
  ttlMs?: number;
  jti?: string;
}): SealTicketResult {
  try {
    if (args.key.length !== KEY_BYTES) {
      return { ok: false, code: "seal_failed" };
    }
    const nowMs = args.nowMs ?? Date.now();
    const ttlMs = args.ttlMs ?? AGE_GATE_TICKET_TTL_MS;
    const payload: AgeGateTicketPayload = {
      v: AGE_GATE_TICKET_VERSION,
      dob: args.dateOfBirth,
      iat: nowMs,
      exp: nowMs + ttlMs,
      jti: args.jti ?? randomUUID(),
    };
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", args.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    if (tag.length !== TAG_BYTES) {
      return { ok: false, code: "seal_failed" };
    }
    const ticket = `v1.${b64url(iv)}.${b64url(ciphertext)}.${b64url(tag)}`;
    return { ok: true, ticket, payload };
  } catch {
    return { ok: false, code: "seal_failed" };
  }
}

export function unsealAgeGateTicket(args: {
  ticket: string;
  key: Buffer;
  nowMs?: number;
}): UnsealTicketResult {
  try {
    if (args.key.length !== KEY_BYTES) {
      return { ok: false, code: "malformed" };
    }
    if (typeof args.ticket !== "string" || args.ticket.length > 2048) {
      return { ok: false, code: "malformed" };
    }
    const parts = args.ticket.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") {
      return { ok: false, code: "malformed" };
    }
    const iv = fromB64url(parts[1]!);
    const ciphertext = fromB64url(parts[2]!);
    const tag = fromB64url(parts[3]!);
    if (!iv || !ciphertext || !tag) {
      return { ok: false, code: "malformed" };
    }
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      return { ok: false, code: "malformed" };
    }

    const decipher = createDecipheriv("aes-256-gcm", args.key, iv);
    decipher.setAuthTag(tag);
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
    } catch {
      return { ok: false, code: "tampered" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext.toString("utf8"));
    } catch {
      return { ok: false, code: "invalid_payload" };
    }

    if (!parsed || typeof parsed !== "object") {
      return { ok: false, code: "invalid_payload" };
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== AGE_GATE_TICKET_VERSION) {
      return { ok: false, code: "invalid_payload" };
    }
    if (typeof obj.dob !== "string" || typeof obj.jti !== "string") {
      return { ok: false, code: "invalid_payload" };
    }
    if (typeof obj.iat !== "number" || typeof obj.exp !== "number") {
      return { ok: false, code: "invalid_payload" };
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        obj.jti,
      )
    ) {
      return { ok: false, code: "invalid_payload" };
    }

    const nowMs = args.nowMs ?? Date.now();
    if (nowMs > obj.exp) {
      return { ok: false, code: "expired" };
    }

    return {
      ok: true,
      payload: {
        v: AGE_GATE_TICKET_VERSION,
        dob: obj.dob,
        iat: obj.iat,
        exp: obj.exp,
        jti: obj.jti,
      },
    };
  } catch {
    return { ok: false, code: "malformed" };
  }
}
