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

/**
 * Shown after the user opens the Supabase password recovery link.
 * Requires an authenticated session (recovery exchanges the link for a session).
 */
export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const resolveSession = async () => {
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
      toast({
        title: "Password updated",
        description: "Your password has been successfully updated.",
      });
      setLocation("/");
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
            <Button className="w-full" onClick={() => setLocation("/")}>
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
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted-foreground text-sm">Preparing password reset…</p>
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
              <Input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-input border-border text-foreground"
                autoComplete="new-password"
                placeholder="At least 8 characters, upper, lower, number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password">Confirm password</Label>
              <Input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-input border-border text-foreground"
                autoComplete="new-password"
              />
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
