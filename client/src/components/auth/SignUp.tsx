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

interface SignUpProps {
  onToggleMode: () => void;
  onAuthSuccess: (role: string) => void;
}

export function SignUp({ onToggleMode, onAuthSuccess }: SignUpProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountType, setAccountType] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const { toast } = useToast();
  
  // Initialize profanity filter
  const filter = new Filter();

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
              setUsernameError('Username already taken, please choose another.');
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

      // Enhanced password validation
      if (password.length < 8) {
        setErrorMessage('Password must be at least 8 characters long');
        return;
      }

      // Check for uppercase, lowercase, and number
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);

      if (!hasUppercase || !hasLowercase || !hasNumber) {
        setErrorMessage('Password must contain uppercase letters, lowercase letters, and numbers');
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
        setErrorMessage('Username already taken, please choose another.');
        return;
      }

      // Create Supabase auth user with ORIGINAL username (preserve casing)
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            username: trimmedUsername, // Send original username with casing preserved
            account_type: accountType,
          }
        }
      });

      // Check if user was created successfully (even if there's a warning/error)
      if (data?.user) {
        // User was created successfully - treat as success even if error exists
        // (magic-link scenarios may have warnings but user is still created)
        console.log('[SignUp] User created successfully:', data.user.id);
        
        // Log successful user creation
        console.log('[SignUp] User created in Supabase, profile will be auto-created by trigger');
        
        // DO NOT verify profile immediately - trigger creates it asynchronously
        // Any profile fetch here could fail due to RLS or timing, and we don't want that to block signup
        // The /api/users endpoint will handle checking if profile exists
        // Profile is automatically created by Supabase trigger (handle_new_user)
        // No need to manually insert into profiles table
        console.log('[SignUp] User created in Supabase, profile auto-created by trigger');

        // Create user in Neon database (critical - must succeed)
        // If this fails, we have an orphaned Supabase user, so we need robust error handling
        console.log('[SignUp] Creating Neon user with ID:', data.user.id);
        try {
          const response = await apiRequest('POST', '/api/users', {
            id: data.user.id,
            username: trimmedUsername, // Send original username with casing preserved
            displayName: trimmedUsername, // Use same username for display
            userType: accountType,
          });
          console.log('[SignUp] User created in Neon database successfully');
        } catch (neonError: any) {
          console.error('[SignUp] Neon database user creation error:', neonError);
          console.error('[SignUp] Error message:', neonError.message);
          
          // Parse error message from API response
          let errorMessage = '';
          let errorCode = '';
          let isUsernameConflict = false;
          
          try {
            // Error format from apiRequest: "statusCode: responseText"
            const errorText = neonError.message || '';
            const colonIndex = errorText.indexOf(':');
            if (colonIndex !== -1) {
              const statusCode = errorText.substring(0, colonIndex).trim();
              const responseText = errorText.substring(colonIndex + 1).trim();
              
              // Try to parse JSON response
              const jsonResponse = JSON.parse(responseText);
              errorMessage = jsonResponse.message || '';
              errorCode = jsonResponse.code || statusCode;
              
              // Check if this is a username conflict
              // Only show username error for actual conflicts
              isUsernameConflict = 
                errorCode === '23505' || // PostgreSQL unique violation
                errorMessage?.toLowerCase().includes('duplicate') ||
                errorMessage?.toLowerCase().includes('profiles_username') ||
                errorMessage?.toLowerCase().includes('already exists') ||
                errorMessage?.toLowerCase().includes("name's taken");
              
              console.log('[SignUp] Parsed error:', { errorMessage, errorCode, isUsernameConflict });
            }
          } catch (parseError) {
            // If parsing fails, check raw error message
            const rawMessage = neonError.message || '';
            isUsernameConflict = 
              rawMessage.includes('23505') ||
              rawMessage.toLowerCase().includes('duplicate') ||
              rawMessage.toLowerCase().includes('profiles_username') ||
              rawMessage.toLowerCase().includes('already exists');
            errorMessage = rawMessage;
            console.error('[SignUp] Error parsing API error response:', parseError);
          }
          
          // Only show username error for actual conflicts
          if (isUsernameConflict) {
            setErrorMessage('Username already taken, please choose another.');
          } else {
            // For other errors, show the actual error message
            setErrorMessage(errorMessage || 'Failed to create account. Please try again.');
          }
          
          // Don't show success toast or verification modal if Neon creation failed
          return;
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

        // Show verification modal
        setShowVerificationModal(true);
        return; // Success - exit early
      }

      // If we reach here, user was not created
      // Handle error only if user doesn't exist
      if (error) {
        // Check for specific error types
        const errorMessage = error.message || '';
        const errorCode = error.code || '';
        
        // Only show username error for actual conflicts
        const isUsernameConflict = 
          errorCode === '23505' || // PostgreSQL unique violation
          errorMessage.toLowerCase().includes('duplicate') ||
          errorMessage.toLowerCase().includes('profiles_username') ||
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes("name's taken");
        
        if (isUsernameConflict) {
          setErrorMessage('Username already taken, please choose another.');
        } else if (errorMessage.includes('already registered') || errorMessage.includes('email')) {
          setErrorMessage('An account with this email already exists');
        } else if (errorMessage.includes('Password should be') || errorMessage.includes('password')) {
          setErrorMessage('Password is too weak. Please use a stronger password');
        } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          setErrorMessage('Too many signup attempts. Please wait a moment and try again');
        } else {
          // Show actual Supabase error message, don't convert to username error
          setErrorMessage(errorMessage || 'Failed to create account. Please try again.');
        }
      } else {
        // No error but no user - might be magic-link scenario
        // Don't show error, just show email verification message
        toast({
          title: "Account Created",
          description: "Please check your email to verify your account.",
        });
        setShowVerificationModal(true);
      }
    } catch (error: any) {
      console.error('[SignUp] Unexpected signup error:', error);
      
      // Only show username error for actual conflicts
      const errorMessage = error.message || '';
      const isUsernameConflict = 
        errorMessage.toLowerCase().includes('duplicate') ||
        errorMessage.toLowerCase().includes('profiles_username') ||
        errorMessage.toLowerCase().includes('already exists') ||
        errorMessage.toLowerCase().includes("name's taken") ||
        errorMessage.includes('23505');
      
      if (isUsernameConflict) {
        setErrorMessage('Username already taken, please choose another.');
      } else if (errorMessage.includes('email') || errorMessage.includes('already registered')) {
        setErrorMessage('An account with this email already exists');
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        setErrorMessage('Too many signup attempts. Please wait a moment and try again');
      } else {
        // Show actual error message, don't convert to username error
        setErrorMessage(errorMessage || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-background border-border">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Logo size="lg" />
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
            <Select value={accountType} onValueChange={setAccountType} required>
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
              data-testid="input-password"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be at least 8 characters with uppercase, lowercase, and numbers
            </p>
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
              data-testid="input-confirm-password"
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isLoading || !!usernameError || username.length === 0}
            data-testid="button-create-account"
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>

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
      <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
        <DialogContent className="bg-background border-border">
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
            {accountType === 'artist' && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-yellow-800 text-sm font-medium text-center">
                  Please verify your email AND send a DM to @dubhub.uk on Instagram from your official artist account to have your profile marked as verified.
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button 
                onClick={() => {
                  setShowVerificationModal(false);
                  onToggleMode();
                }}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Go to Sign In
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowVerificationModal(false)}
                className="w-full border-border text-foreground hover:bg-muted"
              >
                I'll verify later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}