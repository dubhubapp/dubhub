
import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Heart, MessageCircle, Bookmark, Share2, Check, Clock, X, CheckCircle, Trash2, ShieldCheck, MoreVertical, Link as LinkIcon, Flag } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { TrackWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { CommentsModal } from "./comments-modal";
import { CommunityVerificationDialog } from "./community-verification-dialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
// Removed placeholder video import - now using real uploaded videos

interface VideoCardProps {
  track: TrackWithUser;
  isHighlighted?: boolean;
  showStatusBadge?: boolean;
}

export function VideoCard({ track, isHighlighted = false, showStatusBadge = false }: VideoCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage: userProfileImage, currentUser: contextUser } = useUser();
  const [isLiked, setIsLiked] = useState(track.isLiked || false);
  const [isSaved, setIsSaved] = useState(track.isSaved || false);
  const [likes, setLikes] = useState(track.likes);
  const [saves, setSaves] = useState(track.saves);
  const [showComments, setShowComments] = useState(false);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isPlayingRef = useRef(true);

  // Keep ref in sync with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Sync state with track prop when it changes (e.g., after navigation or refresh)
  useEffect(() => {
    setIsLiked(track.isLiked || false);
    setIsSaved(track.isSaved || false);
    setLikes(track.likes);
    setSaves(track.saves);
  }, [track.isLiked, track.isSaved, track.likes, track.saves]);

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
  }, [track.videoUrl]);

  const likeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/posts/${track.id}/like`),
    onSuccess: async (response) => {
      const data = await response.json();
      setIsLiked(data.isLiked);
      setLikes(data.counts.likes);
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to like track", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tracks/${track.id}/save`),
    onSuccess: async (response) => {
      const data = await response.json();
      setIsSaved(data.isSaved);
      setSaves(data.counts.saves);
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      if (contextUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", contextUser.id, "saved"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", contextUser.id, "stats"] });
      }
      
      toast({
        title: data.isSaved ? "Track Saved" : "Track Removed",
        description: data.isSaved ? "Added to your saved tracks" : "Removed from saved tracks",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save track", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/tracks/${track.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      toast({
        title: "Track Deleted",
        description: "Your track has been successfully deleted.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete track", variant: "destructive" });
    },
  });

  const reportMutation = useMutation({
    mutationFn: (reason: string) => apiRequest("POST", `/api/tracks/${track.id}/report`, { reason }),
    onSuccess: () => {
      toast({
        title: "Track Reported",
        description: "Thank you for reporting. Our moderators will review this track.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to report track", variant: "destructive" });
    },
  });

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/?track=${track.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link Copied",
        description: "Track link copied to clipboard",
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleReport = () => {
    const reason = prompt("Please provide a reason for reporting this track:");
    if (reason && reason.trim()) {
      reportMutation.mutate(reason.trim());
    }
  };

  // Get current user to check if they own this track
  const { data: currentUser } = useQuery({
    queryKey: ["/api/user/current"],
    queryFn: async () => {
      const response = await fetch("/api/user/current");
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
  });

  const getStatusBadge = () => {
    // Show identified badge if moderator confirmed
    if (track.verificationStatus === "identified") {
      return (
        <span className="bg-green-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium" data-testid="badge-identified">
          <CheckCircle className="w-3 h-3 inline mr-1" />
          Identified
        </span>
      );
    }
    
    // Show community identified badge if uploader marked but not yet moderator approved
    if (track.verificationStatus === "community") {
      return (
        <span className="bg-blue-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium" data-testid="badge-community-identified">
          <ShieldCheck className="w-3 h-3 inline mr-1" />
          Community Identified
        </span>
      );
    }
    
    // Show unidentified badge when explicitly requested (e.g., in profile Posts tab)
    if (showStatusBadge && track.verificationStatus === "unverified" && track.status !== "confirmed") {
      return (
        <span className="bg-gray-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium" data-testid="badge-unidentified">
          <Clock className="w-3 h-3 inline mr-1" />
          Unidentified
        </span>
      );
    }
    
    // Fall back to old status badges
    switch (track.status) {
      case "confirmed":
        return (
          <span className="bg-green-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium">
            <Check className="w-3 h-3 inline mr-1" />
            Track Identified
          </span>
        );
      case "pending":
        return (
          <span className="bg-yellow-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium">
            <Clock className="w-3 h-3 inline mr-1" />
            Pending
          </span>
        );
      case "rejected":
        return (
          <span className="bg-red-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium">
            <X className="w-3 h-3 inline mr-1" />
            Rejected
          </span>
        );
      default:
        return null;
    }
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
  // For now, use isVerified from Neon DB (legacy field)
  // TODO: Fetch verified_artist from Supabase profiles for accurate verification
  const isVerifiedArtist = track.user.userType === 'artist' && track.user.isVerified;



  return (
    <div 
      className={`h-screen w-full relative snap-start flex-shrink-0 transition-all duration-300 ${
        isHighlighted ? 'ring-4 ring-primary ring-inset' : ''
      }`}
      data-track-id={track.id}
    >
      {/* Video background */}
      <div className="absolute inset-0">
        <video 
          ref={videoRef}
          className="w-full h-full object-cover cursor-pointer"
          autoPlay 
          muted 
          loop 
          playsInline
          preload="auto"
          onClick={(e) => {
            e.preventDefault();
            const video = videoRef.current;
            if (video) {
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
          <source src={track.videoUrl || ""} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60 pointer-events-none" />
      </div>
      {/* Top overlay with status */}
      <div className="absolute top-20 left-4 right-20 z-10">
        <div className="flex gap-2 mb-4">
          {getStatusBadge()}
        </div>
      </div>
      {/* Right side actions */}
      <div className="absolute right-4 bottom-32 z-10 flex flex-col items-center space-y-6">
        {/* Like button */}
        <button 
          className="flex flex-col items-center group"
          onClick={() => likeMutation.mutate()}
          disabled={likeMutation.isPending}
        >
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
            <Heart className={`w-6 h-6 ${isLiked ? "text-red-500 fill-red-500" : "text-white"}`} />
          </div>
          <span className="text-xs mt-1 font-medium text-white">{formatCount(likes)}</span>
        </button>

        {/* Comment button */}
        <button 
          className="flex flex-col items-center group"
          onClick={() => setShowComments(true)}
        >
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-xs mt-1 font-medium text-white">{formatCount(track.comments)}</span>
        </button>

        {/* Save button */}
        <button 
          className="flex flex-col items-center group"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
            <Bookmark className={`w-6 h-6 ${isSaved ? "text-accent fill-accent" : "text-white"}`} />
          </div>
          <span className="text-xs mt-1 font-medium text-white">{formatCount(saves)}</span>
        </button>

        {/* Community Verify button - only show for track owner if not already verified */}
        {currentUser && track.userId === currentUser.id && track.verificationStatus === "unverified" && (
          <button 
            className="flex flex-col items-center group"
            onClick={() => setShowVerificationDialog(true)}
            data-testid="button-community-verify"
          >
            <div className="w-12 h-12 rounded-full bg-blue-500/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
            <span className="text-xs mt-1 font-medium text-blue-400">ID Track</span>
          </button>
        )}

        {/* Delete button - only show for track owner */}
        {currentUser && track.userId === currentUser.id && (
          <button 
            className="flex flex-col items-center group"
            onClick={() => {
              if (confirm("Are you sure you want to delete this track?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-track"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/30 backdrop-blur-sm flex items-center justify-center group-active:scale-95">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <span className="text-xs mt-1 font-medium text-red-400">Delete</span>
          </button>
        )}
      </div>
      {/* Bottom content overlay */}
      <div className="absolute bottom-4 left-4 right-20 z-10">
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            {/* User avatar with verification */}
            <div className="relative">
              <img 
                src={
                  contextUser && track.userId === contextUser.id 
                    ? (userProfileImage || undefined)
                    : (track.user.profileImage || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`)
                }
                alt="User Profile" 
                className={`w-10 h-10 rounded-full border-2 ${
                  isVerifiedArtist 
                    ? "border-[#FFD700]" 
                    : track.genre === "DnB" 
                      ? "border-primary" 
                      : track.genre === "UKG" 
                        ? "border-secondary" 
                        : "border-green-600"
                }`}
              />
              {isVerifiedArtist && (
                <div title="Verified Artist Profile">
                  <CheckCircle className="absolute -bottom-1 -right-1 w-4 h-4 text-[#FFD700] bg-black rounded-full" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <p className={`font-semibold text-sm ${isVerifiedArtist ? "text-[#FFD700]" : "text-white"}`}>
                    @{track.user.username}
                  </p>
                  {isVerifiedArtist && (
                    <div title="Verified Artist Profile">
                      <CheckCircle className="w-4 h-4 text-[#FFD700]" />
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-300">{track.location}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-white">{track.description}</p>
            {track.status === "confirmed" && track.trackTitle && (
              <div className="bg-black/60 rounded-lg p-2">
                <p className="text-green-400 text-xs font-medium">This DnB track from Shy Focus set is absolutely mental! Anyone know the DnB 🔥</p>
                <p className="text-white text-sm font-semibold mt-1">DJ: Shy Focus</p>
                <p className="text-gray-300 text-xs">FABRIC, London</p>
                <p className="text-gray-400 text-xs mt-1">2025-08-04</p>
              </div>
            )}
            <div className="flex items-center space-x-2 text-xs text-gray-300">
              {track.djName && <span>Mixed by: {track.djName}</span>}
              {track.djName && <span>•</span>}
              <span>{formatTimeAgo(track.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
      {/* 3-dot menu in bottom right */}
      <div className="absolute bottom-4 right-4 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
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
              onClick={handleReport}
              className="cursor-pointer text-red-600 focus:text-red-600"
              data-testid="menu-item-report"
            >
              <Flag className="w-4 h-4 mr-2" />
              Report Video
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Comments Modal */}
      <CommentsModal 
        track={track}
        isOpen={showComments}
        onClose={() => setShowComments(false)}
      />
      {/* Community Verification Dialog */}
      <CommunityVerificationDialog 
        trackId={track.id}
        isOpen={showVerificationDialog}
        onClose={() => setShowVerificationDialog(false)}
      />
    </div>
  );
}
