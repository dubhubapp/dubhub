import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTIST_DM_CTA_LABEL,
  ARTIST_VERIFICATION_PENDING_ALREADY_MESSAGED,
  ARTIST_VERIFICATION_PENDING_HEADING,
  ARTIST_VERIFICATION_PENDING_INSTRUCTION,
  DUBHUB_INSTAGRAM_URL,
} from "./artist-verification-ux";

const here = dirname(fileURLToPath(import.meta.url));
const signUpSrc = readFileSync(join(here, "../components/auth/SignUp.tsx"), "utf8");
const signInSrc = readFileSync(join(here, "../components/auth/SignIn.tsx"), "utf8");

describe("artist verification UX copy helpers", () => {
  it("uses send-us instruction without inline username", () => {
    assert.equal(
      ARTIST_VERIFICATION_PENDING_INSTRUCTION,
      "DM @dubhub.uk from your official artist Instagram account and send us your dub hub username:",
    );
    assert.doesNotMatch(ARTIST_VERIFICATION_PENDING_INSTRUCTION, /include your dub hub username/);
  });

  it("uses exact already-messaged copy", () => {
    assert.equal(
      ARTIST_VERIFICATION_PENDING_ALREADY_MESSAGED,
      "Already messaged us? We\u2019ll reply to your DM once we\u2019ve verified your account.",
    );
    assert.equal(ARTIST_VERIFICATION_PENDING_HEADING, "Artist verification pending");
    assert.equal(ARTIST_DM_CTA_LABEL, "DM us on Instagram");
    assert.equal(DUBHUB_INSTAGRAM_URL, "https://www.instagram.com/dubhub.uk/");
  });
});

