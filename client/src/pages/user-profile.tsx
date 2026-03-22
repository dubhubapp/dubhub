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
import { withAvatarCacheBust } from "@/lib/avatar-utils";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { UserStats, NotificationWithUser, PostWithUser } from "@shared/schema";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { GoldVerifiedTick, goldAvatarGlowShadowClass } from "@/components/verified-artist";
import { StatsCardSection, type StatsCardItem } from "@/components/stats-card-section";
import { StatInfoPopover } from "@/components/stat-info-popover";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";

/** Concise copy for profile stat sections and cards (popover help). */
const PROFILE_HELP = {
  sectionImpact:
    "How your music shows up on dub hub: confirmed tracks, releases, clips that feature your songs, and engagement from the community.",
  sectionUserActivity:
    "Your personal activity: uploads, confirmed IDs on your posts, saves, and likes you’ve given others.",
  sectionOverview:
    "A quick snapshot of your account: posts you’ve shared, IDs confirmed on your uploads, saves, and likes you’ve given.",
  reputation:
    "Reputation reflects correct IDs and participation. Higher levels can unlock badges and recognition as the system evolves.",
  tracksPosted:
    "Genres for every clip you’ve posted. Each upload counts once toward the genre totals.",
  tracksIdentified:
    "Shows genres for tracks you correctly identified. Excludes your own tracks and IDs on your own posts.",
  totalIDs: "Total clips or tracks you’ve uploaded to the community.",
  confirmedOverview: "Your uploads that have been identified or verified.",
  saved: "Tracks you’ve bookmarked (when saves are available).",
  likesGiven: "Posts you’ve liked.",
  artistConfirmedTracks: "Tracks on your artist profile that are confirmed as yours.",
  artistReleases: "Releases you’ve created on your artist profile.",
  artistUpcoming: "Scheduled releases that aren’t out yet.",
  artistFeaturedClips: "Community posts that feature your music.",
  artistTrackSaves: "Total likes across posts featuring your tracks.",
  artistComments: "Comments on posts that feature your tracks.",
  artistUploaders: "Different people who posted clips of your tracks.",
  artistCollaborations: "Collaborative releases you’re credited on.",
} as const;

interface UserProfileProps {
  onSignOut?: () => void;
}

