import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Logo } from '@/components/brand/Logo';
import { Mail } from 'lucide-react';
import { Eye, EyeOff, ChevronLeft } from "lucide-react";
import { Filter } from 'bad-words';
import { apiRequest } from '@/lib/queryClient';
import { validateUsername } from '@shared/usernameValidation';
import {
  checkUsernameAvailability,
} from '@shared/usernameAvailability';
import {
  AUTH_EMAIL_RATE_LIMIT_MESSAGE,
  isAuthEmailRateLimitError,
  isExistingAccountSignupBlockError,
} from '@/lib/auth-errors';
import { getAuthCallbackUrl } from '@/lib/auth-callback-url';
import { markOnboardingPendingForEmail } from '@/lib/onboarding';
import { setPendingVerificationEmail } from '@/lib/auth-resend';
import {
  isClaimHttpRetryable,
  runSignupWithDob,
  SIGNUP_INVALID_DOB_MESSAGE,
} from '@/lib/signup-dob-flow';
import {
  canAdvanceSignupStep1,
  canSubmitSignupStep2,
  type SignupStep,
} from '@/lib/signup-steps';
import { ApiRequestError } from '@/lib/apiDiagnostics';
import {
  isSignupAccountType,
  isUsernameReadyForCreateAccount,
  mapAvailabilityFailureToUsernameError,
  mapAvailableUsernameFeedback,
  shouldAcceptAvailabilityResponse,
  signupSubtitleForAccountType,
  type SignupUsernameAvailabilityReason,
  type SignupUsernameStatus,
} from '@/lib/signup-form-state';
import {
  ARTIST_DM_CTA_LABEL,
  openDubhubInstagram,
} from '@/lib/artist-verification-ux';
import { SignupAboutYouFields } from '@/components/auth/SignupAboutYouFields';
import type { DemographicsGender } from '@shared/demographics-gender';
import {
  DUBHUB_SIGNUP_PRIVACY_URL,
  DUBHUB_SIGNUP_TERMS_URL,
} from '@/lib/legal-urls';
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
} from '@/lib/app-material';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn, formatUsernameDisplay } from '@/lib/utils';
import { AUTH_SURFACE_CLASS } from '@/lib/auth-surface';
import {
  PRELOGIN_AUTH_LOGO_CLASS,
  PRELOGIN_CONFIRM_STATUS_CLASS,
  PRELOGIN_DIALOG_CONTENT_CLASS,
  PRELOGIN_DIALOG_MAIL_ICON_CLASS,
  PRELOGIN_DIALOG_MAIL_WELL_CLASS,
  PRELOGIN_DIALOG_OVERLAY_CLASS,
  PRELOGIN_FEEDBACK_GROUP_CLASS,
  PRELOGIN_FIELD_CLASS,
  PRELOGIN_FIELD_INVALID_CLASS,
  PRELOGIN_LINK_CLASS,
  PRELOGIN_MINI_SURFACE_CLASS,
  PRELOGIN_PASSWORD_FEEDBACK_REGION_CLASS,
  PRELOGIN_PRIMARY_CTA_CLASS,
  PRELOGIN_SELECT_CONTENT_CLASS,
  PRELOGIN_SELECT_ITEM_CLASS,
  PRELOGIN_SELECT_VIEWPORT_CLASS,
  PRELOGIN_SIGNUP_CTA_WRAP_CLASS,
  PRELOGIN_SIGNUP_FIELD_STACK_CLASS,
  PRELOGIN_USERNAME_STATUS_CLASS,
} from '@/lib/prelogin-material';

const SIGNUP_ABOUT_YOU_PRIVACY_NOTE =
  "We use these details to confirm your age and understand our community. Your date of birth and gender are private.";

interface SignUpProps {
  onToggleMode: () => void;
  onAuthSuccess: (role: string) => void;
  /** Presentation-only initial value for the existing account-type Select. */
  initialAccountType?: "user" | "artist";
}

const DUPLICATE_EMAIL_SIGNUP_MESSAGE =
  "That email already has a dub hub account. Please sign in instead, or use Forgot password if you can't remember your password.";

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

