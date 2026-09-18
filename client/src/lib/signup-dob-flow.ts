/**
 * SignUp DOB orchestration — testable without DOM.
 * Age-gate on submit only; claim before success UX; abandon if claim fails.
 *
 * Binding order (same submit attempt):
 * validate → age-gate(DOB + pinned email) → signUp(same email) → claim → success
 */

import { evaluateDateOfBirth } from "@shared/age-gate";

export const SIGNUP_UNDER_13_MESSAGE =
  "You need to be at least 13 to create a dub hub account.";

export const SIGNUP_INVALID_DOB_MESSAGE =
  "Please enter a valid date of birth.";

export const SIGNUP_AGE_GATE_UNAVAILABLE_MESSAGE =
  "We could not verify your age right now. Please try again in a moment.";

export const SIGNUP_CLAIM_FAILED_MESSAGE =
  "We couldn’t finish creating your account. Please try again.";

const CLAIM_RETRY_ATTEMPTS = 3;
const CLAIM_RETRY_GAP_MS = 400;

export type SignupAgeGateResult =
  | { ok: true; ticket: string }
  | { ok: false; kind: "under_13" | "invalid" | "unavailable" };

export type SignupAuthResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      kind: "duplicate" | "rate_limit" | "username" | "other";
      message?: string;
    };

export type SignupClaimResult =
  | { ok: true }
  | { ok: false; retryable: boolean; code?: string };

export type SignupAbandonResult = { ok: boolean };

export type RunSignupWithDobDeps = {
  dateOfBirth: string;
  /**
   * Signup email for this submit attempt — passed to age-gate and signUp.
   * Must not change between those steps within one run.
   */
  email: string;
  /** Client-side UX check only; server age-gate remains authoritative. */
  clientValidateDob?: (dob: string) => boolean;
  ageGate: (
    dateOfBirth: string,
    email: string,
  ) => Promise<SignupAgeGateResult>;
  /** Must sign up with the same email passed into this run. */
  signUp: (email: string) => Promise<SignupAuthResult>;
  claim: (userId: string, ticket: string) => Promise<SignupClaimResult>;
  abandon: (userId: string, ticket: string) => Promise<SignupAbandonResult>;
  /** Runs only after claim succeeds — MailerLite / markers / modal. */
  afterClaimSuccess: () => Promise<void> | void;
  sleep?: (ms: number) => Promise<void>;
};

export type RunSignupWithDobResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      /** True when Auth was created then cleaned up (or cleanup attempted). */
      authCompensated?: boolean;
    };

export function clientDobLooksValid(dateOfBirth: string): boolean {
  const result = evaluateDateOfBirth(dateOfBirth);
  // Client may pass eligible or under-13 dates to the server; only block
  // structurally invalid / future / implausible before the network call.
  if (!result.valid) return false;
  return true;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Binding order:
 * validate → age-gate(DOB+email) → signUp(same email) → claim (retry) → success
 * On terminal claim failure → abandon unconfirmed Auth user.
 */
export async function runSignupWithDob(
  deps: RunSignupWithDobDeps,
): Promise<RunSignupWithDobResult> {
  const dob = deps.dateOfBirth.trim();
  const email = deps.email.trim();
  const validate = deps.clientValidateDob ?? clientDobLooksValid;
  if (!dob || !validate(dob)) {
    return { ok: false, message: SIGNUP_INVALID_DOB_MESSAGE };
  }
  if (!email) {
    return { ok: false, message: "Please enter a valid email." };
  }

  const gate = await deps.ageGate(dob, email);
  if (!gate.ok) {
    if (gate.kind === "under_13") {
      return { ok: false, message: SIGNUP_UNDER_13_MESSAGE };
    }
    if (gate.kind === "invalid") {
      return { ok: false, message: SIGNUP_INVALID_DOB_MESSAGE };
    }
    return { ok: false, message: SIGNUP_AGE_GATE_UNAVAILABLE_MESSAGE };
  }

  const ticket = gate.ticket;
  const auth = await deps.signUp(email);
  if (!auth.ok) {
    if (auth.kind === "duplicate") {
      return {
        ok: false,
        message:
          "That email already has a dub hub account. Please sign in instead, or use Forgot password if you can't remember your password.",
      };
    }
    if (auth.kind === "rate_limit") {
      return {
        ok: false,
        message: auth.message || "Please wait a moment before trying again.",
      };
    }
    return {
      ok: false,
      message: auth.message || "Failed to create account. Please try again.",
    };
  }

  const sleep = deps.sleep ?? defaultSleep;
  let claimOk = false;
  let lastRetryable = true;
  for (let i = 0; i < CLAIM_RETRY_ATTEMPTS; i++) {
    const claim = await deps.claim(auth.userId, ticket);
    if (claim.ok) {
      claimOk = true;
      break;
    }
    lastRetryable = claim.retryable;
    if (!claim.retryable) break;
    if (i < CLAIM_RETRY_ATTEMPTS - 1) {
      await sleep(CLAIM_RETRY_GAP_MS);
    }
  }
  void lastRetryable;

  if (!claimOk) {
    const abandoned = await deps.abandon(auth.userId, ticket);
    return {
      ok: false,
      message: SIGNUP_CLAIM_FAILED_MESSAGE,
      authCompensated: abandoned.ok,
    };
  }

  await deps.afterClaimSuccess();
  return { ok: true };
}

export function isClaimHttpRetryable(status: number, code?: string): boolean {
  if (status === 429 || status === 503 || status >= 500) return true;
  if (status === 0) return true;
  if (code === "unavailable" || code === "rate_limited") return true;
  return false;
}
