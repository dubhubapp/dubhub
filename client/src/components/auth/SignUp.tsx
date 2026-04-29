import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/brand/Logo';
import { Mail } from 'lucide-react';
import { Filter } from 'bad-words';
import { apiRequest } from '@/lib/queryClient';
import { validateUsername, normalizeUsernameForStorage } from '@shared/usernameValidation';
import { checkUsernameAvailability } from '@shared/usernameAvailability';
import {
  AUTH_EMAIL_RATE_LIMIT_MESSAGE,
  isAuthEmailRateLimitError,
  isDuplicateSignupEmailError,
} from '@/lib/auth-errors';
import { getAuthCallbackUrl } from '@/lib/auth-callback-url';
import { markOnboardingPendingForEmail } from '@/lib/onboarding';

interface SignUpProps {
  onToggleMode: () => void;
  onAuthSuccess: (role: string) => void;
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

  if (!value) {
    return {
      label: 'empty' as const,
      score,
      canSubmit: false,
      diagnostics: { length: value.length, hasLower, hasUpper, hasNumber, hasSymbol },
    };
  }
  if (!hasMinLength || score <= 2) {
    return {
      label: 'weak' as const,
      score,
      canSubmit: false,
      diagnostics: { length: value.length, hasLower, hasUpper, hasNumber, hasSymbol },
    };
  }
  if (score <= 4) {
    return {
      label: 'okay' as const,
      score,
      canSubmit: true,
      diagnostics: { length: value.length, hasLower, hasUpper, hasNumber, hasSymbol },
    };
  }
  return {
    label: 'strong' as const,
    score,
    canSubmit: true,
    diagnostics: { length: value.length, hasLower, hasUpper, hasNumber, hasSymbol },
  };
}

