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

/**
 * While the keyboard is open, keep the focused signup field inside the visible
 * WKWebView. Padding on the scrollport itself does not extend scroll range.
 */
type SignupKeyboardFrame = {
  height: number;
  offsetTop: number;
  spacer: number;
};

function revealFocusedSignupField(container: HTMLElement, keyboardHeight: number) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !container.contains(active)) return;
  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const covered = Math.max(0, window.innerHeight - viewportHeight - offsetTop);
  // If the visual viewport did not shrink, the keyboard still covers the layout bottom.
  const obscured = covered >= 120 ? 0 : keyboardHeight;
  const visibleBottom = offsetTop + viewportHeight - obscured;
  const delta = active.getBoundingClientRect().bottom - (visibleBottom - 16);
  if (delta > 1) {
    container.scrollTop += delta;
  }
  if (window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }
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
  const [signupKeyboardFrame, setSignupKeyboardFrame] = useState<SignupKeyboardFrame | null>(null);
  useIosKeyboardResizeNone(true);
  const { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion } = useIosKeyboardAwareScroll({
    enabled: true,
    scrollContainerRef: authScrollRef,
  });

  useEffect(() => {
    if (!isNativeIos || !isSignUp || keyboardHeight <= 0) {
      setSignupKeyboardFrame(null);
      return;
    }
    const viewport = window.visualViewport;
    const measure = () => {
      const viewportHeight = Math.round(viewport?.height ?? window.innerHeight);
      const offsetTop = Math.round(viewport?.offsetTop ?? 0);
      const covered = Math.max(0, window.innerHeight - viewportHeight - offsetTop);
      const shrunk = covered >= 120;
      const next: SignupKeyboardFrame = {
        height: shrunk ? viewportHeight : window.innerHeight,
        offsetTop: shrunk ? offsetTop : 0,
        spacer: shrunk ? 0 : keyboardHeight + 16,
      };
      setSignupKeyboardFrame((prev) =>
        prev &&
        prev.height === next.height &&
        prev.offsetTop === next.offsetTop &&
        prev.spacer === next.spacer
          ? prev
          : next,
      );
    };
    measure();
    viewport?.addEventListener("resize", measure);
    return () => {
      viewport?.removeEventListener("resize", measure);
    };
  }, [isNativeIos, isSignUp, keyboardHeight]);

  useEffect(() => {
    if (!isSignUp || !signupKeyboardFrame) return;
    const container = authScrollRef.current;
    if (!container) return;
    const timers: number[] = [];
    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.length = 0;
    };
    const schedule = () => {
      clearTimers();
      revealFocusedSignupField(container, keyboardHeight);
      timers.push(window.setTimeout(() => revealFocusedSignupField(container, keyboardHeight), 80));
      timers.push(window.setTimeout(() => revealFocusedSignupField(container, keyboardHeight), 260));
      timers.push(window.setTimeout(() => revealFocusedSignupField(container, keyboardHeight), 480));
    };
    schedule();
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !container.contains(event.target)) return;
      schedule();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      clearTimers();
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [isSignUp, signupKeyboardFrame, keyboardHeight]);

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
      className={`${AUTH_SURFACE_CLASS} ${PRELOGIN_AUTH_CANVAS_CLASS} ${PRELOGIN_AUTH_PAGE_CLASS}${
        isSignUp && signupKeyboardFrame ? " touch-pan-y overscroll-y-contain" : ""
      }`}
      data-auth-surface=""
      data-prelogin-auth=""
      style={{
        WebkitOverflowScrolling: "touch",
        transition:
          isNativeIos && !prefersReducedMotion
            ? "padding-bottom 300ms ease-in-out"
            : undefined,
        paddingBottom:
          isNativeIos && keyboardHeight > 0 && !isSignUp
            ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
            : undefined,
        ...(isNativeIos && keyboardOpen
          ? { paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }
          : undefined),
        ...(isSignUp && signupKeyboardFrame
          ? {
              minHeight: 0,
              height: `${signupKeyboardFrame.height}px`,
              maxHeight: `${signupKeyboardFrame.height}px`,
              overflowY: "auto" as const,
              scrollPaddingBottom: `${keyboardHeight + 16}px`,
              transform: signupKeyboardFrame.offsetTop
                ? `translateY(${signupKeyboardFrame.offsetTop}px)`
                : undefined,
            }
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
      {isSignUp && signupKeyboardFrame && signupKeyboardFrame.spacer > 0 ? (
        <div
          aria-hidden
          data-testid="signup-keyboard-scroll-spacer"
          className="w-full shrink-0"
          style={{ height: signupKeyboardFrame.spacer }}
        />
      ) : null}
    </div>
  );
}
