import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient, useQuery, type InfiniteData } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
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
import { VinylLoader } from "@/components/ui/vinyl-loader";
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
import { playInteractionLight } from "@/lib/haptic";
import {
  dubhubVideoDebugEnabled,
  dubhubVideoDebugLog,
  getMediaReadyStateLabel,
  mediaResetLogCall,
  mediaResetLogTarget,
} from "@/lib/video-debug";
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

/** Press-and-hold on the far-right thumb strip for temporary 2× (longer = clearer vs scroll). */
const HOLD_2X_DELAY_MS = 400;
/** Cancel pending 2× if the finger moves farther than this (px) from the start (any direction). */
const HOLD_2X_MOVE_CANCEL_PX = 22;
/** If vertical movement dominates and exceeds this (px), treat as feed scroll — cancel 2× (no preventDefault on touch). */
const HOLD_2X_SCROLL_CANCEL_DY_PX = 14;

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

function getPostFeedPosterRaw(post: PostWithUser): string | null {
  const v =
    (post as { thumbnailUrl?: string }).thumbnailUrl ??
    (post as { thumbnail_url?: string }).thumbnail_url ??
    (post as { previewImage?: string }).previewImage ??
    (post as { preview_image?: string }).preview_image ??
    (post as { posterUrl?: string }).posterUrl ??
    (post as { poster_url?: string }).poster_url ??
    null;
  if (v == null || String(v).length === 0) return null;
  return String(v);
}

/** Max long edge for feed poster data-URLs — keeps captures small and drawImage cheap. */
const HOME_FEED_CAPTURE_MAX_EDGE_PX = 720;

/**
 * One JPEG data-URL frame from a decoded video element (Home poster fallback only).
 * Returns null if dimensions are invalid, draw is blocked (tainted canvas), or decode not ready.
 */
function tryCaptureVideoPosterJpegDataUrl(video: HTMLVideoElement): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw < 2 || vh < 2) return null;

  let tw = vw;
  let th = vh;
  if (vw >= vh) {
    if (vw > HOME_FEED_CAPTURE_MAX_EDGE_PX) {
      tw = HOME_FEED_CAPTURE_MAX_EDGE_PX;
      th = Math.max(2, Math.round((vh * HOME_FEED_CAPTURE_MAX_EDGE_PX) / vw));
    }
  } else {
    if (vh > HOME_FEED_CAPTURE_MAX_EDGE_PX) {
      th = HOME_FEED_CAPTURE_MAX_EDGE_PX;
      tw = Math.max(2, Math.round((vw * HOME_FEED_CAPTURE_MAX_EDGE_PX) / vh));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, tw, th);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
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
  /** Home feed only: when set with `onFeedOverlayCollapsedChange`, enables show less / show more overlay density. */
  feedOverlayCollapsed?: boolean;
  onFeedOverlayCollapsedChange?: (collapsed: boolean) => void;
  /** Home media epoch to force fresh <video> DOM instances after post-flow exits on WKWebView. */
  mediaEpoch?: number;
  /**
   * Home feed only: when true, synthesize a poster from decoded video if the post has no thumbnail
   * URLs (canvas capture + session-scoped state on the mounted card). Keeps CORS-friendly video
   * frames from flashing a black stage during snap/handoff.
   */
  homeFeedPosterFallback?: boolean;
}

function videoCardPropsEqual(prev: VideoCardProps, next: VideoCardProps): boolean {
  if (prev.post !== next.post) {
    if (prev.post.id !== next.post.id) return false;
    if (prev.post.likes !== next.post.likes) return false;
    if (prev.post.hasLiked !== next.post.hasLiked) return false;
    const pVid = (prev.post as { videoUrl?: string; video_url?: string }).videoUrl ?? (prev.post as { video_url?: string }).video_url;
    const nVid = (next.post as { videoUrl?: string; video_url?: string }).videoUrl ?? (next.post as { video_url?: string }).video_url;
    if (pVid !== nVid) return false;
    if (getPostFeedPosterRaw(prev.post) !== getPostFeedPosterRaw(next.post)) return false;
    if (prev.post.verificationStatus !== next.post.verificationStatus) return false;
    if (prev.post.description !== next.post.description) return false;
  }
  return (
    prev.isHighlighted === next.isHighlighted &&
    prev.showStatusBadge === next.showStatusBadge &&
    prev.embeddedFeed === next.embeddedFeed &&
    prev.isMuted === next.isMuted &&
    prev.isActive === next.isActive &&
    prev.shouldLoadVideo === next.shouldLoadVideo &&
    prev.videoPreload === next.videoPreload &&
    prev.onToggleMute === next.onToggleMute &&
    prev.feedOverlayCollapsed === next.feedOverlayCollapsed &&
    prev.onFeedOverlayCollapsedChange === next.onFeedOverlayCollapsedChange &&
    prev.mediaEpoch === next.mediaEpoch &&
    prev.feedRandomDice === next.feedRandomDice &&
    prev.homeFeedPosterFallback === next.homeFeedPosterFallback
  );
}