describe("SignUp post-signup verification presentation", () => {
  it("does not fire a success toast when verification Dialog opens", () => {
    assert.doesNotMatch(signUpSrc, /useToast|toast\(/);
    assert.match(signUpSrc, /openVerificationModal\(\)/);
    assert.match(
      signUpSrc,
      /Dedicated verification Dialog is the account-created confirmation \(no duplicate toast\)/,
    );
  });

  it("uses Account Created heading for Artist and Community", () => {
    assert.match(signUpSrc, /DialogTitle[^>]*>Account Created<\/DialogTitle>/);
    assert.doesNotMatch(signUpSrc, /Account created/);
  });

  it("Artist success shows email + artist steps and @username from in-memory signup state", () => {
    const artistBlock = signUpSrc.slice(
      signUpSrc.indexOf("post-signup-artist-next-steps"),
      signUpSrc.indexOf("post-signup-community-next-steps"),
    );
    assert.match(artistBlock, /Verify your email/);
    assert.match(artistBlock, /Verify your artist profile/);
    assert.match(artistBlock, /send us your dub\s+hub username:/);
    assert.doesNotMatch(artistBlock, /include your dub hub username/);
    assert.match(signUpSrc, /formatUsernameDisplay\(username\)/);
    assert.match(artistBlock, /post-signup-artist-username/);
    assert.match(artistBlock, /ARTIST_DM_CTA_LABEL|DM us on Instagram/);
    assert.match(
      artistBlock,
      /Once you&apos;ve verified your email and we&apos;ve verified your artist profile/,
    );
    assert.doesNotMatch(artistBlock, /once you.ve completed both steps/i);
    assert.doesNotMatch(artistBlock, /Already messaged us/);
    // Old Artist warning panel (not the password-strength yellow meter).
    assert.doesNotMatch(signUpSrc, /bg-yellow-50\b|text-yellow-800\b/);
    assert.doesNotMatch(signUpSrc, /We.ll review your verification manually/);
  });

  it("Artist step numbers use primary text colour, not accent", () => {
    const artistBlock = signUpSrc.slice(
      signUpSrc.indexOf("post-signup-artist-next-steps"),
      signUpSrc.indexOf("post-signup-community-next-steps"),
    );
    assert.match(artistBlock, /text-foreground">1\.<\/span>/);
    assert.match(artistBlock, /text-foreground">2\.<\/span>/);
    assert.doesNotMatch(artistBlock, /text-accent">1\./);
    assert.doesNotMatch(artistBlock, /text-accent">2\./);
  });

  it("Artist Go to Sign In is secondary smaller semibold action", () => {
    const goToSignInBtn = signUpSrc.slice(
      signUpSrc.indexOf('data-testid="button-post-signup-artist-sign-in"') - 280,
      signUpSrc.indexOf('data-testid="button-post-signup-artist-sign-in"') + 80,
    );
    assert.match(goToSignInBtn, /variant="ghost"/);
    assert.match(goToSignInBtn, /text-sm/);
    assert.match(goToSignInBtn, /font-semibold/);
  });

  it("Community success keeps email-verification path without Artist DM steps", () => {
    const communityBlock = signUpSrc.slice(signUpSrc.indexOf("post-signup-community-next-steps"));
    assert.match(communityBlock, /Verify your email/);
    assert.match(communityBlock, /button-post-signup-sign-in/);
    assert.match(communityBlock, />\s*Sign In\s*</);
    assert.match(communityBlock, /post-signup-community-email/);
    assert.doesNotMatch(communityBlock, /Verify your artist profile/);
    assert.doesNotMatch(communityBlock, /Instagram/);
    assert.doesNotMatch(communityBlock, /DM us/);
    assert.doesNotMatch(communityBlock, /What&apos;s next/);
    assert.doesNotMatch(communityBlock, />1\.</);
  });

  it("Instagram CTA label and destination; DM does not auto-navigate to Sign In", () => {
    assert.match(signUpSrc, /ARTIST_DM_CTA_LABEL/);
    assert.match(signUpSrc, /openDubhubInstagram/);
    assert.match(signUpSrc, /button-post-signup-artist-sign-in/);
    assert.match(signUpSrc, /Go to Sign In/);
    const dmHandler = signUpSrc.slice(
      signUpSrc.indexOf("handleArtistDmClick"),
      signUpSrc.indexOf("handleVerificationModalOpenChange"),
    );
    assert.match(dmHandler, /openDubhubInstagram\(\)/);
    assert.doesNotMatch(dmHandler, /goToSignIn/);
    assert.doesNotMatch(signUpSrc, /DM us here!/);
  });

  it("does not write verified_artist from signup UI", () => {
    assert.doesNotMatch(signUpSrc, /verified_artist\s*:/);
    assert.match(signUpSrc, /account_type: accountType/);
  });
});

describe("SignIn pending Artist verification presentation", () => {
  it("keeps unverified artist gate then signs out", () => {
    assert.match(
      signInSrc,
      /profileData\.account_type === 'artist' && !profileData\.verified_artist/,
    );
    assert.match(signInSrc, /await supabase\.auth\.signOut\(\)/);
  });

  it("uses informational pending panel instead of destructive error chrome", () => {
    assert.match(signInSrc, /signin-artist-verification-pending/);
    assert.match(signInSrc, /role="status"/);
    assert.match(signInSrc, /PRELOGIN_INFO_PANEL_CLASS/);
    assert.doesNotMatch(signInSrc, /border-accent\/35 bg-accent\/10/);
    assert.match(signInSrc, /signin-error-panel/);
    assert.match(signInSrc, /showAuthError/);
    assert.match(signInSrc, /border-red-500\/40 bg-red-500\/10/);
  });

  it("uses profile username already fetched before signOut (no extra request)", () => {
    assert.match(signInSrc, /formatUsernameDisplay\(profileData\.username\)/);
    assert.match(signInSrc, /setPendingArtistUsername/);
    assert.doesNotMatch(signInSrc, /\.from\('profiles'\).*setPendingArtistUsername/);
    // Single profiles select in handleSignIn path
    const selects = signInSrc.match(/\.from\('profiles'\)/g) ?? [];
    assert.equal(selects.length, 1);
  });

  it("pending copy matches approved strings and Instagram CTA", () => {
    assert.match(signInSrc, /ARTIST_VERIFICATION_PENDING_HEADING/);
    assert.match(signInSrc, /ARTIST_VERIFICATION_PENDING_INSTRUCTION/);
    assert.match(signInSrc, /ARTIST_VERIFICATION_PENDING_ALREADY_MESSAGED/);
    assert.match(signInSrc, /ARTIST_DM_CTA_LABEL/);
    assert.doesNotMatch(signInSrc, /Your artist account is awaiting verification/);
    assert.doesNotMatch(signInSrc, /You.re all set/);
  });

  it("renders dynamic username on its own primary semibold line", () => {
    assert.match(signInSrc, /text-artist-pending-username/);
    assert.match(signInSrc, /\{pendingArtistUsername\}/);
    assert.match(signInSrc, /ARTIST_VERIFICATION_PENDING_INSTRUCTION/);
    assert.doesNotMatch(signInSrc, /include your dub hub username/);
    const usernameLine = signInSrc.slice(
      signInSrc.indexOf("text-artist-pending-username") - 160,
      signInSrc.indexOf("text-artist-pending-username") + 40,
    );
    assert.match(usernameLine, /font-semibold/);
    assert.match(usernameLine, /text-foreground/);
    assert.match(signInSrc, /ARTIST_VERIFICATION_PENDING_ALREADY_MESSAGED/);
    assert.match(signInSrc, /button-signin-artist-dm-instagram/);
  });

  it("does not alter email-not-verified or auth-error presentation in this slice", () => {
    assert.match(signInSrc, /signin-email-verification-pending/);
    assert.match(signInSrc, /showAuthError/);
    assert.match(signInSrc, /signin-error-panel/);
    assert.match(signInSrc, /Email not confirmed/);
  });
});
