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

  it("Step 2 uses standard ChevronLeft back arrow top-left; no worded Back", () => {
    assert.match(signUpSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(signUpSrc, /APP_MATERIAL_BACK_ICON_CLASS/);
    assert.match(signUpSrc, /ChevronLeft/);
    assert.match(signUpSrc, /aria-label="Back"/);
    assert.match(signUpSrc, /grid-cols-\[1fr_auto_1fr\]/);
    // No centered text Back control in CTA wrap.
    assert.doesNotMatch(
      signUpSrc,
      /PRELOGIN_LINK_CLASS[\s\S]{0,120}>\s*Back\s*</,
    );
    assert.doesNotMatch(
      signUpSrc,
      /button-signup-back[\s\S]{0,200}>\s*Back\s*</,
    );
  });

  it("Step 1 and Step 2 share the same logo header row geometry", () => {
    assert.match(signUpSrc, /dubhub-prelogin-signup-logo-gap mb-2 grid grid-cols-\[1fr_auto_1fr\]/);
    assert.match(signUpSrc, /PRELOGIN_AUTH_LOGO_CLASS/);
    assert.match(signUpSrc, /size="xl"/);
    // Absolute overlay back removed — logo row is shared structure.
    assert.doesNotMatch(signUpSrc, /absolute left-3 top-1/);
  });

  it("Step 2 privacy note is behind glass ? info popover, not always visible", () => {
    assert.match(signUpSrc, /signup-about-you-info/);
    assert.match(signUpSrc, /signup-about-you-privacy-popover/);
    assert.match(signUpSrc, /signup-about-you-privacy-note/);
    assert.match(signUpSrc, /PRELOGIN_MINI_SURFACE_CLASS/);
    assert.match(signUpSrc, /SIGNUP_ABOUT_YOU_PRIVACY_NOTE/);
    assert.match(
      signUpSrc,
      /We use these details to confirm your age and understand our community/,
    );
    assert.match(signUpSrc, /A couple of details to finish setting up your account/);
    assert.match(signUpSrc, /aria-label="More info about About you"/);
    // Icon is inline with subtitle sentence (not a detached flex side column).
    assert.match(signUpSrc, /inline-flex h-5 w-5[\s\S]*?align-middle/);
    assert.doesNotMatch(
      signUpSrc,
      /flex items-center justify-center gap-1\.5[\s\S]{0,80}signup-about-you-info/,
    );
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

  it("Step 2 shows legal acknowledgement with external Terms/Privacy links", () => {
    assert.match(signUpSrc, /signup-legal-acknowledgement/);
    assert.match(
      signUpSrc,
      /By creating an account, you agree to our/,
    );
    assert.match(signUpSrc, /DUBHUB_SIGNUP_TERMS_URL/);
    assert.match(signUpSrc, /DUBHUB_SIGNUP_PRIVACY_URL/);
    assert.match(signUpSrc, /target="_blank"/);
    assert.match(signUpSrc, /rel="noopener noreferrer"/);
    assert.match(signUpSrc, /text-\[11px\]/);
    assert.doesNotMatch(signUpSrc, /signup-legal-terms[\s\S]{0,120}underline/);
    assert.doesNotMatch(signUpSrc, /signup-legal-privacy[\s\S]{0,120}underline/);
    // Legal block is Step 2 only and sits after the Sign In row.
    const signInIdx = signUpSrc.indexOf("Already have an account?");
    const legalIdx = signUpSrc.indexOf("signup-legal-acknowledgement");
    assert.ok(signInIdx >= 0 && legalIdx > signInIdx);
  });
});
