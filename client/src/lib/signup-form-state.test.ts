import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { LEGACY_DECEASED_UNAVAILABLE_MESSAGE } from "../../../shared/usernameAvailability";
import {
  SIGNUP_ARTIST_RESERVED_AVAILABLE_MESSAGE,
  SIGNUP_RESERVED_ARTIST_USERNAME_MESSAGE,
  SIGNUP_SUBTITLE_ARTIST,
  SIGNUP_SUBTITLE_COMMUNITY,
  SIGNUP_USERNAME_AVAILABLE_MESSAGE,
  SIGNUP_USERNAME_TAKEN_MESSAGE,
  isUsernameReadyForCreateAccount,
  mapAvailabilityFailureToUsernameError,
  mapAvailableUsernameFeedback,
  shouldAcceptAvailabilityResponse,
  signupSubtitleForAccountType,
} from "./signup-form-state";
import {
  applyScreen1Intent,
  applyScreen2Perspective,
  INITIAL_PRE_LOGIN_ONBOARDING_UI,
  resolveSignupAccountType,
} from "./pre-login-onboarding";
import { validateUsername } from "../../../shared/usernameValidation";

const here = dirname(fileURLToPath(import.meta.url));
const signUpSrc = readFileSync(join(here, "../components/auth/SignUp.tsx"), "utf8");
const signupFormStateSrc = readFileSync(join(here, "./signup-form-state.ts"), "utf8");
const usernameAvailabilitySrc = readFileSync(
  join(here, "../../../shared/usernameAvailability.ts"),
  "utf8",
);

describe("signup username availability copy mapping", () => {
  it("Community + reserved artist username → existing rejection copy", () => {
    assert.equal(
      mapAvailabilityFailureToUsernameError("artist_reserved", "user"),
      SIGNUP_RESERVED_ARTIST_USERNAME_MESSAGE,
    );
    assert.equal(
      SIGNUP_RESERVED_ARTIST_USERNAME_MESSAGE,
      "Don't be silly, you're not that famous",
    );
  });

  it("Artist + reserved artist username → positive acknowledgement (not taken)", () => {
    assert.equal(
      mapAvailableUsernameFeedback("artist_reserved", "artist"),
      SIGNUP_ARTIST_RESERVED_AVAILABLE_MESSAGE,
    );
    assert.equal(
      SIGNUP_ARTIST_RESERVED_AVAILABLE_MESSAGE,
      "We\u2019ve reserved this username just for you.",
    );
    assert.notEqual(
      mapAvailableUsernameFeedback("artist_reserved", "artist"),
      SIGNUP_USERNAME_AVAILABLE_MESSAGE,
    );
  });

  it("Artist reserved failure mapper is not used for available Artist reserved state", () => {
    // Failure mapper would fall through to taken if misused for artist+reserved;
    // available feedback must be used instead.
    assert.equal(
      mapAvailabilityFailureToUsernameError("artist_reserved", "artist"),
      SIGNUP_USERNAME_TAKEN_MESSAGE,
    );
  });

  it("ordinary available → Username available for Community and Artist", () => {
    assert.equal(mapAvailableUsernameFeedback(null, "user"), SIGNUP_USERNAME_AVAILABLE_MESSAGE);
    assert.equal(mapAvailableUsernameFeedback(undefined, "artist"), SIGNUP_USERNAME_AVAILABLE_MESSAGE);
    assert.equal(mapAvailableUsernameFeedback(null, "artist"), SIGNUP_USERNAME_AVAILABLE_MESSAGE);
  });

  it("deceased → existing special copy for Community and Artist", () => {
    assert.equal(
      mapAvailabilityFailureToUsernameError("legacy_deceased", "user"),
      LEGACY_DECEASED_UNAVAILABLE_MESSAGE,
    );
    assert.equal(
      mapAvailabilityFailureToUsernameError("legacy_deceased", "artist"),
      LEGACY_DECEASED_UNAVAILABLE_MESSAGE,
    );
  });

  it("taken/hard reserved → taken copy (never positive reserved)", () => {
    assert.equal(
      mapAvailabilityFailureToUsernameError("taken", "user"),
      SIGNUP_USERNAME_TAKEN_MESSAGE,
    );
    assert.equal(
      mapAvailabilityFailureToUsernameError("taken", "artist"),
      SIGNUP_USERNAME_TAKEN_MESSAGE,
    );
    assert.equal(
      mapAvailabilityFailureToUsernameError("hard_reserved", "artist"),
      SIGNUP_USERNAME_TAKEN_MESSAGE,
    );
    assert.notEqual(
      mapAvailabilityFailureToUsernameError("taken", "artist"),
      SIGNUP_ARTIST_RESERVED_AVAILABLE_MESSAGE,
    );
  });
});

