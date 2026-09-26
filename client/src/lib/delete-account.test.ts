import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_DELETED_SUCCESS_COPY,
  clearAccountDeletedSuccessPhase,
  deleteAccountResponseMeansAuthGone,
  isAccountDeletedSuccessPhaseActive,
  markAccountDeletedSuccessPhase,
  nextDeleteAccountStep,
  parseDeleteAccountErrorBody,
  resetAccountDeletedSuccessPhaseForTests,
  shouldEnterAccountDeletedSuccessPhase,
  userMessageForDeleteAccountCode,
} from "./delete-account";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const manageAccountSrc = readFileSync(
  join(here, "../pages/settings-manage-account.tsx"),
  "utf8",
);
const dialogSrc = readFileSync(
  join(here, "../components/auth/DeleteAccountDialog.tsx"),
  "utf8",
);
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const authSrc = readFileSync(join(here, "../pages/auth.tsx"), "utf8");
const unauthSrc = readFileSync(
  join(here, "../components/pre-login-onboarding.tsx"),
  "utf8",
);
const deleteAccountLibSrc = readFileSync(join(here, "./delete-account.ts"), "utf8");

describe("delete-account client helpers", () => {
  beforeEach(() => {
    resetAccountDeletedSuccessPhaseForTests();
  });

  it("maps wrong password and feature disabled safely", () => {
    assert.equal(
      userMessageForDeleteAccountCode("wrong_password"),
      "That password is incorrect.",
    );
    assert.equal(
      userMessageForDeleteAccountCode("feature_disabled"),
      "Account deletion is not available in this build.",
    );
  });

  it("qualifies success phase for Auth-gone codes only", () => {
    assert.equal(shouldEnterAccountDeletedSuccessPhase({ code: "deleted" }), true);
    assert.equal(
      shouldEnterAccountDeletedSuccessPhase({
        code: "already_deleted",
        authDeleted: true,
      }),
      true,
    );
    assert.equal(
      shouldEnterAccountDeletedSuccessPhase({
        code: "deleted_job_finalize_failed",
        authDeleted: true,
      }),
      true,
    );
    assert.equal(
      shouldEnterAccountDeletedSuccessPhase({
        code: "already_deleted",
        authDeleted: false,
      }),
      false,
    );
    assert.equal(
      shouldEnterAccountDeletedSuccessPhase({ code: "wrong_password" }),
      false,
    );
    assert.equal(
      shouldEnterAccountDeletedSuccessPhase({ code: "auth_delete_failed" }),
      false,
    );
    assert.equal(
      shouldEnterAccountDeletedSuccessPhase({ code: "internal_cleanup_failed" }),
      false,
    );
    assert.equal(
      shouldEnterAccountDeletedSuccessPhase({ code: "feature_disabled" }),
      false,
    );
  });

  it("durable success phase survives hard-reset-like sessionStorage.clear", () => {
    markAccountDeletedSuccessPhase();
    assert.equal(isAccountDeletedSuccessPhaseActive(), true);
    // Simulate hardReset clearing sessionStorage — module phase must remain.
    try {
      sessionStorage.clear();
    } catch {
      // ignore in node
    }
    assert.equal(isAccountDeletedSuccessPhaseActive(), true);
    clearAccountDeletedSuccessPhase();
    assert.equal(isAccountDeletedSuccessPhaseActive(), false);
  });

  it("Continue clear is the only exit from success phase", () => {
    markAccountDeletedSuccessPhase();
    assert.equal(isAccountDeletedSuccessPhaseActive(), true);
    clearAccountDeletedSuccessPhase();
    assert.equal(isAccountDeletedSuccessPhaseActive(), false);
    assert.equal(isAccountDeletedSuccessPhaseActive(), false);
  });

  it("parses error bodies without exposing internals", () => {
    const parsed = parseDeleteAccountErrorBody(
      403,
      JSON.stringify({ ok: false, code: "wrong_password" }),
    );
    assert.equal(parsed.kind, "error");
    if (parsed.kind !== "error") return;
    assert.equal(parsed.code, "wrong_password");
  });

  it("skips subscription step when not applicable", () => {
    assert.equal(
      nextDeleteAccountStep({
        current: "explain",
        showSubscriptionWarning: false,
      }),
      "password",
    );
  });

  it("auth-gone codes still drive hard reset", () => {
    assert.equal(deleteAccountResponseMeansAuthGone("deleted"), true);
    assert.equal(deleteAccountResponseMeansAuthGone("already_deleted"), true);
    assert.equal(deleteAccountResponseMeansAuthGone("auth_delete_failed"), false);
  });
});

