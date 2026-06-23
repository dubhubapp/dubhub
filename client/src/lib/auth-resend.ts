import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getAuthCallbackUrl } from "@/lib/auth-callback-url";
import {
  AUTH_EMAIL_RATE_LIMIT_MESSAGE,
  isAuthEmailRateLimitError,
} from "@/lib/auth-errors";

export const PENDING_VERIFICATION_EMAIL_KEY = "dubhub:pending-verification-email";

export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 45;

export const VERIFICATION_RESEND_COOLDOWN_MESSAGE =
  "Please wait a moment before requesting another verification email.";

export const VERIFICATION_RESEND_SUCCESS_MESSAGE =
  "Verification email sent. Please check your inbox and spam/junk folder. Use the newest email you receive.";

export const VERIFICATION_RESEND_INTRO_KNOWN =
  "Your email verification link has expired. Send yourself a new verification email and use the newest link.";

export const VERIFICATION_RESEND_INTRO_UNKNOWN =
  "Enter your email address and we'll send you a new verification email if your account still needs verification.";

export const EMAIL_NOT_CONFIRMED_MESSAGE =
  "Please check your email and confirm your account. If it doesn't arrive within a couple of minutes, check your spam or junk folder.";

export function getPendingVerificationEmail(): string {
  try {
    return localStorage.getItem(PENDING_VERIFICATION_EMAIL_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setPendingVerificationEmail(email: string): void {
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, trimmed);
  } catch {
    // Storage may be unavailable in constrained environments.
  }
}

export function clearPendingVerificationEmail(): void {
  try {
    localStorage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
  } catch {
    // Best effort only.
  }
}

export type ResendVerificationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Resend signup confirmation email. Uses neutral success for non-rate-limit outcomes
 * to avoid account enumeration (including already-confirmed addresses).
 */
export async function resendSignupVerificationEmail(
  email: string,
): Promise<ResendVerificationResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, message: "Please enter your email" };
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: trimmed,
    options: { emailRedirectTo: getAuthCallbackUrl() },
  });

  if (error && isAuthEmailRateLimitError(error)) {
    return { ok: false, message: AUTH_EMAIL_RATE_LIMIT_MESSAGE };
  }

  return { ok: true };
}

function useCooldownTimer(cooldownRemaining: number, tick: () => void) {
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = window.setTimeout(tick, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownRemaining, tick]);
}

export function useResendVerificationEmail(initialEmail = "") {
  const [email, setEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  const tickCooldown = useCallback(() => {
    setCooldownRemaining((prev) => Math.max(prev - 1, 0));
  }, []);

  useCooldownTimer(cooldownRemaining, tickCooldown);

  const isOnCooldown = cooldownRemaining > 0;

  const send = useCallback(async () => {
    if (isOnCooldown) {
      setErrorMessage(VERIFICATION_RESEND_COOLDOWN_MESSAGE);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    setSuccess(false);
    try {
      const result = await resendSignupVerificationEmail(email);
      setCooldownRemaining(VERIFICATION_RESEND_COOLDOWN_SECONDS);
      if (result.ok) {
        setSuccess(true);
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setCooldownRemaining(VERIFICATION_RESEND_COOLDOWN_SECONDS);
      setErrorMessage("Could not send verification email. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [email, isOnCooldown]);

  const reset = useCallback(() => {
    setErrorMessage("");
    setSuccess(false);
  }, []);

  return {
    email,
    setEmail,
    send,
    isLoading,
    errorMessage,
    success,
    cooldownRemaining,
    isOnCooldown,
    reset,
  };
}
