/**
 * Signup username availability UI helpers.
 * Does not change auth, reserved-name ownership, or password behaviour.
 */

import { LEGACY_DECEASED_UNAVAILABLE_MESSAGE } from "@shared/usernameAvailability";

export type SignupUsernameStatus = "idle" | "checking" | "available" | "unavailable";

/** Informational reason accompanying a confirmed-available username (optional). */
export type SignupUsernameAvailabilityReason = "artist_reserved" | null;

export const SIGNUP_USERNAME_AVAILABLE_MESSAGE = "Username available";

/** Community rejection when claiming an artist-reserved username. */
export const SIGNUP_RESERVED_ARTIST_USERNAME_MESSAGE =
  "Don't be silly, you're not that famous";

/**
 * Artist acknowledgement when an otherwise-available username is in reserved_artist_usernames.
 * Curly apostrophe matches project encoding (e.g. onboarding copy).
 */
export const SIGNUP_ARTIST_RESERVED_AVAILABLE_MESSAGE =
  "We\u2019ve reserved this username just for you.";

export const SIGNUP_USERNAME_TAKEN_MESSAGE =
  "Username already taken, please choose another.";

export type SignupAccountType = "user" | "artist";

export const SIGNUP_SUBTITLE_COMMUNITY =
  "Create your account and discover your next favourite track";

export const SIGNUP_SUBTITLE_ARTIST =
  "Create your artist profile and connect your music to the people looking for it";

/** Subtitle under "Join dub hub" — derived from Account Type only. */
export function signupSubtitleForAccountType(accountType: string): string {
  if (accountType === "artist") {
    return SIGNUP_SUBTITLE_ARTIST;
  }
  return SIGNUP_SUBTITLE_COMMUNITY;
}

export function isSignupAccountType(value: string): value is SignupAccountType {
  return value === "user" || value === "artist";
}

/** Create Account username gate: only positively confirmed availability enables this axis. */
export function isUsernameReadyForCreateAccount(status: SignupUsernameStatus): boolean {
  return status === "available";
}

/** Ignore stale availability responses when a newer username/accountType check superseded them. */
export function shouldAcceptAvailabilityResponse(
  responseRequestId: number,
  latestRequestId: number,
): boolean {
  return responseRequestId === latestRequestId;
}

/**
 * Map availability failure reasons to the pre-existing signup field copy.
 * Artist + artist_reserved is available (not an error) — handled separately.
 */
export function mapAvailabilityFailureToUsernameError(
  reason: string | undefined,
  accountType: string,
): string {
  if (reason === "legacy_deceased") {
    return LEGACY_DECEASED_UNAVAILABLE_MESSAGE;
  }
  if (reason === "artist_reserved" && accountType === "user") {
    return SIGNUP_RESERVED_ARTIST_USERNAME_MESSAGE;
  }
  return SIGNUP_USERNAME_TAKEN_MESSAGE;
}

/**
 * Green field copy for a confirmed-available username.
 * Artist + artist_reserved → positive acknowledgement; otherwise ordinary available.
 */
export function mapAvailableUsernameFeedback(
  reason: string | undefined | null,
  accountType: string,
): string {
  if (reason === "artist_reserved" && accountType === "artist") {
    return SIGNUP_ARTIST_RESERVED_AVAILABLE_MESSAGE;
  }
  return SIGNUP_USERNAME_AVAILABLE_MESSAGE;
}
