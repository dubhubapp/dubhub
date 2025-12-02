import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/brand/Logo';

interface SignInProps {
  onToggleMode: () => void;
  onAuthSuccess: (role: string) => void;
}

export function SignIn({ onToggleMode, onAuthSuccess }: SignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

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
          // For security, we'll show a generic message for invalid credentials
          // In practice, this could be either wrong email or wrong password
          setErrorMessage('No account found with this email');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMessage('Please check your email and confirm your account');
        } else if (error.message.includes('Too many requests')) {
          setErrorMessage('Too many sign in attempts. Please try again later');
        } else if (error.message.includes('User not found')) {
          setErrorMessage('No account found with this email');
        } else if (error.message.includes('Wrong password')) {
          setErrorMessage('Incorrect password. Please try again');
        } else {
          setErrorMessage('No account found with this email');
        }
        return;
      }

      if (data.user) {
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
          setErrorMessage('Account found but profile data is missing. Please contact support');
          return;
        }

        // Block unverified artists from logging in
        if (profileData.account_type === 'artist' && !profileData.verified_artist) {
          console.warn('[SignIn] Unverified artist blocked from login');
          await supabase.auth.signOut();
          setErrorMessage('Your artist account is awaiting verification.');
          return;
        }

        // Determine user role based on profile data
        let userRole = profileData.account_type || 'user';
        
        // If user is a moderator, update role to include moderator status
        if (profileData.moderator) {
          userRole = 'moderator';
        }

        toast({
          title: "Signed In",
          description: `Welcome back, ${profileData.username}!`,
        });

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
    <Card className="w-full max-w-md mx-auto bg-background border-border">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Logo size="lg" />
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
              placeholder="Enter your email"
              className="bg-input border-border text-foreground placeholder-muted-foreground"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="bg-input border-border text-foreground placeholder-muted-foreground"
              required
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isLoading}
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>

          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm font-medium">{errorMessage}</p>
            </div>
          )}
        </form>
        
        <div className="text-center mt-4">
          <p className="text-muted-foreground text-sm">
            Don't have an account?{' '}
            <button
              onClick={onToggleMode}
              className="text-accent hover:underline"
            >
              Sign Up
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}