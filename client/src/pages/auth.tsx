import { useRef, useState } from 'react';
import { SignIn } from '@/components/auth/SignIn';
import { SignUp } from '@/components/auth/SignUp';
import { Logo } from '@/components/brand/Logo';
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";

interface AuthPageProps {
  onAuthSuccess: (role: string) => void;
  defaultToSignUp?: boolean;
}

export default function AuthPage({ onAuthSuccess, defaultToSignUp = false }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(defaultToSignUp);
  const authScrollRef = useRef<HTMLDivElement | null>(null);
  useIosKeyboardResizeNone(true);
  const { isNativeIos, keyboardHeight } = useIosKeyboardAwareScroll({
    enabled: true,
    scrollContainerRef: authScrollRef,
  });

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
    <div
      ref={authScrollRef}
      className="min-h-screen h-screen overflow-y-auto bg-[#0f1324] flex items-start sm:items-center justify-center px-4 pt-6 sm:pt-8"
      style={{
        paddingBottom:
          isNativeIos && keyboardHeight > 0
            ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
            : undefined,
      }}
    >
      <div className="w-full max-w-md py-2">
        
        {isSignUp ? (
          <SignUp onToggleMode={toggleMode} onAuthSuccess={handleAuthSuccess} />
        ) : (
          <SignIn onToggleMode={toggleMode} onAuthSuccess={handleAuthSuccess} />
        )}
      </div>
    </div>
  );
}