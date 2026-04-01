
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Heart, MessageCircle, Bookmark, Share2, Check, Clock, X, CheckCircle, Trash2, ShieldCheck, MoreVertical, Link as LinkIcon, Flag, Music, Edit2, MapPin, Users, Volume2, VolumeX } from "lucide-react";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { PostWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { GoldVerifiedTick, goldAvatarGlowShadowClass } from "./verified-artist";
import { UserRoleInlineIcons } from "./moderator-shield";
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
import { getGenreChipStyle, getGenreGlowPillStyle, STATUS_GLOW_PILL_BG } from "@/lib/genre-styles";
import { isDefaultAvatarUrl } from "@/lib/default-avatar";
import { useUserProfileLightPopup } from "@/components/user-profile-light-popup";
import { formatUsernameDisplay, cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media-url";
import { RandomDiceButton } from "@/components/random-dice-button";
// Removed placeholder video import - now using real uploaded videos

/**
 * Feed video fit: aspect-ratio tiers + estimated `object-cover` crop in the actual video stage
 * (no raw video pixel-height heuristics). Square / landscape stays contained.
 *
 * r = displayWidth / displayHeight (portrait ⇒ r < 1).
 */
const PORTRAIT_R_9_16 = 9 / 16;
/** Band around 9:16 for encoder rounding / slight reframings (original near-9:16 fix). */
const NEAR_9_16_TOLERANCE = 0.03;
/** Immersive portrait through ~3:5 and a bit beyond — always cover in the feed. */
const IMMERSIVE_PORTRAIT_R_MAX = 0.63;
/** If cover would crop more than this fraction of the scaled frame on either axis, use contain. */
const MAX_ACCEPTABLE_COVER_CROP = 0.13;

function estimateCoverMaxCropFraction(
  vw: number,
  vh: number,
  cw: number,
  ch: number,
): number {
  if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return 1;
  const s = Math.max(cw / vw, ch / vh);
  const dw = s * vw;
  const dh = s * vh;
  let fh = 0;
  let fv = 0;
  if (dw > cw) fh = (dw - cw) / dw;
  if (dh > ch) fv = (dh - ch) / dh;
  return Math.max(fh, fv);
}

function resolveFeedVideoObjectFit(
  vw: number,
  vh: number,
  cw: number,
  ch: number,
): "cover" | "contain" {
  if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return "contain";
  if (vh <= vw) return "contain";

  const r = vw / vh;
  const crop = estimateCoverMaxCropFraction(vw, vh, cw, ch);

  // Taller / narrower than near-9:16 (e.g. 9:18): cover only when crop stays mild.
  if (r < PORTRAIT_R_9_16 - NEAR_9_16_TOLERANCE) {
    return crop <= MAX_ACCEPTABLE_COVER_CROP ? "cover" : "contain";
  }

  // True / near 9:16 through moderately tall portrait — edge-fill (fixes iPhone letterboxing).
  if (r <= IMMERSIVE_PORTRAIT_R_MAX) {
    return "cover";
  }

  // Squarer portrait (4:5, etc.): fill only when cover barely trims; otherwise full frame + black.
  return crop <= MAX_ACCEPTABLE_COVER_CROP ? "cover" : "contain";
}

interface VideoCardProps {
  post: PostWithUser;
  isHighlighted?: boolean;
  showStatusBadge?: boolean;
  /** Use scrollport height (e.g. Profile Likes snap viewer) instead of full viewport. */
  embeddedFeed?: boolean;
  isMuted?: boolean;
  isActive?: boolean;
  shouldLoadVideo?: boolean;
  videoPreload?: "none" | "metadata" | "auto";
  onToggleMute?: () => void;
  /** Home random mode: dice above Like; `enterGeneration` bumps each time Random mode is entered. */
  feedRandomDice?: {
    onPress: () => void;
    delayPressMs?: number;
    disabled?: boolean;
    enterGeneration: number;
    exiting?: boolean;
    showIntroGlow?: boolean;
  };
}

export function VideoCard({
  post,
  isHighlighted = false,
  showStatusBadge = false,
  embeddedFeed = false,
  isMuted = true,
  isActive = true,
  shouldLoadVideo = true,
  videoPreload = "metadata",
  onToggleMute,
  feedRandomDice,
}: VideoCardProps) {
  const [, navigate] = useLocation();
  const releasePreview = (post as any).releasePreview as {
    id: string;
    title: string;
    artworkUrl: string | null;
    releaseDate: string | null;
    isComingSoon?: boolean;
    ownerUsername: string;
    ownerArtistId?: string | null;
    collaborators: { username: string; status: string }[];
  } | null | undefined;
  const showVerifyDebug =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "verify";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage: userProfileImage, currentUser: contextUser } = useUser();
  const { openByUsername, popup: userProfilePopup } = useUserProfileLightPopup();
  const debugComments =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "comments";
  const [hasLiked, setHasLiked] = useState(post.hasLiked || false);
  const [likes, setLikes] = useState(post.likes);

  const postOwnerId =
    (post as any).user_id ?? post.userId ?? post.user?.id ?? null;
  const isPostUploader = !!contextUser?.id && postOwnerId === contextUser.id;

  const isPostIdentified = post.verificationStatus === "identified" || post.verificationStatus === "community";
  const isReleaseOwner =
    !!contextUser?.id &&
    !!releasePreview?.ownerArtistId &&
    releasePreview.ownerArtistId === contextUser.id;
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
  const wasActiveRef = useRef<boolean>(isActive);
  const activationRunRef = useRef(0);
  const primedAtStartRef = useRef(false);
  const hasManuallyToggledLike = useRef(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [showLoadingFallback, setShowLoadingFallback] = useState(false);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const [videoIntrinsic, setVideoIntrinsic] = useState<{ w: number; h: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);

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
  }, [post.id, post.hasLiked, post.likes]); // Avoid depending on `post` reference — cache updates replace the object every time

  const videoSrc =
    resolveMediaUrl(
      (post.videoUrl && String(post.videoUrl)) ||
        ((post as any).video_url != null && String((post as any).video_url)) ||
        ""
    ) || "";

  useEffect(() => {
    setVideoIntrinsic(null);
  }, [post.id, videoSrc]);

  useLayoutEffect(() => {
    const el = videoStageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setStageSize({ w, h });
    };
    apply();

    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const feedVideoObjectFit = useMemo(() => {
    if (!videoIntrinsic || !stageSize) return "contain" as const;
    return resolveFeedVideoObjectFit(
      videoIntrinsic.w,
      videoIntrinsic.h,
      stageSize.w,
      stageSize.h,
    );
  }, [videoIntrinsic, stageSize]);

  // Ensure looping remains seamless once a clip is actively playing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    // Cleanup
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [post.id, videoSrc]);

  // Keep DOM media muted state aligned with feed-level preference + active post gating.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const shouldMute = isMuted || !isActive;
    video.muted = shouldMute;
    if (!isActive || !shouldLoadVideo) {
      if (!video.paused) video.pause();
      setIsVideoReady(false);
    }
  }, [isMuted, isActive, post.id, shouldLoadVideo]);

  // Pre-warm nearby inactive videos to frame 0 so next swipe can reveal instantly.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoadVideo || isActive) return;
    primedAtStartRef.current = false;

    const primeToStart = () => {
      try {
        video.currentTime = 0;
      } catch {
        return;
      }
      primedAtStartRef.current = true;
    };

    if (video.readyState >= 1) {
      primeToStart();
      return;
    }

    const onLoadedMetadata = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      primeToStart();
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [isActive, shouldLoadVideo, post.id]);

  // Deterministic activation pipeline:
  // hide video -> loadedmetadata -> seek(0) -> play -> reveal on "playing".
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldLoadVideo || !isActive) {
      setIsVideoReady(false);
      return;
    }

    const runId = activationRunRef.current + 1;
    activationRunRef.current = runId;
    setIsVideoReady(false);
    setShowLoadingFallback(false);

    const stillCurrent = () => activationRunRef.current === runId && isActive;
    const reveal = () => {
      if (stillCurrent()) setIsVideoReady(true);
    };
    let revealFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const clearFallbackTimer = () => {
      if (revealFallbackTimer) {
        clearTimeout(revealFallbackTimer);
        revealFallbackTimer = null;
      }
    };
    const playAndReveal = () => {
      if (!stillCurrent()) return;
      const onPlaying = () => {
        clearFallbackTimer();
        reveal();
      };
      video.addEventListener("playing", onPlaying, { once: true });
      if (isPlayingRef.current) {
        video.play().then(() => {
          // playing event usually follows; keep fallback for WebKit edge cases.
        }).catch(() => {
          // If autoplay is blocked, still reveal frame-0 so UI doesn't stay in loading state.
          clearFallbackTimer();
          reveal();
        });
      } else {
        clearFallbackTimer();
        reveal();
      }
      // iOS/WebKit can miss a "playing" callback occasionally; reveal after a short grace period.
      revealFallbackTimer = setTimeout(() => {
        reveal();
      }, 260);
    };

    const revealNowAndPlay = () => {
      if (!stillCurrent()) return;
      reveal();
      if (isPlayingRef.current && video.paused) {
        video.play().catch(() => {
          // Ignore autoplay races; frame-0 is already visible.
        });
      }
    };

    const seekToStart = () => {
      if (!stillCurrent()) return;
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        playAndReveal();
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      try {
        video.currentTime = 0;
      } catch {
        // If seek throws transiently, reveal once media is still playable.
        video.removeEventListener("seeked", onSeeked);
        playAndReveal();
        return;
      }
      // currentTime already 0 can skip seeked in some browsers.
      if (Math.abs(video.currentTime) < 0.01) {
        video.removeEventListener("seeked", onSeeked);
        playAndReveal();
      }
    };

    if (primedAtStartRef.current && video.readyState >= 2) {
      // Fast path for prewarmed neighbors: reveal immediately, then play.
      // This removes the visible wait on `playing` for normal swipe handoff.
      revealNowAndPlay();
      return () => {
        clearFallbackTimer();
      };
    }

    if (video.readyState >= 1) {
      seekToStart();
      return;
    }

    const onLoadedMetadata = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      seekToStart();
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });

    return () => {
      clearFallbackTimer();
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [isActive, post.id, shouldLoadVideo]);

  useEffect(() => {
    if (!shouldLoadVideo) {
      const video = videoRef.current;
      if (video && !video.paused) video.pause();
      setIsVideoReady(false);
      setShowLoadingFallback(false);
      primedAtStartRef.current = false;
    }
  }, [shouldLoadVideo, post.id]);

  useEffect(() => {
    if (!isActive || isVideoReady) {
      setShowLoadingFallback(false);
      return;
    }
    const t = window.setTimeout(() => setShowLoadingFallback(true), 160);
    return () => window.clearTimeout(t);
  }, [isActive, isVideoReady, post.id]);

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
      const response = await fetch(apiUrl("/api/user/current"));
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
  });

  const getStatusBadge = () => {
    /** Same footprint as `post-genre-tag`: padding, type size, leading, radius; glow from `getGenreGlowPillStyle`. */
    const statusPillBase =
      "inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15";
    const iconBaseClass = "h-3 w-3 shrink-0";
    const renderStatus = (
      icon: JSX.Element,
      label: string,
      testId: string,
      glowBgHex: string,
    ) => (
      <span
        className={statusPillBase}
        style={getGenreGlowPillStyle(glowBgHex, "text-white")}
        data-testid={testId}
      >
        {icon}
        {label}
      </span>
    );

    const verificationStatus = post.verificationStatus ?? (post as any).verification_status;

    // Community source first so it never falls through to another identified source
    if (verificationStatus === "community") {
      return renderStatus(
        <Users className={iconBaseClass} />,
        "Identified",
        "badge-community-identified",
        STATUS_GLOW_PILL_BG.identified,
      );
    }

    // Artist verification takes precedence: if artist confirmed, show Artist Verified
    const isArtistVerifiedPost = !!((post as any).isVerifiedArtist ?? (post as any).is_verified_artist);
    const artistVerifiedBy = (post as any).artistVerifiedBy ?? (post as any).artist_verified_by;
    if (isArtistVerifiedPost && artistVerifiedBy) {
      return renderStatus(
        <GoldVerifiedTick className={`${iconBaseClass} text-[#FFD700]`} />,
        "Identified",
        "badge-artist-verified",
        STATUS_GLOW_PILL_BG.identified,
      );
    }
    
    // Show identified badge if moderator confirmed (fallback when no artist verification)
    if (verificationStatus === "identified") {
      return renderStatus(
        <Check className={`${iconBaseClass} text-white`} />,
        "Identified",
        "badge-identified",
        STATUS_GLOW_PILL_BG.identified,
      );
    }
    
    // Show under review badge
    if (verificationStatus === "under_review") {
      return (
        <span
          className={statusPillBase}
          style={getGenreGlowPillStyle(STATUS_GLOW_PILL_BG.underReview, "text-white")}
          data-testid="badge-under-review"
        >
          <ShieldCheck className={iconBaseClass} />
          Under review by moderators
        </span>
      );
    }
    
    // Unidentified should always show a red status pill
    if (verificationStatus === "unverified") {
      return (
        <span
          className={statusPillBase}
          style={getGenreGlowPillStyle(STATUS_GLOW_PILL_BG.unidentified, "text-white")}
          data-testid="badge-unidentified"
        >
          <Clock className={iconBaseClass} />
          Unidentified
        </span>
      );
    }
    
    return null;
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

  const formatPlayedDate = (value: string | Date | null | undefined) => {
    if (!value) return "";
    if (typeof value === "string") {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const yyyy = Number(match[1]);
        const mm = Number(match[2]) - 1;
        const dd = Number(match[3]);
        return new Date(yyyy, mm, dd).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }

      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      }

      return value;
    }

    return value.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  // Check if artist is verified
  const isVerifiedArtist = post.user.account_type === 'artist' && post.user.verified_artist === true;
  const isModeratorUser = !!post.user.moderator;
  const postAvatarSrc =
    contextUser && post.userId === contextUser.id
      ? (userProfileImage || post.user.avatar_url || undefined)
      : (post.user.avatar_url || undefined);

  const genreChip = getGenreChipStyle(post.genre);
  const statusBadgeEl = getStatusBadge();

  /** Match scrollport height (not 100vh) so mandatory snap + slow drags settle reliably. */
  const snapHeightClass = "min-h-full h-full";

  return (
    <div
      className={`${snapHeightClass} relative w-full shrink-0 snap-start snap-always [scroll-snap-stop:always] ${
        isHighlighted ? "ring-4 ring-inset ring-primary" : ""
      }`}
      data-post-id={post.id}
    >
      {/* Video background: ratio-tiered cover vs contain; black shows only when contained. */}
      <div ref={videoStageRef} className="absolute inset-0 flex items-center justify-center bg-black">
        <video
          key={`${post.id}-${videoSrc}`}
          ref={videoRef}
          className={`w-full h-full cursor-pointer transition-opacity duration-150 ${
            feedVideoObjectFit === "cover" ? "object-cover object-center" : "object-contain"
          } ${isVideoReady ? "opacity-100" : "opacity-0"}`}
          src={shouldLoadVideo ? (videoSrc || undefined) : undefined}
          autoPlay
          muted={isMuted || !isActive}
          loop
          playsInline
          preload={videoPreload}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              setVideoIntrinsic({ w: v.videoWidth, h: v.videoHeight });
            }
          }}
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
        />
        {isActive && !isVideoReady && showLoadingFallback ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-900/85 via-zinc-900/75 to-zinc-950/90">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-white/60 border-t-transparent animate-spin" aria-hidden />
              <span className="text-[10px] font-medium tracking-wide text-white/70">Loading video</span>
            </div>
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60 pointer-events-none" />
      </div>
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

        const railBtn =
          "group flex w-full flex-col items-center gap-1 touch-manipulation";
        /** 44px min tap target (iOS HIG); no circular pill — icons read via stroke + drop shadow on varied video. */
        const railIconWrap =
          "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center active:scale-[0.94] sm:min-h-12 sm:min-w-12 [&_svg]:drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]";

        return (
          <>
            {showVerifyDebug && debugInfo && (
              <div className="absolute left-2 right-2 top-14 z-20 rounded bg-black/80 p-2 font-mono text-xs text-green-400">
                <div>viewer_id (currentUserId): {String(debugInfo.currentUserId ?? "null")}</div>
                <div>user_id (postOwnerId): {String(debugInfo.postOwnerId ?? "null")}</div>
                <div>isOwner: {String(debugInfo.isOwner)}</div>
                <div>canVerify: {String(debugInfo.canVerify)}</div>
                <div>
                  hasComments: {String(debugInfo.hasComments)} | isTaggedArtist: {String(debugInfo.isTaggedArtist)} |
                  status: {String(debugInfo.status)}
                </div>
              </div>
            )}
            {/* Right action rail — top→bottom: Like, Comment, optional verify/delete, More (short-form pattern) */}
            <div
              data-video-action-rail
              className="absolute bottom-[clamp(calc(4.5rem+env(safe-area-inset-bottom,0px)),14lvh,7rem)] right-[max(0.5rem,env(safe-area-inset-right,0px))] z-20 flex w-[var(--video-feed-rail-width)] flex-col items-center gap-4"
            >
              {feedRandomDice ? (
                <div
                  key={feedRandomDice.enterGeneration}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 motion-reduce:animate-none",
                    feedRandomDice.exiting
                      ? "animate-random-dice-rail-exit"
                      : "animate-random-dice-rail-enter",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full motion-reduce:animate-none",
                      feedRandomDice.showIntroGlow && !feedRandomDice.exiting
                        ? "animate-random-dice-rail-glow-once transform-gpu will-change-[filter] motion-reduce:will-change-auto"
                        : null,
                    )}
                  >
                    <RandomDiceButton
                      active
                      disabled={feedRandomDice.disabled}
                      delayPressMs={feedRandomDice.delayPressMs}
                      onPress={feedRandomDice.onPress}
                      aria-label="Next random track"
                      className={cn(
                        railIconWrap,
                        "!min-h-[44px] !min-w-[44px] border-0 bg-transparent p-0 shadow-none ring-0 sm:!min-h-12 sm:!min-w-12",
                      )}
                      iconWrapClassName="!size-7 sm:!size-7"
                      iconClassName="!h-full !w-full !text-white"
                    />
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className={railBtn}
                onClick={() => likeMutation.mutate()}
                disabled={likeMutation.isPending}
              >
                <div className={railIconWrap}>
                  <Heart className={`h-7 w-7 ${hasLiked ? "fill-red-500 text-red-500" : "text-white"}`} />
                </div>
                <span className="max-w-[3.25rem] truncate text-center text-[11px] font-medium leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {formatCount(likes)}
                </span>
              </button>

              <button
                type="button"
                className={railBtn}
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
                <div className={railIconWrap}>
                  <MessageCircle className="h-7 w-7 text-white" />
                </div>
                <span className="max-w-[3.25rem] truncate text-center text-[11px] font-medium leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {formatCount(post.comments)}
                </span>
              </button>

              {canVerify ? (
                <button
                  type="button"
                  className={railBtn}
                  onClick={() => (isOwner ? setShowVerificationDialog(true) : setShowArtistVerificationDialog(true))}
                  data-testid={isOwner ? "button-community-verify" : "button-artist-verify"}
                  title={isOwner ? "Mark comment as correct" : "Confirm or deny track"}
                >
                  <div className={railIconWrap}>
                    <ShieldCheck className="h-6 w-6 text-blue-400" />
                  </div>
                  <span className="max-w-[3.25rem] text-center text-[10px] font-medium leading-tight text-blue-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">
                    {isOwner ? "Mark" : "ID"}
                  </span>
                </button>
              ) : null}

              {isOwner ? (
                <button
                  type="button"
                  className={railBtn}
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this post?")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-post"
                >
                  <div className={railIconWrap}>
                    <Trash2 className="h-6 w-6 text-red-400" />
                  </div>
                  <span className="text-[10px] font-medium leading-none text-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">Del</span>
                </button>
              ) : null}

              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    ref={menuTriggerRef}
                    aria-label="More options"
                    className={`${railBtn} !gap-0 outline-none ring-0 ring-offset-0 [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:bg-transparent data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:ring-offset-0 data-[state=open]:shadow-none`}
                    data-testid="button-more-options"
                  >
                    <div className={railIconWrap}>
                      <MoreVertical className="h-6 w-6 text-white" />
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-sm">
                  <DropdownMenuItem
                    onClick={handleShare}
                    className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 pl-[6px] pr-[6px] pt-[6px] pb-[6px] text-sm font-normal text-[#000000] outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled:pointer-events-none] data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                    data-testid="menu-item-share"
                  >
                    <LinkIcon className="mr-2 h-4 w-4" />
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
                    <Flag className="mr-2 h-4 w-4" />
                    Report Video
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                className={`${railBtn} transition-transform duration-150 active:scale-95`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleMute?.();
                }}
                aria-label={isMuted ? "Unmute video" : "Mute video"}
                data-testid="button-toggle-mute"
              >
                <div className={`${railIconWrap} transition-all duration-150`}>
                  {isMuted ? <VolumeX className="h-6 w-6 text-white/95" /> : <Volume2 className="h-6 w-6 text-white" />}
                </div>
              </button>
            </div>
          </>
        );
      })()}
      {/* Bottom content — padding-right reserves rail (scrollport already clears shell nav). */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent py-5 pl-3 pr-[calc(var(--video-feed-rail-width)+0.65rem)] pt-12 sm:py-6 sm:pl-4 sm:pt-14 ${embeddedFeed ? "pb-3" : ""}`}
      >
        {/* pointer-events-none here + inherited none on text: wheel/click reach feed + video; only explicit auto hits targets */}
        <div className="pointer-events-none flex flex-col gap-2 overflow-visible">
          <div className="overflow-x-visible py-0.5 pl-0.5 pr-1">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (post.user?.username) openByUsername(post.user.username);
                }}
                aria-label={
                  post.user.username ? `View profile ${formatUsernameDisplay(post.user.username)}` : "View profile"
                }
                data-testid="post-author-identity"
              >
                <div className="relative shrink-0">
                  <img
                    src={postAvatarSrc}
                    alt=""
                    className={`avatar-media h-10 w-10 rounded-full border-2 ${
                      isDefaultAvatarUrl(postAvatarSrc) ? "avatar-default-media" : ""
                    } ${isVerifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : ""}`}
                    style={!isVerifiedArtist ? { borderColor: genreChip.bgColor } : undefined}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <span
                        className={`min-w-0 truncate font-semibold text-sm ${
                          isVerifiedArtist ? "text-[#FFD700]" : "text-white"
                        }`}
                        title={post.user.username ? formatUsernameDisplay(post.user.username) : undefined}
                      >
                        {formatUsernameDisplay(post.user.username)}
                      </span>
                      <UserRoleInlineIcons
                        verifiedArtist={isVerifiedArtist}
                        moderator={isModeratorUser}
                        tickClassName="h-4 w-4 shrink-0 -mt-0.5"
                        shieldSizeClass="h-[1.125rem] w-[1.125rem]"
                        shieldTone="onDark"
                      />
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {(post.title || post.description) ? (
              <div className="mt-2 space-y-2">
                {post.title && (
                  <p className="line-clamp-2 text-sm font-semibold text-white break-words" title={post.title}>
                    {post.title}
                  </p>
                )}
                {post.description && (
                  <p
                    className="line-clamp-4 text-sm font-medium text-white break-words"
                    title={post.description}
                  >
                    {post.description}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 overflow-visible px-0.5 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs leading-relaxed text-gray-300">
              {statusBadgeEl ? (
                <>
                  {statusBadgeEl}
                  <span className="text-gray-500 select-none" aria-hidden>
                    •
                  </span>
                </>
              ) : null}
              <span
                data-testid="post-genre-tag"
                className="inline-block rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15"
                style={getGenreGlowPillStyle(genreChip.bgColor, genreChip.textClass)}
              >
                {genreChip.label}
              </span>
              <span className="text-gray-500 select-none" aria-hidden>
                •
              </span>
              {post.djName && <span>Played by: {post.djName}</span>}
              {post.djName && (
                <span className="text-gray-500 select-none" aria-hidden>
                  •
                </span>
              )}
              <span>
                {post.playedDate
                  ? `Played on: ${formatPlayedDate(post.playedDate)}`
                  : post.createdAt
                    ? formatTimeAgo(post.createdAt)
                    : "Recently"}
              </span>
              {post.location && (
                <>
                  <span className="text-gray-500 select-none" aria-hidden>
                    •
                  </span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-gray-300 shrink-0" aria-hidden />
                    <span className="truncate">{post.location}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {releasePreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(isReleaseOwner ? `/releases/${releasePreview.id}/edit` : `/releases/${releasePreview.id}`);
              }}
              className="pointer-events-auto mt-2 flex min-h-0 w-full min-w-0 items-start gap-2.5 rounded-lg bg-black/45 p-2.5 text-left backdrop-blur-sm transition-colors hover:bg-black/55 sm:mt-3 sm:gap-3 sm:p-3"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:h-12 sm:w-12">
                {releasePreview.artworkUrl ? (
                  <img src={releasePreview.artworkUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Music className="h-5 w-5 text-gray-500 sm:h-6 sm:w-6" />
                )}
              </div>
              <div className="min-w-0 flex-1 overflow-visible">
                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white sm:text-xs">
                  {formatReleaseTitleLine(
                    releasePreview.ownerUsername,
                    releasePreview.title,
                    releasePreview.collaborators
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400 sm:text-xs">
                  {releasePreview.isComingSoon
                    ? "Coming soon..."
                    : releasePreview.releaseDate
                      ? formatDate(releasePreview.releaseDate)
                      : ""}
                  <span
                    className={`ml-1.5 inline-block rounded px-1 py-0.5 text-[9px] sm:text-[10px] ${
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
                <p className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-gray-400 sm:text-[11px]">
                  {isReleaseOwner ? (
                    <>
                      <Edit2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      <span>Edit release</span>
                    </>
                  ) : isPostUploader && isPostIdentified ? (
                    <>
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                      <span className="line-clamp-3">Saved to your Releases</span>
                    </>
                  ) : hasLiked ? (
                    <>
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                      <span>In your Releases</span>
                    </>
                  ) : (
                    <span className="line-clamp-3">Like to add this track to your Releases</span>
                  )}
                </p>
              </div>
            </button>
          )}
        </div>
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
      {userProfilePopup}
    </div>
  );
}
