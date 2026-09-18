/**
 * SignUp internal step helpers — Step 1 account details → Step 2 About you.
 * Local React state only; no browser history.
 */

export type SignupStep = 1 | 2;

export function canAdvanceSignupStep1(input: {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  accountType: string;
  usernameReady: boolean;
  passwordCanSubmit: boolean;
  passwordsMatch: boolean;
}): boolean {
  return (
    !!input.email.trim() &&
    !!input.username.trim() &&
    !!input.password &&
    !!input.confirmPassword &&
    (input.accountType === "user" || input.accountType === "artist") &&
    input.usernameReady &&
    input.passwordCanSubmit &&
    input.passwordsMatch
  );
}

export function canSubmitSignupStep2(input: {
  dateOfBirth: string;
  countryCode: string | null;
  gender: string;
}): boolean {
  return (
    !!input.dateOfBirth.trim() &&
    !!input.countryCode &&
    !!input.gender
  );
}
