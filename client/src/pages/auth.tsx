import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { SignIn } from '@/components/auth/SignIn';
import { SignUp } from '@/components/auth/SignUp';
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import { EMAIL_VERIFIED_SESSION_STORAGE_KEY } from "@/lib/auth-session-utils";

interface AuthPageProps {
  onAuthSuccess: (role: string) => void;
  defaultToSignUp?: boolean;
  /** Shown when JWT exists but profile row is missing (App-level gate). */
  authBanner?: string | null;
}

export default function AuthPage({
  onAuthSuccess,
  defaultToSignUp = false,
  authBanner = null,
}: AuthPageProps) {
  const [, setLocation] = useLocation();
  const [isSignUp, setIsSignUp] = useState(defaultToSignUp);
  const [showEmailVerifiedNotice, setShowEmailVerifiedNotice] = useState(false);
  const authScrollRef = useRef<HTMLDivElement | null>(null);
  useIosKeyboardResizeNone(true);
  const { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion } = useIosKeyboardAwareScroll({
    enabled: true,
    scrollContainerRef: authScrollRef,
  });

  useEffect(() => {
    try {
      if (sessionStorage.getItem(EMAIL_VERIFIED_SESSION_STORAGE_KEY) === "1") {
        sessionStorage.removeItem(EMAIL_VERIFIED_SESSION_STORAGE_KEY);
        setShowEmailVerifiedNotice(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setShowEmailVerifiedNotice(false);
  };

  const handleAuthSuccess = (userRole: string) => {
    localStorage.setItem('userRole', userRole);
    onAuthSuccess(userRole);
    queueMicrotask(() => {
      setLocation("/", { replace: true });
    });
  };

  return (
    <div
      ref={authScrollRef}
      className={`min-h-screen h-screen overflow-y-auto bg-[#0f1324] flex items-center justify-center px-4 ${
        isNativeIos && keyboardOpen ? "pt-4" : "py-8"
      }`}
      style={{
        WebkitOverflowScrolling: "touch",
        transition:
          isNativeIos && !prefersReducedMotion
            ? "padding-bottom 300ms ease-in-out, padding-top 300ms ease-in-out"
            : undefined,
        paddingBottom:
          isNativeIos && keyboardHeight > 0
            ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
            : undefined,
      }}
    >
      <div className="w-full max-w-md py-2 -translate-y-4 sm:-translate-y-6">
        <div className="mb-4 flex flex-col items-center gap-3">
          {authBanner ? (
            <p className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-100/95">
              {authBanner}
            </p>
          ) : null}
          {showEmailVerifiedNotice ? (
            <p className="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-100/95">
              Your email is verified. Sign in below to finish opening dub hub.
            </p>
          ) : null}
        </div>
        
        {isSignUp ? (
          <SignUp onToggleMode={toggleMode} onAuthSuccess={handleAuthSuccess} />
        ) : (
          <SignIn onToggleMode={toggleMode} onAuthSuccess={handleAuthSuccess} />
        )}
      </div>
    </div>
  );
}