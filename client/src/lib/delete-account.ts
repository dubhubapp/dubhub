/**
 * Client helpers for POST /api/me/delete-account (no PII logging).
 *
 * Post-delete success uses a durable module phase (not toast / useEffect races).
 */

export type DeleteAccountApiCode =
  | "deleted"
  | "already_deleted"
  | "deleted_job_finalize_failed"
  | "feature_disabled"
  | "wrong_password"
  | "password_required"
  | "invalid_request"
  | "not_authenticated"
  | "email_password_required"
  | "reauth_unavailable"
  | "internal_cleanup_failed"
  | "auth_delete_failed"
  | "admin_unavailable"
  | "network_error"
  | "unknown";

export type DeleteAccountClientOutcome =
  | { kind: "success"; authDeleted: true }
  | { kind: "error"; code: DeleteAccountApiCode; message: string };

const USER_MESSAGES: Record<DeleteAccountApiCode, string> = {
  deleted: "Your account has been deleted.",
  already_deleted: "Your account has been deleted.",
  deleted_job_finalize_failed: "Your account has been deleted.",
  feature_disabled: "Account deletion is not available in this build.",
  wrong_password: "That password is incorrect.",
  password_required: "Enter your current password to continue.",
  invalid_request: "We couldn't finish deleting your account. Please try again.",
  not_authenticated: "Please sign in again and retry.",
  email_password_required:
    "Account deletion requires an email and password sign-in.",
  reauth_unavailable:
    "We couldn't verify your password right now. Please try again.",
  internal_cleanup_failed:
    "We couldn't finish deleting your account. Please try again.",
  auth_delete_failed:
    "We couldn't finish deleting your account. Please try again.",
  admin_unavailable:
    "We couldn't finish deleting your account. Please try again.",
  network_error:
    "Connection issue. Check your network and try again — your account may or may not have been deleted.",
  unknown: "We couldn't finish deleting your account. Please try again.",
};

export function userMessageForDeleteAccountCode(
  code: DeleteAccountApiCode,
): string {
  return USER_MESSAGES[code] ?? USER_MESSAGES.unknown;
}

/** Auth was deleted — local hard reset required even if bookkeeping failed. */
export function deleteAccountResponseMeansAuthGone(code: string | undefined): boolean {
  return (
    code === "deleted" ||
    code === "already_deleted" ||
    code === "deleted_job_finalize_failed"
  );
}

/**
 * Whether to enter the logged-out account-deleted success phase.
 * Requires confirmed Auth-gone responses only.
 */
export function shouldEnterAccountDeletedSuccessPhase(args: {
  code?: string;
  authDeleted?: boolean;
}): boolean {
  if (args.code === "deleted") return true;
  if (args.code === "already_deleted" && args.authDeleted === true) return true;
  if (args.code === "deleted_job_finalize_failed" && args.authDeleted === true) {
    return true;
  }
  return false;
}

/**
 * Durable post-delete success phase for UnauthenticatedEntry.
 * Survives hardReset sessionStorage.clear and remounts for this JS runtime.
 * Cleared only by Continue (clearAccountDeletedSuccessPhase).
 */
let accountDeletedSuccessPhaseActive = false;

export function markAccountDeletedSuccessPhase(): void {
  accountDeletedSuccessPhaseActive = true;
}

export function isAccountDeletedSuccessPhaseActive(): boolean {
  return accountDeletedSuccessPhaseActive;
}

export function clearAccountDeletedSuccessPhase(): void {
  accountDeletedSuccessPhaseActive = false;
}

/** Test-only reset. */
export function resetAccountDeletedSuccessPhaseForTests(): void {
  accountDeletedSuccessPhaseActive = false;
}

export const ACCOUNT_DELETED_SUCCESS_COPY = {
  title: "Account deleted",
  description:
    "Your dub hub account and associated data have been deleted.",
  continueLabel: "Continue",
} as const;

export function parseDeleteAccountErrorBody(
  status: number | undefined,
  responseBody: string | undefined,
): DeleteAccountClientOutcome {
  let code: DeleteAccountApiCode = "unknown";
  try {
    if (responseBody) {
      const parsed = JSON.parse(responseBody) as { code?: string };
      if (typeof parsed.code === "string") {
        code = parsed.code as DeleteAccountApiCode;
      }
    }
  } catch {
    // fall through
  }

  if (status === 403 && code === "unknown") {
    code = "feature_disabled";
  }
  if (!(code in USER_MESSAGES)) {
    code = "unknown";
  }

  return {
    kind: "error",
    code,
    message: userMessageForDeleteAccountCode(code),
  };
}

export type DeleteAccountDialogStep =
  | "explain"
  | "subscription"
  | "password";

export function nextDeleteAccountStep(args: {
  current: DeleteAccountDialogStep;
  showSubscriptionWarning: boolean;
}): DeleteAccountDialogStep | "done" {
  if (args.current === "explain") {
    return args.showSubscriptionWarning ? "subscription" : "password";
  }
  if (args.current === "subscription") {
    return "password";
  }
  return "done";
}
