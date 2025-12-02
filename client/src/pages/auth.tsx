import { useState } from 'react';
import { SignIn } from '@/components/auth/SignIn';
import { SignUp } from '@/components/auth/SignUp';
import { Logo } from '@/components/brand/Logo';

interface AuthPageProps {
  onAuthSuccess: (role: string) => void;
  defaultToSignUp?: boolean;
}

export default function AuthPage({ onAuthSuccess, defaultToSignUp = false }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(defaultToSignUp);

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
  };

  const handleAuthSuccess = (userRole: string) => {
    // Store the role for immediate access
    localStorage.setItem('userRole', userRole);
    
    // Call the parent auth success handler
    onAuthSuccess(userRole);
    
    // Small delay to ensure state is updated before redirect
    // All users (including artists) go to main feed - unified experience
    setTimeout(() => {
      if (userRole === 'moderator') {
        window.location.pathname = '/'; // Moderators go to main feed for now
      } else {
        window.location.pathname = '/'; // All users and artists go to main feed
      }
    }, 100);
  };

  return (
    <div className="min-h-screen h-screen overflow-y-auto bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        
        {isSignUp ? (
          <SignUp onToggleMode={toggleMode} onAuthSuccess={handleAuthSuccess} />
        ) : (
          <SignIn onToggleMode={toggleMode} onAuthSuccess={handleAuthSuccess} />
        )}
      </div>
    </div>
  );
}