import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/lib/user-context";
import { SubmitClipProvider } from "@/lib/submit-clip-context";
import { SubmitClipDrawer } from "@/components/submit-clip-drawer";
import { ConditionalBottomNavigation } from "@/components/conditional-bottom-navigation";
import { ReleaseDropDayBanner } from "@/components/release-drop-day-banner";
import { PasswordRecoveryRedirect } from "@/components/auth/PasswordRecoveryRedirect";
import { supabase } from "@/lib/supabaseClient";

import Home from "@/pages/home";
import Submit from "@/pages/submit";
import TrimVideo from "@/pages/trim-video";
import SubmitMetadata from "@/pages/submit-metadata";
import ReleaseTracker from "@/pages/release-tracker";
import ReleaseDetail from "@/pages/release-detail";
import ReleaseCreate from "@/pages/release-create";
import ReleaseEdit from "@/pages/release-edit";
import UserProfile from "@/pages/user-profile";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import ResetPasswordPage from "@/pages/reset-password";
import AuthCallbackPage from "@/pages/auth-callback";
import ModeratorPage from "@/pages/moderator";
import Leaderboard from "@/pages/leaderboard";
import SettingsPage from "@/pages/settings";
import { APP_MAIN_SHELL_BASE, APP_SHELL_SAFE_TOP_CLASS } from "@/lib/app-shell-layout";
import { HomeFeedInteractionProvider } from "@/lib/home-feed-interaction-context";
import { AppLaunchSplash } from "@/components/brand/app-launch-splash";
import { clearDubhubTrimSession } from "@/lib/dubhub-trim-session";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import { disposeTrimExportResources, getTrimExportResourceState } from "@/lib/export-trimmed-video";
import { FirstLoginOnboardingModal } from "@/components/first-login-onboarding-modal";
import {
  clearPendingOnboardingForEmail,
  HOME_FEED_READY_EVENT,
  ONBOARDING_ACTIVE_SESSION_KEY,
  getOnboardingSeenKey,
  hasPendingOnboardingForEmail,
  WELCOME_BACK_FLAG_KEY,
} from "@/lib/onboarding";

function AuthenticatedMainShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const prevLocationRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevLocationRef.current;
    prevLocationRef.current = location;
    if (prev && prev !== location) {
      dubhubVideoDebugLog("[DubHub][PostFlow][route]", "route changed", {
        from: prev,
        to: location,
      });
    }
    if (location !== "/") return;
    // Isolation mode: disable route-based epoch bump.
    // Keep explicit cancel-path epoch increments only.
    if (prev === "/trim-video" || prev === "/submit-metadata" || prev === "/submit") {
      dubhubVideoDebugLog("[DubHub][PostFlow][resource]", "home-return resource snapshot", {
        fromRoute: prev,
        ...getTrimExportResourceState(),
      });
      void disposeTrimExportResources("app-home-return-cleanup");
      dubhubVideoDebugLog("[DubHub][VideoCard][reset]", "route-based epoch increment disabled", {
        fromRoute: prev,
        toRoute: location,
      });
      dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "clear trim session on return Home", {
        from: prev,
        to: location,
      });
      clearDubhubTrimSession();
    }
  }, [location]);

  const shellClass =
    location === "/"
      ? APP_MAIN_SHELL_BASE
      : `${APP_MAIN_SHELL_BASE} ${APP_SHELL_SAFE_TOP_CLASS}`;
  return (
    <div data-app-shell className={shellClass}>
      {children}
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [isLoading, setIsLoading] = useState(true);
  const [firstLoginOnboarding, setFirstLoginOnboarding] = useState<{
    open: boolean;
    audience: "user" | "artist";
    userId: string | null;
    email: string | null;
  }>({
    open: false,
    audience: "user",
    userId: null,
    email: null,
  });
  const [isHomeFeedReady, setIsHomeFeedReady] = useState(false);
  const [enforcementState, setEnforcementState] = useState<{ banned: boolean; suspendedUntil: string | null }>({
    banned: false,
    suspendedUntil: null,
  });

  useEffect(() => {
    const maybeQueueFirstLoginOnboarding = ({
      userId,
      email,
      accountType,
      verifiedArtist,
      emailConfirmed,
    }: {
      userId: string;
      email: string | null | undefined;
      accountType: string | null | undefined;
      verifiedArtist: boolean | null | undefined;
      emailConfirmed: boolean;
    }) => {
      const seenKey = getOnboardingSeenKey(userId);
      if (localStorage.getItem(seenKey) === "1") return;
      if (!emailConfirmed) return;
      if (accountType === "artist" && !verifiedArtist) return;
      if (!hasPendingOnboardingForEmail(email)) return;

      // Prioritize first-login onboarding over returning-user welcome toast.
      sessionStorage.removeItem(WELCOME_BACK_FLAG_KEY);
      setFirstLoginOnboarding({
        open: isHomeFeedReady,
        audience: accountType === "artist" ? "artist" : "user",
        userId,
        email: email ?? null,
      });
    };

    // Check Supabase authentication session
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth check error:', error);
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        if (session?.user) {
          // Validate account state before marking the app session authenticated.
          
          // Fetch user profile to get role and check artist verification
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, username, avatar_url, account_type, moderator, verified_artist, suspended_until, banned')
            .eq('id', session.user.id)
            .single();
          
          if (profileData) {
            const suspendedUntil = profileData.suspended_until ? new Date(profileData.suspended_until) : null;
            const isSuspended = !!suspendedUntil && suspendedUntil.getTime() > Date.now();
            const isBanned = profileData.banned === true;
            if (isBanned || isSuspended) {
              setIsAuthenticated(false);
              setIsHomeFeedReady(false);
              setEnforcementState({
                banned: isBanned,
                suspendedUntil: isSuspended ? profileData.suspended_until : null,
              });
              setIsLoading(false);
              return;
            }
            setEnforcementState({ banned: false, suspendedUntil: null });
            // Block unverified artists from logging in
            if (profileData.account_type === 'artist' && !profileData.verified_artist) {
              console.warn('[App] Unverified artist blocked from login');
              await supabase.auth.signOut();
              setIsAuthenticated(false);
              setIsHomeFeedReady(false);
              setUserRole('user');
              localStorage.removeItem('dubhub-authenticated');
              localStorage.removeItem('dubhub-user-role');
              setIsLoading(false);
              return;
            }
            
            let userRole = profileData.account_type || 'user';
            if (profileData.moderator) {
              userRole = 'moderator';
            }
            setIsAuthenticated(true);
            setUserRole(userRole);
            maybeQueueFirstLoginOnboarding({
              userId: profileData.id,
              email: profileData.email ?? session.user.email,
              accountType: profileData.account_type,
              verifiedArtist: profileData.verified_artist,
              emailConfirmed: !!session.user.email_confirmed_at,
            });
            // Also store in localStorage for backward compatibility
            localStorage.setItem('dubhub-authenticated', 'true');
            localStorage.setItem('dubhub-user-role', userRole);
          } else {
            setIsAuthenticated(true);
            setUserRole('user');
          }
        } else {
          setIsAuthenticated(false);
        setIsHomeFeedReady(false);
        setEnforcementState({ banned: false, suspendedUntil: null });
          // Clear localStorage if no session
          localStorage.removeItem('dubhub-authenticated');
          localStorage.removeItem('dubhub-user-role');
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Fetch role and check artist verification before allowing app entry.
        supabase
          .from('profiles')
          .select('id, email, username, avatar_url, account_type, moderator, verified_artist, suspended_until, banned')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profileData }) => {
            if (profileData) {
              const suspendedUntil = profileData.suspended_until ? new Date(profileData.suspended_until) : null;
              const isSuspended = !!suspendedUntil && suspendedUntil.getTime() > Date.now();
              const isBanned = profileData.banned === true;
              if (isBanned || isSuspended) {
                setIsAuthenticated(false);
                setIsHomeFeedReady(false);
                setEnforcementState({
                  banned: isBanned,
                  suspendedUntil: isSuspended ? profileData.suspended_until : null,
                });
                return;
              }
              setEnforcementState({ banned: false, suspendedUntil: null });
              // Block unverified artists from logging in
              if (profileData.account_type === 'artist' && !profileData.verified_artist) {
                console.warn('[App] Unverified artist blocked from login');
                supabase.auth.signOut();
                setIsAuthenticated(false);
                setIsHomeFeedReady(false);
                setUserRole('user');
                localStorage.removeItem('dubhub-authenticated');
                localStorage.removeItem('dubhub-user-role');
                return;
              }
              
              let userRole = profileData.account_type || 'user';
              if (profileData.moderator) {
                userRole = 'moderator';
              }
              setIsAuthenticated(true);
              setUserRole(userRole);
              maybeQueueFirstLoginOnboarding({
                userId: profileData.id,
                email: profileData.email ?? session.user.email,
                accountType: profileData.account_type,
                verifiedArtist: profileData.verified_artist,
                emailConfirmed: !!session.user.email_confirmed_at,
              });
              localStorage.setItem('dubhub-authenticated', 'true');
              localStorage.setItem('dubhub-user-role', userRole);
            }
          });
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUserRole('user');
        setIsHomeFeedReady(false);
        setEnforcementState({ banned: false, suspendedUntil: null });
        localStorage.removeItem('dubhub-authenticated');
        localStorage.removeItem('dubhub-user-role');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onHomeFeedReady = () => setIsHomeFeedReady(true);
    window.addEventListener(HOME_FEED_READY_EVENT, onHomeFeedReady);
    return () => window.removeEventListener(HOME_FEED_READY_EVENT, onHomeFeedReady);
  }, []);

  useEffect(() => {
    if (!isHomeFeedReady) return;
    setFirstLoginOnboarding((prev) => {
      if (!prev.userId || prev.open) return prev;
      return { ...prev, open: true };
    });
  }, [isHomeFeedReady]);

  useEffect(() => {
    if (firstLoginOnboarding.open) {
      sessionStorage.setItem(ONBOARDING_ACTIVE_SESSION_KEY, "1");
      return;
    }
    sessionStorage.removeItem(ONBOARDING_ACTIVE_SESSION_KEY);
  }, [firstLoginOnboarding.open]);

  useLayoutEffect(() => {
    document.documentElement.removeAttribute("data-dubhub-launch-bg");
  }, []);

  const handleAuthSuccess = (role: string) => {
    localStorage.setItem('dubhub-authenticated', 'true');
    localStorage.setItem('dubhub-user-role', role);
    setIsAuthenticated(true);
    setUserRole(role);
    setIsLoading(false);
  };

  const handleSignOut = async () => {
    // Sign out from Supabase
    await supabase.auth.signOut();

    // Clear all authentication and user data from localStorage and sessionStorage
    localStorage.removeItem('dubhub-authenticated');
    localStorage.removeItem('dubhub-user-role');
    localStorage.removeItem('dubhub-profile-image');
    localStorage.removeItem('dubhub-display-name');
    localStorage.removeItem('userRole');
    localStorage.removeItem('dubhub-signup-role');

    // Keep device-level preferences (e.g. theme) intact across logout/login.
    sessionStorage.clear();
    
    // Reset authentication state
    setIsAuthenticated(false);
    setUserRole('user');
    setFirstLoginOnboarding({ open: false, audience: "user", userId: null, email: null });
  };

  const handleDismissFirstLoginOnboarding = () => {
    const userId = firstLoginOnboarding.userId;
    if (userId) {
      localStorage.setItem(getOnboardingSeenKey(userId), "1");
    }
    clearPendingOnboardingForEmail(firstLoginOnboarding.email);
    setFirstLoginOnboarding((prev) => ({ ...prev, open: false }));
  };

  if (isLoading) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppLaunchSplash />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Switch>
              <Route path="/auth-callback" component={AuthCallbackPage} />
              <Route path="/reset-password" component={ResetPasswordPage} />
              <Route>
                <AuthPage onAuthSuccess={handleAuthSuccess} defaultToSignUp={false} />
              </Route>
            </Switch>
            <Toaster />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (enforcementState.banned || enforcementState.suspendedUntil) {
    const suspendedText = enforcementState.suspendedUntil
      ? new Date(enforcementState.suspendedUntil).toLocaleString()
      : null;
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 w-full items-center justify-center bg-background px-6 py-8">
            <div className="max-w-md w-full rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center">
              <h1 className="text-2xl font-bold text-red-300 mb-2">
                {enforcementState.banned ? "Account permanently banned" : "Account temporarily suspended"}
              </h1>
              <p className="text-sm text-red-100/90 mb-4">
                {enforcementState.banned
                  ? "Your account has been permanently banned due to repeated violations of community guidelines."
                  : `Your account is suspended until ${suspendedText}.`}
              </p>
              <button
                className="inline-flex items-center justify-center rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-500/90"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          </div>
          <Toaster />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Wrapper for settings actions that require app-level sign-out behavior
  const SettingsWithSignOut = () => <SettingsPage onSignOut={handleSignOut} />;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UserProvider>
          <SubmitClipProvider>
          <HomeFeedInteractionProvider>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PasswordRecoveryRedirect />
          <FirstLoginOnboardingModal
            open={firstLoginOnboarding.open}
            audience={firstLoginOnboarding.audience}
            onDismiss={handleDismissFirstLoginOnboarding}
          />
          <Toaster />
          <div
            data-app-root="true"
            className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
          >
            <AuthenticatedMainShell>
            <Switch>
              <Route path="/auth-callback" component={AuthCallbackPage} />
              <Route path="/reset-password" component={ResetPasswordPage} />
              <Route path="/" component={Home} />
              <Route path="/submit" component={Submit} />
              <Route path="/trim-video" component={TrimVideo} />
              <Route path="/submit-metadata" component={SubmitMetadata} />
              <Route path="/releases/new" component={ReleaseCreate} />
              <Route path="/releases/:id/edit" component={ReleaseEdit} />
              <Route path="/releases/:id" component={ReleaseDetail} />
              <Route path="/releases" component={ReleaseTracker} />
              <Route path="/leaderboard" component={Leaderboard} />
              <Route path="/profile" component={UserProfile} />
              <Route path="/settings" component={SettingsWithSignOut} />
              <Route path="/moderator" component={ModeratorPage} />
              <Route component={NotFound} />
            </Switch>
            </AuthenticatedMainShell>
            <SubmitClipDrawer />
            <ConditionalBottomNavigation />
            <ReleaseDropDayBanner />
          </div>
          </div>
          </HomeFeedInteractionProvider>
          </SubmitClipProvider>
        </UserProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