describe("usernameAvailability helper Artist reserved informational reason", () => {
  it("runs reserved RPC for both account types and branches availability", () => {
    assert.match(usernameAvailabilitySrc, /is_artist_username_reserved/);
    assert.match(usernameAvailabilitySrc, /Artist-reserved names: Community blocked/);
    assert.match(
      usernameAvailabilitySrc,
      /available: true,\s*\n\s*reason: 'artist_reserved'/,
    );
    assert.match(
      usernameAvailabilitySrc,
      /available: false,[\s\S]*reason: 'artist_reserved'/,
    );
    // Must not skip reserved lookup solely for artists
    assert.doesNotMatch(
      usernameAvailabilitySrc,
      /Check artist-reserved names \(only if account_type = 'user'\)/,
    );
  });
});

describe("signup-form-state username CTA gate", () => {
  it("unresolved statuses cannot enable Create Account username axis", () => {
    assert.equal(isUsernameReadyForCreateAccount("idle"), false);
    assert.equal(isUsernameReadyForCreateAccount("checking"), false);
    assert.equal(isUsernameReadyForCreateAccount("unavailable"), false);
  });

  it("confirmed available (including Artist reserved) enables username CTA axis", () => {
    assert.equal(isUsernameReadyForCreateAccount("available"), true);
  });
});

describe("signup-form-state stale availability / account-type switch", () => {
  it("late username A cannot overwrite username B", () => {
    let latest = 0;
    const requestA = ++latest;
    const requestB = ++latest;
    assert.equal(shouldAcceptAvailabilityResponse(requestA, latest), false);
    assert.equal(shouldAcceptAvailabilityResponse(requestB, latest), true);
  });

  it("Community → Artist and Artist → Community invalidate prior responses", () => {
    let latest = 0;
    const communityRequest = ++latest;
    const artistRequest = ++latest;
    assert.equal(shouldAcceptAvailabilityResponse(communityRequest, latest), false);
    assert.equal(shouldAcceptAvailabilityResponse(artistRequest, latest), true);
    const communityAgain = ++latest;
    assert.equal(shouldAcceptAvailabilityResponse(artistRequest, latest), false);
    assert.equal(shouldAcceptAvailabilityResponse(communityAgain, latest), true);
  });
});

describe("SignUp.tsx username reserved presentation wiring", () => {
  it("does not render Checking username copy", () => {
    assert.doesNotMatch(signUpSrc, /Checking username/);
    assert.doesNotMatch(signUpSrc, /text-username-checking/);
  });

  it("wires Artist reserved available feedback separately from ordinary available", () => {
    assert.match(signUpSrc, /mapAvailableUsernameFeedback/);
    assert.match(signUpSrc, /usernameAvailabilityReason/);
    assert.match(signUpSrc, /text-username-artist-reserved/);
    assert.match(signUpSrc, /text-username-available/);
    assert.match(signupFormStateSrc, /We\\u2019ve reserved this username just for you\./);
  });

  it("clears availability reason when invalidating / checking", () => {
    assert.match(signUpSrc, /setUsernameAvailabilityReason\(null\)/);
    assert.match(
      signUpSrc,
      /result\.reason === 'artist_reserved' \? 'artist_reserved' : null/,
    );
  });

  it("gates Create Account while availability is unresolved; available satisfies CTA", () => {
    assert.match(signUpSrc, /!isUsernameReadyForCreateAccount\(usernameStatus\)/);
  });

  it("keeps submit-time username re-check and race-safe request ids", () => {
    assert.match(signUpSrc, /usernameRequestIdRef/);
    assert.match(signUpSrc, /shouldAcceptAvailabilityResponse/);
    assert.match(
      signUpSrc,
      /checkUsernameAvailability\(supabase, trimmedUsername, accountType as 'user' \| 'artist'\)/,
    );
  });

  it("does not set verified_artist or alter account_type contract", () => {
    assert.doesNotMatch(signUpSrc, /verified_artist\s*:/);
    assert.match(signUpSrc, /account_type: accountType/);
    assert.match(signUpSrc, /SelectItem value="user"/);
    assert.match(signUpSrc, /SelectItem value="artist"/);
  });

  it("keeps Account Type / Community Member capitalization", () => {
    assert.match(signUpSrc, /Account Type/);
    assert.match(signUpSrc, /Community Member/);
  });

  it("locally invalid usernames remain invalid", () => {
    assert.equal(validateUsername("ab").valid, false);
    assert.equal(validateUsername("valid_name").valid, true);
  });
});

