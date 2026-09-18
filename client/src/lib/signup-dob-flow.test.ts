import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clientDobLooksValid,
  isClaimHttpRetryable,
  runSignupWithDob,
  SIGNUP_CLAIM_FAILED_MESSAGE,
  SIGNUP_UNDER_13_MESSAGE,
} from "./signup-dob-flow";

const here = dirname(fileURLToPath(import.meta.url));
const signUpSrc = readFileSync(
  join(here, "../components/auth/SignUp.tsx"),
  "utf8",
);
const flowSrc = readFileSync(join(here, "signup-dob-flow.ts"), "utf8");
const indexCssSrc = readFileSync(
  join(here, "../index.css"),
  "utf8",
);

const EMAIL = "alice@example.com";

describe("clientDobLooksValid", () => {
  it("rejects empty / impossible / future", () => {
    assert.equal(clientDobLooksValid(""), false);
    assert.equal(clientDobLooksValid("2026-02-30"), false);
    assert.equal(clientDobLooksValid("2099-01-01"), false);
  });

  it("accepts structurally valid past DOBs (server still authoritative)", () => {
    assert.equal(clientDobLooksValid("2018-01-01"), true);
    assert.equal(clientDobLooksValid("1995-06-15"), true);
  });
});

describe("runSignupWithDob orchestration", () => {
  it("eligible happy path: age-gate → signUp → claim → success side effects", async () => {
    const calls: string[] = [];
    const result = await runSignupWithDob({
      dateOfBirth: "1995-06-15",
      countryCode: "GB",
      gender: "male",
      email: EMAIL,
      ageGate: async (dob, email) => {
        calls.push(`ageGate:${dob}:${email}`);
        return { ok: true, ticket: "v2.ticket" };
      },
      signUp: async (email) => {
        calls.push(`signUp:${email}`);
        return { ok: true, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      claim: async (userId, ticket, country, gender) => {
        calls.push(`claim:${userId}:${ticket}:${country}:${gender}`);
        return { ok: true };
      },
      abandon: async () => {
        calls.push("abandon");
        return { ok: true };
      },
      afterClaimSuccess: async () => {
        calls.push("success");
      },
      sleep: async () => {},
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      `ageGate:1995-06-15:${EMAIL}`,
      `signUp:${EMAIL}`,
      "claim:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:v2.ticket:GB:male",
      "success",
    ]);
  });

  it("pins same email across age-gate and signUp", async () => {
    let gateEmail = "";
    let signEmail = "";
    await runSignupWithDob({
      dateOfBirth: "1995-06-15",
      countryCode: "GB",
      gender: "male",
      email: "  Alice@Example.COM ",
      ageGate: async (_dob, email) => {
        gateEmail = email;
        return { ok: true, ticket: "t" };
      },
      signUp: async (email) => {
        signEmail = email;
        return { ok: true, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      claim: async () => ({ ok: true }),
      abandon: async () => ({ ok: true }),
      afterClaimSuccess: async () => {},
      sleep: async () => {},
    });
    assert.equal(gateEmail, "Alice@Example.COM");
    assert.equal(signEmail, gateEmail);
  });

  it("under 13: never signUp or claim", async () => {
    const calls: string[] = [];
    const result = await runSignupWithDob({
      dateOfBirth: "2018-01-01",
      countryCode: "GB",
      gender: "male",
      email: EMAIL,
      ageGate: async () => {
        calls.push("ageGate");
        return { ok: false, kind: "under_13" };
      },
      signUp: async () => {
        calls.push("signUp");
        return { ok: true, userId: "x" };
      },
      claim: async () => {
        calls.push("claim");
        return { ok: true };
      },
      abandon: async () => {
        calls.push("abandon");
        return { ok: true };
      },
      afterClaimSuccess: async () => {
        calls.push("success");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.message, SIGNUP_UNDER_13_MESSAGE);
    assert.deepEqual(calls, ["ageGate"]);
  });

  it("invalid DOB from age-gate: never signUp", async () => {
    const calls: string[] = [];
    const result = await runSignupWithDob({
      dateOfBirth: "2026-02-30",
      countryCode: "GB",
      gender: "male",
      email: EMAIL,
      clientValidateDob: () => true,
      ageGate: async () => {
        calls.push("ageGate");
        return { ok: false, kind: "invalid" };
      },
      signUp: async () => {
        calls.push("signUp");
        return { ok: true, userId: "x" };
      },
      claim: async () => {
        calls.push("claim");
        return { ok: true };
      },
      abandon: async () => ({ ok: true }),
      afterClaimSuccess: async () => {
        calls.push("success");
      },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(calls, ["ageGate"]);
  });

  it("age-gate network failure: never signUp", async () => {
    const calls: string[] = [];
    await runSignupWithDob({
      dateOfBirth: "1995-06-15",
      countryCode: "GB",
      gender: "male",
      email: EMAIL,
      ageGate: async () => {
        calls.push("ageGate");
        return { ok: false, kind: "unavailable" };
      },
      signUp: async () => {
        calls.push("signUp");
        return { ok: true, userId: "x" };
      },
      claim: async () => {
        calls.push("claim");
        return { ok: true };
      },
      abandon: async () => ({ ok: true }),
      afterClaimSuccess: async () => {
        calls.push("success");
      },
    });
    assert.deepEqual(calls, ["ageGate"]);
  });

  it("signUp failure: never claim", async () => {
    const calls: string[] = [];
    await runSignupWithDob({
      dateOfBirth: "1995-06-15",
      countryCode: "GB",
      gender: "male",
      email: EMAIL,
      ageGate: async () => ({ ok: true, ticket: "t" }),
      signUp: async () => {
        calls.push("signUp");
        return { ok: false, kind: "duplicate" };
      },
      claim: async () => {
        calls.push("claim");
        return { ok: true };
      },
      abandon: async () => {
        calls.push("abandon");
        return { ok: true };
      },
      afterClaimSuccess: async () => {
        calls.push("success");
      },
    });
    assert.deepEqual(calls, ["signUp"]);
  });

  it("claim transient failure retries then succeeds", async () => {
    const calls: string[] = [];
    let n = 0;
    const result = await runSignupWithDob({
      dateOfBirth: "1995-06-15",
      countryCode: "GB",
      gender: "male",
      email: EMAIL,
      ageGate: async () => ({ ok: true, ticket: "t" }),
      signUp: async () => ({
        ok: true,
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      claim: async () => {
        n += 1;
        calls.push(`claim${n}`);
        if (n < 2) return { ok: false, retryable: true };
        return { ok: true };
      },
      abandon: async () => {
        calls.push("abandon");
        return { ok: true };
      },
      afterClaimSuccess: async () => {
        calls.push("success");
      },
      sleep: async () => {},
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["claim1", "claim2", "success"]);
  });

  it("claim terminal failure abandons Auth and hides success", async () => {
    const calls: string[] = [];
    const result = await runSignupWithDob({
      dateOfBirth: "1995-06-15",
      countryCode: "GB",
      gender: "male",
      email: EMAIL,
      ageGate: async () => ({ ok: true, ticket: "t" }),
      signUp: async () => ({
        ok: true,
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      claim: async () => {
        calls.push("claim");
        return { ok: false, retryable: false, code: "conflict" };
      },
      abandon: async (userId, ticket) => {
        calls.push(`abandon:${userId}:${ticket}`);
        return { ok: true };
      },
      afterClaimSuccess: async () => {
        calls.push("success");
      },
      sleep: async () => {},
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, SIGNUP_CLAIM_FAILED_MESSAGE);
      assert.equal(result.authCompensated, true);
    }
    assert.deepEqual(calls, [
      "claim",
      "abandon:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:t",
    ]);
  });

  it("isClaimHttpRetryable", () => {
    assert.equal(isClaimHttpRetryable(503), true);
    assert.equal(isClaimHttpRetryable(429), true);
    assert.equal(isClaimHttpRetryable(409), false);
    assert.equal(isClaimHttpRetryable(400), false);
  });
});

describe("SignUp.tsx Phase 3A wiring", () => {
  it("includes DOB field without permanent age helper", () => {
    assert.match(signUpSrc, /input-date-of-birth/);
    assert.match(signUpSrc, /Date of birth/);
    assert.match(signUpSrc, /type="date"/);
    assert.match(signUpSrc, /dubhub-date-input/);
    assert.match(signUpSrc, /runSignupWithDob/);
    assert.doesNotMatch(signUpSrc, /SIGNUP_DOB_HELPER/);
    assert.doesNotMatch(signUpSrc, /dubhub-prelogin-date-field/);
    assert.doesNotMatch(
      signUpSrc,
      /You must be 13 or older to use dub hub/,
    );
    assert.match(flowSrc, /SIGNUP_UNDER_13_MESSAGE/);
    assert.match(
      flowSrc,
      /You need to be at least 13 to create a dub hub account/,
    );
  });

  it("two-step: age-gate only on Step 2 Create Account path", () => {
    assert.match(signUpSrc, /signupStep === 1 \? handleContinueStep1 : handleCreateAccount/);
    assert.match(signUpSrc, /\/api\/auth\/age-gate/);
    const createStart = signUpSrc.indexOf("handleCreateAccount");
    const createEnd = signUpSrc.indexOf("return (", createStart);
    const createBody = signUpSrc.slice(createStart, createEnd);
    assert.match(createBody, /age-gate/);
    assert.match(createBody, /auth\.signUp/);
    assert.match(createBody, /pending-demographics/);
  });

  it("reuses Submit Metadata date wrapper + dubhub-date-input; no empty status reserve", () => {
    assert.match(
      signUpSrc,
      /dubhub-prelogin-dob-wrap relative isolate flex h-\[2\.8125rem\] min-w-0 w-full max-w-full overflow-hidden rounded-\[15px\] \[contain:inline-size\]/,
    );
    assert.match(signUpSrc, /dubhub-date-input h-full min-h-0 max-h-full/);
    assert.match(signUpSrc, /py-0 pr-12/);
    assert.match(signUpSrc, /\{dobError \? \(/);
    assert.doesNotMatch(
      signUpSrc,
      /dateOfBirth[\s\S]{0,800}PRELOGIN_USERNAME_STATUS_CLASS/,
    );
    assert.doesNotMatch(
      signUpSrc,
      /dateOfBirth[\s\S]{0,400}PRELOGIN_FEEDBACK_GROUP_CLASS/,
    );
    assert.doesNotMatch(indexCssSrc, /dubhub-prelogin-date-field/);
    assert.match(indexCssSrc, /\.dubhub-date-input::-webkit-datetime-edit/);
    assert.match(
      indexCssSrc,
      /\.dubhub-date-input::-webkit-calendar-picker-indicator/,
    );
  });

  it("scopes SignUp DOB typography inherit under prelogin auth only", () => {
    assert.match(indexCssSrc, /\.dubhub-prelogin-auth \.dubhub-prelogin-dob-wrap/);
    assert.match(
      indexCssSrc,
      /\.dubhub-prelogin-dob-wrap\s*\{[^}]*0 2px 10px rgba\(0, 0, 0, 0\.28\)/,
    );
    assert.match(
      indexCssSrc,
      /\.dubhub-prelogin-dob-wrap\s*\{[^}]*inset 0 1px 0 rgba\(255, 255, 255, 0\.16\)/,
    );
    assert.match(
      indexCssSrc,
      /input\.dubhub-prelogin-field\.dubhub-date-input\[type="date"\][\s\S]{0,200}height:\s*100%/,
    );
    assert.match(
      indexCssSrc,
      /input\.dubhub-prelogin-field\.dubhub-date-input\[type="date"\][\s\S]{0,280}box-shadow:\s*none/,
    );
    assert.match(
      indexCssSrc,
      /input\.dubhub-prelogin-field\.dubhub-date-input\[type="date"\]::-webkit-datetime-edit/,
    );
    assert.match(
      indexCssSrc,
      /input\.dubhub-prelogin-field\.dubhub-date-input\[type="date"\][\s\S]{0,500}font-size:\s*16px/,
    );
    assert.match(
      indexCssSrc,
      /::-webkit-datetime-edit[\s\S]{0,400}font-size:\s*16px/,
    );
    assert.match(
      indexCssSrc,
      /::-webkit-datetime-edit[\s\S]{0,400}line-height:\s*normal/,
    );
    // Shared Submit Metadata rule must keep its own line-height (not rewritten).
    const sharedEdit = indexCssSrc.match(
      /\.dubhub-date-input::-webkit-datetime-edit\s*\{[^}]+\}/,
    );
    assert.ok(sharedEdit);
    assert.match(sharedEdit![0], /line-height:\s*1\.25rem/);
    assert.doesNotMatch(sharedEdit![0], /font-size:\s*16px/);
  });

  it("Auth metadata stays username + account_type only", () => {
    assert.match(signUpSrc, /username:\s*trimmedUsername/);
    assert.match(signUpSrc, /account_type:\s*accountType/);
    const dataBlock = signUpSrc.slice(
      signUpSrc.indexOf("data: {"),
      signUpSrc.indexOf("data: {") + 120,
    );
    assert.match(dataBlock, /username/);
    assert.match(dataBlock, /account_type/);
    assert.doesNotMatch(dataBlock, /dateOfBirth|dob|gender|country/i);
  });

  it("age-gate request includes email; signUp uses same email arg", () => {
    assert.match(signUpSrc, /email:\s*trimmedEmail/);
    assert.match(signUpSrc, /ageGate:\s*async\s*\(dob,\s*emailForGate\)/);
    assert.match(signUpSrc, /dateOfBirth:\s*dob,\s*\n\s*email:\s*emailForGate/);
    assert.match(signUpSrc, /signUp:\s*async\s*\(emailForSignUp\)/);
  });

  it("does not persist DOB or emailBinding to localStorage/sessionStorage", () => {
    assert.doesNotMatch(signUpSrc, /localStorage.*dateOfBirth|dateOfBirth.*localStorage/);
    assert.doesNotMatch(signUpSrc, /sessionStorage.*dateOfBirth|dateOfBirth.*sessionStorage/);
    assert.doesNotMatch(signUpSrc, /emailBinding/);
  });

  it("does not console.log DOB or ticket", () => {
    assert.doesNotMatch(signUpSrc, /console\.(log|warn|error|debug)\([^\)]*dateOfBirth/);
    assert.doesNotMatch(signUpSrc, /console\.(log|warn|error|debug)\([^\)]*ticket/);
  });

  it("uses abandon compensation endpoint", () => {
    assert.match(signUpSrc, /\/api\/auth\/abandon-unconfirmed-signup/);
    assert.match(signUpSrc, /\/api\/auth\/age-gate/);
    assert.match(signUpSrc, /\/api\/auth\/pending-demographics/);
  });

  it("MailerLite runs only in afterClaimSuccess", () => {
    const idxClaim = signUpSrc.indexOf("afterClaimSuccess");
    const idxMailer = signUpSrc.indexOf("/api/addToMailerLite");
    assert.ok(idxClaim > 0 && idxMailer > idxClaim);
  });
});