export function SignUp({ onToggleMode, onAuthSuccess }: SignUpProps) {
  const SIGNUP_EMAIL_COOLDOWN_SECONDS = 45;
  const SIGNUP_COOLDOWN_MESSAGE = 'Please wait a moment before creating another account.';
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountType, setAccountType] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [hasSignupSucceeded, setHasSignupSucceeded] = useState(false);
  const [signupCooldownRemaining, setSignupCooldownRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const { toast } = useToast();
  
  // Initialize profanity filter
  const filter = new Filter();
  const passwordStrengthResult = getPasswordStrength(password);
  const isPasswordWeak = password.length > 0 && !passwordStrengthResult.canSubmit;
  const confirmPasswordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const openVerificationModal = () => {
    setHasSignupSucceeded(true);
    setShowVerificationModal(true);
  };

  const goToSignIn = () => {
    setShowVerificationModal(false);
    onToggleMode();
  };

  const handleArtistDmClick = () => {
    window.open("https://www.instagram.com/dubhub.uk/", "_blank", "noopener,noreferrer");
    goToSignIn();
  };

  const handleVerificationModalOpenChange = (open: boolean) => {
    // Keep this modal intentional and non-dismissible once shown.
    if (open) {
      setShowVerificationModal(true);
    }
  };

  useEffect(() => {
    if (!import.meta.env.DEV || password.length === 0) {
      return;
    }
    console.log('[SignUp][password-strength]', {
      length: passwordStrengthResult.diagnostics.length,
      hasLower: passwordStrengthResult.diagnostics.hasLower,
      hasUpper: passwordStrengthResult.diagnostics.hasUpper,
      hasNumber: passwordStrengthResult.diagnostics.hasNumber,
      hasSymbol: passwordStrengthResult.diagnostics.hasSymbol,
      score: passwordStrengthResult.score,
      label: passwordStrengthResult.label,
    });
  }, [password, passwordStrengthResult]);

  useEffect(() => {
    if (signupCooldownRemaining <= 0) return;
    const timer = window.setTimeout(() => {
      setSignupCooldownRemaining((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [signupCooldownRemaining]);

  useEffect(() => {
    const isPasswordWeakError =
      errorMessage === 'Password is too weak' ||
      errorMessage === 'Password is too weak. Please use a stronger password';
    if (isPasswordWeakError && passwordStrengthResult.canSubmit) {
      setErrorMessage('');
    }
  }, [errorMessage, passwordStrengthResult.canSubmit]);

  // Real-time username validation as user types
  // Re-validates when username OR accountType changes to prevent stale results
  useEffect(() => {
    if (username.length === 0) {
      setUsernameError('');
      return;
    }

    // First check format validation
    const validation = validateUsername(username);
    if (!validation.valid) {
      setUsernameError(validation.error || 'Invalid username');
      return;
    }

    // Then check availability (only if format is valid and account type is selected)
    if (accountType && (accountType === 'user' || accountType === 'artist')) {
      // Clear previous error while checking
      setUsernameError('');
      
      // Debounce the availability check to avoid excessive API calls
      const timeoutId = setTimeout(() => {
        checkUsernameAvailability(supabase, username, accountType as 'user' | 'artist')
          .then((result) => {
            if (!result.available) {
              if (result.reason === 'artist_reserved' && accountType === 'user') {
                setUsernameError("Don't be silly, you're not that famous");
              } else {
                setUsernameError('Username already taken, please choose another.');
              }
            } else {
              setUsernameError('');
            }
          })
          .catch((err) => {
            console.error('[SignUp] Error checking username availability:', err);
            // Don't show error on check failure - format validation already passed
            setUsernameError('');
          });
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    } else {
      setUsernameError('');
    }
  }, [username, accountType]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasSignupSucceeded || showVerificationModal) {
      return;
    }
    if (signupCooldownRemaining > 0) {
      setErrorMessage(SIGNUP_COOLDOWN_MESSAGE);
      return;
    }
    setIsLoading(true);
    setErrorMessage('');

    try {
      // Validate form inputs
      if (!email || !username || !password || !confirmPassword || !accountType) {
        setErrorMessage('Please fill in all fields');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please try again');
        return;
      }

      if (!passwordStrengthResult.canSubmit) {
        setErrorMessage('Password is too weak');
        return;
      }

      // Check for profanity in username
      if (filter.isProfane(username)) {
        setErrorMessage('Username contains inappropriate language. Please choose a different username');
        return;
      }

      // Validate username format first
      const trimmedUsername = username.trim();
      const validation = validateUsername(trimmedUsername);
      
      if (!validation.valid) {
        // Log blocked attempt
        console.warn('[SignUp] Username format validation failed:', {
          attempted_username: trimmedUsername,
          reason: validation.reason || 'format',
          timestamp: new Date().toISOString(),
        });
        setErrorMessage(validation.error || 'Invalid username');
        return;
      }

      // Check username availability (matches backend rules exactly)
      // Always re-check on submit to prevent stale results
      const availability = await checkUsernameAvailability(supabase, trimmedUsername, accountType as 'user' | 'artist');
      
      if (!availability.available) {
        // Log blocked attempt
        console.warn('[SignUp] Username availability check failed:', {
          attempted_username: trimmedUsername,
          reason: availability.reason || 'unavailable',
          accountType,
          timestamp: new Date().toISOString(),
        });
        if (availability.reason === 'artist_reserved' && accountType === 'user') {
          setErrorMessage("Don't be silly, you're not that famous");
        } else {
          setErrorMessage('Username already taken, please choose another.');
        }
        return;
      }

      // Create Supabase auth user with ORIGINAL username (preserve casing)
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: getAuthCallbackUrl(),
          data: {
            username: trimmedUsername, // Send original username with casing preserved
            account_type: accountType,
          }
        }
      });

      // Check if user was created successfully (even if there's a warning/error)
      if (data?.user && !error) {
        setSignupCooldownRemaining(SIGNUP_EMAIL_COOLDOWN_SECONDS);
        // User was created successfully - treat as success even if error exists
        // (magic-link scenarios may have warnings but user is still created)
        console.log('[SignUp] User created successfully:', data.user.id);
        
        // Log successful user creation
        console.log('[SignUp] User created in Supabase, profile will be auto-created by trigger');
        
        // DO NOT verify profile immediately - trigger creates it asynchronously in Supabase
        // Any profile fetch here could fail due to RLS or timing, and we don't want that to block signup
        // A separate backend endpoint can be used to verify profile existence if needed
        // Profile is automatically created by Supabase trigger (handle_new_user)
        console.log('[SignUp] User created in Supabase, profile auto-created by trigger');

        // Call backend helper to ensure the Supabase profile exists / is readable
        // This is a best-effort sync and MUST NOT block a successful signup flow
        console.log('[SignUp] Calling backend to verify Supabase profile for user ID:', data.user.id);
        try {
          await apiRequest('POST', '/api/users', {
            id: data.user.id,
            username: trimmedUsername, // Send original username with casing preserved
            userType: accountType,
          });
          console.log('[SignUp] Backend confirmed Supabase profile for user.');
        } catch (profileSyncError: any) {
          // This endpoint is best-effort only. Log and continue.
          console.error('[SignUp] Backend profile verification error (non-blocking):', profileSyncError?.message || profileSyncError);
        }

        // Add user to MailerLite (non-blocking - don't fail sign-up if this fails)
        try {
          await apiRequest('POST', '/api/addToMailerLite', {
            email: email.trim(),
            role: accountType,
            username: trimmedUsername, // Use original username
          });
          console.log('User added to MailerLite successfully');
        } catch (mailerLiteError) {
          // Log error but don't block sign-up
          console.error('MailerLite integration error:', mailerLiteError);
        }

        toast({
          title: "Account Created",
          description: "Please check your email to verify your account.",
        });
        markOnboardingPendingForEmail(email);

        // Show verification modal
        openVerificationModal();
        return; // Success - exit early
      }

      // If we reach here, user was not created
      // Handle error only if user doesn't exist
      if (error) {
        const errorMessage = error.message || '';
        const errorCode = error.code || '';

        if (isAuthEmailRateLimitError(error)) {
          setErrorMessage(AUTH_EMAIL_RATE_LIMIT_MESSAGE);
        } else {
          const em = errorMessage.toLowerCase();
          // Prefer duplicate-email detection before username heuristics ("already exists" can mean email).
          const isUsernameConflict =
            errorCode === '23505' ||
            em.includes('profiles_username') ||
            em.includes("name's taken") ||
            (em.includes('duplicate') &&
              (em.includes('username') || em.includes('profiles') || em.includes('unique'))) ||
            (em.includes('username') && em.includes('taken'));

          if (isDuplicateSignupEmailError(error)) {
            setErrorMessage('An account with this email already exists');
          } else if (isUsernameConflict) {
            setErrorMessage('Username already taken, please choose another.');
          } else if (
            errorMessage.includes('Password should be') ||
            errorMessage.toLowerCase().includes('password')
          ) {
            setErrorMessage(errorMessage || 'Password was rejected. Please use a different password.');
          } else {
            setErrorMessage(errorMessage || 'Failed to create account. Please try again.');
          }
        }
      } else {
        setSignupCooldownRemaining(SIGNUP_EMAIL_COOLDOWN_SECONDS);
        // No error but no user - might be magic-link scenario
        // Don't show error, just show email verification message
        toast({
          title: "Account Created",
          description: "Please check your email to verify your account.",
        });
        markOnboardingPendingForEmail(email);
        openVerificationModal();
      }
    } catch (error: unknown) {
      console.error('[SignUp] Unexpected signup error:', error);

      if (isAuthEmailRateLimitError(error)) {
        setErrorMessage(AUTH_EMAIL_RATE_LIMIT_MESSAGE);
      } else {
        const errorMessage =
          error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
        const em = errorMessage.toLowerCase();
        const code = String((error as { code?: string }).code ?? '');
        const isUsernameConflict =
          code === '23505' ||
          em.includes('profiles_username') ||
          em.includes("name's taken") ||
          (em.includes('duplicate') &&
            (em.includes('username') || em.includes('profiles') || em.includes('unique'))) ||
          (em.includes('username') && em.includes('taken'));

        if (isDuplicateSignupEmailError(error)) {
          setErrorMessage('An account with this email already exists');
        } else if (isUsernameConflict) {
          setErrorMessage('Username already taken, please choose another.');
        } else {
          setErrorMessage(errorMessage || 'An unexpected error occurred. Please try again.');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto border-0 bg-transparent shadow-none">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Logo size="xl" />
        </div>
        <CardTitle className="text-2xl font-bold text-foreground bg-transparent">Join dub hub</CardTitle>
        <CardDescription className="text-muted-foreground">
          Create your account and discover your next favourite track
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accountType" className="text-foreground">I am a...</Label>
            <Select value={accountType} onValueChange={setAccountType} required disabled={hasSignupSucceeded}>
              <SelectTrigger className="bg-input border-border text-foreground" data-testid="select-account-type">
                <SelectValue placeholder="Select your account type" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                <SelectItem value="user" className="text-foreground hover:bg-muted">
                  User
                </SelectItem>
                <SelectItem value="artist" className="text-foreground hover:bg-muted">
                  Artist
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="bg-input border-border text-foreground placeholder-muted-foreground"
              required
              disabled={hasSignupSucceeded}
              data-testid="input-email"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="username" className="text-foreground">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              className={`bg-input border-border text-foreground placeholder-muted-foreground ${
                usernameError ? 'border-red-500' : ''
              }`}
              required
              minLength={3}
              maxLength={20}
              disabled={hasSignupSucceeded}
              data-testid="input-username"
            />
            {usernameError && (
              <p className="text-xs text-red-600 mt-1" data-testid="text-username-error">
                {usernameError}
              </p>
            )}
            {!usernameError && username.length > 0 && (
              <p className="text-xs text-green-600 mt-1">Username available</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              className="bg-input border-border text-foreground placeholder-muted-foreground"
              required
              minLength={8}
              disabled={hasSignupSucceeded}
              data-testid="input-password"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be at least 8 characters with uppercase, lowercase, and numbers
            </p>
            {password.trim().length > 0 && (
              <div className="mt-2 space-y-1" data-testid="password-strength-indicator">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      passwordStrengthResult.label === 'weak'
                        ? 'w-1/3 bg-red-500'
                        : passwordStrengthResult.label === 'okay'
                          ? 'w-2/3 bg-yellow-500'
                          : 'w-full bg-green-500'
                    }`}
                  />
                </div>
                <p
                  className={`text-xs ${
                    passwordStrengthResult.label === 'weak'
                      ? 'text-red-600'
                      : passwordStrengthResult.label === 'okay'
                        ? 'text-yellow-600'
                        : 'text-green-600'
                  }`}
                >
                  {passwordStrengthResult.label === 'weak'
                    ? 'Password is too weak'
                    : passwordStrengthResult.label === 'okay'
                      ? 'Password could be stronger'
                      : 'Password looks strong'}
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className="bg-input border-border text-foreground placeholder-muted-foreground"
              required
              minLength={8}
              disabled={hasSignupSucceeded}
              data-testid="input-confirm-password"
            />
            {confirmPasswordMismatch && (
              <p className="text-xs text-red-600 mt-1" data-testid="text-confirm-password-error">
                Passwords do not match. Please try again
              </p>
            )}
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={
              isLoading ||
              !!usernameError ||
              isPasswordWeak ||
              confirmPasswordMismatch ||
              username.length === 0 ||
              hasSignupSucceeded ||
              signupCooldownRemaining > 0
            }
            data-testid="button-create-account"
          >
            {isLoading
              ? "Creating Account..."
              : signupCooldownRemaining > 0
                ? `Please wait (${signupCooldownRemaining}s)`
                : "Create Account"}
          </Button>
          {signupCooldownRemaining > 0 && !hasSignupSucceeded && (
            <p className="text-xs text-muted-foreground text-center">
              Please wait a moment before creating another account.
            </p>
          )}

          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm font-medium" data-testid="text-error-message">{errorMessage}</p>
            </div>
          )}
        </form>
        
        <div className="text-center mt-4">
          <p className="text-muted-foreground text-sm">
            Already have an account?{' '}
            <button
              onClick={onToggleMode}
              className="text-accent hover:underline"
            >
              Sign In
            </button>
          </p>
        </div>
      </CardContent>

      {/* Email Verification Modal */}
      <Dialog open={showVerificationModal} onOpenChange={handleVerificationModalOpenChange}>
        <DialogContent
          hideCloseButton
          className="w-[calc(100%-2rem)] max-w-sm bg-background border-border p-5 sm:max-w-md sm:p-6 rounded-lg"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <Mail className="w-12 h-12 text-accent" />
            </div>
            <DialogTitle className="text-foreground text-center">Check Your Email</DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              We've sent a verification link to <strong>{email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Please click the verification link in your email to activate your account. 
              Once verified, you can return here and sign in.
            </p>
            {accountType === "artist" && (
              <>
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-yellow-800 text-sm font-medium text-center">
                    Please verify your email AND send a DM to @dubhub.uk on Instagram from your official artist account to have your profile marked as verified.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={handleArtistDmClick}
                  >
                    DM us here!
                  </Button>
                </div>
              </>
            )}
            {accountType === "user" && (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="button-post-signup-sign-in"
                  onClick={goToSignIn}
                >
                  Sign in
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}