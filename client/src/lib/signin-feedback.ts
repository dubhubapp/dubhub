/**
 * Sign In feedback presentation kind — presentation only.
 * Does not change auth / gate mechanics.
 */

export type SignInFeedbackKind = "none" | "auth_error" | "email_pending" | "artist_pending";

export const EMAIL_NOT_CONFIRMED_HEADING = "Verify your email";

export const EMAIL_NOT_CONFIRMED_BODY =
  "Please check your email and verify your account before signing in.";

export const EMAIL_NOT_CONFIRMED_SPAM_HINT =
  "If it doesn't arrive within a couple of minutes, check your spam or junk folder.";

/**
 * Resolves which Sign In feedback surface should render.
 * Artist pending and email pending never share the destructive auth-error panel.
 * Artist pending wins if both flags were somehow set (should not happen in product flow).
 */
export function resolveSignInFeedbackKind(args: {
  emailNotConfirmed: boolean;
  pendingArtistUsername: string | null;
  errorMessage: string;
}): SignInFeedbackKind {
  if (args.pendingArtistUsername !== null) {
    return "artist_pending";
  }
  if (args.emailNotConfirmed) {
    return "email_pending";
  }
  if (args.errorMessage.trim().length > 0) {
    return "auth_error";
  }
  return "none";
}
