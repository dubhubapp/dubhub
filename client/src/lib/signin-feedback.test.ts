import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMAIL_NOT_CONFIRMED_BODY,
  EMAIL_NOT_CONFIRMED_HEADING,
  EMAIL_NOT_CONFIRMED_SPAM_HINT,
  resolveSignInFeedbackKind,
} from "./signin-feedback";

const here = dirname(fileURLToPath(import.meta.url));
const signInSrc = readFileSync(join(here, "../components/auth/SignIn.tsx"), "utf8");

describe("resolveSignInFeedbackKind", () => {
  it("maps email-not-confirmed to email_pending, not auth_error", () => {
    assert.equal(
      resolveSignInFeedbackKind({
        emailNotConfirmed: true,
        pendingArtistUsername: null,
        errorMessage: "",
      }),
      "email_pending",
    );
    // Even if a stale error string were present, email pending wins over auth_error.
    assert.equal(
      resolveSignInFeedbackKind({
        emailNotConfirmed: true,
        pendingArtistUsername: null,
        errorMessage: "Incorrect email or password",
      }),
      "email_pending",
    );
  });

  it("maps invalid credentials to auth_error", () => {
    assert.equal(
      resolveSignInFeedbackKind({
        emailNotConfirmed: false,
        pendingArtistUsername: null,
        errorMessage: "Incorrect email or password",
      }),
      "auth_error",
    );
  });

  it("keeps Artist verification pending separate and preferred if both flags set", () => {
    assert.equal(
      resolveSignInFeedbackKind({
        emailNotConfirmed: false,
        pendingArtistUsername: "@artist",
        errorMessage: "",
      }),
      "artist_pending",
    );
    assert.equal(
      resolveSignInFeedbackKind({
        emailNotConfirmed: true,
        pendingArtistUsername: "@artist",
        errorMessage: "stale",
      }),
      "artist_pending",
    );
  });

  it("returns none when feedback is cleared", () => {
    assert.equal(
      resolveSignInFeedbackKind({
        emailNotConfirmed: false,
        pendingArtistUsername: null,
        errorMessage: "",
      }),
      "none",
    );
    assert.equal(
      resolveSignInFeedbackKind({
        emailNotConfirmed: false,
        pendingArtistUsername: null,
        errorMessage: "   ",
      }),
      "none",
    );
  });
});

describe("SignIn email-not-verified presentation wiring", () => {
  it("maps Email not confirmed to emailNotConfirmed without setting errorMessage", () => {
    const emailBranch = signInSrc.slice(
      signInSrc.indexOf("Email not confirmed"),
      signInSrc.indexOf("Too many requests"),
    );
    assert.match(emailBranch, /setEmailNotConfirmed\(true\)/);
    assert.doesNotMatch(emailBranch, /setErrorMessage/);
  });

  it("renders informational email panel, not destructive signin-error-panel", () => {
    assert.match(signInSrc, /signin-email-verification-pending/);
    assert.match(signInSrc, /EMAIL_NOT_CONFIRMED_HEADING/);
    assert.match(signInSrc, /showEmailVerificationPending/);
    assert.match(signInSrc, /showAuthError/);
    // Destructive panel only when showAuthError
    const errorPanelBlock = signInSrc.slice(
      signInSrc.indexOf("showAuthError"),
      signInSrc.indexOf("signin-email-verification-pending"),
    );
    assert.match(errorPanelBlock, /signin-error-panel/);
    assert.match(errorPanelBlock, /role="alert"/);
    assert.match(signInSrc, /data-testid="signin-email-verification-pending"/);
    assert.match(
      signInSrc.slice(signInSrc.indexOf("signin-email-verification-pending")),
      /role="status"/,
    );
  });

  it("keeps existing resend action inside the email-pending state", () => {
    const emailPanel = signInSrc.slice(
      signInSrc.indexOf("signin-email-verification-pending"),
      signInSrc.indexOf("signin-artist-verification-pending"),
    );
    assert.match(emailPanel, /button-resend-verification-sign-in/);
    assert.match(emailPanel, /sendVerificationEmail/);
    assert.match(emailPanel, /VERIFICATION_RESEND_SUCCESS_MESSAGE/);
    assert.match(emailPanel, /text-resend-verification-error-sign-in/);
  });

  it("uses approved email-pending copy and no Artist copy in that panel", () => {
    assert.equal(EMAIL_NOT_CONFIRMED_HEADING, "Verify your email");
    assert.equal(
      EMAIL_NOT_CONFIRMED_BODY,
      "Please check your email and verify your account before signing in.",
    );
    assert.equal(
      EMAIL_NOT_CONFIRMED_SPAM_HINT,
      "If it doesn't arrive within a couple of minutes, check your spam or junk folder.",
    );
    const emailPanel = signInSrc.slice(
      signInSrc.indexOf("signin-email-verification-pending"),
      signInSrc.indexOf("signin-artist-verification-pending"),
    );
    assert.doesNotMatch(emailPanel, /Artist verification pending/);
    assert.doesNotMatch(emailPanel, /DM @dubhub\.uk/);
    assert.doesNotMatch(emailPanel, /Instagram/);
    assert.match(emailPanel, /Mail/);
  });

  it("clears pending/error feedback before each Sign In attempt", () => {
    assert.match(signInSrc, /clearFeedback\(\)/);
    const clearFeedback = signInSrc.slice(
      signInSrc.indexOf("const clearFeedback"),
      signInSrc.indexOf("const handleSignIn"),
    );
    assert.match(clearFeedback, /setErrorMessage\(''\)/);
    assert.match(clearFeedback, /setPendingArtistUsername\(null\)/);
    assert.match(clearFeedback, /setEmailNotConfirmed\(false\)/);
    assert.match(clearFeedback, /resetResendState\(\)/);
  });

  it("clears email-pending and resend UI state when email changes", () => {
    assert.match(signInSrc, /setEmailNotConfirmed\(false\)/);
    assert.match(signInSrc, /\[email, resetResendState\]/);
  });

  it("keeps Artist pending gate and panel separate from email pending", () => {
    assert.match(
      signInSrc,
      /profileData\.account_type === 'artist' && !profileData\.verified_artist/,
    );
    assert.match(signInSrc, /signin-artist-verification-pending/);
    assert.match(signInSrc, /resolveSignInFeedbackKind/);
  });

  it("preserves invalid-credentials destructive presentation", () => {
    assert.match(signInSrc, /Incorrect email or password/);
    assert.match(signInSrc, /Invalid login credentials/);
    assert.match(signInSrc, /border-red-500\/40 bg-red-500\/10/);
  });
});
