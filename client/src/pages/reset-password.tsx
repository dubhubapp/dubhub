import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/brand/Logo";
import { validateSignupPassword } from "@/lib/password-validation";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { queryClient } from "@/lib/queryClient";
import { Eye, EyeOff } from "lucide-react";

const RECOVERY_INTENT_KEY = "dubhub:auth-recovery-intent";

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

/**
 * Shown after the user opens the Supabase password recovery link.
 * Requires an authenticated session (recovery exchanges the link for a session).
 */
export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasRecoveryIntent, setHasRecoveryIntent] = useState<boolean | null>(null);
  const passwordStrength = getPasswordStrength(newPassword);

  const exitRecoveryFlowToSignIn = () => {
    try {
      sessionStorage.removeItem(RECOVERY_INTENT_KEY);
    } catch {
      // Best effort only.
    }
    window.history.replaceState(null, "", "/");
    setLocation("/", { replace: true });
  };

  useEffect(() => {
    try {
      setHasRecoveryIntent(sessionStorage.getItem(RECOVERY_INTENT_KEY) === "1");
    } catch {
      // Best effort only.
      setHasRecoveryIntent(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const resolveSession = async () => {
      if (hasRecoveryIntent === null) {
        return;
      }
      if (!hasRecoveryIntent) {
        setLocation("/", { replace: true });
        return;
      }
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setSessionError(error.message);
        return;
      }
      if (session?.user) {
        setSessionReady(true);
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
      const retry = await supabase.auth.getSession();
      if (cancelled) return;
      if (retry.data.session?.user) {
        setSessionReady(true);
      } else {
        setSessionError(
          "This reset link is invalid or has expired. Request a new one from the sign-in screen."
        );
      }
    };
    resolveSession();
    return () => {
      cancelled = true;
    };
  }, [hasRecoveryIntent]);

  useEffect(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      el.blur();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const v = validateSignupPassword(newPassword);
    if (!v.valid) {
      setErrorMessage(v.message);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setErrorMessage(error.message || "Could not update password");
        return;
      }
      try {
        sessionStorage.removeItem(RECOVERY_INTENT_KEY);
      } catch {
        // Best effort only.
      }
      await supabase.auth.signOut();
      queryClient.clear();
      window.history.replaceState(null, "", "/");
      toast({
        title: "Password updated",
        description: "Password updated. Please sign in with your new password.",
      });
      setLocation("/", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  if (sessionError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border-border">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Logo size="lg" />
            </div>
            <CardTitle className="text-xl">Link not valid</CardTitle>
            <CardDescription className="text-muted-foreground">{sessionError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={exitRecoveryFlowToSignIn}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <VinylLoader label="Preparing password reset…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen overflow-y-auto bg-background flex items-center justify-center px-4 py-8 pb-24">
      <Card className="w-full max-w-md mx-auto bg-background border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Set a new password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Choose a strong password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-new-password">New password</Label>
              <div className="relative">
                <Input
                  id="reset-new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-input border-border text-foreground pr-10"
                  autoComplete="new-password"
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
                <div className="mt-2 space-y-1" data-testid="reset-password-strength-indicator">
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
              <Label htmlFor="reset-confirm-password">Confirm password</Label>
              <div className="relative">
                <Input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-input border-border text-foreground pr-10"
                  autoComplete="new-password"
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
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm font-medium">{errorMessage}</p>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Saving…" : "Save new password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