export function SignUp({ onToggleMode, onAuthSuccess, initialAccountType }: SignUpProps) {
  const SIGNUP_EMAIL_COOLDOWN_SECONDS = 45;
  const SIGNUP_COOLDOWN_MESSAGE = 'Please wait a moment before creating another account.';
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accountType, setAccountType] = useState(
    initialAccountType === "user" || initialAccountType === "artist" ? initialAccountType : "",
  );
  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [gender, setGender] = useState<DemographicsGender | "">("");
  const [dobError, setDobError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [hasSignupSucceeded, setHasSignupSucceeded] = useState(false);
  const [signupCooldownRemaining, setSignupCooldownRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<SignupUsernameStatus>('idle');
  const [usernameAvailabilityReason, setUsernameAvailabilityReason] =
    useState<SignupUsernameAvailabilityReason>(null);
  const usernameRequestIdRef = useRef(0);

  // Initialize profanity filter
  const filter = new Filter();
  const passwordStrengthResult = getPasswordStrength(password);
  const confirmPasswordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const signupUsernameHandle = formatUsernameDisplay(username);

  const openVerificationModal = () => {
    setHasSignupSucceeded(true);
    setShowVerificationModal(true);
  };

  const goToSignIn = () => {
    setShowVerificationModal(false);
    onToggleMode();
  };

  /** Opens Instagram only — leave verification Dialog open so Sign In is an explicit choice. */
  const handleArtistDmClick = () => {
    openDubhubInstagram();
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

  // Real-time username validation + race-safe availability (username OR accountType change invalidates prior confirmation)
  useEffect(() => {
    const requestId = ++usernameRequestIdRef.current;

    if (username.length === 0) {
      setUsernameError('');
      setUsernameStatus('idle');
      setUsernameAvailabilityReason(null);
      return;
    }

    const validation = validateUsername(username);
    if (!validation.valid) {
      setUsernameError(validation.error || 'Invalid username');
      setUsernameStatus('unavailable');
      setUsernameAvailabilityReason(null);
      return;
    }

    if (!isSignupAccountType(accountType)) {
      // Format OK but availability cannot be confirmed without account type.
      setUsernameError('');
      setUsernameStatus('idle');
      setUsernameAvailabilityReason(null);
      return;
    }

    setUsernameError('');
    setUsernameStatus('checking');
    setUsernameAvailabilityReason(null);

    const capturedUsername = username;
    const capturedAccountType = accountType;

    const timeoutId = setTimeout(() => {
      checkUsernameAvailability(supabase, capturedUsername, capturedAccountType)
        .then((result) => {
          if (!shouldAcceptAvailabilityResponse(requestId, usernameRequestIdRef.current)) {
            return;
          }
          if (!result.available) {
            // Pre-slice copy mapping (including reserved-artist Community rejection).
            setUsernameError(
              mapAvailabilityFailureToUsernameError(result.reason, capturedAccountType),
            );
            setUsernameStatus('unavailable');
            setUsernameAvailabilityReason(null);
          } else {
            setUsernameError('');
            setUsernameStatus('available');
            setUsernameAvailabilityReason(
              result.reason === 'artist_reserved' ? 'artist_reserved' : null,
            );
          }
        })
        .catch((err) => {
          console.error('[SignUp] Error checking username availability:', err);
          if (!shouldAcceptAvailabilityResponse(requestId, usernameRequestIdRef.current)) {
            return;
          }
          // Do not claim available on check failure; keep CTA gated until a positive confirmation.
          setUsernameError('');
          setUsernameStatus('idle');
          setUsernameAvailabilityReason(null);
        });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [username, accountType]);

  const goBackToStep1 = () => {
    if (isLoading || hasSignupSucceeded) return;
    setErrorMessage('');
    setDobError('');
    setSignupStep(1);
  };

  /** Step 1 Continue — client validation only; no age-gate / Auth / MailerLite. */
  const handleContinueStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasSignupSucceeded || showVerificationModal || signupStep !== 1) {
      return;
    }
    setIsLoading(true);
    setErrorMessage('');

    try {
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

      if (filter.isProfane(username)) {
        setErrorMessage('Username contains inappropriate language. Please choose a different username');
        return;
      }

      const trimmedUsername = username.trim();
      const validation = validateUsername(trimmedUsername);

      if (!validation.valid) {
        setErrorMessage(validation.error || 'Invalid username');
        return;
      }

      const availability = await checkUsernameAvailability(
        supabase,
        trimmedUsername,
        accountType as 'user' | 'artist',
      );

      if (!availability.available) {
        setErrorMessage(
          mapAvailabilityFailureToUsernameError(availability.reason, accountType),
        );
        return;
      }

      const trimmedEmail = email.trim();

      try {
        const checkRes = await apiRequest('POST', '/api/auth/check-email', {
          email: trimmedEmail,
        });
        const checkBody = (await checkRes.json()) as { exists: boolean };
        if (checkBody.exists) {
          setErrorMessage(DUPLICATE_EMAIL_SIGNUP_MESSAGE);
          return;
        }
      } catch (checkErr) {
        console.error('[SignUp] Email availability check failed:', checkErr);
        setErrorMessage(
          'We could not verify that email right now. Please try again in a moment.',
        );
        return;
      }

      setSignupStep(2);
    } catch (error: unknown) {
      console.error('[SignUp] Unexpected step-1 error:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /** Step 2 Create Account — age-gate → signUp → claim(country+gender). */
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasSignupSucceeded || showVerificationModal || signupStep !== 2) {
      return;
    }
    if (signupCooldownRemaining > 0) {
      setErrorMessage(SIGNUP_COOLDOWN_MESSAGE);
      return;
    }
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (!dateOfBirth.trim()) {
        setDobError(SIGNUP_INVALID_DOB_MESSAGE);
        setErrorMessage(SIGNUP_INVALID_DOB_MESSAGE);
        return;
      }
      if (!countryCode || !gender) {
        setErrorMessage('Please fill in all fields');
        return;
      }
      setDobError('');

      const trimmedUsername = username.trim();
      const trimmedEmail = email.trim();
      const emailRedirectTo = getAuthCallbackUrl();
      let mailerLiteAttempted = false;

      const flow = await runSignupWithDob({
        dateOfBirth,
        countryCode,
        gender,
        email: trimmedEmail,
        ageGate: async (dob, emailForGate) => {
          try {
            const res = await apiRequest('POST', '/api/auth/age-gate', {
              dateOfBirth: dob,
              email: emailForGate,
            });
            const body = (await res.json()) as {
              eligible?: boolean;
              ticket?: string;
              code?: string;
            };
            if (body.eligible === true && typeof body.ticket === 'string') {
              return { ok: true, ticket: body.ticket };
            }
            return { ok: false, kind: 'unavailable' };
          } catch (err) {
            if (err instanceof ApiRequestError) {
              if (err.status === 403) {
                return { ok: false, kind: 'under_13' };
              }
              if (err.status === 400) {
                return { ok: false, kind: 'invalid' };
              }
            }
            return { ok: false, kind: 'unavailable' };
          }
        },
        signUp: async (emailForSignUp) => {
          const { data, error } = await supabase.auth.signUp({
            email: emailForSignUp,
            password: password,
            options: {
              emailRedirectTo,
              data: {
                username: trimmedUsername,
                account_type: accountType,
              },
            },
          });

          if (error && isExistingAccountSignupBlockError(error)) {
            return { ok: false, kind: 'duplicate' };
          }
          if (error && isAuthEmailRateLimitError(error)) {
            return {
              ok: false,
              kind: 'rate_limit',
              message: AUTH_EMAIL_RATE_LIMIT_MESSAGE,
            };
          }
          if (error) {
            const errMsg = error.message || '';
            const errorCode = error.code || '';
            const em = errMsg.toLowerCase();
            const isUsernameConflict =
              errorCode === '23505' ||
              em.includes('profiles_username') ||
              em.includes("name's taken") ||
              (em.includes('duplicate') &&
                (em.includes('username') || em.includes('profiles') || em.includes('unique'))) ||
              (em.includes('username') && em.includes('taken'));
            if (isUsernameConflict) {
              return {
                ok: false,
                kind: 'username',
                message: 'Username already taken, please choose another.',
              };
            }
            if (
              errMsg.includes('Password should be') ||
              errMsg.toLowerCase().includes('password')
            ) {
              return {
                ok: false,
                kind: 'other',
                message: errMsg || 'Password was rejected. Please use a different password.',
              };
            }
            return {
              ok: false,
              kind: 'other',
              message: errMsg || 'Failed to create account. Please try again.',
            };
          }
          if (!data?.user?.id) {
            return { ok: false, kind: 'duplicate' };
          }
          return { ok: true, userId: data.user.id };
        },
        claim: async (userId, ticket, claimCountry, claimGender) => {
          try {
            const res = await apiRequest('POST', '/api/auth/pending-demographics', {
              userId,
              ticket,
              countryCode: claimCountry,
              gender: claimGender,
            });
            const body = (await res.json()) as { ok?: boolean; code?: string };
            if (body.ok === true) return { ok: true };
            return {
              ok: false,
              retryable: isClaimHttpRetryable(res.status, body.code),
              code: body.code,
            };
          } catch (err) {
            if (err instanceof ApiRequestError) {
              let code: string | undefined;
              try {
                const parsed = JSON.parse(err.responseBody || '{}') as { code?: string };
                code = parsed.code;
              } catch {
                /* ignore */
              }
              return {
                ok: false,
                retryable: isClaimHttpRetryable(err.status ?? 0, code),
                code,
              };
            }
            return { ok: false, retryable: true };
          }
        },
        abandon: async (userId, ticket) => {
          try {
            const res = await apiRequest('POST', '/api/auth/abandon-unconfirmed-signup', {
              userId,
              ticket,
            });
            const body = (await res.json()) as { ok?: boolean };
            return { ok: body.ok === true };
          } catch {
            return { ok: false };
          }
        },
        afterClaimSuccess: async () => {
          setSignupCooldownRemaining(SIGNUP_EMAIL_COOLDOWN_SECONDS);
          if (!mailerLiteAttempted) {
            mailerLiteAttempted = true;
            try {
              await apiRequest('POST', '/api/addToMailerLite', {
                email: trimmedEmail,
                role: accountType,
                username: trimmedUsername,
              });
            } catch {
              // Non-blocking — do not fail signup after claim
            }
          }
          markOnboardingPendingForEmail(trimmedEmail);
          setPendingVerificationEmail(trimmedEmail);
          openVerificationModal();
        },
      });

      if (!flow.ok) {
        if (
          flow.message === SIGNUP_INVALID_DOB_MESSAGE ||
          flow.message.toLowerCase().includes('date of birth') ||
          flow.message.toLowerCase().includes('at least 13')
        ) {
          setDobError(flow.message);
        }
        setErrorMessage(flow.message);
        return;
      }
      return;
    } catch (error: unknown) {
      console.error('[SignUp] Unexpected signup error:', error);

      if (isAuthEmailRateLimitError(error)) {
        setErrorMessage(AUTH_EMAIL_RATE_LIMIT_MESSAGE);
      } else {
        const errMsg =
          error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
        setErrorMessage(errMsg || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto border-0 bg-transparent shadow-none">
      <CardHeader className="dubhub-prelogin-signup-header space-y-1 px-6 pb-2 pt-1 text-center">
        {/*
          Same brand-row geometry on Step 1 and Step 2 (pre-login onboarding pattern):
          [back | logo | spacer] so logo size/position stay identical when Back appears.
        */}
        <div className="dubhub-prelogin-signup-logo-gap mb-2 grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="justify-self-start">
            {signupStep === 2 ? (
              <button
                type="button"
                onClick={goBackToStep1}
                disabled={isLoading || hasSignupSucceeded}
                aria-label="Back"
                className={cn(
                  APP_MATERIAL_BACK_BUTTON_CLASS,
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
                data-testid="button-signup-back"
              >
                <ChevronLeft
                  className={APP_MATERIAL_BACK_ICON_CLASS}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            ) : null}
          </div>
          <div className="justify-self-center">
            <Logo size="xl" className={PRELOGIN_AUTH_LOGO_CLASS} />
          </div>
          <span aria-hidden />
        </div>
        <CardTitle className="text-2xl font-bold text-foreground bg-transparent">
          {signupStep === 1 ? "Join dub hub" : "About you"}
        </CardTitle>
        {signupStep === 1 ? (
          <CardDescription className="text-muted-foreground">
            {signupSubtitleForAccountType(accountType)}
          </CardDescription>
        ) : (
          <CardDescription className="mx-auto max-w-[20.5rem] text-muted-foreground">
            {/*
              Inline sentence + ? so the icon anchors to the end of the copy
              (including when the subtitle wraps), not a detached side column.
            */}
            A couple of details to finish setting up your account.{" "}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    PRELOGIN_MINI_SURFACE_CLASS,
                    "ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-[11px] font-medium leading-none text-muted-foreground touch-manipulation transition-[color,transform] duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1324] active:scale-95",
                  )}
                  aria-label="More info about About you"
                  data-testid="signup-about-you-info"
                >
                  ?
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={8}
                collisionPadding={12}
                className={cn(
                  PRELOGIN_SELECT_CONTENT_CLASS,
                  "z-[80] w-[min(18rem,calc(100vw-2rem))] max-w-[18rem] p-3 shadow-none",
                )}
                onOpenAutoFocus={(e) => e.preventDefault()}
                data-testid="signup-about-you-privacy-popover"
              >
                <p
                  className="text-xs font-normal leading-relaxed text-muted-foreground"
                  data-testid="signup-about-you-privacy-note"
                >
                  {SIGNUP_ABOUT_YOU_PRIVACY_NOTE}
                </p>
              </PopoverContent>
            </Popover>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-6 pb-3 pt-1">
        <form onSubmit={signupStep === 1 ? handleContinueStep1 : handleCreateAccount}>
          {signupStep === 1 ? (
          <div className={PRELOGIN_SIGNUP_FIELD_STACK_CLASS}>
          <div className="space-y-2">
            <Label htmlFor="accountType" className="text-foreground">Account Type</Label>
            <Select
              value={accountType}
              onValueChange={setAccountType}
              required
              disabled={hasSignupSucceeded}
            >
              <SelectTrigger
                id="accountType"
                className={PRELOGIN_FIELD_CLASS}
                data-testid="select-account-type"
              >
                <SelectValue placeholder="Select your account type" />
              </SelectTrigger>
              <SelectContent
                className={PRELOGIN_SELECT_CONTENT_CLASS}
                viewportClassName={PRELOGIN_SELECT_VIEWPORT_CLASS}
              >
                <SelectItem value="user" className={PRELOGIN_SELECT_ITEM_CLASS}>
                  Community Member
                </SelectItem>
                <SelectItem value="artist" className={PRELOGIN_SELECT_ITEM_CLASS}>
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
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={PRELOGIN_FIELD_CLASS}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              disabled={hasSignupSucceeded}
              data-testid="input-email"
            />
          </div>

          <div className={cn("space-y-2", PRELOGIN_FEEDBACK_GROUP_CLASS)}>
            <Label htmlFor="username" className="text-foreground">Username</Label>
            <Input
              id="username"
              type="text"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              className={cn(
                PRELOGIN_FIELD_CLASS,
                usernameError ? PRELOGIN_FIELD_INVALID_CLASS : "",
              )}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={3}
              maxLength={20}
              disabled={hasSignupSucceeded}
              data-testid="input-username"
              aria-invalid={!!usernameError}
              aria-describedby="username-status"
            />
            {/*
              Internal status may be checking/idle with no visible copy.
              Errors render whenever usernameError is set.
              Green availability only after confirmed available
              (ordinary vs Artist reserved acknowledgement).
            */}
            <div
              id="username-status"
              className={PRELOGIN_USERNAME_STATUS_CLASS}
              data-testid="username-status"
              aria-live="polite"
            >
              {usernameError ? (
                <p className="text-xs text-red-600" data-testid="text-username-error">
                  {usernameError}
                </p>
              ) : usernameStatus === 'available' ? (
                <p
                  className="text-xs text-green-600"
                  data-testid={
                    usernameAvailabilityReason === 'artist_reserved'
                      ? 'text-username-artist-reserved'
                      : 'text-username-available'
                  }
                >
                  {mapAvailableUsernameFeedback(usernameAvailabilityReason, accountType)}
                </p>
              ) : null}
            </div>
          </div>

          <div className={cn("space-y-2", PRELOGIN_FEEDBACK_GROUP_CLASS)}>
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={cn(PRELOGIN_FIELD_CLASS, "pr-10")}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={hasSignupSucceeded}
                data-testid="input-password"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={hasSignupSucceeded}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div
              className={PRELOGIN_PASSWORD_FEEDBACK_REGION_CLASS}
              data-testid="password-feedback-region"
            >
              {password.trim().length > 0 ? (
                <div className="space-y-1" data-testid="password-strength-indicator">
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
              ) : (
                <p
                  className="text-xs leading-snug text-muted-foreground"
                  data-testid="password-requirements"
                >
                  Must be at least 8 characters with uppercase, lowercase, and numbers
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className={cn(PRELOGIN_FIELD_CLASS, "pr-10")}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={hasSignupSucceeded}
                data-testid="input-confirm-password"
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                disabled={hasSignupSucceeded}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div
              className={PRELOGIN_CONFIRM_STATUS_CLASS}
              data-testid="confirm-password-status"
              aria-live="polite"
            >
              {confirmPasswordMismatch ? (
                <p className="text-xs text-red-600" data-testid="text-confirm-password-error">
                  Passwords do not match. Please try again
                </p>
              ) : null}
            </div>
          </div>
          </div>
          ) : (
          <div className={PRELOGIN_SIGNUP_FIELD_STACK_CLASS}>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth" className="text-foreground">
                Date of birth
              </Label>
              {/*
                Same closed-field geometry pattern as Submit Metadata played-date:
                overflow-contain wrapper + proven `dubhub-date-input` WebKit rules.
                Prelogin glass token kept so the field matches Email/Username chrome.
              */}
              <div className="dubhub-prelogin-dob-wrap relative isolate flex h-[2.8125rem] min-w-0 w-full max-w-full overflow-hidden rounded-[15px] [contain:inline-size]">
                <Input
                  id="dateOfBirth"
                  type="date"
                  name="bday"
                  value={dateOfBirth}
                  onChange={(e) => {
                    setDateOfBirth(e.target.value);
                    setDobError('');
                  }}
                  className={cn(
                    PRELOGIN_FIELD_CLASS,
                    "dubhub-date-input h-full min-h-0 max-h-full min-w-0 w-full max-w-full flex-1 basis-0 items-center justify-start px-3 py-0 pr-12 text-left [color-scheme:dark] md:text-sm",
                    "focus-visible:ring-offset-0",
                    dobError ? PRELOGIN_FIELD_INVALID_CLASS : "",
                  )}
                  autoComplete="bday"
                  required
                  disabled={hasSignupSucceeded}
                  data-testid="input-date-of-birth"
                  aria-invalid={!!dobError}
                  aria-describedby={dobError ? "dob-status" : undefined}
                />
              </div>
              {dobError ? (
                <div
                  id="dob-status"
                  className={PRELOGIN_CONFIRM_STATUS_CLASS}
                  data-testid="dob-status"
                  aria-live="polite"
                >
                  <p className="text-xs text-red-600" data-testid="text-dob-error">
                    {dobError}
                  </p>
                </div>
              ) : null}
            </div>

            <SignupAboutYouFields
              countryCode={countryCode}
              gender={gender}
              onCountryChange={setCountryCode}
              onGenderChange={setGender}
              disabled={hasSignupSucceeded}
            />
          </div>
          )}

          <div className={PRELOGIN_SIGNUP_CTA_WRAP_CLASS}>
            <Button
              type="submit"
              className={PRELOGIN_PRIMARY_CTA_CLASS}
              disabled={
                isLoading ||
                hasSignupSucceeded ||
                (signupStep === 1
                  ? !canAdvanceSignupStep1({
                      email,
                      username,
                      password,
                      confirmPassword,
                      accountType,
                      usernameReady: isUsernameReadyForCreateAccount(usernameStatus),
                      passwordCanSubmit: passwordStrengthResult.canSubmit,
                      passwordsMatch: !confirmPasswordMismatch && confirmPassword.length > 0,
                    })
                  : !canSubmitSignupStep2({
                      dateOfBirth,
                      countryCode,
                      gender,
                    }) ||
                    signupCooldownRemaining > 0)
              }
              data-testid={
                signupStep === 1 ? "button-signup-continue" : "button-create-account"
              }
            >
              {signupStep === 1
                ? isLoading
                  ? "Checking..."
                  : "Continue"
                : isLoading
                  ? "Creating Account..."
                  : signupCooldownRemaining > 0
                    ? `Please wait (${signupCooldownRemaining}s)`
                    : "Create Account"}
            </Button>
          </div>
          {signupStep === 2 && signupCooldownRemaining > 0 && !hasSignupSucceeded && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Please wait a moment before creating another account.
            </p>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-[15px] border border-red-500/40 bg-red-500/10 p-3">
              <p className="text-sm font-medium text-red-300" data-testid="text-error-message">{errorMessage}</p>
            </div>
          )}
        </form>

        <div className="text-center mt-4">
          <p className="text-muted-foreground text-[15px]">
            Already have an account?{' '}
            <button
              onClick={onToggleMode}
              className={PRELOGIN_LINK_CLASS}
            >
              Sign In
            </button>
          </p>
        </div>

        {signupStep === 2 ? (
          <p
            className="mx-auto mt-3 max-w-[20rem] px-1 text-center text-[11px] leading-relaxed text-muted-foreground/80"
            data-testid="signup-legal-acknowledgement"
          >
            By creating an account, you agree to our{" "}
            <a
              href={DUBHUB_SIGNUP_TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0a83ff]"
              data-testid="signup-legal-terms"
            >
              Terms of Use
            </a>{" "}
            and acknowledge our{" "}
            <a
              href={DUBHUB_SIGNUP_PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0a83ff]"
              data-testid="signup-legal-privacy"
            >
              Privacy Policy
            </a>
            .
          </p>
        ) : null}
      </CardContent>

      {/* Post-signup verification Dialog — dedicated confirmation (no success toast). */}
      <Dialog open={showVerificationModal} onOpenChange={handleVerificationModalOpenChange}>
        <DialogContent
          hideCloseButton
          overlayClassName={cn(AUTH_SURFACE_CLASS, PRELOGIN_DIALOG_OVERLAY_CLASS)}
          className={cn(AUTH_SURFACE_CLASS, PRELOGIN_DIALOG_CONTENT_CLASS)}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className={PRELOGIN_DIALOG_MAIL_WELL_CLASS}>
              <Mail className={PRELOGIN_DIALOG_MAIL_ICON_CLASS} aria-hidden />
            </div>
            <DialogTitle className="text-foreground text-center">Account Created</DialogTitle>
            <DialogDescription className="sr-only">
              {accountType === "artist"
                ? "Next steps: verify your email and verify your artist profile on Instagram."
                : "Next step: verify your email, then sign in."}
            </DialogDescription>
          </DialogHeader>

          {accountType === "artist" ? (
            <div className="space-y-5" data-testid="post-signup-artist-next-steps">
              <p className="text-sm font-medium text-foreground">What&apos;s next?</p>
              <ol className="space-y-4 text-left">
                <li className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    <span className="text-foreground">1.</span> Verify your email
                  </p>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ve sent a verification link to:
                  </p>
                  <p className="text-sm font-medium text-foreground break-all">{email.trim()}</p>
                </li>
                <li className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    <span className="text-foreground">2.</span> Verify your artist profile
                  </p>
                  <p className="text-sm text-muted-foreground">
                    DM @dubhub.uk from your official artist Instagram account and send us your dub
                    hub username:
                  </p>
                  {signupUsernameHandle ? (
                    <p
                      className="text-sm font-medium text-foreground"
                      data-testid="post-signup-artist-username"
                    >
                      {signupUsernameHandle}
                    </p>
                  ) : null}
                </li>
              </ol>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className={PRELOGIN_PRIMARY_CTA_CLASS}
                  onClick={handleArtistDmClick}
                  data-testid="button-artist-dm-instagram"
                >
                  {ARTIST_DM_CTA_LABEL}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto w-full py-2 text-sm font-semibold hover:bg-transparent",
                    PRELOGIN_LINK_CLASS,
                  )}
                  onClick={goToSignIn}
                  data-testid="button-post-signup-artist-sign-in"
                >
                  Go to Sign In
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Once you&apos;ve verified your email and we&apos;ve verified your artist profile,
                you&apos;ll be able to sign in.
              </p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="post-signup-community-next-steps">
              <p className="text-sm font-medium text-foreground text-center">Verify your email</p>
              <p className="text-sm text-muted-foreground text-center">
                We&apos;ve sent a verification link to:
              </p>
              <p
                className="text-sm font-medium text-foreground break-all text-center"
                data-testid="post-signup-community-email"
              >
                {email.trim()}
              </p>
              <p className="text-sm text-muted-foreground text-center">
                Please click the verification link in your email to activate your account. Once
                verified, you can return here and sign in. If it doesn&apos;t appear within a couple
                of minutes, please check your spam or junk folder.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className={PRELOGIN_PRIMARY_CTA_CLASS}
                  data-testid="button-post-signup-sign-in"
                  onClick={goToSignIn}
                >
                  Sign In
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
