import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@shared/schema";

interface SupabaseProfile {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  account_type: string;
  verified_artist: boolean | null;
  moderator: boolean;
}

interface UserContextType {
  currentUser: User | null;
  userType: "user" | "artist" | "moderator";
  profileImage: string | null;
  displayName: string | null;
  username: string | null;
  verifiedArtist: boolean; // Whether current user is a verified artist
  isLoading: boolean;
  isAuthenticated: boolean;
  updateProfileImage: (url: string) => void;
  updateDisplayName: (name: string) => void;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userType, setUserType] = useState<"user" | "artist" | "moderator">("user");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [verifiedArtist, setVerifiedArtist] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Load profile from Supabase on mount and auth changes
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[UserContext] Error getting session:', sessionError);
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
        
        if (!session?.user) {
          // No session - clear all profile data
          setProfileImage(null);
          setDisplayName(null);
          setUsername(null);
          setUserType("user");
          setCurrentUser(null);
          setVerifiedArtist(false);
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        // Fetch real profile from Supabase
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, username, avatar_url, account_type, verified_artist, moderator')
          .eq('id', session.user.id)
          .single();

        if (profileError || !profileData) {
          console.error('[UserContext] Error loading profile:', profileError);
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        // Use ONLY real data from Supabase
        setUsername(profileData.username || null);
        setDisplayName(profileData.username || null); // Use username as display name
        setProfileImage(profileData.avatar_url || null);
        
        // Set verified artist status
        const isVerifiedArtist = profileData.account_type === "artist" && profileData.verified_artist === true;
        setVerifiedArtist(isVerifiedArtist);
        
        // Set user type
        let role: "user" | "artist" | "moderator" = "user";
        if (profileData.moderator) {
          role = "moderator";
        } else if (profileData.account_type === "artist") {
          role = "artist";
        }
        setUserType(role);

        // Create User object for compatibility
        setCurrentUser({
          id: profileData.id,
          username: profileData.username,
          displayName: profileData.username,
          userType: profileData.account_type as "user" | "artist",
          profileImage: profileData.avatar_url || null,
          isVerified: isVerifiedArtist, // Use verified_artist from Supabase
          level: 1,
          currentXP: 0,
          memberSince: new Date(),
          createdAt: new Date(),
        } as unknown as User);
        
        setIsAuthenticated(true);
        setIsLoading(false);
      } catch (error) {
        console.error('[UserContext] Error loading profile:', error);
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    };

    loadProfile();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadProfile();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const updateProfileImage = (url: string) => {
    setProfileImage(url);
    // Update in Supabase
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from('profiles')
          .update({ avatar_url: url })
          .eq('id', user.id);
      }
    });
  };

  const updateDisplayName = (name: string) => {
    setDisplayName(name);
    // Note: Display name is typically the username, but we can update if needed
  };

  return (
    <UserContext.Provider value={{ 
      currentUser: currentUser || null, 
      userType, 
      profileImage, 
      displayName,
      username,
      verifiedArtist,
      isLoading,
      isAuthenticated,
      updateProfileImage,
      updateDisplayName
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
}
