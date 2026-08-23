import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { SignIn } from '@/components/auth/SignIn';
import { SignUp } from '@/components/auth/SignUp';
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import { EMAIL_VERIFIED_SESSION_STORAGE_KEY } from "@/lib/auth-session-utils";
import { AUTH_SURFACE_CLASS } from "@/lib/auth-surface";
import {
  PRELOGIN_AUTH_CANVAS_CLASS,
  PRELOGIN_AUTH_PAGE_CLASS,
  PRELOGIN_SIGNIN_CENTER_INNER_CLASS,
  PRELOGIN_SIGNIN_COLUMN_CLASS,
  PRELOGIN_SIGNUP_COLUMN_CLASS,
} from "@/lib/prelogin-material";

interface AuthPageProps {
  onAuthSuccess: (role: string) => void;
  defaultToSignUp?: boolean;
  /** Presentation-only signup Select preselection. Not persisted. */
  initialAccountType?: "user" | "artist";
  /** Shown when JWT exists but profile row is missing (App-level gate). */
  authBanner?: string | null;
}

export default function AuthPage({
  onAuthSuccess,
  defaultToSignUp = false,
  initialAccountType,
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

  const banners =
    authBanner || showEmailVerifiedNotice ? (
      <div className="mb-2 flex flex-col items-center gap-2">
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
    ) : null;

  return (
    <div
      ref={authScrollRef}
      className={`${AUTH_SURFACE_CLASS} ${PRELOGIN_AUTH_CANVAS_CLASS} ${PRELOGIN_AUTH_PAGE_CLASS}`}
      data-auth-surface=""
      data-prelogin-auth=""
      style={{
        WebkitOverflowScrolling: "touch",
        transition:
          isNativeIos && !prefersReducedMotion
            ? "padding-bottom 300ms ease-in-out"
            : undefined,
        paddingBottom:
          isNativeIos && keyboardHeight > 0
            ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
            : undefined,
        ...(isNativeIos && keyboardOpen
          ? { paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }
          : undefined),
      }}
    >
      {isSignUp ? (
        <div className={PRELOGIN_SIGNUP_COLUMN_CLASS}>
          {banners}
          <SignUp
            onToggleMode={toggleMode}
            onAuthSuccess={handleAuthSuccess}
            initialAccountType={initialAccountType}
          />
        </div>
      ) : (
        <div className={PRELOGIN_SIGNIN_COLUMN_CLASS}>
          <div className={PRELOGIN_SIGNIN_CENTER_INNER_CLASS}>
            {banners}
            <SignIn onToggleMode={toggleMode} onAuthSuccess={handleAuthSuccess} />
          </div>
        </div>
      )}
    </div>
  );
}
