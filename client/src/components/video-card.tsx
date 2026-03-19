
import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Heart, MessageCircle, Bookmark, Share2, Check, Clock, X, CheckCircle, Trash2, ShieldCheck, MoreVertical, Link as LinkIcon, Flag, Music } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { PostWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { GoldVerifiedArtistPill, GoldVerifiedTick, goldAvatarGlowShadowClass } from "./verified-artist";
import { CommentsModal } from "./comments-modal";
import { CommunityVerificationDialog } from "./community-verification-dialog";
import { ArtistVerificationDialog } from "./artist-verification-dialog";
import { ReportModal } from "./report-modal";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { formatReleaseTitleLine } from "@/lib/release-display";
import { formatDate } from "@/pages/release-tracker";
import { isReleaseUpcoming } from "@/lib/release-status";
// Removed placeholder video import - now using real uploaded videos

interface VideoCardProps {
  post: PostWithUser;
  isHighlighted?: boolean;
  showStatusBadge?: boolean;
}

export function VideoCard({ post, isHighlighted = false, showStatusBadge = false }: VideoCardProps) {
  const [, navigate] = useLocation();
  const releasePreview = (post as any).releasePreview as {
    id: string;
    title: string;
    artworkUrl: string | null;
    releaseDate: string | null;
    isComingSoon?: boolean;
    ownerUsername: string;
    collaborators: { username: string; status: string }[];
  } | null | undefined;
  const showVerifyDebug =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "verify";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage: userProfileImage, currentUser: contextUser } = useUser();
  const debugComments =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "comments";
  const [hasLiked, setHasLiked] = useState(post.hasLiked || false);
  const [likes, setLikes] = useState(post.likes);
  const [showComments, setShowComments] = useState(false);
  // Freeze the post snapshot used by the comments modal to avoid mismatched post IDs
  const [commentsPost, setCommentsPost] = useState<PostWithUser | null>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [showArtistVerificationDialog, setShowArtistVerificationDialog] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isPlayingRef = useRef(true);
  const hasManuallyToggledLike = useRef(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Sync state with post prop when it changes (e.g., after navigation or refresh)
  // Only sync if we haven't manually toggled the like (to prevent overwriting optimistic updates)
  useEffect(() => {
    if (!hasManuallyToggledLike.current) {
      setHasLiked(post.hasLiked || false);
      setLikes(post.likes);
    }
  }, [post.id, post.hasLiked, post.likes, post]); // Sync when post ID, hasLiked, likes, or entire post object changes

  // Ensure video plays immediately and loops properly
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Handle when video metadata is loaded
    const handleLoadedMetadata = () => {
      if (isPlayingRef.current) {
        video.play().catch((error) => {
          // Autoplay might be blocked by browser, but we have muted + playsInline
          console.log("Video autoplay prevented:", error);
        });
      }
    };

    // Seamless loop: restart video before it actually ends to prevent buffering delay
    const handleTimeUpdate = () => {
      if (isPlayingRef.current && !video.paused && video.duration > 0) {
        // Restart 0.1 seconds before the end for seamless looping
        if (video.currentTime >= video.duration - 0.1) {
          video.currentTime = 0;
        }
      }
    };

    // Fallback for ended event (iOS Safari compatibility)
    const handleEnded = () => {
      if (isPlayingRef.current && !video.paused) {
        video.currentTime = 0;
        video.play().catch((error) => {
          console.log("Video loop restart prevented:", error);
        });
      }
    };

    // Add event listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    // Attempt to play immediately if metadata is already loaded
    if (video.readyState >= 2) {
      video.play().catch((error) => {
        console.log("Video initial play prevented:", error);
      });
    }

    // Cleanup
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [post.videoUrl]);

  const likeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/posts/${post.id}/like`),
    onMutate: async () => {
      // Optimistic update before API call
      hasManuallyToggledLike.current = true;
      const previousHasLiked = hasLiked;
      const previousLikes = likes;
      setHasLiked(!previousHasLiked);
      setLikes(previousHasLiked ? previousLikes - 1 : previousLikes + 1);
      
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/posts"] });
      
      return { previousHasLiked, previousLikes };
    },
    onSuccess: async (response, variables, context) => {
      const data = await response.json();
      // Update with server response
      setHasLiked(data.isLiked);
      setLikes(data.counts.likes);
      
      // Update the cache with server response - this ensures hasLiked persists
      // Update all query keys that start with "/api/posts" to handle filtered queries
      queryClient.setQueriesData<any[]>(
        { queryKey: ["/api/posts"], exact: false },
        (old) => {
          if (!old) return old;
          return old.map((p) => 
            p.id === post.id 
              ? { ...p, hasLiked: data.isLiked, likes: data.counts.likes }
              : p
          );
        }
      );
      
      // Reset the flag immediately after cache update so the component can sync with the updated post prop
      // This allows the useEffect to sync when the post prop updates from the cache
      hasManuallyToggledLike.current = false;
      
      // Invalidate liked-posts query so the liked video appears in Profile tab
      if (contextUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", contextUser.id, "liked-posts"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", contextUser.id, "liked-posts"] });
      }
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context) {
        setHasLiked(context.previousHasLiked);
        setLikes(context.previousLikes);
      }
      hasManuallyToggledLike.current = false;
      toast({ title: "Error", description: "Failed to like post", variant: "destructive" });
    },
    onSettled: () => {
      // Flag is already reset in onSuccess, but ensure it's reset on error too
      // This is a safety net in case onSuccess doesn't run
      if (hasManuallyToggledLike.current) {
        hasManuallyToggledLike.current = false;
      }
    },
  });

  // Save functionality removed - no longer supported

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/posts/${post.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post Deleted",
        description: "Your post has been successfully deleted.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
    },
  });

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link Copied",
        description: "Post link copied to clipboard",
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleReport = () => {
    // Close menu first, then open modal after menu has closed
    setMenuOpen(false);
    requestAnimationFrame(() => {
      setShowReportModal(true);
    });
  };

  // Get current user to check if they own this post
  const { data: currentUser } = useQuery({
    queryKey: ["/api/user/current"],
    queryFn: async () => {
      const response = await fetch("/api/user/current");
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
  });

  const getStatusBadge = () => {
    // Artist verification takes precedence: if artist confirmed, show Artist Verified
    const isArtistVerifiedPost = !!((post as any).isVerifiedArtist ?? (post as any).is_verified_artist);
    const artistVerifiedBy = (post as any).artistVerifiedBy ?? (post as any).artist_verified_by;
    if (isArtistVerifiedPost && artistVerifiedBy) {
      return (
        <GoldVerifiedArtistPill data-testid="badge-artist-verified" size="sm" />
      );
    }
    
    // Show identified badge if moderator confirmed (fallback when no artist verification)
    if (post.verificationStatus === "identified") {
      return (
        <span className="bg-green-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium" data-testid="badge-identified">
          <CheckCircle className="w-3 h-3 inline mr-1" />
          Identified
        </span>
      );
    }
    
    // Show community identified badge if uploader marked but not yet moderator approved
    if (post.verificationStatus === "community") {
      return (
        <span className="bg-blue-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium" data-testid="badge-community-identified">
          <ShieldCheck className="w-3 h-3 inline mr-1" />
          Community Identified
        </span>
      );
    }
    
    // Show under review badge
    if (post.verificationStatus === "under_review") {
      return (
        <span className="bg-yellow-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium" data-testid="badge-under-review">
          <ShieldCheck className="w-3 h-3 inline mr-1" />
          Under review by moderators
        </span>
      );
    }
    
    // Show unidentified badge when explicitly requested (e.g., in profile Posts tab)
    if (showStatusBadge && post.verificationStatus === "unverified") {
      return (
        <span className="bg-gray-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium" data-testid="badge-unidentified">
          <Clock className="w-3 h-3 inline mr-1" />
          Unidentified
        </span>
      );
    }
    
    return null;
  };

  const getGenreColor = (genre: string) => {
    switch (genre.toLowerCase()) {
      case "dnb":
        return "bg-primary/80";
      case "ukg":
        return "bg-secondary/80";
      case "dubstep":
        return "bg-green-600/80";
      case "house":
        return "bg-purple-600/80";
      case "techno":
        return "bg-red-600/80";
      case "bassline":
        return "bg-orange-600/80";
      case "trance":
        return "bg-blue-600/80";
      case "other":
        return "bg-gray-600/80";
      default:
        return "bg-gray-600/80";
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const trackDate = typeof date === 'string' ? new Date(date) : date;
    const diffMs = now.getTime() - trackDate.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Check if artist is verified
  const isVerifiedArtist = post.user.account_type === 'artist' && post.user.verified_artist === true;



  return (
    <div 
      className={`min-h-screen h-screen w-full relative snap-start snap-always flex-shrink-0 transition-all duration-300 ${
        isHighlighted ? 'ring-4 ring-primary ring-inset' : ''
      }`}
      data-post-id={post.id}
    >
      {/* Video background - object-contain preserves full frame; muted required for autoplay, unmute on tap */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <video 
          ref={videoRef}
          className="w-full h-full object-contain cursor-pointer"
          autoPlay 
          muted 
          loop 
          playsInline
          preload="auto"
          onClick={(e) => {
            e.preventDefault();
            const video = videoRef.current;
            if (video) {
              video.muted = false; // Unmute on user interaction (browsers require this for autoplay)
              if (video.paused) {
                video.play();
                setIsPlaying(true);
              } else {
                video.pause();
                setIsPlaying(false);
              }
            }
          }}
        >
          <source src={post.videoUrl || ""} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60 pointer-events-none" />
      </div>
      {/* Top overlay with status - pt-safe for notch */}
      <div className="absolute top-20 left-4 right-20 z-20">
        <div className="flex gap-2 mb-4">
          {getStatusBadge()}
        </div>
      </div>
      {/* Right side actions */}
      <div className="absolute right-4 bottom-36 z-20 flex flex-col items-center space-y-6">
        {/* Like button */}
        <button 
          className="flex flex-col items-center group"
          onClick={() => likeMutation.mutate()}
          disabled={likeMutation.isPending}
        >
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
            <Heart className={`w-6 h-6 ${hasLiked ? "text-red-500 fill-red-500" : "text-white"}`} />
          </div>
          <span className="text-xs mt-1 font-medium text-white">{formatCount(likes)}</span>
        </button>

        {/* Comment button */}
        <button 
          className="flex flex-col items-center group"
          onClick={() => {
            if (debugComments) {
              console.log("[CommentsOpen] click", {
                feedPostId: post.id,
                handlerPostId: post.id,
                showCommentsBefore: showComments,
              });
            }
            setCommentsPost(post);
            setShowComments(true);
          }}
        >
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-xs mt-1 font-medium text-white">{formatCount(post.comments)}</span>
        </button>

        {/* Save button removed - functionality no longer supported */}

        {/* Mark comment as correct (owner) / ID Track (tagged artist): owner needs unverified + comments; artist can confirm/deny even if community verified */}
        {(() => {
          const postOwnerId = (post as any).user_id ?? post.userId ?? post.user?.id;
          const currentUserId = (post as any).viewer_id ?? contextUser?.id ?? null;
          const status = post.verificationStatus ?? (post as any).verification_status;
          const isUnverified = !status || status === "unverified";
          const isOwner = currentUserId != null && postOwnerId != null && currentUserId === postOwnerId;
          const commentCount = Number((post as any).comments ?? post.comments ?? (post as any).comments_count ?? 0);
          const hasComments = commentCount >= 1;
          const isTaggedArtist = !!((post as any).currentUserTaggedAsArtist ?? (post as any).current_user_tagged_as_artist);
          const deniedByArtist = !!((post as any).deniedByArtist ?? (post as any).denied_by_artist);
          const isArtistVerified = !!((post as any).isVerifiedArtist ?? (post as any).is_verified_artist);
          const artistVerifiedBy = (post as any).artistVerifiedBy ?? (post as any).artist_verified_by;
          const alreadyArtistConfirmed = isArtistVerified && artistVerifiedBy === currentUserId;
          const alreadyArtistVerifiedBySomeone = isArtistVerified && !!artistVerifiedBy;
          const canVerifyOwner = isUnverified && isOwner && hasComments;
          const canVerifyArtist = isTaggedArtist && !deniedByArtist && !alreadyArtistConfirmed;
          // Once a post is artist-verified by anyone, no more artist confirmations/denials should be possible
          const canVerify = !alreadyArtistVerifiedBySomeone && (canVerifyOwner || canVerifyArtist);

          if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
            (window as any).__VERIFY_DEBUG = (window as any).__VERIFY_DEBUG ?? {};
            (window as any).__VERIFY_DEBUG[post.id] = {
              currentUserId,
              postOwnerId,
              isOwner,
              canVerify,
              hasComments,
              isTaggedArtist,
              status,
            };
          }

          const debugInfo = showVerifyDebug
            ? { currentUserId, postOwnerId, isOwner, canVerify, hasComments, isTaggedArtist, status }
            : null;

          return (
            <>
              {showVerifyDebug && debugInfo && (
                <div className="absolute top-2 left-2 right-2 z-20 rounded bg-black/80 text-xs text-green-400 p-2 font-mono">
                  <div>viewer_id (currentUserId): {String(debugInfo.currentUserId ?? "null")}</div>
                  <div>user_id (postOwnerId): {String(debugInfo.postOwnerId ?? "null")}</div>
                  <div>isOwner: {String(debugInfo.isOwner)}</div>
                  <div>canVerify: {String(debugInfo.canVerify)}</div>
                  <div>hasComments: {String(debugInfo.hasComments)} | isTaggedArtist: {String(debugInfo.isTaggedArtist)} | status: {String(debugInfo.status)}</div>
                </div>
              )}
              {canVerify ? (
            <button
              className="flex flex-col items-center group"
              onClick={() => (isOwner ? setShowVerificationDialog(true) : setShowArtistVerificationDialog(true))}
              data-testid={isOwner ? "button-community-verify" : "button-artist-verify"}
              title={isOwner ? "Mark comment as correct" : "Confirm or deny track"}
            >
              <div className="w-12 h-12 rounded-full bg-blue-500/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
                <ShieldCheck className="w-6 h-6 text-blue-400" />
              </div>
              <span className="text-xs mt-1 font-medium text-blue-400">
                {isOwner ? "Mark correct" : "ID Track"}
              </span>
            </button>
          ) : null}
            </>
          );
        })()}

        {/* Delete button - only show for post owner (use same owner check as verify) */}
        {(() => {
          const postOwnerId = (post as any).user_id ?? post.userId ?? post.user?.id;
          const currentUserId = (post as any).viewer_id ?? contextUser?.id ?? null;
          const isOwner = currentUserId != null && postOwnerId != null && currentUserId === postOwnerId;
          return isOwner;
        })() && (
          <button 
            className="flex flex-col items-center group"
            onClick={() => {
              if (confirm("Are you sure you want to delete this post?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-post"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <span className="text-xs mt-1 font-medium text-red-400">Delete</span>
          </button>
        )}
      </div>
      {/* Bottom content overlay - right-20 leaves room for action buttons; bottom clears BottomNavigation */}
      <div className="absolute left-0 right-20 z-20 px-4 pt-16 pb-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="pointer-events-auto max-h-[50vh] overflow-y-auto space-y-3">
          <div className="flex items-center space-x-3">
            {/* User avatar with verification */}
            <div className="relative">
              <img 
                src={
                  contextUser && post.userId === contextUser.id 
                    ? (userProfileImage || post.user.avatar_url || undefined)
                    : (post.user.avatar_url || undefined)
                }
                alt="User Profile" 
                className={`w-10 h-10 rounded-full border-2 ${
                  isVerifiedArtist
                    ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                    : post.genre === "DnB"
                      ? "border-primary"
                      : post.genre === "UKG"
                        ? "border-secondary"
                        : "border-green-600"
                }`}
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <p className={`font-semibold text-sm ${isVerifiedArtist ? "text-[#FFD700]" : "text-white"}`}>
                    @{post.user.username}
                  </p>
                  {isVerifiedArtist && (
                    <GoldVerifiedTick className="w-4 h-4 -mt-0.5" />
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-300">{post.location}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-white">{post.description}</p>
            <div className="flex items-center space-x-2 text-xs text-gray-300">
              {post.djName && <span>Mixed by: {post.djName}</span>}
              {post.djName && <span>•</span>}
              <span>{post.createdAt ? formatTimeAgo(post.createdAt) : 'Recently'}</span>
            </div>
          </div>
          {releasePreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/releases/${releasePreview.id}`);
              }}
              className="mt-3 w-full flex items-center gap-3 p-2 rounded-lg bg-black/40 hover:bg-black/50 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                {releasePreview.artworkUrl ? (
                  <img src={releasePreview.artworkUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-6 h-6 text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {formatReleaseTitleLine(
                    releasePreview.ownerUsername,
                    releasePreview.title,
                    releasePreview.collaborators
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {releasePreview.isComingSoon
                    ? "Coming soon..."
                    : releasePreview.releaseDate
                    ? formatDate(releasePreview.releaseDate)
                    : ""}
                  <span
                    className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] ${
                      isReleaseUpcoming(releasePreview.isComingSoon, releasePreview.releaseDate)
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-green-500/20 text-green-600 dark:text-green-400"
                    }`}
                  >
                    {isReleaseUpcoming(releasePreview.isComingSoon, releasePreview.releaseDate)
                      ? "Upcoming"
                      : "Released"}
                  </span>
                </p>
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  {hasLiked ? (
                    <>
                      <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                      This track is in your Releases
                    </>
                  ) : (
                    "Like this post to add this track to your Releases"
                  )}
                </p>
              </div>
            </button>
          )}
        </div>
      </div>
      {/* 3-dot menu - positioned above fixed BottomNavigation (5rem) + safe-area */}
      <div 
        className="absolute right-4 z-30"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button 
              ref={menuTriggerRef}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors"
              data-testid="button-more-options"
            >
              <MoreVertical className="w-5 h-5 text-white" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-sm">
            <DropdownMenuItem 
              onClick={handleShare}
              className="relative flex select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer text-[#000000] pl-[6px] pr-[6px] pt-[6px] pb-[6px] ml-[0px] mr-[0px] font-normal"
              data-testid="menu-item-share"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              Share Video
            </DropdownMenuItem>
            <DropdownMenuItem 
              onSelect={(e) => {
                e.preventDefault();
                handleReport();
              }}
              className="cursor-pointer text-red-600 focus:text-red-600"
              data-testid="menu-item-report"
            >
              <Flag className="w-4 h-4 mr-2" />
              Report Video
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Report Modal */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          // Restore focus to menu trigger after modal closes
          // Wait for Dialog's aria-hidden cleanup to complete
          // Use a small delay to ensure Radix has finished cleanup
          setTimeout(() => {
            const root = document.getElementById('root');
            // Check if root still has aria-hidden - if so, wait a bit more
            if (root?.getAttribute('aria-hidden')) {
              // Root still has aria-hidden, wait for cleanup
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (menuTriggerRef.current && document.contains(menuTriggerRef.current)) {
                    menuTriggerRef.current.focus({ preventScroll: true });
                  }
                });
              });
            } else {
              // Root is clean, safe to restore focus
              if (menuTriggerRef.current && document.contains(menuTriggerRef.current)) {
                menuTriggerRef.current.focus({ preventScroll: true });
              }
            }
          }, 10);
        }}
        type="post"
        postId={post.id}
      />
      {/* Comments Modal */}
      {commentsPost && (
        <CommentsModal
          post={commentsPost}
          isOpen={showComments}
          onClose={() => {
            if (debugComments) {
              console.log("[CommentsOpen] close", { modalPostId: commentsPost.id });
            }
            setShowComments(false);
            setCommentsPost(null);
          }}
        />
      )}
      {/* Community Verification Dialog (post owner only) */}
      <CommunityVerificationDialog 
        postId={post.id}
        isOpen={showVerificationDialog}
        onClose={() => setShowVerificationDialog(false)}
      />
      {/* Artist Verification Dialog (tagged artist only) */}
      <ArtistVerificationDialog
        postId={post.id}
        isOpen={showArtistVerificationDialog}
        onClose={() => setShowArtistVerificationDialog(false)}
      />
    </div>
  );
}
