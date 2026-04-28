import { useState, useEffect } from "react";
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
import { getPasswordResetRedirectUrl } from "@/lib/password-validation";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmail?: string;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail = "",
}: ForgotPasswordDialogProps) {
  const RESET_EMAIL_COOLDOWN_SECONDS = 45;
  const RESET_COOLDOWN_MESSAGE = "Please wait a moment before requesting another reset email.";
  const [email, setEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [resetCooldownRemaining, setResetCooldownRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) setEmail(initialEmail);
  }, [open, initialEmail]);

  useEffect(() => {
    if (resetCooldownRemaining <= 0) return;
    const timer = window.setTimeout(() => {
      setResetCooldownRemaining((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resetCooldownRemaining]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setErrorMessage("");
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetCooldownRemaining > 0) {
      setErrorMessage(RESET_COOLDOWN_MESSAGE);
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMessage("Please enter your email");
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    try {
      setResetCooldownRemaining(RESET_EMAIL_COOLDOWN_SECONDS);
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: getPasswordResetRedirectUrl(),
      });
      if (error) {
        setErrorMessage(error.message || "Could not send reset email");
        return;
      }
      toast({
        title: "Check your email",
        description: "If an account exists for that address, we sent a link to reset your password.",
      });
      handleOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm bg-background border-border p-5 sm:max-w-md sm:p-6 rounded-lg">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Enter your email and we will send you a link to choose a new password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-input border-border"
              autoComplete="email"
            />
          </div>
          {errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading || resetCooldownRemaining > 0}>
            {isLoading
              ? "Sending…"
              : resetCooldownRemaining > 0
                ? `Please wait (${resetCooldownRemaining}s)`
                : "Send reset link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