function formatGenreDisplayLabel(genreKey: string): string {
  const g = genreKey.toLowerCase();
  if (g === "dnb") return "DNB";
  if (g === "ukg") return "UKG";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function getGenreChipColors(genre: string) {
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
}

type GenreStatRow = { genre: string; count: number };

function GenreBreakdownSection({
  title,
  titleInfo,
  stats,
  emptyMessage,
  isLoading,
  testIdPrefix,
}: {
  title: string;
  titleInfo: string;
  stats: GenreStatRow[];
  emptyMessage: string;
  isLoading?: boolean;
  testIdPrefix: string;
}) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-1.5">
        <h3 className="font-semibold">{title}</h3>
        <StatInfoPopover
          label={title}
          content={titleInfo}
          side="bottom"
          align="start"
          className="text-gray-400 hover:text-gray-200"
        />
      </div>
      {isLoading ? (
        <p className="text-gray-400 text-sm" data-testid={`${testIdPrefix}-loading`}>
          Loading genre breakdown…
        </p>
      ) : stats.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {stats.map((genreStat) => {
            const colorSet = getGenreChipColors(genreStat.genre);
            return (
              <span
                key={`${genreStat.genre}-${genreStat.count}`}
                className={`${colorSet.bg} ${colorSet.text} px-3 py-1 rounded-full text-sm`}
                data-testid={`${testIdPrefix}-genre-${genreStat.genre.toLowerCase()}`}
              >
                {genreStat.genre} ({genreStat.count})
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400 text-sm" data-testid={`${testIdPrefix}-empty`}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export default function UserProfile(props: any = {}) {
  const { onSignOut } = props;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage, displayName, username, updateProfileImage, updateDisplayName, currentUser, verifiedArtist, userType } = useUser();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [artistStatsMode, setArtistStatsMode] = useState<"artist" | "user">("artist");
  const [postFilter, setPostFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
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

  type IdentifiedGenresResponse = { genres: { genreKey: string; count: number }[] };

  const { data: identifiedGenresData, isLoading: identifiedGenresLoading } = useQuery<IdentifiedGenresResponse>({
    queryKey: ["/api/user", currentUser?.id, "identified-posts-genres"],
    enabled: !!currentUser?.id,
    retry: false,
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
        genre: formatGenreDisplayLabel(genre),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
  }, [userPosts]);

  const identifiedGenreStats = useMemo(() => {
    const rows = identifiedGenresData?.genres ?? [];
    return rows
      .map((row) => ({
        genre: formatGenreDisplayLabel(row.genreKey),
        count: row.count,
      }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
  }, [identifiedGenresData]);

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

  const artistImpactItems: StatsCardItem[] = artistStats
    ? [
        {
          label: "Confirmed tracks",
          value: artistStats.confirmedTracks.toLocaleString(),
          Icon: BadgeCheck,
          toneClassName: "border-green-500/35 bg-green-500/5 shadow-[0_0_12px_rgba(34,197,94,0.12)] text-green-300 [&_svg]:drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]",
          info: PROFILE_HELP.artistConfirmedTracks,
        },
        {
          label: "Releases",
          value: artistStats.releasesCreated.toLocaleString(),
          Icon: Calendar,
          toneClassName: "border-indigo-500/35 bg-indigo-500/5 shadow-[0_0_12px_rgba(99,102,241,0.12)] text-indigo-300 [&_svg]:drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]",
          info: PROFILE_HELP.artistReleases,
        },
        {
          label: "Upcoming releases",
          value: artistStats.upcomingReleases.toLocaleString(),
          Icon: CalendarClock,
          toneClassName: "border-amber-500/35 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.12)] text-amber-300 [&_svg]:drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]",
          info: PROFILE_HELP.artistUpcoming,
        },
        {
          label: "Featured clips",
          value: artistStats.postsFeaturingTracks.toLocaleString(),
          Icon: Radio,
          toneClassName: "border-purple-500/35 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.12)] text-purple-300 [&_svg]:drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]",
          info: PROFILE_HELP.artistFeaturedClips,
        },
        {
          label: "Track saves",
          value: artistStats.totalLikesAcrossPosts.toLocaleString(),
          Icon: Heart,
          toneClassName: "border-pink-500/35 bg-pink-500/5 shadow-[0_0_12px_rgba(236,72,153,0.12)] text-pink-300 [&_svg]:drop-shadow-[0_0_6px_rgba(236,72,153,0.4)]",
          info: PROFILE_HELP.artistTrackSaves,
        },
        {
          label: "Comments",
          value: artistStats.totalCommentsAcrossPosts.toLocaleString(),
          Icon: MessageCircle,
          toneClassName: "border-cyan-500/35 bg-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.12)] text-cyan-300 [&_svg]:drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]",
          info: PROFILE_HELP.artistComments,
        },
        {
          label: "Uploaders",
          value: artistStats.uniqueUploaders.toLocaleString(),
          Icon: Users,
          toneClassName: "border-blue-500/35 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.12)] text-blue-300 [&_svg]:drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]",
          info: PROFILE_HELP.artistUploaders,
        },
        {
          label: "Collaborations",
          value: artistStats.collaborations.toLocaleString(),
          Icon: Headphones,
          toneClassName: "border-emerald-500/35 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.12)] text-emerald-300 [&_svg]:drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]",
          info: PROFILE_HELP.artistCollaborations,
        },
      ]
    : [];

  const userOverviewItems: StatsCardItem[] = [
    {
      label: "Total IDs",
      value: Number(userStats?.totalIDs || 0).toLocaleString(),
      Icon: Upload,
      toneClassName: "border-primary/35 bg-primary/5 shadow-[0_0_12px_rgba(59,130,246,0.12)] text-primary [&_svg]:drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]",
      info: PROFILE_HELP.totalIDs,
    },
    {
      label: "Confirmed",
      value: Number(userStats?.confirmedIDs || 0).toLocaleString(),
      Icon: CheckCircle,
      toneClassName: "border-green-500/35 bg-green-500/5 shadow-[0_0_12px_rgba(34,197,94,0.12)] text-green-300 [&_svg]:drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]",
      info: PROFILE_HELP.confirmedOverview,
    },
    {
      label: "Saved",
      value: Number(userStats?.savedTracks || 0).toLocaleString(),
      Icon: Bookmark,
      toneClassName: "border-amber-500/35 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.12)] text-amber-300 [&_svg]:drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]",
      info: PROFILE_HELP.saved,
    },
    {
      label: "Likes",
      value: Number(userStats?.totalLikes || 0).toLocaleString(),
      Icon: Heart,
      toneClassName: "border-pink-500/35 bg-pink-500/5 shadow-[0_0_12px_rgba(236,72,153,0.12)] text-pink-300 [&_svg]:drop-shadow-[0_0_6px_rgba(236,72,153,0.4)]",
      info: PROFILE_HELP.likesGiven,
    },
  ];

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
          cacheControl: '60',
          upsert: true, // Overwrite if exists
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL (same path every time → same base URL; bust cache for display)
      const { data: { publicUrl } } = supabase.storage
        .from('profile_uploads')
        .getPublicUrl(filePath);

      const avatarUrl = withAvatarCacheBust(publicUrl);

      // Update Supabase profiles.avatar_url
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', currentUser.id);

      if (updateError) {
        throw updateError;
      }

      return { url: avatarUrl };
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
                <div className="mb-6">
                  <div className="flex justify-center mb-3">
                    <div className="inline-flex items-center rounded-lg border border-white/10 bg-black/20 p-1">
                      <button
                        type="button"
                        onClick={() => setArtistStatsMode("artist")}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          artistStatsMode === "artist"
                            ? "bg-white text-black"
                            : "text-gray-300 hover:text-white"
                        }`}
                        data-testid="stats-mode-artist"
                      >
                        Artist
                      </button>
                      <button
                        type="button"
                        onClick={() => setArtistStatsMode("user")}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          artistStatsMode === "user"
                            ? "bg-white text-black"
                            : "text-gray-300 hover:text-white"
                        }`}
                        data-testid="stats-mode-user"
                      >
                        User
                      </button>
                    </div>
                  </div>

                  <div className="[perspective:1200px]">
                    <div
                      className="relative min-h-[430px] transition-transform duration-500 ease-out [transform-style:preserve-3d]"
                      style={{
                        transform: artistStatsMode === "artist" ? "rotateY(0deg)" : "rotateY(180deg)",
                      }}
                    >
                      <div className="absolute inset-0 [backface-visibility:hidden]">
                        <StatsCardSection
                          title="Your impact"
                          titleInfo={PROFILE_HELP.sectionImpact}
                          items={artistImpactItems}
                          helperText={
                            hasAnyArtistImpact
                              ? undefined
                              : "Your impact stats will grow as tracks are confirmed and clips get linked to your releases."
                          }
                        />
                      </div>
                      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                        <StatsCardSection
                          title="Your user activity"
                          titleInfo={PROFILE_HELP.sectionUserActivity}
                          items={userOverviewItems}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <StatsCardSection
                  title="Your overview"
                  titleInfo={PROFILE_HELP.sectionOverview}
                  items={userOverviewItems}
                  className="mb-6"
                />
              )}

          {/* Reputation Section */}
          <div className="mb-6">
            <div className="mb-4 flex items-center gap-1.5">
              <TrendingUp className="w-5 h-5 text-accent shrink-0" />
              <h3 className="font-semibold">Reputation</h3>
              <StatInfoPopover
                label="Reputation"
                content={PROFILE_HELP.reputation}
                side="bottom"
                align="start"
                className="text-gray-400 hover:text-gray-200"
              />
            </div>
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

          <GenreBreakdownSection
            title="Tracks You Posted"
            titleInfo={PROFILE_HELP.tracksPosted}
            stats={genreStats}
            emptyMessage="No tracks posted yet. Start submitting tracks to see your genre breakdown."
            isLoading={postsLoading}
            testIdPrefix="posted-genres"
          />

          <GenreBreakdownSection
            title="Tracks You Identified"
            titleInfo={PROFILE_HELP.tracksIdentified}
            stats={identifiedGenreStats}
            emptyMessage="When your ID is confirmed as the correct track, those tracks will show up here."
            isLoading={identifiedGenresLoading}
            testIdPrefix="identified-genres"
          />

          {/* Settings */}
          <div className="space-y-3">
            <Button
              variant="ghost"
              type="button"
              className="w-full bg-surface hover:bg-surface/80 text-left p-4 rounded-xl flex items-center justify-between h-auto"
              data-testid="button-settings"
              onClick={() => setChangePasswordOpen(true)}
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
          <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
        </div>
      </div>
    </div>
  );
}