describe("Delete account success phase UX", () => {
  it("marks success phase before hard reset", () => {
    const mark = dialogSrc.indexOf("markAccountDeletedSuccessPhase()");
    const onDeleted = dialogSrc.indexOf("await onAccountDeleted");
    assert.ok(mark > 0 && onDeleted > mark);
    assert.match(dialogSrc, /shouldEnterAccountDeletedSuccessPhase/);
  });

  it("UnauthenticatedEntry owns account_deleted phase until Continue → Sign In", () => {
    assert.match(unauthSrc, /account_deleted/);
    assert.match(unauthSrc, /isAccountDeletedSuccessPhaseActive/);
    assert.match(unauthSrc, /data-testid="account-deleted-success"/);
    assert.match(unauthSrc, /button-account-deleted-continue/);
    assert.match(unauthSrc, /clearAccountDeletedSuccessPhase/);
    assert.match(unauthSrc, /defaultToSignUp: false/);
    assert.match(unauthSrc, /ACCOUNT_DELETED_SUCCESS_COPY/);
    assert.equal(ACCOUNT_DELETED_SUCCESS_COPY.title, "Account deleted");
    assert.equal(ACCOUNT_DELETED_SUCCESS_COPY.continueLabel, "Continue");
  });

  it("AuthPage is not required for success UI; no deletion toast code remains", () => {
    assert.doesNotMatch(authSrc, /accountDeleted|ACCOUNT_DELETED|consumeAccountDeleted/);
    assert.doesNotMatch(unauthSrc, /consumeAccountDeleted|ACCOUNT_DELETED_SUCCESS_TOAST|useToast/);
    assert.doesNotMatch(dialogSrc, /markAccountDeletedSuccessHandoff|SuccessToast|\.toast\(/);
    assert.doesNotMatch(deleteAccountLibSrc, /sessionStorage\.setItem|SUCCESS_TOAST|consumeAccountDeletedSuccessOnce/);
    assert.doesNotMatch(deleteAccountLibSrc, /ACCOUNT_DELETED_SUCCESS_HANDOFF/);
    assert.doesNotMatch(deleteAccountLibSrc, /shouldShowAccountDeletedSuccessToast/);
  });

  it("does not expose Delete account beside Log Out on Settings root", () => {
    assert.match(settingsSrc, /data-testid="button-manage-account"/);
    assert.doesNotMatch(settingsSrc, /data-testid="button-delete-account"/);
  });

  it("Manage account path contains Change Password + Delete Account", () => {
    assert.match(manageAccountSrc, /data-testid="button-change-password"/);
    assert.match(manageAccountSrc, /data-testid="button-delete-account"/);
  });

  it("registers manage-account route and deletion hard reset", () => {
    assert.match(appSrc, /path="\/settings\/manage-account"/);
    assert.match(appSrc, /handleAccountDeleted/);
    assert.match(appSrc, /hardResetLocalAuthState/);
  });

  it("improved explain copy with selective emphasis", () => {
    assert.match(dialogSrc, /Delete your account\?/);
    assert.match(dialogSrc, /text-delete-account-irreversible/);
    assert.match(dialogSrc, /Delete account permanently/);
  });
});
