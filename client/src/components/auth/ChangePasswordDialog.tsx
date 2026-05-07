import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
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
import { useToast } from "@/hooks/use-toast";
import { validateSignupPassword } from "@/lib/password-validation";
import { Eye, EyeOff } from "lucide-react";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

function getPasswordStrength(password: string) {
  const value = password.trim();
  let score = 0;

  const hasMinLength = value.length >= 8;
  const hasLongLength = value.length >= 12;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);

  if (hasMinLength) score += 1;
  if (hasLower) score += 1;
  if (hasUpper) score += 1;
  if (hasNumber) score += 1;
  if (hasSymbol) score += 1;
  if (hasLongLength) score += 1;

  if (!value || !hasMinLength || score <= 2) return "weak" as const;
  if (score <= 4) return "okay" as const;
  return "strong" as const;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { toast } = useToast();
  const passwordStrength = getPasswordStrength(newPassword);
  const { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion } = useIosKeyboardAwareScroll({
    enabled: open,
    scrollContainerRef: dialogContentRef,
  });
  const keyboardAwareLayoutActive = open && isNativeIos && keyboardOpen;

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorMessage("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      const activeEl = document.activeElement;
      if (isEditableElement(activeEl) && dialogContentRef.current?.contains(activeEl)) {
        activeEl.blur();
      }
      resetForm();
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const v = validateSignupPassword(newPassword);
    if (!v.valid) {
      setErrorMessage(v.message);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match");
      return;
    }
    if (currentPassword === newPassword) {
      setErrorMessage("New password must be different from your current password");
      return;
    }

    setIsLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      const email = user?.email;
      if (userError || !email) {
        setErrorMessage("Could not load your account. Please sign in again.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) {
        if (
          signInError.message.includes("Invalid login credentials") ||
          signInError.message.includes("Invalid")
        ) {
          setErrorMessage("Current password is incorrect");
        } else {
          setErrorMessage(signInError.message);
        }
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setErrorMessage(updateError.message || "Could not update password");
        return;
      }

      toast({
        title: "Password updated",
        description: "Your password has been successfully updated.",
      });
      resetForm();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className={`w-[calc(100%-2rem)] max-w-sm bg-background border-border p-5 sm:max-w-md sm:p-6 rounded-lg max-h-[90vh] overflow-y-auto ${
          keyboardAwareLayoutActive ? "!top-[max(0.75rem,env(safe-area-inset-top,0px))] !translate-y-0" : ""
        }`}
        onOpenAutoFocus={(event) => event.preventDefault()}
        style={{
          WebkitOverflowScrolling: "touch",
          transition:
            isNativeIos && !prefersReducedMotion
              ? "padding-bottom 300ms ease-in-out, max-height 300ms ease-in-out, top 300ms ease-in-out, transform 300ms ease-in-out"
              : undefined,
          maxHeight:
            keyboardAwareLayoutActive
              ? "calc(100dvh - max(0.75rem, env(safe-area-inset-top, 0px)) - 0.75rem)"
              : undefined,
          paddingBottom:
            keyboardAwareLayoutActive
              ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
              : undefined,
        }}
      >
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password, then choose a new one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-input border-border pr-10"
              />
              <button
                type="button"
                aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="bg-input border-border pr-10"
                placeholder="At least 8 characters, upper, lower, number"
              />
              <button
                type="button"
                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Must be at least 8 characters with uppercase, lowercase and numbers
            </p>
            {newPassword.trim().length > 0 && (
              <div className="mt-2 space-y-1" data-testid="change-password-strength-indicator">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      passwordStrength === "weak"
                        ? "w-1/3 bg-red-500"
                        : passwordStrength === "okay"
                          ? "w-2/3 bg-yellow-500"
                          : "w-full bg-green-500"
                    }`}
                  />
                </div>
                <p
                  className={`text-xs ${
                    passwordStrength === "weak"
                      ? "text-red-600"
                      : passwordStrength === "okay"
                        ? "text-yellow-600"
                        : "text-green-600"
                  }`}
                >
                  {passwordStrength === "weak"
                    ? "Password is too weak"
                    : passwordStrength === "okay"
                      ? "Password could be stronger"
                      : "Password looks strong"}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <div className="relative">
              <Input
                id="confirm-new-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="bg-input border-border pr-10"
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Updating…" : "Update password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