function VideoCardInner({
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
  feedOverlayCollapsed = false,
  onFeedOverlayCollapsedChange,
  mediaEpoch = 0,
  homeFeedPosterFallback = false,
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
  const handleOpenPostAuthorProfile = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (post.user?.username) openByUsername(post.user.username);
    },
    [openByUsername, post.user?.username],
  );
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
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  const isPlayingRef = useRef(true);
  const activationRunRef = useRef(0);
  const primedAtStartRef = useRef(false);
  const hasManuallyToggledLike = useRef(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [showLoadingFallback, setShowLoadingFallback] = useState(false);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const [videoIntrinsic, setVideoIntrinsic] = useState<{ w: number; h: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const forcedLoadAtSrcRef = useRef<string | null>(null);

  /** Slim feed scrub bar: DOM-driven fill via ref + rAF; only mounted when active + finite duration. */
  const scrubFillRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const scrubRafRef = useRef(0);
  const scrubThumbRef = useRef<HTMLDivElement>(null);
  /** Smoothed 0–1 progress; avoids scrub thumb jumping when `playbackRate` flips (WebKit `currentTime` glitches). */
  const scrubSmoothedPRef = useRef(-1);
  const [scrubBarReady, setScrubBarReady] = useState(false);
  /** Drives overlay dim + readout; kept in sync with scrubbingRef on pointer lifecycle. */
  const [isScrubbingUi, setIsScrubbingUi] = useState(false);
  /** Scrub handle/notch: visible only while scrubbing; fades out on release (playback + fill unchanged). */
  const [showScrubThumb, setShowScrubThumb] = useState(false);
  const [scrubReadout, setScrubReadout] = useState<{ current: number; total: number } | null>(null);

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

  const feedPosterSourceKey = getPostFeedPosterRaw(post) ?? "";
  const feedPosterUrl = useMemo(
    () => (feedPosterSourceKey ? resolveMediaUrl(feedPosterSourceKey) || "" : ""),
    [feedPosterSourceKey],
  );

  const [generatedFeedPosterUrl, setGeneratedFeedPosterUrl] = useState<string | null>(null);
  const feedPosterCaptureKeyRef = useRef<string | null>(null);
  const feedInvasiveCaptureTriedRef = useRef(false);

  /** Prefer API thumbnail; else one client-side capture per mounted video revision (Home only). */
  const displayPosterUrl = feedPosterUrl || generatedFeedPosterUrl || "";

  /** Poster / thumbnail stays up until the card is both snapped-active and video can render. */
  const shouldShowPoster = !isActive || !isVideoReady;

  useEffect(() => {
    feedPosterCaptureKeyRef.current = null;
    feedInvasiveCaptureTriedRef.current = false;
    setGeneratedFeedPosterUrl(null);
  }, [post.id, videoSrc, mediaEpoch, homeFeedPosterFallback, feedPosterUrl]);

  // Home-only: lightweight first-frame JPEG from the existing `<video>` once data is decoded
  // (same element / preload tier as nearby cards — no extra network).
  useEffect(() => {
    if (!homeFeedPosterFallback || feedPosterUrl) return;
    if (!shouldLoadVideo || !videoSrc) return;

    const captureKey = `${post.id}|${videoSrc}|${mediaEpoch}`;
    if (feedPosterCaptureKeyRef.current === captureKey) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let detachSeeked: (() => void) | null = null;
    let activeRetryTimer: number | null = null;

    const finishCapture = () => {
      if (cancelled) return;
      const url = tryCaptureVideoPosterJpegDataUrl(video);
      if (url) {
        feedPosterCaptureKeyRef.current = captureKey;
        setGeneratedFeedPosterUrl(url);
      }
    };

    const run = () => {
      if (cancelled) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (feedPosterCaptureKeyRef.current === captureKey) return;

      const silent = tryCaptureVideoPosterJpegDataUrl(video);
      if (silent) {
        feedPosterCaptureKeyRef.current = captureKey;
        setGeneratedFeedPosterUrl(silent);
        return;
      }

      // Avoid pause/seek while snapped-active — fights the activation pipeline. Retry after decode.
      if (isActiveRef.current) {
        if (activeRetryTimer != null) window.clearTimeout(activeRetryTimer);
        activeRetryTimer = window.setTimeout(() => {
          activeRetryTimer = null;
          if (cancelled) return;
          if (feedPosterCaptureKeyRef.current === captureKey) return;
          const retry = tryCaptureVideoPosterJpegDataUrl(video);
          if (retry) {
            feedPosterCaptureKeyRef.current = captureKey;
            setGeneratedFeedPosterUrl(retry);
          }
        }, 320);
        return;
      }

      if (feedInvasiveCaptureTriedRef.current) return;
      feedInvasiveCaptureTriedRef.current = true;

      const wasPaused = video.paused;
      const prevTime = video.currentTime;
      try {
        video.pause();
      } catch {
        /* ignore */
      }

      const restore = () => {
        try {
          video.currentTime = prevTime;
        } catch {
          /* ignore */
        }
        if (!wasPaused && isActiveRef.current) {
          void video.play().catch(() => {
            /* ignore */
          });
        }
      };

      const onSeeked = () => {
        detachSeeked?.();
        detachSeeked = null;
        if (cancelled) {
          restore();
          return;
        }
        finishCapture();
        restore();
      };

      video.addEventListener("seeked", onSeeked, { once: true });
      detachSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        detachSeeked = null;
      };

      try {
        const target = Math.min(0.05, Number.isFinite(video.duration) && video.duration > 0.12 ? 0.05 : 0);
        video.currentTime = target;
        if (Math.abs(video.currentTime - target) < 0.02) {
          detachSeeked?.();
          finishCapture();
          restore();
        }
      } catch {
        detachSeeked?.();
        finishCapture();
        restore();
      }
    };

    run();
    video.addEventListener("loadeddata", run, { once: true });

    return () => {
      cancelled = true;
      if (activeRetryTimer != null) window.clearTimeout(activeRetryTimer);
      detachSeeked?.();
      video.removeEventListener("loadeddata", run);
    };
  }, [
    homeFeedPosterFallback,
    feedPosterUrl,
    shouldLoadVideo,
    videoSrc,
    post.id,
    mediaEpoch,
    isActive,
  ]);

  /** Temporary 2× speed while holding the right thumb zone (active post only). */
  const hold2xZoneRef = useRef<HTMLDivElement>(null);
  const hold2xTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold2xPointerIdRef = useRef<number | null>(null);
  const hold2xActivatedRef = useRef(false);
  const hold2xMoveExceededRef = useRef(false);
  const hold2xWinCleanupRef = useRef<(() => void) | null>(null);
  const [hold2xUiVisible, setHold2xUiVisible] = useState(false);
  const shouldLogCard = isActive;
  const debugLog = useCallback(
    (scope: "mount" | "state" | "event" | "overlay", message: string, payload?: Record<string, unknown>) => {
      if (!shouldLogCard) return;
      const tag = `[DubHub][VideoCard][${scope}]`;
      dubhubVideoDebugLog(tag, message, { postId: post.id, ...payload });
    },
    [post.id, shouldLogCard],
  );
  const debugLoadLog = useCallback(
    (message: string, payload?: Record<string, unknown>) => {
      if (!shouldLogCard) return;
      dubhubVideoDebugLog("[DubHub][VideoCard][load]", message, { postId: post.id, ...payload });
    },
    [post.id, shouldLogCard],
  );
  const debugResetLog = useCallback(
    (message: string, payload?: Record<string, unknown>) => {
      if (!shouldLogCard) return;
      dubhubVideoDebugLog("[DubHub][VideoCard][reset]", message, { postId: post.id, ...payload });
    },
    [post.id, shouldLogCard],
  );
  const bootMode: "current" | "minimal" =
    typeof window !== "undefined" && sessionStorage.getItem("dubhub_video_boot_mode") === "minimal"
      ? "minimal"
      : "current";
  const isMinimalBootMode = bootMode === "minimal";
  const shouldLogActivationTiming =
    typeof window !== "undefined" &&
    (process.env.NODE_ENV === "development" || (Capacitor.isNativePlatform() && dubhubVideoDebugEnabled()));

  const clearHold2xWinListeners = useCallback(() => {
    const fn = hold2xWinCleanupRef.current;
    hold2xWinCleanupRef.current = null;
    fn?.();
  }, []);

  const endHold2x = useCallback(() => {
    if (hold2xTimerRef.current) {
      clearTimeout(hold2xTimerRef.current);
      hold2xTimerRef.current = null;
    }
    clearHold2xWinListeners();
    hold2xPointerIdRef.current = null;
    hold2xMoveExceededRef.current = false;
    if (hold2xActivatedRef.current) {
      hold2xActivatedRef.current = false;
      const video = videoRef.current;
      if (video) {
        video.playbackRate = 1;
      }
      requestAnimationFrame(() => setHold2xUiVisible(false));
    }
  }, [clearHold2xWinListeners]);

  /** Pause when the app/webview backgrounds or blurs — reduces iOS lock-screen media session leaks. */
  useEffect(() => {
    const pauseForLifecycleBackground = () => {
      if (!isActiveRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      if (!video.paused) video.pause();
      try {
        video.playbackRate = 1;
      } catch {
        /* ignore */
      }
      setIsPlaying(false);
      endHold2x();
    };

    const onVisibility = () => {
      if (!document.hidden) return;
      pauseForLifecycleBackground();
    };
    const onPageHide = () => pauseForLifecycleBackground();
    const onBlur = () => pauseForLifecycleBackground();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onBlur);
    };
  }, [endHold2x]);

  const onHold2xPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!isActiveRef.current || !shouldLoadVideo || !videoSrc) return;
      if (scrubbingRef.current) return;
      e.stopPropagation();
      endHold2x();

      hold2xPointerIdRef.current = e.pointerId;
      hold2xMoveExceededRef.current = false;

      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;

      const onWinMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const looksLikeVerticalScroll =
          absDy >= HOLD_2X_SCROLL_CANCEL_DY_PX && absDy >= absDx * 1.25;
        const movedTooFar = Math.hypot(dx, dy) > HOLD_2X_MOVE_CANCEL_PX;
        if (looksLikeVerticalScroll || movedTooFar) {
          hold2xMoveExceededRef.current = true;
          if (hold2xTimerRef.current) {
            clearTimeout(hold2xTimerRef.current);
            hold2xTimerRef.current = null;
          }
        }
      };

      const onWinUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        endHold2x();
      };

      const removeWin = () => {
        window.removeEventListener("pointermove", onWinMove, true);
        window.removeEventListener("pointerup", onWinUp, true);
        window.removeEventListener("pointercancel", onWinUp, true);
      };
      hold2xWinCleanupRef.current = removeWin;
      window.addEventListener("pointermove", onWinMove, true);
      window.addEventListener("pointerup", onWinUp, true);
      window.addEventListener("pointercancel", onWinUp, true);

      hold2xTimerRef.current = setTimeout(() => {
        hold2xTimerRef.current = null;
        if (hold2xMoveExceededRef.current || !isActiveRef.current || scrubbingRef.current) return;
        const v = videoRef.current;
        if (!v) return;
        hold2xActivatedRef.current = true;
        requestAnimationFrame(() => {
          const v2 = videoRef.current;
          if (!v2 || !hold2xActivatedRef.current) return;
          v2.playbackRate = 2;
          setHold2xUiVisible(true);
        });
      }, HOLD_2X_DELAY_MS);
    },
    [shouldLoadVideo, videoSrc, endHold2x],
  );

  useEffect(() => {
    return () => {
      endHold2x();
    };
  }, [endHold2x]);

  useEffect(() => {
    setVideoIntrinsic(null);
    setScrubBarReady(false);
    scrubSmoothedPRef.current = -1;
  }, [post.id, videoSrc]);

  useEffect(() => {
    debugLog("mount", "mounted", {
      isActive,
      shouldLoadVideo,
      hasVideoSrc: !!videoSrc,
      preload: videoPreload,
      mediaEpoch,
    });
    return () => {
      debugLog("mount", "unmounted", {
        wasActive: isActiveRef.current,
      });
    };
  }, [debugLog, isActive, shouldLoadVideo, videoPreload, videoSrc, mediaEpoch]);

  useEffect(() => {
    if (!shouldLogCard) return;
    dubhubVideoDebugLog("[DubHub][VideoCard][mode]", "boot mode active", {
      postId: post.id,
      bootMode,
      isActive,
      shouldLoadVideo,
      hasVideoSrc: !!videoSrc,
    });
  }, [bootMode, isActive, post.id, shouldLoadVideo, shouldLogCard, videoSrc]);

  useEffect(() => {
    debugResetLog("media epoch observed", {
      mediaEpoch,
      isActive,
      shouldLoadVideo,
      hasVideoSrc: !!videoSrc,
    });
  }, [debugResetLog, mediaEpoch, isActive, shouldLoadVideo, videoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    debugLog("state", "isActive changed", {
      isActive,
      shouldLoadVideo,
      readyState: v?.readyState ?? null,
      readyStateLabel: v ? getMediaReadyStateLabel(v.readyState) : null,
      paused: v?.paused ?? null,
    });
  }, [debugLog, isActive, shouldLoadVideo]);

  useEffect(() => {
    debugLog("state", "source/preload updated", {
      shouldLoadVideo,
      hasVideoSrc: !!videoSrc,
      srcPreview: videoSrc ? videoSrc.slice(0, 120) : null,
      preload: videoPreload,
    });
  }, [debugLog, shouldLoadVideo, videoSrc, videoPreload]);

  useEffect(() => {
    if (isMinimalBootMode) return;
    const video = videoRef.current;
    const isNativeShell = Capacitor.isNativePlatform();
    if (!video || !isActive || !shouldLoadVideo || !videoSrc || !isNativeShell) {
      if (!videoSrc) forcedLoadAtSrcRef.current = null;
      return;
    }
    // WKWebView re-entry edge case: element can remain HAVE_NOTHING and never fire media events.
    // Also observed: DOM video may report no bound `src` even though React state has a URL.
    if (video.readyState !== 0) return;
    if (forcedLoadAtSrcRef.current === videoSrc) return;

    forcedLoadAtSrcRef.current = videoSrc;
    const srcAttr = video.getAttribute("src");
    const hasDomSrc = !!(srcAttr && srcAttr.length > 0);
    if (!hasDomSrc || !video.currentSrc) {
      try {
        video.src = videoSrc;
      } catch {
        /* ignore */
      }
      debugLoadLog("bound src imperatively before load()", {
        hadDomSrc: hasDomSrc,
        currentSrcBeforeBind: video.currentSrc || null,
        srcAttrBeforeBind: srcAttr || null,
      });
    }
    debugLoadLog("forcing load() for HAVE_NOTHING bootstrap", {
      readyStateBefore: video.readyState,
      readyStateLabelBefore: getMediaReadyStateLabel(video.readyState),
      preload: video.preload,
      currentSrc: video.currentSrc || null,
      hasSrcAttr: !!video.getAttribute("src"),
    });
    try {
      // Defer one frame so imperative `src` assignment is committed before load on WKWebView.
      requestAnimationFrame(() => {
        if (!isActiveRef.current) return;
        mediaResetLogCall("video-card:bootstrap", "load for HAVE_NOTHING bootstrap", video, { postId: post.id });
        video.load();
        mediaResetLogTarget("video-card:bootstrap", "load for HAVE_NOTHING bootstrap", video, { postId: post.id });
        debugLoadLog("load() called", {
          readyStateAfterCall: video.readyState,
          readyStateLabelAfterCall: getMediaReadyStateLabel(video.readyState),
          currentSrcAfterCall: video.currentSrc || null,
          hasSrcAttrAfterCall: !!video.getAttribute("src"),
        });
      });
    } catch (err) {
      debugLoadLog("load() threw", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [debugLoadLog, isActive, isMinimalBootMode, shouldLoadVideo, videoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    debugLog("state", "isVideoReady changed", {
      isVideoReady,
      readyState: v?.readyState ?? null,
      readyStateLabel: v ? getMediaReadyStateLabel(v.readyState) : null,
      paused: v?.paused ?? null,
      currentTime: v?.currentTime ?? null,
    });
  }, [debugLog, isVideoReady]);

  useEffect(() => {
    const v = videoRef.current;
    debugLog("state", "showLoadingFallback changed", {
      showLoadingFallback,
      isActive,
      isVideoReady,
      readyState: v?.readyState ?? null,
      readyStateLabel: v ? getMediaReadyStateLabel(v.readyState) : null,
    });
  }, [debugLog, showLoadingFallback, isActive, isVideoReady]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const logEvent = (name: string) => {
      debugLog("event", name, {
        isActive: isActiveRef.current,
        shouldLoadVideo,
        readyState: v.readyState,
        readyStateLabel: getMediaReadyStateLabel(v.readyState),
        paused: v.paused,
        currentTime: Number.isFinite(v.currentTime) ? Number(v.currentTime.toFixed(3)) : v.currentTime,
      });
    };
    const onLoadedMetadata = () => logEvent("loadedmetadata");
    const onLoadedData = () => logEvent("loadeddata");
    const onCanPlay = () => logEvent("canplay");
    const onPause = () => logEvent("pause");
    const onError = () =>
      debugLoadLog("media error event", {
        readyState: v.readyState,
        readyStateLabel: getMediaReadyStateLabel(v.readyState),
        networkState: v.networkState,
        errorCode: v.error?.code ?? null,
        errorMessage: v.error?.message ?? null,
        currentSrc: v.currentSrc || null,
      });
    const onStalled = () => logEvent("stalled");
    const onSuspend = () => logEvent("suspend");
    const onEmptied = () => logEvent("emptied");
    const onAbort = () => logEvent("abort");
    const onWaiting = () => logEvent("waiting");
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("loadeddata", onLoadedData);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("error", onError);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("suspend", onSuspend);
    v.addEventListener("emptied", onEmptied);
    v.addEventListener("abort", onAbort);
    v.addEventListener("waiting", onWaiting);
    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("loadeddata", onLoadedData);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("error", onError);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("suspend", onSuspend);
      v.removeEventListener("emptied", onEmptied);
      v.removeEventListener("abort", onAbort);
      v.removeEventListener("waiting", onWaiting);
    };
  }, [debugLog, post.id, shouldLoadVideo, videoSrc]);

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
      if (scrubbingRef.current) return;
      if (isPlayingRef.current && !video.paused && video.duration > 0) {
        // Restart 0.1 seconds before the end for seamless looping
        if (video.currentTime >= video.duration - 0.1) {
          video.currentTime = 0;
        }
      }
    };

    // Fallback for ended event (iOS Safari compatibility)
    const handleEnded = () => {
      if (scrubbingRef.current) return;
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

  // Smooth progress fill without per-frame React state (active post only).
  useEffect(() => {
    if (!isActive || !scrubBarReady || !shouldLoadVideo || !videoSrc) {
      cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = 0;
      return;
    }
    const video = videoRef.current;
    const tick = () => {
      const fill = scrubFillRef.current;
      const thumb = scrubThumbRef.current;
      if (!scrubbingRef.current && video && fill && Number.isFinite(video.duration) && video.duration > 0) {
        const rawP = Math.min(1, Math.max(0, video.currentTime / video.duration));
        let displayP = scrubSmoothedPRef.current;
        if (displayP < 0 || displayP > 1) {
          displayP = rawP;
        } else if (rawP + 0.08 < displayP) {
          displayP = rawP;
        } else {
          const d = rawP - displayP;
          const maxStep = 0.032;
          displayP = Math.abs(d) <= maxStep ? rawP : displayP + Math.sign(d) * maxStep;
        }
        scrubSmoothedPRef.current = displayP;
        fill.style.transform = `scaleX(${displayP})`;
        if (thumb) thumb.style.left = `${displayP * 100}%`;
      }
      scrubRafRef.current = requestAnimationFrame(tick);
    };
    scrubRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = 0;
    };
  }, [isActive, scrubBarReady, shouldLoadVideo, videoSrc, post.id]);

  useEffect(() => {
    if (!isActive) {
      scrubbingRef.current = false;
      setIsScrubbingUi(false);
      setShowScrubThumb(false);
      setScrubReadout(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) endHold2x();
  }, [isActive, endHold2x]);

  // Keep DOM media muted state aligned with feed-level preference + active post gating.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const shouldMute = isMuted || !isActive;
    video.muted = shouldMute;
    if (!isActive || !shouldLoadVideo) {
      if (!video.paused) {
        mediaResetLogCall("video-card:muted-gate", "pause inactive/no-load", video, { postId: post.id });
        video.pause();
        mediaResetLogTarget("video-card:muted-gate", "pause inactive/no-load", video, { postId: post.id });
      }
      setIsVideoReady(false);
    }
  }, [isMuted, isActive, post.id, shouldLoadVideo]);

  useEffect(() => {
    if (isMinimalBootMode) return;
    return () => {
      const video = videoRef.current;
      if (!video) return;
      // True disposal only: do not run this on normal active/inactive transitions,
      // otherwise WKWebView can churn media state and starve normal preload/activation.
      dubhubVideoDebugLog("[DubHub][VideoCard][reset]", "aggressive teardown on unmount", {
        postId: post.id,
        readyStateBefore: video.readyState,
        readyStateLabelBefore: getMediaReadyStateLabel(video.readyState),
        currentSrc: video.currentSrc || null,
      });
      try {
        mediaResetLogCall("video-card:unmount", "pause during unmount teardown", video, { postId: post.id });
        video.pause();
        mediaResetLogTarget("video-card:unmount", "pause during unmount teardown", video, { postId: post.id });
      } catch {
        /* ignore */
      }
      try {
        mediaResetLogCall("video-card:unmount", "remove src and load during unmount teardown", video, {
          postId: post.id,
        });
        video.removeAttribute("src");
        video.load();
        mediaResetLogTarget("video-card:unmount", "remove src and load during unmount teardown", video, {
          postId: post.id,
        });
      } catch {
        /* ignore */
      }
    };
  }, [isMinimalBootMode, post.id]);

  // Pre-warm nearby inactive videos to frame 0 so next swipe can reveal instantly.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoadVideo || isActive) return;
    primedAtStartRef.current = false;

    const primeToStart = () => {
      try {
        if (!video.paused) video.pause();
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
      debugLog("state", "activation skipped: inactive or no-load", {
        isActive,
        shouldLoadVideo,
      });
      setIsVideoReady(false);
      return;
    }

    const runId = activationRunRef.current + 1;
    activationRunRef.current = runId;
    const activationStartedAt = performance.now();
    const logActivationTiming = (step: string, extra?: Record<string, unknown>) => {
      if (!shouldLogActivationTiming) return;
      const elapsedMs = Math.round(performance.now() - activationStartedAt);
      console.debug("[DubHub][VideoCard][activation-timing]", {
        postId: post.id,
        runId,
        step,
        elapsedMs,
        ...(extra || {}),
      });
    };
    debugLog("state", "activation run started", {
      runId,
      readyState: video.readyState,
      readyStateLabel: getMediaReadyStateLabel(video.readyState),
      paused: video.paused,
    });
    logActivationTiming("activation-start", {
      readyState: video.readyState,
      readyStateLabel: getMediaReadyStateLabel(video.readyState),
      paused: video.paused,
    });
    const primedFastHandoff =
      primedAtStartRef.current && video.readyState >= 2;
    // Hiding the `<video>` during the primed handoff caused a black flash: opacity-0 until `seeked`
    // fired (often async on WebKit). Cold activations still hide until playback is ready.
    if (!primedFastHandoff) {
      setIsVideoReady(false);
    }
    setShowLoadingFallback(false);
    scrubSmoothedPRef.current = 0;
    const fill = scrubFillRef.current;
    const thumb = scrubThumbRef.current;
    if (fill) fill.style.transform = "scaleX(0)";
    if (thumb) thumb.style.left = "0%";

    // Use ref for async gates — closure `isActive` can be stale after route remount / rAF / timers
    // (e.g. returning from submit flow while the feed query is fine), which skips reveal() forever.
    const stillCurrent = () => {
      const ok = activationRunRef.current === runId && isActiveRef.current;
      if (!ok) {
        debugLog("state", "stillCurrent=false", {
          runId,
          activeRunId: activationRunRef.current,
          isActiveRef: isActiveRef.current,
        });
      }
      return ok;
    };
    const reveal = (reason: string) => {
      if (!stillCurrent()) return;
      debugLog("state", "reveal called", { runId, stillCurrent: true, reason });
      const v = video;
      const hasCurrentData = v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      const commit = () => {
        if (stillCurrent()) {
          setIsVideoReady(true);
          logActivationTiming("reveal", {
            reason,
            readyState: v.readyState,
            readyStateLabel: getMediaReadyStateLabel(v.readyState),
            paused: v.paused,
          });
        }
      };
      if (!hasCurrentData) {
        const onLoadedDataForReveal = () => {
          v.removeEventListener("loadeddata", onLoadedDataForReveal);
          if (!stillCurrent()) return;
          requestAnimationFrame(() => {
            requestAnimationFrame(commit);
          });
        };
        v.addEventListener("loadeddata", onLoadedDataForReveal, { once: true });
        return;
      }
      try {
        if (!v.paused && typeof v.requestVideoFrameCallback === "function") {
          v.requestVideoFrameCallback(() => {
            commit();
          });
          return;
        }
      } catch {
        /* fall through */
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(commit);
      });
    };
    let revealFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const clearFallbackTimer = () => {
      if (revealFallbackTimer) {
        clearTimeout(revealFallbackTimer);
        revealFallbackTimer = null;
      }
    };
    let detachLoadedData: (() => void) | null = null;

    const playAndReveal = () => {
      if (!stillCurrent()) return;
      debugLog("event", "playAndReveal", {
        runId,
        isPlayingRef: isPlayingRef.current,
        readyState: video.readyState,
        readyStateLabel: getMediaReadyStateLabel(video.readyState),
      });
      const onPlaying = () => {
        debugLog("event", "playing", { runId });
        logActivationTiming("playing");
        detachLoadedData?.();
        detachLoadedData = null;
        clearFallbackTimer();
        reveal("playing");
      };
      video.addEventListener("playing", onPlaying, { once: true });

      const onLoadedData = () => {
        debugLog("event", "loadeddata (playAndReveal listener)", { runId });
        logActivationTiming("loadeddata");
        video.removeEventListener("loadeddata", onLoadedData);
        detachLoadedData = null;
        if (!stillCurrent()) return;
        clearFallbackTimer();
        reveal("loadeddata");
      };
      video.addEventListener("loadeddata", onLoadedData, { once: true });
      detachLoadedData = () => {
        video.removeEventListener("loadeddata", onLoadedData);
        detachLoadedData = null;
      };

      if (isPlayingRef.current) {
        debugLog("event", "play() attempt", { runId });
        video
          .play()
          .then(() => {
            debugLog("event", "play() resolved", {
              runId,
              paused: video.paused,
              readyState: video.readyState,
              readyStateLabel: getMediaReadyStateLabel(video.readyState),
            });
            // playing may not fire if playback resumed in the same turn; rAF sees updated paused state.
            requestAnimationFrame(() => {
              if (!stillCurrent()) return;
              if (!video.paused) {
                clearFallbackTimer();
                detachLoadedData?.();
                detachLoadedData = null;
                reveal("play-resolved");
              }
            });
          })
          .catch((err) => {
            debugLog("event", "play() rejected", {
              runId,
              error: err instanceof Error ? err.message : String(err),
            });
            // If autoplay is blocked, still reveal frame-0 so UI doesn't stay in loading state.
            detachLoadedData?.();
            detachLoadedData = null;
            clearFallbackTimer();
            reveal("play-rejected");
          });
      } else {
        debugLog("state", "play skipped because paused state", { runId });
        detachLoadedData?.();
        detachLoadedData = null;
        clearFallbackTimer();
        reveal("play-skipped");
      }
      // iOS/WebKit can miss a "playing" callback occasionally; reveal after a short grace period.
      revealFallbackTimer = setTimeout(() => {
        debugLog("state", "reveal fallback timer fired", { runId });
        reveal("fallback-timer");
      }, 260);
    };

    let detachSeeked: (() => void) | null = null;

    const seekToStartThen = (
      afterSeek: () => void,
      opts?: { optimisticRevealWhileSeeking?: boolean },
    ) => {
      if (!stillCurrent()) return;
      debugLog("state", "seekToStartThen start", {
        runId,
        optimisticRevealWhileSeeking: !!opts?.optimisticRevealWhileSeeking,
        currentTime: video.currentTime,
      });
      if (opts?.optimisticRevealWhileSeeking) {
        reveal("optimistic-seek");
      }
      if (!video.paused) {
        debugLog("event", "pause() for seek pipeline", { runId });
        video.pause();
      }
      let settled = false;
      const settleAndContinue = () => {
        if (settled) return;
        settled = true;
        detachSeeked?.();
        detachSeeked = null;
        afterSeek();
      };
      const onSeeked = () => {
        debugLog("event", "seeked", { runId, currentTime: video.currentTime });
        settleAndContinue();
      };
      detachSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        detachSeeked = null;
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      try {
        video.currentTime = 0;
        debugLog("state", "set currentTime=0", { runId, currentTime: video.currentTime });
      } catch {
        debugLog("state", "set currentTime=0 threw", { runId });
        settleAndContinue();
        return;
      }
      // currentTime already 0 can skip seeked in some browsers.
      if (Math.abs(video.currentTime) < 0.01) {
        settleAndContinue();
      }
    };

    const finishCleanup = () => {
      debugLog("state", "activation cleanup", { runId });
      clearFallbackTimer();
      detachSeeked?.();
      detachLoadedData?.();
    };

    if (primedFastHandoff) {
      // Same pipeline as cold start: a feed poster covers the stage until `playAndReveal` fires.
      seekToStartThen(playAndReveal);
      return finishCleanup;
    }

    if (video.readyState >= 1) {
      debugLog("state", "activation continues from readyState>=1", {
        runId,
        readyState: video.readyState,
        readyStateLabel: getMediaReadyStateLabel(video.readyState),
      });
      seekToStartThen(playAndReveal);
      return finishCleanup;
    }

    const onLoadedMetadata = () => {
      debugLog("event", "loadedmetadata (activation listener)", { runId });
      logActivationTiming("loadedmetadata");
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      seekToStartThen(playAndReveal);
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    const onCanPlay = () => {
      logActivationTiming("canplay");
    };
    video.addEventListener("canplay", onCanPlay, { once: true });

    return () => {
      finishCleanup();
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [isActive, post.id, shouldLoadVideo, shouldLogActivationTiming, videoSrc]);

  useEffect(() => {
    if (!shouldLoadVideo) {
      const video = videoRef.current;
      if (video && !video.paused) {
        mediaResetLogCall("video-card:shouldLoadVideo", "pause when shouldLoadVideo=false", video, { postId: post.id });
        video.pause();
        mediaResetLogTarget("video-card:shouldLoadVideo", "pause when shouldLoadVideo=false", video, {
          postId: post.id,
        });
      }
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
    // If no poster exists, show a visual placeholder immediately to avoid a dark/blank snap handoff.
    if (!(homeFeedPosterFallback && !!displayPosterUrl)) {
      setShowLoadingFallback(true);
      return;
    }
    const t = window.setTimeout(() => setShowLoadingFallback(true), 160);
    return () => window.clearTimeout(t);
  }, [displayPosterUrl, homeFeedPosterFallback, isActive, isVideoReady, post.id]);

  const overlayVisible =
    isActive &&
    !isVideoReady &&
    !(homeFeedPosterFallback && !!displayPosterUrl) &&
    showLoadingFallback;
  useEffect(() => {
    if (!overlayVisible) return;
    const v = videoRef.current;
    debugLog("overlay", "overlay visible", {
      overlayVisible,
      isActive,
      isVideoReady,
      showLoadingFallback,
      shouldLoadVideo,
      hasVideoSrc: !!videoSrc,
      readyState: v?.readyState ?? null,
      readyStateLabel: v ? getMediaReadyStateLabel(v.readyState) : null,
      paused: v?.paused ?? null,
    });
  }, [
    debugLog,
    overlayVisible,
    isActive,
    isVideoReady,
    showLoadingFallback,
    shouldLoadVideo,
    videoSrc,
  ]);

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
      queryClient.setQueriesData(
        { queryKey: ["/api/posts"], exact: false },
        (old: any) => {
          if (!old) return old;
          if (Array.isArray(old)) {
            return old.map((p) =>
              p.id === post.id
                ? { ...p, hasLiked: data.isLiked, likes: data.counts.likes }
                : p
            );
          }
          if (old && Array.isArray((old as InfiniteData<any>).pages)) {
            const paged = old as InfiniteData<{ items?: any[] }>;
            return {
              ...paged,
              pages: paged.pages.map((page) => ({
                ...page,
                items: Array.isArray(page.items)
                  ? page.items.map((p) =>
                      p.id === post.id
                        ? { ...p, hasLiked: data.isLiked, likes: data.counts.likes }
                        : p
                    )
                  : page.items,
              })),
            };
          }
          return old;
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
  const overlayDensityControl = typeof onFeedOverlayCollapsedChange === "function";
  const overlayCollapsed = overlayDensityControl && feedOverlayCollapsed;

  const scrubHitRef = useRef<HTMLDivElement>(null);
  const applyScrubFromClientX = useCallback((clientX: number, video: HTMLVideoElement) => {
    const hit = scrubHitRef.current;
    if (!hit || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const rect = hit.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const fill = scrubFillRef.current;
    const thumb = scrubThumbRef.current;
    if (fill) fill.style.transform = `scaleX(${ratio})`;
    if (thumb) thumb.style.left = `${ratio * 100}%`;
    scrubSmoothedPRef.current = ratio;
    try {
      video.currentTime = ratio * video.duration;
    } catch {
      /* ignore */
    }
    setScrubReadout({
      current: Math.floor(video.currentTime),
      total: Math.floor(video.duration),
    });
  }, []);

  const endScrubGesture = useCallback((opts?: { releaseTarget: HTMLElement; pointerId: number }) => {
    const wasScrubbing = scrubbingRef.current;
    scrubbingRef.current = false;
    setIsScrubbingUi(false);
    setShowScrubThumb(false);
    setScrubReadout(null);
    if (opts) {
      try {
        opts.releaseTarget.releasePointerCapture(opts.pointerId);
      } catch {
        /* ignore */
      }
    }
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      scrubSmoothedPRef.current = Math.min(1, Math.max(0, video.currentTime / video.duration));
    }
    if (wasScrubbing && video && wasPlayingBeforeScrubRef.current && isPlayingRef.current) {
      video.play().catch(() => {
        /* ignore */
      });
    }
  }, []);

  const genrePillEl = (
    <span
      data-testid="post-genre-tag"
      className="inline-block rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15"
      style={getGenreGlowPillStyle(genreChip.bgColor, genreChip.textClass)}
    >
      {genreChip.label}
    </span>
  );

  /** `min-w` fits the wider of “Show more” / “Show less” so the pill row doesn’t shift when the label swaps. */
  const overlayDensityToggleClass =
    "pointer-events-auto inline-flex shrink-0 items-center justify-center min-h-[36px] min-w-[5rem] touch-manipulation rounded-md px-2 py-1.5 text-[11px] font-medium text-white/45 transition-colors hover:text-white/80 active:text-white/90 outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:min-h-0 sm:px-1.5 sm:py-1";

  /** Home overlay expand/collapse: ~300ms ease + inner fade so height changes feel less abrupt. */
  const overlayCollapseGridTransition = cn(
    "transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
  );
  const overlayCollapseFade = cn(
    "transition-opacity duration-300 ease-in-out motion-reduce:transition-none",
  );
  const overlayCollapseMetaTransition = cn(
    "transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none",
  );

  /** Match scrollport height (not 100vh) so mandatory snap + slow drags settle reliably. */
  const snapHeightClass = "min-h-full h-full";

  return (
    <div
      className={`${snapHeightClass} relative w-full shrink-0 snap-start snap-always [scroll-snap-stop:always] ${
        isHighlighted ? "ring-4 ring-inset ring-primary" : ""
      }`}
      data-post-id={post.id}
      data-video-ready={isVideoReady ? "1" : "0"}
      data-video-overlay-visible={overlayVisible ? "1" : "0"}
      data-video-has-src={videoSrc ? "1" : "0"}
    >
      {/* Video background: ratio-tiered cover vs contain. Home uses near-black stage + poster to avoid snap flash. */}
      <div
        ref={videoStageRef}
        className={`absolute inset-0 flex select-none items-center justify-center [-webkit-touch-callout:none] [-webkit-user-select:none] ${
          homeFeedPosterFallback ? "bg-zinc-950" : "bg-black"
        }`}
      >
        {displayPosterUrl ? (
          <img
            src={displayPosterUrl}
            alt=""
            draggable={false}
            className={`pointer-events-none absolute inset-0 z-0 h-full w-full select-none transition-opacity duration-150 motion-reduce:transition-none [-webkit-touch-callout:none] [-webkit-user-select:none] ${
              feedVideoObjectFit === "cover" ? "object-cover object-center" : "object-contain"
            } ${shouldShowPoster ? "opacity-100" : "opacity-0"}`}
          />
        ) : null}
        <video
          key={`${post.id}-${isMinimalBootMode ? "minimal" : String(mediaEpoch)}`}
          ref={videoRef}
          data-debug-media-id={`home-feed-${post.id}`}
          className={`absolute inset-0 z-[1] h-full w-full cursor-pointer select-none transition-opacity duration-150 [-webkit-touch-callout:none] [-webkit-user-select:none] ${
            feedVideoObjectFit === "cover" ? "object-cover object-center" : "object-contain"
          } ${isVideoReady ? "opacity-100" : "opacity-0"}`}
          src={shouldLoadVideo ? (videoSrc || undefined) : undefined}
          crossOrigin={homeFeedPosterFallback && !feedPosterUrl ? "anonymous" : undefined}
          muted={isMuted || !isActive}
          loop
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          preload={shouldLoadVideo ? videoPreload : "none"}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            debugLoadLog("media event after bootstrap: loadedmetadata", {
              readyState: v.readyState,
              readyStateLabel: getMediaReadyStateLabel(v.readyState),
              currentSrc: v.currentSrc || null,
            });
            try {
              v.preservesPitch = true;
              v.disableRemotePlayback = true;
            } catch {
              /* ignore */
            }
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              setVideoIntrinsic({ w: v.videoWidth, h: v.videoHeight });
            }
            const d = v.duration;
            setScrubBarReady(Number.isFinite(d) && d > 0);
          }}
          onLoadedData={(e) => {
            const v = e.currentTarget;
            debugLoadLog("media event after bootstrap: loadeddata", {
              readyState: v.readyState,
              readyStateLabel: getMediaReadyStateLabel(v.readyState),
            });
          }}
          onCanPlay={(e) => {
            const v = e.currentTarget;
            debugLoadLog("media event after bootstrap: canplay", {
              readyState: v.readyState,
              readyStateLabel: getMediaReadyStateLabel(v.readyState),
            });
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
        {overlayVisible ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-900/85 via-zinc-900/75 to-zinc-950/90">
            <div className="flex flex-col items-center gap-2">
              <VinylLoader size="md" />
              <span className="text-[10px] font-medium tracking-wide text-white/70">Loading video</span>
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 to-black/60",
            "transition-opacity duration-300 ease-out motion-reduce:transition-none",
            isScrubbingUi ? "opacity-[0.35]" : "opacity-100",
          )}
        />
        {/* Narrow far-right strip (middle half vertically); rail z-20 stays tappable above. No touchstart preventDefault — scroll uses pan-y. */}
        <div
          ref={hold2xZoneRef}
          data-feed-2x-hold-zone
          className={cn(
            "absolute right-0 top-[25%] z-[12] h-1/2 w-[min(2.875rem,12.5vw)] max-w-[3rem] touch-pan-y select-none",
            "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]",
            "pr-[max(0px,env(safe-area-inset-right,0px))]",
            isActive && shouldLoadVideo && videoSrc ? "pointer-events-auto" : "pointer-events-none",
          )}
          onPointerDown={onHold2xPointerDown}
          onContextMenu={(ev) => ev.preventDefault()}
          aria-hidden
        />
        {isActive ? (
          <div
            className={cn(
              "pointer-events-none absolute left-1/2 top-[26%] z-[13] -translate-x-1/2 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 backdrop-blur-md",
              "text-[12px] font-medium tabular-nums tracking-[0.12em] text-white/85 shadow-[0_2px_12px_rgba(0,0,0,0.35)]",
              "transition-opacity duration-300 ease-out motion-reduce:transition-none",
              hold2xUiVisible ? "opacity-100" : "opacity-0",
            )}
            aria-live="polite"
            aria-hidden={!hold2xUiVisible}
          >
            2×
          </div>
        ) : null}
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
              className={cn(
                "absolute bottom-[clamp(calc(4.5rem+env(safe-area-inset-bottom,0px)),14lvh,7rem)] right-[max(0.5rem,env(safe-area-inset-right,0px))] z-20 flex w-[var(--video-feed-rail-width)] flex-col items-center gap-4",
                "transition-opacity duration-300 ease-out motion-reduce:transition-none",
                isScrubbingUi ? "opacity-[0.2]" : "opacity-100",
              )}
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
                      "flex items-center justify-center rounded-full shadow-[0_0_16px_rgba(74,233,223,0.28)] motion-reduce:animate-none",
                      feedRandomDice.showIntroGlow && !feedRandomDice.exiting
                        ? "animate-random-dice-rail-glow-once transform-gpu will-change-[filter] motion-reduce:will-change-auto"
                        : null,
                    )}
                  >
                    <RandomDiceButton
                      active
                      accentGlow="turquoiseSubtle"
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
                onClick={() => {
                  playInteractionLight();
                  likeMutation.mutate();
                }}
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

              {!homeFeedPosterFallback ? (
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
              ) : null}
            </div>
          </>
        );
      })()}
      {/* Bottom content — padding-right reserves rail (scrollport already clears shell nav). */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent pl-3 pr-[calc(var(--video-feed-rail-width)+0.65rem)] sm:pl-4",
          "transition-opacity duration-300 ease-out motion-reduce:transition-none",
          isScrubbingUi ? "opacity-[0.18]" : "opacity-100",
          overlayCollapsed
            ? "pt-8 pb-3.5 sm:pt-9 sm:pb-4"
            : "py-5 pt-12 sm:py-6 sm:pt-14",
          embeddedFeed && "pb-3",
        )}
      >
        {/* pointer-events-none here + inherited none on text: wheel/click reach feed + video; only explicit auto hits targets */}
        <div className="pointer-events-none flex flex-col gap-2 overflow-visible">
          <div className="overflow-x-visible py-0.5 pl-0.5 pr-1">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={handleOpenPostAuthorProfile}
                aria-label={
                  post.user.username ? `View profile ${formatUsernameDisplay(post.user.username)}` : "View profile"
                }
                data-testid="post-author-avatar"
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
              </button>
              <button
                type="button"
                className="pointer-events-auto inline-flex min-h-11 min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 text-left outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={handleOpenPostAuthorProfile}
                aria-label={
                  post.user.username ? `View profile ${formatUsernameDisplay(post.user.username)}` : "View profile"
                }
                data-testid="post-author-identity"
              >
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
              </button>
            </div>

            {!overlayDensityControl && (post.title || post.description) ? (
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

          {overlayDensityControl ? (
            <>
              {/* Title/description only — collapses; pills stay outside so glow isn’t clipped by overflow-hidden. */}
              <div
                className={cn(
                  "grid",
                  overlayCollapseGridTransition,
                  overlayCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "pointer-events-none overflow-x-visible px-0.5 pl-0.5 pr-1 will-change-[opacity]",
                      overlayCollapseFade,
                      overlayCollapsed ? "opacity-0" : "opacity-100",
                    )}
                    aria-hidden={overlayCollapsed}
                  >
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
                </div>
              </div>

              {/* Status + genre + inline toggle (+ extended meta when expanded). Not inside collapse grid — box-shadow glow stays visible. */}
              <div className="shrink-0 overflow-visible px-0.5 py-3 pl-0.5 pr-1 sm:py-3.5">
                <div className="pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-2 text-xs leading-relaxed text-gray-300">
                  {statusBadgeEl ? (
                    <>
                      {statusBadgeEl}
                      <span className="text-gray-500 select-none" aria-hidden>
                        •
                      </span>
                    </>
                  ) : null}
                  {genrePillEl}
                  <button
                    type="button"
                    className={overlayDensityToggleClass}
                    aria-expanded={!overlayCollapsed}
                    aria-label={overlayCollapsed ? "Show more post details" : "Show less post details"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onFeedOverlayCollapsedChange?.(!overlayCollapsed);
                    }}
                  >
                    {overlayCollapsed ? "Show more" : "Show less"}
                  </button>
                  <div
                    className={cn(
                      "inline-grid max-w-full min-w-0 align-middle will-change-[opacity,grid-template-rows]",
                      overlayCollapseMetaTransition,
                      overlayCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                    )}
                    aria-hidden={overlayCollapsed}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
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
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden />
                              <span className="truncate">{post.location}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "grid",
                  overlayCollapseGridTransition,
                  overlayCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "pointer-events-none overflow-visible will-change-[opacity]",
                      overlayCollapseFade,
                      overlayCollapsed ? "opacity-0" : "opacity-100",
                    )}
                    aria-hidden={overlayCollapsed}
                  >
                    {releasePreview ? (
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
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="shrink-0 overflow-visible px-0.5 py-3 pl-0.5 pr-1 sm:py-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs leading-relaxed text-gray-300">
                  {statusBadgeEl ? (
                    <>
                      {statusBadgeEl}
                      <span className="text-gray-500 select-none" aria-hidden>
                        •
                      </span>
                    </>
                  ) : null}
                  {genrePillEl}
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
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden />
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
            </>
          )}
        </div>
      </div>
      {/* Feed scrub: full width, tall hit zone; home feed portals to body so `fixed` stays viewport-anchored on iOS (not the scrollport). */}
      {isActive && scrubBarReady && shouldLoadVideo && videoSrc ? (() => {
        const scrubTree = (
          <div
            className={cn(
              "pointer-events-none z-[40] flex w-full justify-center px-0",
              /* Profile snap viewers: tie to card/scrollport. Home: `fixed` + `--video-feed-scrub-bottom` (portal avoids WebKit double-offset). */
              embeddedFeed
                ? "absolute inset-x-0 bottom-0 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]"
                : "fixed inset-x-0 bottom-[var(--video-feed-scrub-bottom)] pb-0",
            )}
          >
            <div
              ref={scrubHitRef}
              role="slider"
              aria-label="Seek video"
              aria-valuemin={0}
              aria-valuemax={100}
              className={cn(
              "pointer-events-auto relative flex w-full max-w-none min-h-0 touch-none select-none flex-col justify-end pt-1.5 [-webkit-tap-highlight-color:transparent]",
              /* `pb-1` lifts the track off the anchor; omit for viewport-fixed scrub so the bar sits flush on the nav top. */
              embeddedFeed ? "pb-1" : "pb-0",
            )}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                endHold2x();
                const video = videoRef.current;
                if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
                e.preventDefault();
                e.stopPropagation();
                scrubbingRef.current = true;
                setIsScrubbingUi(true);
                setShowScrubThumb(true);
                wasPlayingBeforeScrubRef.current = !video.paused;
                if (wasPlayingBeforeScrubRef.current) video.pause();
                try {
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
                applyScrubFromClientX(e.clientX, video);
              }}
              onPointerMove={(e) => {
                if (!scrubbingRef.current) return;
                e.preventDefault();
                const video = videoRef.current;
                if (!video) return;
                applyScrubFromClientX(e.clientX, video);
              }}
              onPointerUp={(e) => {
                if (!scrubbingRef.current) return;
                endScrubGesture({ releaseTarget: e.currentTarget, pointerId: e.pointerId });
              }}
              onPointerCancel={(e) => {
                if (!scrubbingRef.current) return;
                endScrubGesture({ releaseTarget: e.currentTarget, pointerId: e.pointerId });
              }}
              onLostPointerCapture={() => {
                if (!scrubbingRef.current) return;
                endScrubGesture();
              }}
            >
              <div className="relative w-full">
                {isScrubbingUi && scrubReadout ? (
                  <div
                    className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 right-0 z-[2] text-center text-[11px] font-medium tabular-nums tracking-tight text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                    aria-live="polite"
                  >
                    {scrubReadout.current} / {scrubReadout.total}
                  </div>
                ) : null}
                <div className="relative h-1 w-full overflow-visible">
                  <div className="absolute inset-0 rounded-full bg-white/15" aria-hidden />
                  <div
                    ref={scrubFillRef}
                    className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-white/55 will-change-transform motion-reduce:transition-none"
                    style={{ transform: "scaleX(0)" }}
                  />
                  <div
                    ref={scrubThumbRef}
                    className={cn(
                      "pointer-events-none absolute top-1/2 z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.55)] ring-2 ring-white/55 transition-opacity ease-out motion-reduce:transition-none",
                      showScrubThumb ? "opacity-100 duration-75" : "opacity-0 duration-200",
                    )}
                    style={{ left: "0%" }}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </div>
        );
        if (homeFeedPosterFallback && typeof document !== "undefined") {
          return createPortal(scrubTree, document.body);
        }
        return scrubTree;
      })() : null}
      {isActive &&
      onToggleMute &&
      homeFeedPosterFallback &&
      !embeddedFeed &&
      typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              className={cn(
                /* z below scrub (z-40) so corner seeks aren’t blocked if edges align */
                "pointer-events-auto fixed z-[38] flex h-11 w-11 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-transparent [-webkit-tap-highlight-color:transparent] transition-opacity duration-300 ease-out motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95",
                /* Scrub strip ≈ pt-1.5 + h-1 (~10px) above `--video-feed-scrub-bottom`; +1.25rem clears it with a thin gap */
                "bottom-[calc(var(--video-feed-scrub-bottom)+1.25rem)] right-[max(0.5rem,env(safe-area-inset-right,0px))]",
                isScrubbingUi ? "opacity-[0.22]" : "opacity-100",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleMute();
              }}
              aria-label={isMuted ? "Unmute video" : "Mute video"}
              data-testid="button-toggle-mute"
            >
              <span className="flex h-11 w-11 items-center justify-center [&_svg]:drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                {isMuted ? (
                  <VolumeX className="h-5 w-5 shrink-0 text-white/95" aria-hidden />
                ) : (
                  <Volume2 className="h-5 w-5 shrink-0 text-white" aria-hidden />
                )}
              </span>
            </button>,
            document.body,
          )
        : null}
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

export const VideoCard = memo(VideoCardInner, videoCardPropsEqual);
