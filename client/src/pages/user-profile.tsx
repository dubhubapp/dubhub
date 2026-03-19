import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Settings, Bell, ChevronRight, LogOut, Edit2, Camera, Check, X, Upload, MessageCircle, Heart, Bookmark, User, CheckCircle, BadgeCheck, Calendar, CalendarClock, Radio, Users, Headphones } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useRef, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabaseClient';
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { UserStats, NotificationWithUser, PostWithUser } from "@shared/schema";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { GoldVerifiedTick, goldAvatarGlowShadowClass } from "@/components/verified-artist";

interface UserProfileProps {
  onSignOut?: () => void;
}

export default function UserProfile(props: any = {}) {
  const { onSignOut } = props;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage, displayName, username, updateProfileImage, updateDisplayName, currentUser, verifiedArtist, userType } = useUser();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [postFilter, setPostFilter] = useState<"all" | "identified" | "unidentified">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();
  const { data: userStats, isLoading: statsLoading, isError: statsError } = useQuery<UserStats>({
    queryKey: ["/api/user", currentUser?.id, "stats"],
    enabled: !!currentUser?.id,
    retry: false,
  });

  type ArtistStats = {
    confirmedTracks: number;
    releasesCreated: number;
    upcomingReleases: number;
    postsFeaturingTracks: number;
    totalLikesAcrossPosts: number;
    totalCommentsAcrossPosts: number;
    uniqueUploaders: number;
    collaborations: number;
  };

  const { data: artistStats } = useQuery<ArtistStats>({
    queryKey: ["/api/artists", currentUser?.id, "stats"],
    enabled: !!currentUser?.id && userType === "artist",
    retry: false,
  });

  // Karma system
  const { data: karmaData, isLoading: reputationLoading, isError: karmaError } = useQuery<{karma: number}>({
    queryKey: ["/api/user", currentUser?.id, "karma"],
    enabled: !!currentUser?.id,
    retry: false,
  });
  const userReputation = karmaData ? { reputation: karmaData.karma, confirmedIds: userStats?.confirmedIDs || 0 } : { reputation: 0, confirmedIds: userStats?.confirmedIDs || 0 };

  // Query for user's liked posts
  const { data: likedPosts = [], isLoading: likedLoading } = useQuery<PostWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "liked-posts"],
    enabled: !!currentUser?.id,
  });

  // Saved posts removed - no longer supported
  const savedPosts: PostWithUser[] = [];
  const savedLoading = false;

  // Query for user's posts
  const { data: userPosts = [], isLoading: postsLoading } = useQuery<PostWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "posts"],
    enabled: !!currentUser?.id,
  });

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "notifications"],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: unreadCountData, isError: unreadCountError } = useQuery<{ count: number }>({
    queryKey: ["/api/user", currentUser?.id, "notifications", "unread-count"],
    enabled: !!currentUser?.id,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const unreadCount = unreadCountData?.count || 0;

  // Filter posts based on verification status
  const filteredPosts = useMemo(() => {
    if (postFilter === "all") {
      return userPosts;
    } else if (postFilter === "identified") {
      return userPosts.filter(post => 
        post.verificationStatus === "identified" || 
        post.verificationStatus === "community"
      );
    } else {
      // unidentified
      return userPosts.filter(post => 
        post.verificationStatus === "unverified"
      );
    }
  }, [userPosts, postFilter]);

  const genreStats = useMemo(() => {
    const genreCounts = new Map<string, number>();
    for (const post of userPosts) {
      const rawGenre = typeof post.genre === "string" ? post.genre : "";
      const normalized = rawGenre.trim().toLowerCase();
      const genreKey = normalized || "other";
      genreCounts.set(genreKey, (genreCounts.get(genreKey) || 0) + 1);
    }

    return Array.from(genreCounts.entries())
      .map(([genre, count]) => ({
        genre: genre === "dnb" ? "DNB" : genre === "ukg" ? "UKG" : genre.charAt(0).toUpperCase() + genre.slice(1),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
  }, [userPosts]);

  const hasAnyArtistImpact =
    !!artistStats &&
    (
      artistStats.confirmedTracks > 0 ||
      artistStats.releasesCreated > 0 ||
      artistStats.upcomingReleases > 0 ||
      artistStats.postsFeaturingTracks > 0 ||
      artistStats.totalLikesAcrossPosts > 0 ||
      artistStats.totalCommentsAcrossPosts > 0 ||
      artistStats.uniqueUploaders > 0 ||
      artistStats.collaborations > 0
    );

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear all storage to prevent session mix-up
      localStorage.clear();
      sessionStorage.clear();
      
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
      
      if (onSignOut) {
        onSignOut();
      } else {
        // Redirect to main page if no callback provided
        window.location.pathname = '/';
      }
    } catch (error: any) {
      toast({
        title: "Sign Out Failed",
        description: error.message || "Failed to sign out.",
        variant: "destructive",
      });
    }
  };

  const handleNameEdit = () => {
    setEditedName(displayName || "");
    setIsEditingName(true);
  };

  const handleNameSave = () => {
    // Update the display name permanently
    updateDisplayName(editedName);
    setIsEditingName(false);
    toast({
      title: "Profile Updated",
      description: "Your display name has been updated.",
    });
  };

  const handleNameCancel = () => {
    setEditedName("");
    setIsEditingName(false);
  };

  const handleProfileImageChange = () => {
    fileInputRef.current?.click();
  };

  const profileImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!currentUser?.id) {
        throw new Error('No user logged in');
      }

      // Get the user's session to authenticate the upload
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Determine folder based on user type
      const folder = currentUser.userType === 'artist' ? 'artists' : 'users';
      const filePath = `${folder}/${currentUser.id}.png`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile_uploads')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true, // Overwrite if exists
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile_uploads')
        .getPublicUrl(filePath);

      // Update Supabase profiles.avatar_url
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', currentUser.id);

      if (updateError) {
        throw updateError;
      }

      return { url: publicUrl };
    },
    onSuccess: (data) => {
      updateProfileImage(data.url);
      
      // Invalidate current user query to refetch with new avatar
      queryClient.invalidateQueries({ queryKey: ["/api/user/current"] });
      
      toast({
        title: "Profile Picture Updated",
        description: "Your profile picture has been updated successfully.",
      });
    },
    onError: (error: any) => {
      console.error('Profile image upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload profile picture. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markNotificationAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications", "unread-count"] });
      }
    },
  });

  const markAllNotificationsAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) return;
      return apiRequest("PATCH", `/api/user/${currentUser.id}/notifications/mark-all-read`);
    },
    onSuccess: () => {
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications", "unread-count"] });
      }
      toast({ title: "All notifications marked as read" });
    },
  });

  const respondToTagMutation = useMutation({
    mutationFn: async ({ postId, status }: { postId: string; status: "confirmed" | "denied" }) => {
      const res = await apiRequest("GET", `/api/posts/${postId}/artist-tags`);
      const tags = (await res.json()) as { id: string; artist_id: string; status: string }[];
      const myTag = tags.find((t) => t.artist_id === currentUser?.id && (t.status === "PENDING" || t.status === "pending"));
      if (!myTag) throw new Error("Tag not found or already responded");
      return apiRequest("POST", `/api/artist-tags/${myTag.id}/status`, { status });
    },
    onSuccess: (_, { status }) => {
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications", "unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      }
      toast({ title: status === "confirmed" ? "Track confirmed as yours" : "Tag declined" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    },
  });

  const isTagNotification = (n: NotificationWithUser) =>
    n.message?.includes("tagged you in a comment");

  const isCollaboratorAcceptance = (n: NotificationWithUser) => {
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id;
    return !!releaseId && (n.message?.includes("accepted your collaboration invite") ?? false);
  };

  const isCollaboratorRejection = (n: NotificationWithUser) => {
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id;
    return !!releaseId && (n.message?.includes("rejected your collaboration invite") ?? false);
  };

  const isCollaboratorResponse = (n: NotificationWithUser) => isCollaboratorAcceptance(n) || isCollaboratorRejection(n);

  // Release-related (upcoming announcement + release-day) — exclude collab accept/reject
  const isReleaseNotification = (n: NotificationWithUser) => {
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id;
    return !!releaseId && !isCollaboratorResponse(n);
  };

  // Mark all notifications as read when Notifications tab is opened
  useEffect(() => {
    if (activeTab === "notifications" && unreadCount > 0) {
      markAllNotificationsAsReadMutation.mutate();
    }
  }, [activeTab]);

  const handleNotificationClick = (notification: NotificationWithUser) => {
    // Mark as read if unread
    if (!notification.read) {
      markNotificationAsReadMutation.mutate(notification.id);
    }
    // Navigate to release detail when release_id is present, else to post
    const releaseId = (notification as any).releaseId ?? (notification as any).release_id ?? notification.release?.id;
    if (releaseId) {
      navigate(`/releases/${releaseId}`);
    } else if (notification.postId) {
      navigate(`/?post=${notification.postId}`);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please select a valid image file (JPEG, PNG, GIF, or WebP).",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      profileImageMutation.mutate(file);
    }
  };

  // Early return if no current user
  if (!currentUser) {
    return (
      <div className="flex-1 bg-dark flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Please log in to view your profile</p>
        </div>
      </div>
    );
  }

  if (statsLoading || reputationLoading) {
    return (
      <div className="flex-1 bg-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Format member since date
  const formatMemberSince = (date?: Date | string) => {
    if (!date) return "Recently";
    const memberDate = typeof date === 'string' ? new Date(date) : date;
    return memberDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // User data from current user context - ONLY use real data from Supabase
  // NO mock/fallback data
  const userData = {
    displayName: username || displayName || currentUser?.username || null,
    username: username || currentUser?.username || null,
    profileImage: profileImage || (currentUser as any)?.avatarUrl || currentUser?.profileImage || null,
    level: currentUser?.level || 1,
    currentXP: currentUser?.currentXP || 0,
    nextLevelXP: 1000,
    memberSince: formatMemberSince(currentUser?.memberSince),
  };

  const progressPercentage = (userData.currentXP / userData.nextLevelXP) * 100;

  // Reputation helper functions with new level system
  const getLevelInfo = (score: number) => {
    if (score < 20) return { level: 1, min: 0, max: 20, color: 'from-gray-400 to-gray-500' };
    if (score < 50) return { level: 2, min: 20, max: 50, color: 'from-blue-400 to-blue-500' };
    if (score < 100) return { level: 3, min: 50, max: 100, color: 'from-green-400 to-green-500' };
    if (score < 200) return { level: 4, min: 100, max: 200, color: 'from-purple-400 to-purple-500' };
    return { level: 5, min: 200, max: 300, color: 'from-yellow-400 to-yellow-500' };
  };

  const getReputationLevel = (score: number) => {
    const levelInfo = getLevelInfo(score);
    return `Level ${levelInfo.level}`;
  };

  const getReputationProgress = (score: number) => {
    const levelInfo = getLevelInfo(score);
    const progress = ((score - levelInfo.min) / (levelInfo.max - levelInfo.min)) * 100;
    return Math.min(100, Math.max(0, progress));
  };

  const getReputationColor = (score: number) => {
    return getLevelInfo(score).color;
  };

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const diffMs = now.getTime() - targetDate.getTime();
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "1d ago";
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  return (
    <div className="flex-1 bg-dark overflow-y-auto">
      <div className="p-6 pb-24">
        <div className="max-w-md mx-auto">
          {/* User Header */}
          <div className="text-center mb-6">
            <div className="relative inline-block">
              {userData.profileImage ? (
                <img 
                  src={userData.profileImage}
                  alt="User Profile" 
                  className={`w-20 h-20 rounded-full mx-auto border-2 ${
                    verifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
                  }`}
                />
              ) : (
                <div
                  className={`w-20 h-20 rounded-full mx-auto border-2 ${
                    verifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
                  } bg-gray-700 flex items-center justify-center`}
                >
                  <User className="w-10 h-10 text-gray-400" />
                </div>
              )}
              <button 
                onClick={handleProfileImageChange}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center hover:bg-primary/80 transition-colors"
                data-testid="button-edit-profile-picture"
              >
                <Camera className="w-4 h-4 text-black" />
              </button>
            </div>
            <div className="mt-3">
              {isEditingName ? (
                <div className="flex items-center justify-center space-x-2 mt-2">
                  <Input 
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-48 text-center"
                    data-testid="input-edit-name"
                  />
                  <Button 
                    size="sm" 
                    onClick={handleNameSave}
                    data-testid="button-save-name"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleNameCancel}
                    data-testid="button-cancel-name"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <h1 className="text-xl font-bold">{userData.displayName || userData.username || 'User'}</h1>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleNameEdit}
                    className="p-1 h-6 w-6"
                    data-testid="button-edit-name"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            {userData.username && (
              <div className="flex items-center justify-center space-x-1">
                <p className={`text-sm font-semibold ${verifiedArtist ? "text-[#FFD700]" : "text-gray-400"}`}>
                  @{userData.username}
                </p>
                {verifiedArtist && (
                  <GoldVerifiedTick className="w-4 h-4 -mt-0.5" />
                )}
              </div>
            )}
            <p
              className={`text-xs mt-1 inline-flex items-center rounded-full px-3 py-0.5 border ${
                verifiedArtist
                  ? "text-white border-white/70 shadow-[0_0_12px_rgba(255,255,255,0.7)]"
                  : "text-gray-500 border-transparent"
              }`}
            >
              Member since {userData.memberSince}
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
            <TabsList className="grid w-full grid-cols-5" data-testid="profile-tabs">
              <TabsTrigger value="profile" data-testid="tab-profile">
                Profile
              </TabsTrigger>
              <TabsTrigger value="posts" data-testid="tab-posts">
                <Upload className="w-4 h-4 mr-1" />
                Posts
              </TabsTrigger>
              <TabsTrigger value="liked" data-testid="tab-liked">
                <Heart className="w-4 h-4 mr-1" />
                Liked
              </TabsTrigger>
              <TabsTrigger value="saved" data-testid="tab-saved">
                <Bookmark className="w-4 h-4 mr-1" />
                Saved
              </TabsTrigger>
              <TabsTrigger value="notifications" data-testid="tab-notifications" className="relative">
                <Bell className="w-4 h-4 mr-1" />
                Notif.
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6 mt-6">
              {userType === "artist" && artistStats ? (
                <div className="bg-surface rounded-xl p-4 mb-6">
                  <h3 className="font-semibold mb-4 text-center">Your impact</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border-2 border-green-500/35 bg-green-500/5 p-3 shadow-[0_0_12px_rgba(34,197,94,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-green-300 mb-1.5">
                        <BadgeCheck className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
                        <span>Confirmed tracks</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.confirmedTracks.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border-2 border-indigo-500/35 bg-indigo-500/5 p-3 shadow-[0_0_12px_rgba(99,102,241,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-indigo-300 mb-1.5">
                        <Calendar className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]" />
                        <span>Releases</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.releasesCreated.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border-2 border-amber-500/35 bg-amber-500/5 p-3 shadow-[0_0_12px_rgba(245,158,11,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-amber-300 mb-1.5">
                        <CalendarClock className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
                        <span>Upcoming releases</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.upcomingReleases.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border-2 border-purple-500/35 bg-purple-500/5 p-3 shadow-[0_0_12px_rgba(168,85,247,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-purple-300 mb-1.5">
                        <Radio className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]" />
                        <span>Featured clips</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.postsFeaturingTracks.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border-2 border-pink-500/35 bg-pink-500/5 p-3 shadow-[0_0_12px_rgba(236,72,153,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-pink-300 mb-1.5">
                        <Heart className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(236,72,153,0.4)]" />
                        <span>Track saves</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.totalLikesAcrossPosts.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border-2 border-cyan-500/35 bg-cyan-500/5 p-3 shadow-[0_0_12px_rgba(6,182,212,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-cyan-300 mb-1.5">
                        <MessageCircle className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]" />
                        <span>Comments</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.totalCommentsAcrossPosts.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border-2 border-blue-500/35 bg-blue-500/5 p-3 shadow-[0_0_12px_rgba(59,130,246,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-blue-300 mb-1.5">
                        <Users className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]" />
                        <span>Uploaders</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.uniqueUploaders.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border-2 border-emerald-500/35 bg-emerald-500/5 p-3 shadow-[0_0_12px_rgba(16,185,129,0.12)]">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-300 mb-1.5">
                        <Headphones className="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
                        <span>Collaborations</span>
                      </div>
                      <div className="text-xl font-bold text-center">{artistStats.collaborations.toLocaleString()}</div>
                    </div>
                  </div>
                  {!hasAnyArtistImpact && (
                    <p className="text-xs text-gray-400 mt-3 text-center">
                      Your impact stats will grow as tracks are confirmed and clips get linked to your releases.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-surface rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-primary mb-1" data-testid="stat-total-ids">
                      {userStats?.totalIDs || 0}
                    </div>
                    <div className="text-xs text-gray-400">Total IDs</div>
                  </div>
                  <div className="bg-surface rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-green-500 mb-1" data-testid="stat-confirmed">
                      {userStats?.confirmedIDs || 0}
                    </div>
                    <div className="text-xs text-gray-400">Confirmed</div>
                  </div>
                  <div className="bg-surface rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-accent mb-1" data-testid="stat-saved">
                      {userStats?.savedTracks || 0}
                    </div>
                    <div className="text-xs text-gray-400">Saved</div>
                  </div>
                  <div className="bg-surface rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-secondary mb-1" data-testid="stat-likes">
                      {userStats?.totalLikes || 0}
                    </div>
                    <div className="text-xs text-gray-400">Likes</div>
                  </div>
                </div>
              )}

          {/* Reputation Section */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 text-accent mr-2" />
              Reputation
            </h3>
            <div className="bg-surface rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" data-testid="reputation-level">
                  {getReputationLevel(userReputation?.reputation || 0)}
                </span>
                <span className="text-xs text-gray-400">
                  {Math.floor(getReputationProgress(userReputation?.reputation || 0))}% to next level
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                <div 
                  className={`bg-gradient-to-r ${getReputationColor(userReputation?.reputation || 0)} h-2 rounded-full transition-all duration-1000 ease-out`}
                  style={{ 
                    width: `${getReputationProgress(userReputation?.reputation || 0)}%` 
                  }}
                  data-testid="reputation-bar"
                ></div>
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <p>• Earn reputation by correctly identifying tracks</p>
                <p>• Higher levels unlock special badges and recognition</p>
              </div>
            </div>
          </div>

          {/* Favorite Genres */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">Your Posted Genres</h3>
            {genreStats.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {genreStats.map((genreStat) => {
                  const getGenreColors = (genre: string) => {
                    switch (genre.toLowerCase()) {
                      case "dnb":
                        return { bg: "bg-purple-600/20", text: "text-purple-400" };
                      case "ukg":
                        return { bg: "bg-green-600/20", text: "text-green-400" };
                      case "dubstep":
                        return { bg: "bg-red-600/20", text: "text-red-400" };
                      case "bassline":
                        return { bg: "bg-blue-600/20", text: "text-blue-400" };
                      case "house":
                        return { bg: "bg-yellow-600/20", text: "text-yellow-400" };
                      case "techno":
                        return { bg: "bg-pink-600/20", text: "text-pink-400" };
                      case "trance":
                        return { bg: "bg-cyan-600/20", text: "text-cyan-400" };
                      case "other":
                        return { bg: "bg-gray-600/20", text: "text-gray-400" };
                      default:
                        return { bg: "bg-gray-600/20", text: "text-gray-400" };
                    }
                  };
                  
                  const colorSet = getGenreColors(genreStat.genre);
                  
                  return (
                    <span 
                      key={genreStat.genre}
                      className={`${colorSet.bg} ${colorSet.text} px-3 py-1 rounded-full text-sm`}
                      data-testid={`genre-${genreStat.genre.toLowerCase()}`}
                    >
                      {genreStat.genre} ({genreStat.count})
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm" data-testid="text-no-genres">
                No tracks posted yet. Start submitting tracks to see your genre statistics!
              </p>
            )}
          </div>

          {/* Settings */}
          <div className="space-y-3">
            <Button
              variant="ghost"
              className="w-full bg-surface hover:bg-surface/80 text-left p-4 rounded-xl flex items-center justify-between h-auto"
              data-testid="button-settings"
            >
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-gray-400" />
                <span className="text-sm">Settings</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Button>
            
            <Button
              variant="ghost"
              className="w-full bg-red-900/20 hover:bg-red-900/30 text-left p-4 rounded-xl flex items-center justify-between h-auto text-red-400 hover:text-red-300"
              onClick={handleSignOut}
              data-testid="button-logout"
            >
              <div className="flex items-center space-x-3">
                <LogOut className="w-5 h-5" />
                <span className="text-sm">Sign Out</span>
              </div>
            </Button>
              </div>
            </TabsContent>

            {/* Posts Tab */}
            <TabsContent value="posts" className="mt-6">
              {/* Filter Buttons */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={postFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPostFilter("all")}
                  data-testid="filter-all-posts"
                >
                  All ({userPosts.length})
                </Button>
                <Button
                  variant={postFilter === "identified" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPostFilter("identified")}
                  data-testid="filter-identified-posts"
                >
                  Identified ({userPosts.filter(t => 
                    t.verificationStatus === "identified" || 
                    t.verificationStatus === "community"
                  ).length})
                </Button>
                <Button
                  variant={postFilter === "unidentified" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPostFilter("unidentified")}
                  data-testid="filter-unidentified-posts"
                >
                  Unidentified ({userPosts.filter(t => 
                    t.verificationStatus === "unverified"
                  ).length})
                </Button>
              </div>

              {postsLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-gray-400">Loading your posts...</p>
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Upload className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg mb-2">
                    {postFilter === "all" 
                      ? "No posts yet" 
                      : postFilter === "identified"
                      ? "No identified posts"
                      : "No unidentified posts"}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {postFilter === "all" && "Start uploading tracks to see them here!"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPosts.map((post) => (
                    <VideoCard key={post.id} post={post} showStatusBadge />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Liked Tab */}
            <TabsContent value="liked" className="mt-6">
              {likedLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-gray-400">Loading liked videos...</p>
                </div>
              ) : likedPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg mb-2">No liked videos yet</p>
                  <p className="text-gray-500 text-sm">Start liking tracks to see them here!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {likedPosts.map((post) => (
                    <VideoCard key={post.id} post={post} showStatusBadge />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Saved Tab */}
            <TabsContent value="saved" className="mt-6">
              {savedLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-gray-400">Loading saved videos...</p>
                </div>
              ) : savedPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Bookmark className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg mb-2">No saved videos yet</p>
                  <p className="text-gray-500 text-sm">Start saving tracks to see them here!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Saved tracks feature removed */}
                  <div className="text-center py-12">
                    <p className="text-gray-400">Saved tracks feature is no longer available</p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="mt-6">
              {unreadCount > 0 && (
                <div className="flex justify-end mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAllNotificationsAsReadMutation.mutate()}
                    data-testid="mark-all-read"
                    disabled={markAllNotificationsAsReadMutation.isPending}
                  >
                    Mark all as read
                  </Button>
                </div>
              )}
              {notificationsLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-gray-400">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg mb-2">No notifications yet</p>
                  <p className="text-gray-500 text-sm">You'll see activity updates here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => {
                    const isTag = isTagNotification(notification);
                    const isAcceptance = isCollaboratorAcceptance(notification);
                    const isRejection = isCollaboratorRejection(notification);
                    const isCollabResponse = isCollaboratorResponse(notification);
                    const isRelease = isReleaseNotification(notification);
                    const baseClass = "flex gap-3 p-3 rounded-lg border transition-colors cursor-pointer";
                    const styleClass = isCollabResponse
                      ? isAcceptance
                        ? notification.read
                          ? "border-green-600/40 bg-green-500/5 hover:bg-green-500/10"
                          : "border-green-500/60 bg-green-500/15 hover:bg-green-500/25 ring-1 ring-green-500/20"
                        : notification.read
                          ? "border-amber-600/40 bg-amber-500/5 hover:bg-amber-500/10"
                          : "border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25 ring-1 ring-amber-500/20"
                      : isRelease
                        ? notification.read
                          ? "border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/15"
                          : "border-amber-400/70 bg-amber-500/20 hover:bg-amber-500/30 ring-1 ring-amber-400/30"
                      : notification.read
                        ? "border-gray-700 bg-surface hover:bg-gray-800"
                        : "border-primary/30 bg-primary/10 hover:bg-primary/20";
                    return (
                      <div
                        key={notification.id}
                        className={`${baseClass} ${styleClass}`}
                        onClick={() => handleNotificationClick(notification)}
                        data-testid={`notification-${notification.id}`}
                      >
                        {/* Thumbnail: release artwork takes precedence over post video */}
                        <div className="relative w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-gray-800">
                          {notification.release?.artworkUrl ? (
                            <img
                              src={notification.release.artworkUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : notification.post?.videoUrl ? (
                            <video
                              src={notification.post.videoUrl}
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Bell className="w-6 h-6 text-gray-600" />
                            </div>
                          )}
                        </div>

                        {/* Notification Content: tag and acceptance include @username in message */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${(isCollabResponse || isRelease) ? "font-medium text-foreground" : "text-foreground"}`}>
                            {isTag || isCollabResponse ? (
                              notification.message
                            ) : (
                              <>
                                <span className="font-semibold">{notification.triggeredByUser?.username ?? "Someone"}</span>
                                {' '}{notification.message}
                              </>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTimeAgo(notification.createdAt)}
                          </p>
                        </div>

                        {/* Acceptance/rejection icon + unread indicator */}
                        <div className="flex items-center gap-2">
                          {isAcceptance && (
                            <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" aria-hidden />
                          )}
                          {isRejection && (
                            <X className="w-5 h-5 flex-shrink-0 text-amber-500" aria-hidden />
                          )}
                          {!notification.read && (
                            <div className={`w-2 h-2 rounded-full ${isCollabResponse ? (isAcceptance ? "bg-green-500" : "bg-amber-500") : isRelease ? "bg-amber-400" : "bg-primary"}`}></div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          {/* Hidden file input for profile picture upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
