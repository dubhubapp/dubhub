/**
 * Auth premium material Slice A — Sign Up + Sign In isolation.
 * Does not assert auth mechanics.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRELOGIN_AUTH_CANVAS_CLASS,
  PRELOGIN_FIELD_CLASS,
  PRELOGIN_LINK_CLASS,
  PRELOGIN_PRIMARY_CTA_CLASS,
} from "./prelogin-material";

const here = dirname(fileURLToPath(import.meta.url));
const signUpSrc = readFileSync(join(here, "../components/auth/SignUp.tsx"), "utf8");
const authPageSrc = readFileSync(join(here, "../pages/auth.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const signInSrc = readFileSync(join(here, "../components/auth/SignIn.tsx"), "utf8");
const onboardingSrc = readFileSync(join(here, "../components/pre-login-onboarding.tsx"), "utf8");
const inputSrc = readFileSync(join(here, "../components/ui/input.tsx"), "utf8");
const buttonSrc = readFileSync(join(here, "../components/ui/button.tsx"), "utf8");
const selectSrc = readFileSync(join(here, "../components/ui/select.tsx"), "utf8");
const materialSrc = readFileSync(join(here, "./prelogin-material.ts"), "utf8");

describe("premium auth material Slice A isolation", () => {
  it("applies atmospheric canvas to AuthPage for both Sign Up and Sign In", () => {
    assert.equal(PRELOGIN_AUTH_CANVAS_CLASS, "dubhub-prelogin-auth");
    assert.match(authPageSrc, /PRELOGIN_AUTH_CANVAS_CLASS/);
    assert.match(authPageSrc, /data-prelogin-auth=/);
    assert.doesNotMatch(authPageSrc, /isSignUp \? "dubhub-signup-proving"/);
    assert.doesNotMatch(authPageSrc, /dubhub-signup-proving/);
  });

  it("shares glass field + ceramic CTA constants between Sign Up and Sign In", () => {
    assert.match(signUpSrc, /PRELOGIN_FIELD_CLASS/);
    assert.match(signInSrc, /PRELOGIN_FIELD_CLASS/);
    assert.match(signUpSrc, /PRELOGIN_PRIMARY_CTA_CLASS/);
    assert.match(signInSrc, /PRELOGIN_PRIMARY_CTA_CLASS/);
    assert.match(signUpSrc, /PRELOGIN_LINK_CLASS/);
    assert.match(signInSrc, /PRELOGIN_LINK_CLASS/);
    assert.match(materialSrc, /dubhub-prelogin-field/);
    assert.match(materialSrc, /text-\[#0a83ff\]/);
  });

  it("does not edit shared Input/Button/Select primitives", () => {
    assert.doesNotMatch(inputSrc, /dubhub-prelogin|dubhub-signup/);
    assert.doesNotMatch(buttonSrc, /dubhub-prelogin|dubhub-signup/);
    assert.doesNotMatch(selectSrc, /dubhub-prelogin|dubhub-signup/);
  });

  it("shares premium canvas + ceramic CTA with onboarding; fields stay auth-only", () => {
    assert.match(onboardingSrc, /PRELOGIN_CANVAS_CLASS|PRELOGIN_AUTH_CANVAS_CLASS/);
    assert.match(onboardingSrc, /PRELOGIN_PRIMARY_CTA_CLASS/);
    assert.match(onboardingSrc, /PRELOGIN_LINK_CLASS/);
    assert.doesNotMatch(onboardingSrc, /PRELOGIN_FIELD_CLASS/);
    assert.match(onboardingSrc, /dubhub-prelogin-auth|PRELOGIN_CANVAS_CLASS/);
  });

  it("scopes refined glass + ceramic CTA + autofill under prelogin-auth CSS", () => {
    assert.match(cssSrc, /\.dubhub-prelogin-auth\s*\{/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \.dubhub-prelogin-field/);
    assert.match(cssSrc, /rgba\(48,\s*58,\s*102,\s*0\.54\)/);
    assert.match(cssSrc, /-webkit-backdrop-filter:\s*blur\(20px\)\s*saturate\(1\.45\)/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \.dubhub-prelogin-primary-cta/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth input\.dubhub-prelogin-field:-webkit-autofill/);
    assert.match(cssSrc, /\.dubhub-prelogin-select-content/);
    assert.doesNotMatch(cssSrc, /\.dubhub-signup-proving/);
    const authSurfaceStart = cssSrc.indexOf(".dubhub-auth-surface {");
    const authSurfaceEnd = cssSrc.indexOf("}", authSurfaceStart);
    const authSurfaceBlock = cssSrc.slice(authSurfaceStart, authSurfaceEnd + 1);
    assert.doesNotMatch(authSurfaceBlock, /#0a83ff|#001df9/);
  });

  it("keeps white ceramic CTA (not blue fill) and success/error roles on Sign Up", () => {
    assert.equal(PRELOGIN_FIELD_CLASS.includes("dubhub-prelogin-field"), true);
    assert.equal(PRELOGIN_PRIMARY_CTA_CLASS.includes("dubhub-prelogin-primary-cta"), true);
    assert.equal(PRELOGIN_LINK_CLASS.includes("#0a83ff"), true);
    assert.doesNotMatch(PRELOGIN_PRIMARY_CTA_CLASS, /bg-\[#0a83ff\]/);
    assert.match(signUpSrc, /text-green-600/);
    assert.match(signUpSrc, /text-red-600|text-red-300/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \.dubhub-prelogin-primary-cta[\s\S]*?#f7f8fb/);
  });

  it("moves Sign In informational chrome off teal accent", () => {
    assert.match(signInSrc, /PRELOGIN_INFO_PANEL_CLASS/);
    assert.doesNotMatch(signInSrc, /border-accent\/35 bg-accent\/10/);
    assert.doesNotMatch(signInSrc, /text-accent/);
  });
});

describe("Auth Material A.1 device correction — geometry", () => {
  it("uses one stable Password feedback region (requirement XOR strength)", () => {
    assert.match(signUpSrc, /password-feedback-region/);
    assert.match(signUpSrc, /PRELOGIN_PASSWORD_FEEDBACK_REGION_CLASS/);
    assert.match(materialSrc, /min-h-\[2\.125rem\]/);
    assert.match(signUpSrc, /password-requirements/);
    assert.match(
      signUpSrc,
      /Must be at least 8 characters with uppercase, lowercase, and numbers/,
    );
    assert.match(signUpSrc, /password\.trim\(\)\.length > 0 \?/);
    assert.match(signUpSrc, /password-strength-indicator/);
    assert.match(signUpSrc, /Password looks strong/);
    assert.match(signUpSrc, /function getPasswordStrength\(password: string\)/);
    assert.doesNotMatch(signUpSrc, /password-strength-region/);
    // Empty shows requirements; non-empty swaps to strength in the same region (ternary).
    assert.match(
      signUpSrc,
      /password\.trim\(\)\.length > 0 \?[\s\S]*?password-strength-indicator[\s\S]*?:[\s\S]*?password-requirements/,
    );
  });

  it("reserves confirm validation slot; mismatch copy stays conditional", () => {
    assert.match(signUpSrc, /confirm-password-status/);
    assert.match(signUpSrc, /PRELOGIN_CONFIRM_STATUS_CLASS/);
    assert.match(materialSrc, /PRELOGIN_CONFIRM_STATUS_CLASS = "mt-1 min-h-\[1\.25rem\]"/);
    assert.match(signUpSrc, /confirmPasswordMismatch \?/);
    assert.match(signUpSrc, /text-confirm-password-error/);
    assert.match(signUpSrc, /Passwords do not match\. Please try again/);
  });

  it("uses shared feedback-to-next-field spacing for Username and Password", () => {
    assert.match(materialSrc, /PRELOGIN_FEEDBACK_TO_NEXT_FIELD_CLASS = "mb-3"/);
    assert.match(materialSrc, /PRELOGIN_FEEDBACK_GROUP_CLASS/);
    assert.match(materialSrc, /PRELOGIN_USERNAME_STATUS_CLASS/);
    assert.match(signUpSrc, /PRELOGIN_USERNAME_STATUS_CLASS/);
    assert.match(signUpSrc, /username-status/);
    assert.match(signUpSrc, /password-feedback-region/);
    assert.match(signUpSrc, /PRELOGIN_PASSWORD_FEEDBACK_REGION_CLASS/);
    assert.match(signUpSrc, /PRELOGIN_FEEDBACK_GROUP_CLASS/);
    assert.match(
      cssSrc,
      /\.dubhub-prelogin-signup-field-stack > \.dubhub-prelogin-feedback-group \+ :not\(\[hidden\]\)/,
    );
    assert.match(materialSrc, /PRELOGIN_SIGNUP_CTA_WRAP_CLASS = "mt-5"/);
    assert.doesNotMatch(signUpSrc, /usernameError \? "[^"]*mb-|usernameStatus === [^;]*mb-/);
  });

  it("tightens field rhythm and CTA separation without shrinking fields", () => {
    assert.match(signUpSrc, /id="username-status"/);
    assert.match(signUpSrc, /PRELOGIN_SIGNUP_FIELD_STACK_CLASS/);
    assert.match(materialSrc, /PRELOGIN_SIGNUP_FIELD_STACK_CLASS[\s\S]*?space-y-3/);
    assert.match(materialSrc, /PRELOGIN_SIGNUP_CTA_WRAP_CLASS = "mt-5"/);
    assert.match(signUpSrc, /PRELOGIN_SIGNUP_CTA_WRAP_CLASS[\s\S]*?button-create-account/);
    assert.match(signUpSrc, /h-\[2\.8125rem\]|PRELOGIN_FIELD_CLASS/);
    assert.doesNotMatch(signUpSrc, /space-y-3\.5/);
  });

  it("keeps Sign Up top-flow and Sign In centred without negative translate", () => {
    assert.match(authPageSrc, /PRELOGIN_AUTH_PAGE_CLASS/);
    assert.match(authPageSrc, /PRELOGIN_SIGNUP_COLUMN_CLASS/);
    assert.match(authPageSrc, /PRELOGIN_SIGNIN_COLUMN_CLASS/);
    assert.match(authPageSrc, /PRELOGIN_SIGNIN_CENTER_INNER_CLASS/);
    assert.match(materialSrc, /env\(safe-area-inset-top/);
    assert.match(materialSrc, /dubhub-prelogin-auth-page/);
    assert.match(materialSrc, /my-auto/);
    // Optical upward bias via bottom padding inside centred wrapper (not translate).
    assert.match(materialSrc, /PRELOGIN_SIGNIN_CENTER_INNER_CLASS[\s\S]*?pb-16/);
    assert.doesNotMatch(authPageSrc, /-translate-y-/);
    assert.doesNotMatch(materialSrc, /PRELOGIN_SIGNIN_CENTER_INNER_CLASS[\s\S]*?-translate/);
    assert.doesNotMatch(authPageSrc, /justify-center/);
  });

  it("scopes short-height responsive rules to auth only", () => {
    assert.match(cssSrc, /@media \(max-height:\s*700px\)/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth-page/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \.dubhub-prelogin-auth-logo/);
    assert.match(cssSrc, /height:\s*4\.75rem/);
    assert.match(cssSrc, /\.dubhub-prelogin-signup-field-stack/);
    assert.match(cssSrc, /\.dubhub-prelogin-signin-center-inner/);
    assert.match(signUpSrc, /PRELOGIN_AUTH_LOGO_CLASS/);
    assert.match(materialSrc, /!h-24/);
  });

  it("keeps premium glass + ceramic CTA material tokens unchanged", () => {
    assert.match(cssSrc, /rgba\(48,\s*58,\s*102,\s*0\.54\)/);
    assert.match(cssSrc, /-webkit-backdrop-filter:\s*blur\(20px\)\s*saturate\(1\.45\)/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \.dubhub-prelogin-primary-cta[\s\S]*?#f7f8fb/);
    assert.doesNotMatch(PRELOGIN_PRIMARY_CTA_CLASS, /bg-\[#0a83ff\]/);
  });

  it("does not change Sign In form spacing; onboarding reuses canvas/CTA not fields", () => {
    assert.match(signInSrc, /className="space-y-3\.5"/);
    assert.match(onboardingSrc, /PRELOGIN_PRIMARY_CTA_CLASS/);
    assert.doesNotMatch(onboardingSrc, /PRELOGIN_FIELD_CLASS/);
  });

  it("polishes Select items locally without editing ui/select", () => {
    assert.match(signUpSrc, /viewportClassName=\{PRELOGIN_SELECT_VIEWPORT_CLASS\}/);
    assert.match(materialSrc, /PRELOGIN_SELECT_VIEWPORT_CLASS = "p-1\.5"/);
    assert.match(materialSrc, /rounded-\[11px\]/);
    assert.match(materialSrc, /data-\[highlighted\]:bg-\[#0a83ff\]\/14/);
    assert.doesNotMatch(selectSrc, /dubhub-prelogin|0a83ff|rounded-\[11px\]/);
  });

  it("keeps Account Created Dialog premium auth shell", () => {
    assert.match(signUpSrc, /PRELOGIN_DIALOG_CONTENT_CLASS/);
    assert.match(signUpSrc, /PRELOGIN_DIALOG_OVERLAY_CLASS/);
    assert.match(signUpSrc, /overlayClassName=\{cn\(AUTH_SURFACE_CLASS/);
    assert.match(signUpSrc, /PRELOGIN_DIALOG_MAIL_ICON_CLASS/);
    assert.doesNotMatch(signUpSrc, /Mail className="w-12 h-12 text-accent"/);
    assert.match(signUpSrc, /button-post-signup-sign-in[\s\S]*?PRELOGIN_PRIMARY_CTA_CLASS|PRELOGIN_PRIMARY_CTA_CLASS[\s\S]*?button-post-signup-sign-in/);
    assert.match(signUpSrc, /button-artist-dm-instagram/);
    assert.match(cssSrc, /\.dubhub-prelogin-dialog-content/);
    assert.match(cssSrc, /\.dubhub-prelogin-dialog-overlay/);
    assert.match(signUpSrc, /Account Created/);
    assert.match(signUpSrc, /What&apos;s next\?/);
    assert.match(signUpSrc, /Go to Sign In/);
  });

  it("compresses Sign Up header decorative spacing", () => {
    assert.match(signUpSrc, /dubhub-prelogin-signup-header/);
    assert.match(signUpSrc, /dubhub-prelogin-signup-logo-gap mb-2/);
    assert.match(signUpSrc, /px-6 pb-2 pt-1/);
    assert.match(signUpSrc, /CardContent className="px-6 pb-3 pt-1"/);
  });
});
