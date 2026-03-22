export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; message: string };

/** Matches signup rules: min 8 chars, upper, lower, digit. */
export function validateSignupPassword(password: string): PasswordValidationResult {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must include an uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must include a lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must include a number" };
  }
  return { valid: true };
}

export function getPasswordResetRedirectUrl(): string {
  if (typeof window === "undefined") return "/reset-password";
  return `${window.location.origin}/reset-password`;
}
