import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/brand/Logo';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { Eye, EyeOff } from "lucide-react";
import {
  clearPendingVerificationEmail,
  EMAIL_NOT_CONFIRMED_MESSAGE,
  VERIFICATION_RESEND_COOLDOWN_MESSAGE,
  VERIFICATION_RESEND_SUCCESS_MESSAGE,
  useResendVerificationEmail,
} from '@/lib/auth-resend';

const RECOVERY_INTENT_KEY = "dubhub:auth-recovery-intent";

interface SignInProps {
  onToggleMode: () => void;
  onAuthSuccess: (role: string) => void;
}

export function SignIn({ onToggleMode, onAuthSuccess }: SignInProps) {
  const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password';
  const UNVERIFIED_ARTIST_MESSAGE =
    "Your artist account is awaiting verification. If you haven’t already, DM us at @dubhub.uk from your artist Instagram account so we can verify you.";
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const {
    send: sendVerificationEmail,
    isLoading: isResendLoading,
    errorMessage: resendErrorMessage,
    success: resendSuccess,
    cooldownRemaining: resendCooldownRemaining,
    isOnCooldown: isResendOnCooldown,
    reset: resetResendState,
  } = useResendVerificationEmail(email);

  useEffect(() => {
    setEmailNotConfirmed(false);
    resetResendState();
  }, [email, resetResendState]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setEmailNotConfirmed(false);
    resetResendState();
    try {
      sessionStorage.removeItem(RECOVERY_INTENT_KEY);
    } catch {
      // Best effort only.
    }

    try {
      if (!email || !password) {
        setErrorMessage('Please enter both email and password');
        return;
      }

      // Use Supabase signInWithPassword
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        // Handle specific Supabase error cases
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage(INVALID_CREDENTIALS_MESSAGE);
        } else if (error.message.includes('Email not confirmed')) {
          setEmailNotConfirmed(true);
          setErrorMessage(EMAIL_NOT_CONFIRMED_MESSAGE);
        } else if (error.message.includes('Too many requests')) {
          setErrorMessage('Too many sign in attempts. Please try again later');
        } else if (error.message.includes('User not found')) {
          setErrorMessage(INVALID_CREDENTIALS_MESSAGE);
        } else if (error.message.includes('Wrong password')) {
          setErrorMessage(INVALID_CREDENTIALS_MESSAGE);
        } else {
          setErrorMessage(INVALID_CREDENTIALS_MESSAGE);
        }
        return;
      }

      if (data.user) {
        try {
          sessionStorage.removeItem(RECOVERY_INTENT_KEY);
        } catch {
          // Best effort only.
        }
        // Always fetch fresh user data from the current authenticated session
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        
        if (!currentUser) {
          setErrorMessage('Session error. Please try signing in again');
          return;
        }

        // Fetch user profile from profiles table with fresh query
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('account_type, moderator, username, verified_artist')
          .eq('id', currentUser.id)
          .single();

        if (profileError || !profileData) {
          console.error('Profile fetch error:', profileError);
          await supabase.auth.signOut();
          setErrorMessage('Account found but profile data is missing. Please contact support');
          return;
        }

        // Block unverified artists from logging in
        if (profileData.account_type === 'artist' && !profileData.verified_artist) {
          console.warn('[SignIn] Unverified artist blocked from login');
          await supabase.auth.signOut();
          setErrorMessage(UNVERIFIED_ARTIST_MESSAGE);
          return;
        }

        // Determine user role based on profile data
        let userRole = profileData.account_type || 'user';
        
        // If user is a moderator, update role to include moderator status
        if (profileData.moderator) {
          userRole = 'moderator';
        }

        clearPendingVerificationEmail();
        onAuthSuccess(userRole);
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      setErrorMessage('An unexpected error occurred. Please try again');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto border-0 bg-transparent shadow-none">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Logo size="xl" className="!h-24 w-auto" />
        </div>
        <CardTitle className="text-2xl font-bold text-foreground bg-transparent">Welcome Back</CardTitle>
        <CardDescription className="text-muted-foreground">
          Sign in to identify your next favourite track
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="bg-input border-border text-foreground placeholder-muted-foreground"
              required
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <button
                type="button"
                onClick={() => setForgotPasswordOpen(true)}
                className="text-xs text-accent hover:underline"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="bg-input border-border text-foreground placeholder-muted-foreground pr-10"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          
          <Button 
            type="submit" 
            className="w-full font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isLoading}
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>

          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm font-medium">{errorMessage}</p>
            </div>
          )}

          {emailNotConfirmed && resendSuccess && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-green-800 text-sm font-medium" data-testid="text-resend-verification-success">
                {VERIFICATION_RESEND_SUCCESS_MESSAGE}
              </p>
            </div>
          )}

          {emailNotConfirmed && !resendSuccess && (
            <div className="mt-3 space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void sendVerificationEmail()}
                disabled={isResendLoading || isResendOnCooldown || !email.trim()}
                data-testid="button-resend-verification-sign-in"
              >
                {isResendLoading
                  ? "Sending…"
                  : isResendOnCooldown
                    ? `Please wait (${resendCooldownRemaining}s)`
                    : "Send new verification email"}
              </Button>
              {resendErrorMessage && (
                <p className="text-sm text-red-600" data-testid="text-resend-verification-error-sign-in">
                  {resendErrorMessage}
                </p>
              )}
              {isResendOnCooldown && !resendErrorMessage && (
                <p className="text-xs text-muted-foreground text-center">
                  {VERIFICATION_RESEND_COOLDOWN_MESSAGE}
                </p>
              )}
            </div>
          )}
        </form>
        
        <div className="text-center mt-5">
          <p className="text-muted-foreground text-[15px]">
            New to dub hub?{' '}
            <button
              onClick={onToggleMode}
              className="text-accent font-semibold hover:underline"
            >
              Create account
            </button>
          </p>
        </div>

        <ForgotPasswordDialog
          open={forgotPasswordOpen}
          onOpenChange={setForgotPasswordOpen}
          initialEmail={email}
        />
      </CardContent>
    </Card>
  );
}