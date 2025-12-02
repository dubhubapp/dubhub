import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/lib/user-context";
import { BottomNavigation } from "@/components/bottom-navigation";
import { supabase } from "@/lib/supabaseClient";

import Home from "@/pages/home";
import Submit from "@/pages/submit";
import TrimVideo from "@/pages/trim-video";
import SubmitMetadata from "@/pages/submit-metadata";
import ReleaseTracker from "@/pages/release-tracker";
import UserProfile from "@/pages/user-profile";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import ModeratorPage from "@/pages/moderator";
import Leaderboard from "@/pages/leaderboard";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
          // User is authenticated via Supabase
          setIsAuthenticated(true);
          
          // Fetch user profile to get role and check artist verification
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, username, avatar_url, account_type, moderator, verified_artist')
            .eq('id', session.user.id)
            .single();
          
          if (profileData) {
            // Block unverified artists from logging in
            if (profileData.account_type === 'artist' && !profileData.verified_artist) {
              console.warn('[App] Unverified artist blocked from login');
              await supabase.auth.signOut();
              setIsAuthenticated(false);
              setUserRole('user');
              localStorage.removeItem('dubhub-authenticated');
              localStorage.removeItem('dubhub-user-role');
              alert('Your artist account is awaiting verification.');
              setIsLoading(false);
              return;
            }
            
            let userRole = profileData.account_type || 'user';
            if (profileData.moderator) {
              userRole = 'moderator';
            }
            setUserRole(userRole);
            // Also store in localStorage for backward compatibility
            localStorage.setItem('dubhub-authenticated', 'true');
            localStorage.setItem('dubhub-user-role', userRole);
          } else {
            setUserRole('user');
          }
        } else {
          setIsAuthenticated(false);
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
        setIsAuthenticated(true);
        // Fetch role and check artist verification
        supabase
          .from('profiles')
          .select('id, email, username, avatar_url, account_type, moderator, verified_artist')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profileData }) => {
            if (profileData) {
              // Block unverified artists from logging in
              if (profileData.account_type === 'artist' && !profileData.verified_artist) {
                console.warn('[App] Unverified artist blocked from login');
                supabase.auth.signOut();
                setIsAuthenticated(false);
                setUserRole('user');
                localStorage.removeItem('dubhub-authenticated');
                localStorage.removeItem('dubhub-user-role');
                alert('Your artist account is awaiting verification.');
                return;
              }
              
              let userRole = profileData.account_type || 'user';
              if (profileData.moderator) {
                userRole = 'moderator';
              }
              setUserRole(userRole);
              localStorage.setItem('dubhub-authenticated', 'true');
              localStorage.setItem('dubhub-user-role', userRole);
            }
          });
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUserRole('user');
        localStorage.removeItem('dubhub-authenticated');
        localStorage.removeItem('dubhub-user-role');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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
    
    // Clear any other potential storage items
    localStorage.clear();
    sessionStorage.clear();
    
    // Reset authentication state
    setIsAuthenticated(false);
    setUserRole('user');
  };

  if (isLoading) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="h-screen bg-background flex items-center justify-center">
            <div className="text-foreground text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading...</p>
            </div>
          </div>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthPage onAuthSuccess={handleAuthSuccess} defaultToSignUp={false} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Create a wrapper component for UserProfile that has access to handleSignOut
  const UserProfileWithSignOut = () => <UserProfile onSignOut={handleSignOut} />;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UserProvider>
          <Toaster />
          <div className="h-screen flex flex-col bg-background text-foreground">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/submit" component={Submit} />
              <Route path="/trim-video" component={TrimVideo} />
              <Route path="/submit-metadata" component={SubmitMetadata} />
              <Route path="/releases" component={ReleaseTracker} />
              <Route path="/leaderboard" component={Leaderboard} />
              <Route path="/profile" component={UserProfileWithSignOut} />
              <Route path="/moderator" component={ModeratorPage} />
              <Route component={NotFound} />
            </Switch>
            <BottomNavigation />
          </div>
        </UserProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
