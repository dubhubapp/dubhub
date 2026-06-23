import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardDescription, CardTitle } from "@/components/ui/card";
import {
  VERIFICATION_RESEND_COOLDOWN_MESSAGE,
  VERIFICATION_RESEND_INTRO_KNOWN,
  VERIFICATION_RESEND_INTRO_UNKNOWN,
  VERIFICATION_RESEND_SUCCESS_MESSAGE,
  useResendVerificationEmail,
} from "@/lib/auth-resend";

interface ResendVerificationPanelProps {
  initialEmail?: string;
  onBackToSignIn: () => void;
}

export function ResendVerificationPanel({
  initialEmail = "",
  onBackToSignIn,
}: ResendVerificationPanelProps) {
  const hasKnownEmail = !!initialEmail.trim();
  const {
    email,
    setEmail,
    send,
    isLoading,
    errorMessage,
    success,
    cooldownRemaining,
    isOnCooldown,
  } = useResendVerificationEmail(initialEmail);

  if (success) {
    return (
      <>
        <CardTitle className="text-xl">Verification email sent</CardTitle>
        <CardDescription className="text-muted-foreground">
          {VERIFICATION_RESEND_SUCCESS_MESSAGE}
        </CardDescription>
        <div className="mt-4 space-y-3">
          <Button className="w-full" type="button" onClick={onBackToSignIn}>
            Back to sign in
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <CardTitle className="text-xl">Verification email expired</CardTitle>
      <CardDescription className="text-muted-foreground">
        {hasKnownEmail ? VERIFICATION_RESEND_INTRO_KNOWN : VERIFICATION_RESEND_INTRO_UNKNOWN}
      </CardDescription>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="resend-verification-email">Email</Label>
          <Input
            id="resend-verification-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="bg-input border-border text-foreground placeholder-muted-foreground"
            autoComplete="email"
            readOnly={hasKnownEmail}
            data-testid="input-resend-verification-email"
          />
        </div>
        {errorMessage && (
          <p className="text-sm text-red-600" data-testid="text-resend-verification-error">
            {errorMessage}
          </p>
        )}
        <Button
          className="w-full"
          type="button"
          onClick={() => void send()}
          disabled={isLoading || isOnCooldown || !email.trim()}
          data-testid="button-send-verification-email"
        >
          {isLoading
            ? "Sending…"
            : isOnCooldown
              ? `Please wait (${cooldownRemaining}s)`
              : "Send new verification email"}
        </Button>
        {isOnCooldown && !errorMessage && (
          <p className="text-xs text-muted-foreground text-center">
            {VERIFICATION_RESEND_COOLDOWN_MESSAGE}
          </p>
        )}
        <Button
          className="w-full"
          type="button"
          variant="outline"
          onClick={onBackToSignIn}
          data-testid="button-back-to-sign-in"
        >
          Back to sign in
        </Button>
      </div>
    </>
  );
}
