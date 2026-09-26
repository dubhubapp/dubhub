import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff } from "lucide-react";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import { cn } from "@/lib/utils";
import {
  APP_MATERIAL_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_FIELD_CLASS,
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";
import { apiRequest } from "@/lib/queryClient";
import { ApiRequestError } from "@/lib/apiDiagnostics";
import { openIosManageSubscriptions } from "@/lib/legal-urls";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import { resolveSettingsSubscriptionRowView } from "@/lib/settings-subscription-row";
import { useUser } from "@/lib/user-context";
import {
  deleteAccountResponseMeansAuthGone,
  markAccountDeletedSuccessPhase,
  nextDeleteAccountStep,
  parseDeleteAccountErrorBody,
  shouldEnterAccountDeletedSuccessPhase,
  userMessageForDeleteAccountCode,
  type DeleteAccountDialogStep,
} from "@/lib/delete-account";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After Auth is gone — push deactivate + App auth state (reuse sign-out path). */
  onAccountDeleted?: () => Promise<void> | void;
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  onAccountDeleted,
}: DeleteAccountDialogProps) {
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<DeleteAccountDialogStep>("explain");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { verifiedArtist } = useUser();

  const subscription = useAuthoritativeSubscriptionStatus({
    enabled: open && !!verifiedArtist,
  });
  const subscriptionView = resolveSettingsSubscriptionRowView({
    loading: subscription.loading,
    hasError: subscription.error != null,
    selection: subscription.selection,
  });
  const showSubscriptionWarning =
    !!verifiedArtist && subscriptionView.showManage === true;

  const { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion } =
    useIosKeyboardAwareScroll({
      enabled: open,
      scrollContainerRef: dialogContentRef,
    });
  const keyboardAwareLayoutActive = open && isNativeIos && keyboardOpen;

  const resetForm = () => {
    setStep("explain");
    setPassword("");
    setShowPassword(false);
    setErrorMessage("");
    setIsLoading(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (isLoading) return;
    if (!next) {
      const activeEl = document.activeElement;
      if (
        isEditableElement(activeEl) &&
        dialogContentRef.current?.contains(activeEl)
      ) {
        activeEl.blur();
      }
      resetForm();
    }
    onOpenChange(next);
  };

  const goNext = () => {
    setErrorMessage("");
    const next = nextDeleteAccountStep({
      current: step,
      showSubscriptionWarning,
    });
    if (next === "done") return;
    setStep(next);
  };

  const completeLocalDeletionCleanup = async (args: {
    showSuccessPhase: boolean;
  }) => {
    // Mark durable phase BEFORE hard reset / auth shell flip.
    if (args.showSuccessPhase) {
      markAccountDeletedSuccessPhase();
    }
    await onAccountDeleted?.();
    onOpenChange(false);
    resetForm();
  };

  const handleDeletePermanently = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorMessage("");
    if (!password.trim()) {
      setErrorMessage(userMessageForDeleteAccountCode("password_required"));
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/me/delete-account", {
        password,
        confirm: true,
      });
      const body = (await res.json()) as {
        ok?: boolean;
        code?: string;
        authDeleted?: boolean;
      };
      if (deleteAccountResponseMeansAuthGone(body.code)) {
        await completeLocalDeletionCleanup({
          showSuccessPhase: shouldEnterAccountDeletedSuccessPhase({
            code: body.code,
            authDeleted: body.authDeleted === true || body.code === "deleted",
          }),
        });
        return;
      }
      setErrorMessage(userMessageForDeleteAccountCode("unknown"));
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (!err.status) {
          setErrorMessage(userMessageForDeleteAccountCode("network_error"));
          return;
        }
        const parsed = parseDeleteAccountErrorBody(
          err.status,
          err.responseBody,
        );
        if (parsed.kind === "error") {
          if (deleteAccountResponseMeansAuthGone(parsed.code)) {
            let authDeleted = false;
            try {
              const raw = err.responseBody
                ? (JSON.parse(err.responseBody) as { authDeleted?: boolean })
                : null;
              authDeleted = raw?.authDeleted === true;
            } catch {
              // ignore
            }
            await completeLocalDeletionCleanup({
              showSuccessPhase: shouldEnterAccountDeletedSuccessPhase({
                code: parsed.code,
                authDeleted: authDeleted || parsed.code === "deleted",
              }),
            });
            return;
          }
          setErrorMessage(parsed.message);
          return;
        }
      }
      setErrorMessage(userMessageForDeleteAccountCode("network_error"));
    } finally {
      setIsLoading(false);
    }
  };

  const title =
    step === "password"
      ? "Confirm account deletion"
      : step === "subscription"
        ? "Apple subscription"
        : "Delete your account?";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className={cn(
          APP_MATERIAL_DIALOG_CONTENT_CLASS,
          "w-[calc(100%-2rem)] max-w-sm p-5 sm:max-w-md sm:p-6 max-h-[90vh] overflow-y-auto",
          keyboardAwareLayoutActive
            ? "!top-[max(0.75rem,env(safe-area-inset-top,0px))] !translate-y-0"
            : "",
        )}
        overlayClassName={APP_MATERIAL_OVERLAY_BACKDROP_CLASS}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        style={{
          WebkitOverflowScrolling: "touch",
          transition:
            isNativeIos && !prefersReducedMotion
              ? "padding-bottom 300ms ease-in-out, max-height 300ms ease-in-out, top 300ms ease-in-out, transform 300ms ease-in-out"
              : undefined,
          maxHeight: keyboardAwareLayoutActive
            ? "calc(100dvh - max(0.75rem, env(safe-area-inset-top, 0px)) - 0.75rem)"
            : undefined,
          paddingBottom: keyboardAwareLayoutActive
            ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
            : undefined,
        }}
        data-testid="dialog-delete-account"
      >
        <DialogHeader>
          <DialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
            {title}
          </DialogTitle>
          {step === "explain" ? (
            <DialogDescription
              className={cn(APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS, "space-y-3 text-left")}
              data-testid="text-delete-account-explain"
            >
              <span className="block font-normal">
                This permanently deletes your{" "}
                <span className="font-medium text-foreground">
                  profile and account data
                </span>
                , including your posts, uploaded media, comments, releases, saved
                posts and preferences.
              </span>
              <span
                className="block font-semibold text-foreground"
                data-testid="text-delete-account-irreversible"
              >
                This can’t be undone.
              </span>
              <span className="block font-normal">
                Some moderation and safety records may be retained where necessary
                for safety or legal reasons.
              </span>
            </DialogDescription>
          ) : step === "subscription" ? (
            <DialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              Deleting your dub hub account will not cancel billing through Apple.
            </DialogDescription>
          ) : (
            <DialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              Enter your current password to permanently delete your account.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === "explain" ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className={APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS}
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
              data-testid="button-delete-account-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS}
              onClick={goNext}
              data-testid="button-delete-account-continue"
            >
              Continue
            </Button>
          </div>
        ) : null}

        {step === "subscription" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Deleting your dub hub account does not cancel your Apple
              subscription.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className={APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS}
                onClick={() => openIosManageSubscriptions()}
                data-testid="button-delete-account-manage-subscription"
              >
                Manage Subscription
              </Button>
              <Button
                type="button"
                className={APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS}
                onClick={goNext}
                data-testid="button-delete-account-continue-after-subscription"
              >
                Continue deleting account
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => handleOpenChange(false)}
                data-testid="button-delete-account-cancel-subscription"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {step === "password" ? (
          <form
            onSubmit={(e) => void handleDeletePermanently(e)}
            className="mt-4 space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="delete-account-password">Current password</Label>
              <div className="relative">
                <Input
                  id="delete-account-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={isLoading}
                  className={cn(APP_MATERIAL_FIELD_CLASS, "h-10 pr-10")}
                  data-testid="input-delete-account-password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isLoading}
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchStart={(e) => e.preventDefault()}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {errorMessage ? (
              <p
                className="text-sm text-red-600 dark:text-red-400"
                data-testid="text-delete-account-error"
              >
                {errorMessage}
              </p>
            ) : null}
            {isLoading ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="text-delete-account-progress"
              >
                Deleting your account…
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className={APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS}
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
                data-testid="button-delete-account-password-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS}
                disabled={isLoading}
                data-testid="button-delete-account-confirm"
              >
                {isLoading ? "Deleting…" : "Delete account permanently"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
