import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canAdvanceSignupStep1,
  canSubmitSignupStep2,
} from "./signup-steps";

const here = dirname(fileURLToPath(import.meta.url));
const signUpSrc = readFileSync(
  join(here, "../components/auth/SignUp.tsx"),
  "utf8",
);
const aboutYouFieldsSrc = readFileSync(
  join(here, "../components/auth/SignupAboutYouFields.tsx"),
  "utf8",
);
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");

describe("signup steps helpers", () => {
  it("Step 1 Continue requires account fields + username ready", () => {
    assert.equal(
      canAdvanceSignupStep1({
        email: "a@b.com",
        username: "alice",
        password: "Password1",
        confirmPassword: "Password1",
        accountType: "user",
        usernameReady: true,
        passwordCanSubmit: true,
        passwordsMatch: true,
      }),
      true,
    );
    assert.equal(
      canAdvanceSignupStep1({
        email: "a@b.com",
        username: "alice",
        password: "Password1",
        confirmPassword: "Password1",
        accountType: "user",
        usernameReady: false,
        passwordCanSubmit: true,
        passwordsMatch: true,
      }),
      false,
    );
  });

  it("Step 2 Create Account requires DOB + country + gender", () => {
    assert.equal(
      canSubmitSignupStep2({
        dateOfBirth: "1995-06-15",
        countryCode: "GB",
        gender: "prefer_not_to_say",
      }),
      true,
    );
    assert.equal(
      canSubmitSignupStep2({
        dateOfBirth: "1995-06-15",
        countryCode: null,
        gender: "male",
      }),
      false,
    );
  });
});

describe("SignUp two-step wiring", () => {
  it("Step 1 Continue does not call age-gate or signUp", () => {
    assert.match(signUpSrc, /button-signup-continue/);
    assert.match(signUpSrc, /handleContinueStep1/);
    const step1Start = signUpSrc.indexOf("/** Step 1 Continue");
    const step1End = signUpSrc.indexOf("/** Step 2 Create Account");
    assert.ok(step1Start >= 0 && step1End > step1Start);
    const step1 = signUpSrc.slice(step1Start, step1End);
    assert.doesNotMatch(step1, /\/api\/auth\/age-gate/);
    assert.doesNotMatch(step1, /auth\.signUp/);
    assert.doesNotMatch(step1, /pending-demographics/);
    assert.doesNotMatch(step1, /addToMailerLite/);
    assert.doesNotMatch(step1, /markOnboardingPendingForEmail/);
    assert.match(step1, /setSignupStep\(2\)/);
  });

  it("Step 2 holds DOB + Country + Gender and Create Account", () => {
    assert.match(signUpSrc, /About you/);
    assert.match(signUpSrc, /SignupAboutYouFields/);
    assert.match(signUpSrc, /input-date-of-birth/);
    assert.match(signUpSrc, /button-create-account/);
    assert.match(signUpSrc, /button-signup-back/);
    assert.match(signUpSrc, /setSignupStep\(1\)/);
  });

  it("final claim posts countryCode + gender; metadata stays username/account_type", () => {
    assert.match(
      signUpSrc,
      /pending-demographics[\s\S]{0,200}countryCode: claimCountry/,
    );
    assert.match(signUpSrc, /gender: claimGender/);
    assert.match(signUpSrc, /username: trimmedUsername/);
    assert.match(signUpSrc, /account_type: accountType/);
    assert.doesNotMatch(
      signUpSrc,
      /data:\s*\{[^}]*dateOfBirth|data:\s*\{[^}]*country|data:\s*\{[^}]*gender/,
    );
  });

  it("reuses searchable country + gender options without auth dependency", () => {
    assert.match(aboutYouFieldsSrc, /filterCountryOptions/);
    assert.match(aboutYouFieldsSrc, /DEMOGRAPHICS_GENDER_VALUES/);
    assert.match(aboutYouFieldsSrc, /CountryFlag/);
    assert.match(aboutYouFieldsSrc, /countryCode=\{/);
    assert.doesNotMatch(aboutYouFieldsSrc, /useUser|apiRequest|complete-demographics/);
  });

  it("Country popover floats with material shell; no Command teal / duplicate search icon", () => {
    assert.match(aboutYouFieldsSrc, /PopoverContent/);
    assert.match(aboutYouFieldsSrc, /PRELOGIN_SELECT_CONTENT_CLASS/);
    assert.match(aboutYouFieldsSrc, /PRELOGIN_SELECT_ITEM_CLASS/);
    assert.match(aboutYouFieldsSrc, /modal/);
    assert.match(aboutYouFieldsSrc, /Where you&apos;re based/);
    // Single Search icon beside plain input — not CommandInput (built-in icon) + wrapper icon.
    assert.doesNotMatch(aboutYouFieldsSrc, /CommandInput|CommandItem|from \"@\/components\/ui\/command\"/);
    assert.match(aboutYouFieldsSrc, /signup-country-search/);
    // No accent/teal selection tokens from generic Command.
    assert.doesNotMatch(aboutYouFieldsSrc, /bg-accent|data-\[selected/);
    assert.match(aboutYouFieldsSrc, /COUNTRY_FLAG_PICKER_CLASS/);
  });

  it("post-login About You gate is removed", () => {
    assert.doesNotMatch(appSrc, /AboutYouGate|about-you-gate|resolveDemographicsGateDecision/);
    assert.doesNotMatch(appSrc, /demographics-status|complete-demographics/);
  });
});