describe("SignUp.tsx account-type + autofill regression", () => {
  it("keeps Select editable and onboarding preselection", () => {
    assert.match(signUpSrc, /onValueChange=\{setAccountType\}/);
    assert.match(
      signUpSrc,
      /initialAccountType === "user" \|\| initialAccountType === "artist" \? initialAccountType : ""/,
    );
    const community = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    const artist = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    assert.equal(resolveSignupAccountType(community.intent), "user");
    assert.equal(resolveSignupAccountType(artist.intent), "artist");
  });

  it("Screen 2 browsing still does not alter signup intent", () => {
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, "artist");
    assert.equal(resolveSignupAccountType(state.intent), "user");
  });

  it("subtitle derives from accountType; values remain user/artist", () => {
    assert.equal(signupSubtitleForAccountType("user"), SIGNUP_SUBTITLE_COMMUNITY);
    assert.equal(signupSubtitleForAccountType("artist"), SIGNUP_SUBTITLE_ARTIST);
    assert.equal(signupSubtitleForAccountType(""), SIGNUP_SUBTITLE_COMMUNITY);
    assert.equal(
      SIGNUP_SUBTITLE_COMMUNITY,
      "Create your account and discover your next favourite track",
    );
    assert.equal(
      SIGNUP_SUBTITLE_ARTIST,
      "Create your artist profile and connect your music to the people looking for it",
    );
    assert.match(signUpSrc, /signupSubtitleForAccountType\(accountType\)/);
    assert.match(signUpSrc, /value="user"/);
    assert.match(signUpSrc, /value="artist"/);
    assert.match(signUpSrc, /onValueChange=\{setAccountType\}/);

    const community = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    const artist = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    assert.equal(
      signupSubtitleForAccountType(resolveSignupAccountType(community.intent) ?? ""),
      SIGNUP_SUBTITLE_COMMUNITY,
    );
    assert.equal(
      signupSubtitleForAccountType(resolveSignupAccountType(artist.intent) ?? ""),
      SIGNUP_SUBTITLE_ARTIST,
    );
  });

  it("keeps a11y association and autofill semantics", () => {
    assert.match(signUpSrc, /htmlFor="accountType"/);
    assert.match(signUpSrc, /id="accountType"/);
    assert.match(signUpSrc, /autoComplete="email"/);
    assert.match(signUpSrc, /autoComplete="username"/);
    const newPassword = signUpSrc.match(/autoComplete="new-password"/g) ?? [];
    assert.ok(newPassword.length >= 2);
  });

  it("password / email / modal regressions unchanged", () => {
    assert.match(signUpSrc, /function getPasswordStrength\(password: string\)/);
    assert.match(signUpSrc, /\/api\/auth\/check-email/);
    assert.match(signUpSrc, /Account Created/);
    assert.match(signUpSrc, /DM us on Instagram|ARTIST_DM_CTA_LABEL/);
    assert.match(signUpSrc, /Join dub hub/);
  });
});
