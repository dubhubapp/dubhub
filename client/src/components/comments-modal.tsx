
import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Heart, Check, CheckCircle, Award, Users, XCircle, Flag, MoreHorizontal, ArrowUpDown, MessageCircle, Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_LIMITS } from "@shared/input-limits";
import {
  DELETED_COMMENT_BODY,
  DELETED_COMMENT_DISPLAY,
  isDeletedCommentBody,
} from "@shared/deleted-comment";
import { ApiRequestError } from "@/lib/apiDiagnostics";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { PostWithUser, CommentWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { ReportModal } from "./report-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoldVerifiedTick, goldAvatarGlowShadowClass } from "./verified-artist";
import { getGenreGlowPillStyle, STATUS_GLOW_PILL_BG } from "@/lib/genre-styles";
import { UserRoleInlineIcons } from "./moderator-shield";
import { isDefaultAvatarUrl } from "@/lib/default-avatar";
import { useUserProfileLightPopup } from "@/components/user-profile-light-popup";
import { formatUsernameDisplay } from "@/lib/utils";
import { commentsKeyboardDebugEnabled, logCommentsKeyboardSnapshot } from "@/lib/comments-keyboard-debug";
import { playInteractionLight, playSuccessNotification } from "@/lib/haptic";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

interface CommentsModalProps {
  post: PostWithUser;
  isOpen: boolean;
  onClose: () => void;
}

/** Matches previous sheet cap: min(66vh, 33rem). */
const COMMENTS_SHEET_VH_FRACTION = 0.66;
const COMMENTS_SHEET_REM_CAP = 33;

/**
 * Space below the physical top of the visual viewport reserved for status / notch,
 * Vaul drag handle, and Comments header so the sheet never grows under the notch.
 * Single constant — not per-device.
 */
const COMMENTS_SHEET_TOP_RESERVE_PX = 72;

const COMMENTS_SHEET_MIN_PX = 160;

/** Comment ⋯ menu (delete / report) — keep inset from screen edges on mobile. */
const COMMENT_ACTIONS_DROPDOWN_CONTENT_CLASS =
  "z-[70] min-w-[10rem] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-1 text-gray-900 shadow-lg dark:border-border dark:bg-popover dark:text-popover-foreground";

function getAppViewportHostEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("root");
  const inner = root?.firstElementChild;
  return inner instanceof HTMLElement ? inner : root;
}

/** Lifts a `position:fixed; bottom:0` sheet to sit above the on-screen keyboard. */
function computeCommentsKeyboardBottomInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

/**
 * Max sheet height: prefer the established large-phone cap, but never exceed what
 * fits in the *visual* viewport (critical when the iOS keyboard is open — `100dvh`
 * / layout height often stay large, which over-shrinks nothing and the OS scrolls
 * the sheet past the top).
 */
function computeCommentsSheetMaxPx(): number {
  if (typeof window === "undefined") {
    return COMMENTS_SHEET_REM_CAP * 16;
  }
  const innerH = window.innerHeight;
  const vv = window.visualViewport;
  const visibleH = vv?.height ?? innerH;
  const preferredCap = Math.min(innerH * COMMENTS_SHEET_VH_FRACTION, COMMENTS_SHEET_REM_CAP * 16);
  const visibleBudget = Math.max(COMMENTS_SHEET_MIN_PX, Math.floor(visibleH - COMMENTS_SHEET_TOP_RESERVE_PX));
  return Math.min(preferredCap, visibleBudget);
}

/** Native iOS keyboard mode keeps layout viewport fixed; cap from innerHeight only. */
function computeCommentsSheetMaxPxWithoutVisualViewport(): number {
  if (typeof window === "undefined") {
    return COMMENTS_SHEET_REM_CAP * 16;
  }
  const innerH = window.innerHeight;
  const preferredCap = Math.min(innerH * COMMENTS_SHEET_VH_FRACTION, COMMENTS_SHEET_REM_CAP * 16);
  const visibleBudget = Math.max(COMMENTS_SHEET_MIN_PX, Math.floor(innerH - COMMENTS_SHEET_TOP_RESERVE_PX));
  return Math.min(preferredCap, visibleBudget);
}

export function CommentsModal({ post, isOpen, onClose }: CommentsModalProps) {
  const closeCommittedRef = useRef(false);
  const drawerContentRef = useRef<HTMLDivElement | null>(null);

  const handleClose = useCallback(() => {
    if (closeCommittedRef.current) return;
    closeCommittedRef.current = true;
    playInteractionLight();
    onClose();
  }, [onClose]);

  const [newComment, setNewComment] = useState("");
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [artistSearchTerm, setArtistSearchTerm] = useState("");
  const [currentMentionStart, setCurrentMentionStart] = useState(-1);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingComment, setReportingComment] = useState<{id: string, userId: string} | null>(null);
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<string | null>(null);
  const [nativeKeyboardInsetPx, setNativeKeyboardInsetPx] = useState(0);
  const [nativeKeyboardLayoutActive, setNativeKeyboardLayoutActive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    profileImage: userProfileImage,
    username: contextUsername,
    currentUser: contextUser,
    verifiedArtist,
    userType,
    isModerator,
  } = useUser();
  const debugComments = commentsKeyboardDebugEnabled();
  const debugKeyboardTiming = commentsKeyboardDebugEnabled() || debugComments;
  const composerFieldId = useId();
  /** Set while comments viewport lock is active; used to resync offset immediately on composer focus. */
  const viewportHostVvSyncRef = useRef<(() => void) | null>(null);

  const { openByUsername, popup: userProfilePopup } = useUserProfileLightPopup({
    verifiedArtistsEnabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) return;
    closeCommittedRef.current = false;
    playInteractionLight();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (debugComments) {
      console.log("[CommentsModal] opened", {
        modalPostId: post.id,
        queryKey: ["/api/posts", post.id, "comments"],
      });
    }
  }, [isOpen, post.id, debugComments]);

  useEffect(() => {
    if (!isOpen || !debugKeyboardTiming) return;
    console.log("[CommentsModal][kbd-timing] instrumentation-active", {
      postId: post.id,
      search: typeof window !== "undefined" ? window.location.search : "",
      localStorageLegacy: typeof window !== "undefined" ? localStorage.getItem("dubhub-debug-comments-keyboard") : null,
      localStorageNative: typeof window !== "undefined" ? localStorage.getItem("dubhub.debug.commentsKeyboard") : null,
    });
  }, [debugKeyboardTiming, isOpen, post.id]);

  /**
   * Keep shell `pb-[var(--app-bottom-nav-block)]` identical for the whole time comments are open.
   * Freezing avoids iOS keyboard / dynamic safe-area changes fighting `--app-bottom-nav-block`
   * (which includes `env(safe-area-inset-bottom)`) and shifting the feed.
   */
  useLayoutEffect(() => {
    if (typeof document === "undefined" || !isOpen) return;
    const frozen = getComputedStyle(document.documentElement).getPropertyValue("--app-bottom-nav-block").trim();
    if (!frozen) return;
    document.body.style.setProperty("--app-bottom-nav-block", frozen);
    return () => {
      document.body.style.removeProperty("--app-bottom-nav-block");
    };
  }, [isOpen]);

  /**
   * Pin the React viewport host (everything under #root except portaled drawers) while comments
   * are open, and counteract Mobile Safari’s visual-viewport pan when the composer focuses so the
   * feed/video does not slide upward. The drawer stays outside this host and gets its own
   * `bottom` inset from `computeCommentsKeyboardBottomInset()` so only the sheet rides above the keyboard.
   */
  useLayoutEffect(() => {
    if (typeof document === "undefined" || !isOpen) return;
    const host = getAppViewportHostEl();
    if (!host) return;

    const lockH = Math.round(Math.max(window.innerHeight, window.visualViewport?.height ?? 0));

    if (commentsKeyboardDebugEnabled()) {
      document.documentElement.style.setProperty("--comments-app-lock-px", `${lockH}px`);
    }

    let rafFollowUpId = 0;

    const syncVvOffset = () => {
      const vv = window.visualViewport;
      const y = vv ? Math.round(vv.offsetTop) : 0;
      if (y) {
        host.style.transform = `translate3d(0, ${y}px, 0)`;
      } else {
        host.style.removeProperty("transform");
      }
    };

    /** Apply immediately (same tick as WebKit’s viewport change) plus one rAF so we match layout after paint. */
    const syncVvOffsetThorough = () => {
      logKeyboardTiming("viewport-host-sync:start");
      syncVvOffset();
      if (rafFollowUpId) cancelAnimationFrame(rafFollowUpId);
      logKeyboardTiming("viewport-host-sync:raf-scheduled");
      rafFollowUpId = requestAnimationFrame(() => {
        rafFollowUpId = 0;
        logKeyboardTiming("viewport-host-sync:raf-fired");
        syncVvOffset();
      });
    };

    viewportHostVvSyncRef.current = syncVvOffsetThorough;

    const applyLock = () => {
      host.style.position = "fixed";
      host.style.top = "0";
      host.style.left = "0";
      host.style.width = "100%";
      host.style.height = `${lockH}px`;
      host.style.maxHeight = `${lockH}px`;
      host.style.overflow = "hidden";
      host.style.boxSizing = "border-box";
      /* Interpolating `transform` lags behind `offsetTop` during the iOS keyboard animation → visible jump. */
      host.style.transition = "none";
      host.style.willChange = "transform";
      syncVvOffsetThorough();
    };

    applyLock();

    const vv = window.visualViewport;
    const onVv = () => {
      logKeyboardTiming("viewport-host-sync:event");
      syncVvOffsetThorough();
    };
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    window.addEventListener("resize", onVv);

    return () => {
      viewportHostVvSyncRef.current = null;
      if (rafFollowUpId) cancelAnimationFrame(rafFollowUpId);
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onVv);
      host.style.removeProperty("position");
      host.style.removeProperty("top");
      host.style.removeProperty("left");
      host.style.removeProperty("width");
      host.style.removeProperty("height");
      host.style.removeProperty("max-height");
      host.style.removeProperty("overflow");
      host.style.removeProperty("box-sizing");
      host.style.removeProperty("transform");
      host.style.removeProperty("transition");
      host.style.removeProperty("will-change");
      if (commentsKeyboardDebugEnabled()) {
        document.documentElement.style.removeProperty("--comments-app-lock-px");
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;
    let dismissPullGuardTimer: number | null = null;

    const clearDismissPullGuardTimer = () => {
      if (dismissPullGuardTimer != null) {
        clearTimeout(dismissPullGuardTimer);
        dismissPullGuardTimer = null;
      }
    };

    if (isOpen) {
      clearDismissPullGuardTimer();
      body.classList.remove("comments-dismiss-pull-guard");
      root.classList.add("comments-modal-open");
      body.classList.add("comments-modal-open");
      if (commentsKeyboardDebugEnabled()) {
        queueMicrotask(() => logCommentsKeyboardSnapshot("after-modal-open", { postId: post.id }));
      }
    } else {
      root.classList.remove("comments-modal-open");
      body.classList.remove("comments-modal-open");
      clearDismissPullGuardTimer();
      body.classList.add("comments-dismiss-pull-guard");
      logKeyboardTiming("dismiss-pull-guard-timeout:scheduled", { delayMs: 520 });
      dismissPullGuardTimer = window.setTimeout(() => {
        logKeyboardTiming("dismiss-pull-guard-timeout:fired");
        dismissPullGuardTimer = null;
        body.classList.remove("comments-dismiss-pull-guard");
      }, 520);
    }

    return () => {
      clearDismissPullGuardTimer();
      body.classList.remove("comments-dismiss-pull-guard");
      if (isOpen) {
        root.classList.remove("comments-modal-open");
        body.classList.remove("comments-modal-open");
      }
    };
  }, [isOpen, post.id]);

  useEffect(() => {
    if (!isOpen || !commentsKeyboardDebugEnabled()) return;
    const vv = window.visualViewport;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onVv = () => {
      logKeyboardTiming("debug-vv-listener:event");
      clearTimeout(t);
      logKeyboardTiming("debug-vv-listener:timeout-scheduled", { delayMs: 80 });
      t = setTimeout(() => {
        logKeyboardTiming("debug-vv-listener:timeout-fired", { delayMs: 80 });
        logCommentsKeyboardSnapshot("visual-viewport-resize");
      }, 80);
    };
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    let moT: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => {
      clearTimeout(moT);
      logKeyboardTiming("debug-mutation-listener:timeout-scheduled", { delayMs: 80 });
      moT = setTimeout(() => {
        logKeyboardTiming("debug-mutation-listener:timeout-fired", { delayMs: 80 });
        logCommentsKeyboardSnapshot("html-body-style-mutation");
      }, 80);
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      mo.disconnect();
      clearTimeout(t);
      clearTimeout(moT);
    };
  }, [isOpen]);

  // Format time ago helper function
  const formatTimeAgo = (date: string | Date | null) => {
    if (!date) return "Recently";
    const now = new Date();
    const commentDate = typeof date === 'string' ? new Date(date) : date;
    const diffInMinutes = Math.floor((now.getTime() - commentDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  // Function to highlight artist mentions in comment text
  const highlightArtistMentions = (text: string, tagStatus?: "pending" | "confirmed" | "denied") => {
    const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.substring(1);
        
        // Check if user is a verified artist
        const isVerifiedArtist = verifiedArtists.some((artist: any) => 
          artist.username === username
        );
        
        let className = isVerifiedArtist 
          ? "text-yellow-500 font-medium cursor-pointer hover:underline" // Gold for verified artists
          : "text-[#4ae9df] font-medium cursor-pointer hover:underline"; // Blue for regular users
        
        if (tagStatus === "confirmed") {
          className =
            "text-green-600 font-medium bg-green-50 px-1 rounded cursor-pointer hover:underline dark:bg-green-950/55 dark:text-green-400";
        } else if (tagStatus === "denied") {
          className = "text-gray-400 font-medium line-through dark:text-white/45";
        }
        
        return (
          <span
            key={index}
            className={className}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openByUsername(username, {
                anchor: { x: e.clientX, y: e.clientY },
              });
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const REPLY_BATCH_SIZE = 3;
  // Per-parent-thread visible reply count (0 = collapsed)
  const [visibleReplyCountByParent, setVisibleReplyCountByParent] = useState<Record<string, number>>({});
  const [replyingTo, setReplyingTo] = useState<{id: string, username: string} | null>(null);
  const [commentFilter, setCommentFilter] = useState<'all' | 'newest' | 'top'>('all');
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const commentsListRef = useRef<HTMLDivElement | null>(null);

  const scrollToPostedComment = useCallback(
    (commentId: string, opts: { isReply: boolean; parentId?: string }) => {
      const run = () => {
        const listEl = commentsListRef.current;
        if (!listEl) return;

        if (!opts.isReply) {
          if (commentFilter === "top") {
            const target = listEl.querySelector(`[data-comment-id="${commentId}"]`);
            if (target instanceof HTMLElement) {
              target.scrollIntoView({ block: "nearest" });
            } else {
              listEl.scrollTop = listEl.scrollHeight;
            }
          } else {
            listEl.scrollTop = 0;
          }
          return;
        }

        const replyTarget = listEl.querySelector(`[data-comment-id="${commentId}"]`);
        if (replyTarget instanceof HTMLElement) {
          replyTarget.scrollIntoView({ block: "nearest" });
          return;
        }
        if (opts.parentId) {
          const parentTarget = listEl.querySelector(`[data-comment-id="${opts.parentId}"]`);
          if (parentTarget instanceof HTMLElement) {
            parentTarget.scrollIntoView({ block: "nearest" });
          }
        }
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(run);
      });
    },
    [commentFilter],
  );
  const [, bumpForVisualViewport] = useReducer((x: number) => x + 1, 0);
  const postArtistVerifiedBy = (post as any).artistVerifiedBy ?? (post as any).artist_verified_by;
  const isArtistIdentifiedPost = !!((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && !!postArtistVerifiedBy;
  const shouldShowArtistSelfTagPlaceholder =
    !!contextUser?.id &&
    userType === "artist" &&
    verifiedArtist &&
    !isArtistIdentifiedPost;
  const commentsSheetMaxPx = isOpen
    ? nativeKeyboardLayoutActive
      ? computeCommentsSheetMaxPxWithoutVisualViewport()
      : computeCommentsSheetMaxPx()
    : null;
  const commentsKeyboardBottomInset = isOpen
    ? nativeKeyboardLayoutActive
      ? nativeKeyboardInsetPx
      : computeCommentsKeyboardBottomInset()
    : 0;

  function logKeyboardTiming(phase: string, extra?: Record<string, unknown>) {
    if (!debugKeyboardTiming || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const composerRect = commentInputRef.current?.getBoundingClientRect();
    const drawerRect = drawerContentRef.current?.getBoundingClientRect();
    const drawerStyle = drawerContentRef.current ? getComputedStyle(drawerContentRef.current) : null;
    const keyboardInset = vv
      ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      : 0;

    console.log("[CommentsModal][kbd-timing]", {
      phase,
      tPerfMs: Math.round(performance.now() * 100) / 100,
      tIso: new Date().toISOString(),
      isOpen,
      innerHeight: window.innerHeight,
      visualViewportHeight: vv?.height ?? null,
      visualViewportOffsetTop: vv?.offsetTop ?? null,
      computedKeyboardInset: keyboardInset,
      drawerBottom: drawerStyle?.bottom ?? null,
      commentsSheetMaxPx,
      nativeKeyboardLayoutActive,
      nativeKeyboardInsetPx,
      effectiveDrawerBottomInset: commentsKeyboardBottomInset,
      composerRect: composerRect
        ? {
            top: Math.round(composerRect.top * 100) / 100,
            bottom: Math.round(composerRect.bottom * 100) / 100,
            height: Math.round(composerRect.height * 100) / 100,
          }
        : null,
      drawerRect: drawerRect
        ? {
            top: Math.round(drawerRect.top * 100) / 100,
            bottom: Math.round(drawerRect.bottom * 100) / 100,
            height: Math.round(drawerRect.height * 100) / 100,
          }
        : null,
      ...extra,
    });
  }

  useEffect(() => {
    if (!isOpen) {
      setNativeKeyboardInsetPx(0);
      setNativeKeyboardLayoutActive(false);
      return;
    }
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      setNativeKeyboardInsetPx(0);
      setNativeKeyboardLayoutActive(false);
      return;
    }

    let cancelled = false;
    let previousResizeMode: KeyboardResize | null = null;
    let removeWillShow: (() => Promise<void>) | null = null;
    let removeWillHide: (() => Promise<void>) | null = null;
    let removeDidHide: (() => Promise<void>) | null = null;
    const onWindowResize = () => {
      logKeyboardTiming("native-ios:window-resize-observed");
    };

    const setupNativeKeyboardMode = async () => {
      try {
        const current = await Keyboard.getResizeMode();
        previousResizeMode = current?.mode ?? KeyboardResize.Native;
      } catch {
        previousResizeMode = KeyboardResize.Native;
      }

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.None });
        if (cancelled) return;
        setNativeKeyboardLayoutActive(true);
        logKeyboardTiming("native-ios:resize-mode-set-none");
      } catch (err) {
        if (!cancelled) {
          setNativeKeyboardLayoutActive(false);
          setNativeKeyboardInsetPx(0);
          logKeyboardTiming("native-ios:resize-mode-set-none-failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      window.addEventListener("resize", onWindowResize);

      try {
        const h = await Keyboard.addListener("keyboardWillShow", (info) => {
          const height = Math.max(0, Math.round((info as { keyboardHeight?: number }).keyboardHeight ?? 0));
          logKeyboardTiming("native-ios:keyboardWillShow", { keyboardHeight: height });
          setNativeKeyboardInsetPx(height);
        });
        removeWillShow = () => h.remove();
      } catch (err) {
        logKeyboardTiming("native-ios:keyboardWillShow-listener-failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const h = await Keyboard.addListener("keyboardWillHide", () => {
          logKeyboardTiming("native-ios:keyboardWillHide");
          setNativeKeyboardInsetPx(0);
        });
        removeWillHide = () => h.remove();
      } catch (err) {
        logKeyboardTiming("native-ios:keyboardWillHide-listener-failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const h = await Keyboard.addListener("keyboardDidHide", () => {
          logKeyboardTiming("native-ios:keyboardDidHide");
          setNativeKeyboardInsetPx(0);
        });
        removeDidHide = () => h.remove();
      } catch (err) {
        logKeyboardTiming("native-ios:keyboardDidHide-listener-failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void setupNativeKeyboardMode();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onWindowResize);
      setNativeKeyboardInsetPx(0);
      setNativeKeyboardLayoutActive(false);
      void removeWillShow?.();
      void removeWillHide?.();
      void removeDidHide?.();
      const restoreMode = previousResizeMode ?? KeyboardResize.Native;
      void Keyboard.setResizeMode({ mode: restoreMode })
        .then(() => {
          logKeyboardTiming("native-ios:resize-mode-restored", { mode: restoreMode });
        })
        .catch((err) => {
          logKeyboardTiming("native-ios:resize-mode-restore-failed", {
            mode: restoreMode,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const bump = (reason: string) => {
      logKeyboardTiming("layout-bump:before", { reason });
      bumpForVisualViewport();
      logKeyboardTiming("layout-bump:after", { reason });
      requestAnimationFrame(() => {
        logKeyboardTiming("layout-bump:after-raf", { reason });
      });
    };
    const onVvResize = () => {
      logKeyboardTiming("visualViewport:resize:before");
      bump("visualViewport.resize");
      logKeyboardTiming("visualViewport:resize:after");
      requestAnimationFrame(() => logKeyboardTiming("visualViewport:resize:after-raf"));
    };
    const onVvScroll = () => {
      logKeyboardTiming("visualViewport:scroll:before");
      bump("visualViewport.scroll");
      logKeyboardTiming("visualViewport:scroll:after");
      requestAnimationFrame(() => logKeyboardTiming("visualViewport:scroll:after-raf"));
    };
    const onWindowResize = () => {
      logKeyboardTiming("window:resize:before");
      bump("window.resize");
      logKeyboardTiming("window:resize:after");
      requestAnimationFrame(() => logKeyboardTiming("window:resize:after-raf"));
    };
    logKeyboardTiming("layout-bump:effect-mounted");
    bump("effect-mount");
    vv?.addEventListener("resize", onVvResize);
    vv?.addEventListener("scroll", onVvScroll);
    window.addEventListener("resize", onWindowResize);
    return () => {
      logKeyboardTiming("layout-bump:effect-cleanup");
      vv?.removeEventListener("resize", onVvResize);
      vv?.removeEventListener("scroll", onVvScroll);
      window.removeEventListener("resize", onWindowResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    logKeyboardTiming("layout-values:render");
  }, [commentsKeyboardBottomInset, commentsSheetMaxPx, isOpen]);

  useEffect(() => {
    logKeyboardTiming("modal-open-state-change");
  }, [isOpen]);

  const {
    data: commentsData,
    isLoading: isLoadingComments,
    isFetching: isFetchingComments,
  } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      if (debugComments) {
        console.log("[CommentsModal] fetching", { modalPostId: post.id, url: `/api/posts/${post.id}/comments` });
      }
      const response = await apiRequest("GET", `/api/posts/${post.id}/comments`);
      const data = await response.json();
      if (!Array.isArray(data)) {
        console.warn("[DubHub][CommentsModal] Non-array comments payload", data);
      }
      if (debugComments) {
        console.log("[CommentsModal] fetched", {
          modalPostId: post.id,
          payloadType: Array.isArray(data) ? "array" : typeof data,
          rootCount: Array.isArray(data) ? data.length : null,
        });
      }
      return Array.isArray(data) ? data : [];
    },
    enabled: isOpen,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const comments = Array.isArray(commentsData) ? commentsData : [];
  const shouldShowCommentsLoadingState =
    isOpen && commentsData === undefined && (isLoadingComments || isFetchingComments);

  // Get verified artists for auto-complete
  const { data: verifiedArtists = [] } = useQuery<any[]>({
    queryKey: ["/api/artists/verified"],
    enabled: isOpen,
  });

  // Note: karma display has been removed from the comments UI to avoid stray numeric artifacts near names.

  // Handle comment input changes and artist mention detection
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    
    setNewComment(value);
    
    // Check for artist mention (@) - improved regex to handle underscores
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      
      // Only show dropdown if we have a valid mention context (allow underscores)
      if (textAfterAt.length >= 0 && !/\s/.test(textAfterAt)) {
        setArtistSearchTerm(textAfterAt);
        setCurrentMentionStart(lastAtIndex);
        setShowArtistDropdown(true);
      } else {
        setShowArtistDropdown(false);
      }
    } else {
      setShowArtistDropdown(false);
    }
  };

  // Handle artist selection from dropdown
  const handleArtistSelect = (artistName: string) => {
    if (currentMentionStart !== -1) {
      const beforeMention = newComment.substring(0, currentMentionStart);
      const afterCursor = newComment.substring(currentMentionStart + 1 + artistSearchTerm.length);
      const newValue = `${beforeMention}@${artistName}${afterCursor}`;
      setNewComment(newValue);
    }
    setShowArtistDropdown(false);
    setArtistSearchTerm("");
    setCurrentMentionStart(-1);
  };

  // Get current user for profile picture
  const { data: currentUser } = useQuery({
    queryKey: ["/api/user/current"],
    enabled: isOpen,
  });

  // Filter artists based on search term
  const filteredArtists = verifiedArtists.filter((artist: any) =>
    artist.username.toLowerCase().includes(artistSearchTerm.toLowerCase())
  );

  // Keep existing list order, but pin the logged-in verified artist to the top when present.
  const shouldPinCurrentArtistInMentions = userType === "artist" && verifiedArtist && !!contextUsername;
  const normalizedContextUsername = (contextUsername ?? "").toLowerCase();
  const pinnedArtistIndex = shouldPinCurrentArtistInMentions
    ? filteredArtists.findIndex((artist: any) => artist.username?.toLowerCase() === normalizedContextUsername)
    : -1;
  const pinnedArtist = pinnedArtistIndex >= 0 ? filteredArtists[pinnedArtistIndex] : null;
  const mentionArtists = (pinnedArtist
    ? [pinnedArtist, ...filteredArtists.filter((artist: any, index: number) => index !== pinnedArtistIndex)]
    : filteredArtists
  ).slice(0, 5); // Limit to 5 results

  const addCommentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: string }) => {
      const res = await apiRequest("POST", `/api/posts/${post.id}/comments`, {
        body: data.content,
        parentId: data.parentId ?? null,
      });
      const created = await res.json();
      return created as { id: string; post_id: string; user_id: string; body: string; artist_tag: string | null; created_at: string };
    },
    onSuccess: (data, variables) => {
      playSuccessNotification();
      setNewComment("");
      const newCommentWithUser: CommentWithUser = {
        id: data.id,
        postId: post.id,
        userId: data.user_id,
        body: data.body,
        artistTag: data.artist_tag ?? null,
        createdAt: data.created_at as unknown as Date,
        parentId: (variables.parentId as string | undefined) ?? null,
        user: {
          id: contextUser?.id ?? data.user_id,
          username: contextUsername ?? "You",
          avatar_url: userProfileImage ?? null,
          account_type: currentUser?.userType === "artist" ? "artist" : "user",
          verified_artist: verifiedArtist,
          moderator: isModerator,
        } as CommentWithUser["user"],
        replies: [],
      };
      // If this is a reply, attach to parent comment; otherwise prepend as top-level (newest-first)
      if (variables.parentId) {
        queryClient.setQueryData<CommentWithUser[]>(
          ["/api/posts", post.id, "comments"],
          (old) => {
            if (!old) return old;
            const attachReply = (items: CommentWithUser[]): CommentWithUser[] =>
              items.map((c) => {
                if (c.id === variables.parentId) {
                  const existingReplies = Array.isArray(c.replies) ? c.replies : [];
                  return { ...c, replies: [...existingReplies, newCommentWithUser] };
                }
                if (c.replies && c.replies.length > 0) {
                  return { ...c, replies: attachReply(c.replies) };
                }
                return c;
              });
            return attachReply(old);
          }
        );

        // Exception: if the user just replied, reveal the whole parent thread so
        // the reply is immediately visible.
        const key = ["/api/posts", post.id, "comments"] as const;
        const latest = queryClient.getQueryData<CommentWithUser[]>(key);
        const findInTree = (items: CommentWithUser[], id: string): CommentWithUser | null => {
          for (const c of items) {
            if (c.id === id) return c;
            if (c.replies?.length) {
              const found = findInTree(c.replies, id);
              if (found) return found;
            }
          }
          return null;
        };
        const parent = findInTree(latest || [], variables.parentId);
        const total = parent?.replies?.length ?? 0;
        setVisibleReplyCountByParent((prev) => ({
          ...prev,
          [variables.parentId as string]: Math.max(prev[variables.parentId as string] ?? 0, total),
        }));
        scrollToPostedComment(data.id, {
          isReply: true,
          parentId: variables.parentId as string,
        });
      } else {
        queryClient.setQueryData<CommentWithUser[]>(
          ["/api/posts", post.id, "comments"],
          (old) => (old ? [newCommentWithUser, ...old] : [newCommentWithUser])
        );
        scrollToPostedComment(data.id, { isReply: false });
      }
      const currentComments = Number((post as any).comments ?? post.comments ?? 0);
      queryClient.setQueriesData<PostWithUser[]>(
        { queryKey: ["/api/posts"], exact: false },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((p) => {
            if (p.id !== post.id) return p;
            return { ...p, comments: currentComments + 1 };
          });
        }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Comment added successfully!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add comment", variant: "destructive" });
    },
  });

  const updateCommentBodyInTree = useCallback(
    (commentId: string, body: string) => {
      queryClient.setQueryData<CommentWithUser[]>(
        ["/api/posts", post.id, "comments"],
        (old) => {
          if (!old) return old;
          const patchTree = (items: CommentWithUser[]): CommentWithUser[] =>
            items.map((c) => {
              if (c.id === commentId) {
                return { ...c, body, artistTag: null };
              }
              if (c.replies?.length) {
                return { ...c, replies: patchTree(c.replies) };
              }
              return c;
            });
          return patchTree(old);
        },
      );
    },
    [post.id, queryClient],
  );

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: (_data, commentId) => {
      updateCommentBodyInTree(commentId, DELETED_COMMENT_BODY);
    },
    onError: (error: unknown) => {
      let description = "Failed to delete comment";
      if (error instanceof ApiRequestError && error.responseBody) {
        try {
          const parsed = JSON.parse(error.responseBody) as { message?: string };
          if (typeof parsed.message === "string" && parsed.message.trim()) {
            description = parsed.message;
          }
        } catch {
          /* use default */
        }
      }
      toast({ title: "Could not delete comment", description, variant: "destructive" });
    },
  });

  const requestDeleteComment = (commentId: string) => {
    if (deleteCommentMutation.isPending) return;
    setDeleteConfirmCommentId(commentId);
  };

  const confirmDeleteComment = () => {
    if (!deleteConfirmCommentId || deleteCommentMutation.isPending) return;
    const commentId = deleteConfirmCommentId;
    setDeleteConfirmCommentId(null);
    deleteCommentMutation.mutate(commentId);
  };

  // Comment like toggle
  const handleToggleCommentLike = async (commentId: string) => {
    try {
      // Optimistic UI update
      queryClient.setQueryData<CommentWithUser[]>(
        ["/api/posts", post.id, "comments"],
        (old) => {
          if (!old) return old;

          const updateTree = (items: CommentWithUser[]): CommentWithUser[] =>
            items.map((c) => {
              if (c.id === commentId) {
                const currentlyLiked = c.userVote === "upvote";
                const currentCount = c.voteScore || 0;
                return {
                  ...c,
                  voteScore: currentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
                  userVote: currentlyLiked ? null : "upvote",
                };
              }
              if (c.replies && c.replies.length > 0) {
                return { ...c, replies: updateTree(c.replies) };
              }
              return c;
            });

          return updateTree(old);
        }
      );

      await apiRequest("POST", `/api/comments/${commentId}/like`, {});
      // Optionally re-fetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comments"] });
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  const sortedRepliesChronological = (replies: CommentWithUser[] | undefined) => {
    const safeReplies = Array.isArray(replies) ? replies : [];
    if (safeReplies.length === 0) return [];
    return [...safeReplies].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB; // oldest -> newest
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || trimmed.length > INPUT_LIMITS.commentBody) return;
    addCommentMutation.mutate({
      content: trimmed,
      parentId: replyingTo?.id
    } as any);
    setReplyingTo(null); // Clear reply state after submitting
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || trimmed.length > INPUT_LIMITS.commentBody || addCommentMutation.isPending) return;
    addCommentMutation.mutate({
      content: trimmed,
      parentId: replyingTo?.id,
    } as any);
    setReplyingTo(null);
  };

  const activateReplyTarget = useCallback((parentCommentId: string, username: string) => {
    setReplyingTo({ id: parentCommentId, username });
    setNewComment(`${formatUsernameDisplay(username)} `);
    requestAnimationFrame(() => {
      commentInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useLayoutEffect(() => {
    const el = commentInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(el.scrollHeight, 112);
    el.style.height = `${nextHeight}px`;
  }, [newComment, isOpen, replyingTo]);

  useEffect(() => {
    if (!isOpen) setDeleteConfirmCommentId(null);
  }, [isOpen]);

  return (
    <>
      <AlertDialog
        open={deleteConfirmCommentId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmCommentId(null);
        }}
      >
        <AlertDialogContent className="z-[80] w-[calc(100vw-2rem)] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>Any replies will stay visible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-comment-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCommentMutation.isPending}
              data-testid="delete-comment-confirm"
              onClick={confirmDeleteComment}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReportModal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setReportingComment(null);
        }}
        type="comment"
        postId={post.id}
        commentId={reportingComment?.id}
        reportedUserId={reportingComment?.userId}
        dialogStackClassName="z-[70]"
      />
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        shouldScaleBackground={false}
        repositionInputs={false}
        noBodyStyles
      >
      <DrawerContent
        ref={drawerContentRef}
        overlayClassName="z-[60] bg-transparent"
        className="bottom-0 z-[60] mx-auto mt-0 h-[min(66vh,33rem)] w-full max-w-xl gap-0 rounded-t-3xl border-0 bg-white/95 p-0 shadow-2xl backdrop-blur-sm dark:border dark:border-border/55 dark:bg-[color:var(--dark)] dark:shadow-[0_-16px_56px_-12px_rgba(0,0,0,0.58)] dark:backdrop-blur-md"
        style={
          commentsSheetMaxPx != null
            ? {
                maxHeight: commentsSheetMaxPx,
                bottom: commentsKeyboardBottomInset,
                transition: "bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
                willChange: "bottom",
              }
            : undefined
        }
      >
        <DrawerTitle className="sr-only">Comments for track</DrawerTitle>
        <DrawerDescription className="sr-only">View and add comments for this track</DrawerDescription>
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-border">
          <div className="h-8 w-[4.5rem]" aria-hidden />
          <h3 className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-base font-semibold text-gray-900 dark:text-white">
            Comments
          </h3>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-ring dark:focus-visible:ring-offset-[color:var(--dark)]"
                  aria-label="Sort comments"
                  data-testid="comments-filter-menu-trigger"
                >
                  <ArrowUpDown className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="z-[70] min-w-[10rem] rounded-lg border border-gray-200 bg-white p-1 text-gray-900 shadow-lg dark:border-border dark:bg-popover dark:text-popover-foreground"
              >
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                  onSelect={() => setCommentFilter("all")}
                  data-testid="comments-filter-all"
                >
                  {commentFilter === "all" ? "✓ " : ""}All
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                  onSelect={() => setCommentFilter("newest")}
                  data-testid="comments-filter-newest"
                >
                  {commentFilter === "newest" ? "✓ " : ""}Newest
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                  onSelect={() => setCommentFilter("top")}
                  data-testid="comments-filter-top"
                >
                  {commentFilter === "top" ? "✓ " : ""}Top rated
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-7 w-7 rounded-full p-0 text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Comments List */}
        <div
          ref={commentsListRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3.5 pb-2.5 pt-2 sm:px-4 sm:pb-3 sm:pt-2.5"
        >
          {(() => {
            let filteredComments = [...comments];
            
            switch (commentFilter) {
              case 'newest':
                filteredComments.sort((a, b) => {
                  const dateA = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt).getTime() : 0;
                  const dateB = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt).getTime() : 0;
                  return dateB - dateA;
                });
                break;
              case 'top':
                filteredComments.sort((a, b) => (b.voteScore || 0) - (a.voteScore || 0));
                break;
              case 'all':
              default:
                // Keep original order
                break;
            }
            
            const artistVerifiedBy = (post as any).artistVerifiedBy ?? (post as any).artist_verified_by;
            const isArtistVerifiedPost = !!((post as any).isVerifiedArtist ?? (post as any).is_verified_artist);

            // Derive the artist confirmation comment heuristically:
            // - Same artist who verified the post
            // - Body uses the confirmation copy we generate ("@... confirmed:"), with or without legacy leading emoji
            const artistConfirmationCommentId = isArtistVerifiedPost && artistVerifiedBy
              ? filteredComments.find((c) => {
                  const userId = (c as any).userId ?? (c as any).user?.id;
                  const body = (c as any).body ?? "";
                  const normalizedBody =
                    typeof body === "string" ? body.trim().replace(/^✅\s*/, "") : "";
                  return (
                    userId === artistVerifiedBy &&
                    typeof body === "string" &&
                    normalizedBody.toLowerCase().includes("confirmed:")
                  );
                })?.id ?? null
              : null;

            // Sort so that:
            // 1) The artist/system confirmation comment appears first (if present)
            // 2) The artist-selected community comment (verifiedCommentId) appears next
            filteredComments.sort((a, b) => {
              const aIsArtistConfirmation = artistConfirmationCommentId && a.id === artistConfirmationCommentId;
              const bIsArtistConfirmation = artistConfirmationCommentId && b.id === artistConfirmationCommentId;
              if (aIsArtistConfirmation && !bIsArtistConfirmation) return -1;
              if (!aIsArtistConfirmation && bIsArtistConfirmation) return 1;

              const aIsPinned = post.verifiedCommentId === a.id;
              const bIsPinned = post.verifiedCommentId === b.id;
              if (aIsPinned && !bIsPinned) return -1;
              if (!aIsPinned && bIsPinned) return 1;

              return 0;
            });

            if (shouldShowCommentsLoadingState) {
              return (
                <div className="min-h-[9rem] px-1 py-1.5 sm:px-0">
                  <div className="space-y-3.5" aria-hidden>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`comment-skeleton-${index}`} className="flex space-x-2.5">
                        <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200/80 sm:h-7 sm:w-7 dark:bg-white/12" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-2.5 w-28 animate-pulse rounded bg-gray-200/80 dark:bg-white/12" />
                          <div className="h-2.5 w-11/12 animate-pulse rounded bg-gray-200/70 dark:bg-white/10" />
                          <div className="h-2.5 w-8/12 animate-pulse rounded bg-gray-200/60 dark:bg-white/10" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (filteredComments.length === 0) {
              return (
                <div className="flex h-full min-h-[9rem] items-center justify-center px-4 text-center">
                  <div className="flex max-w-[18rem] flex-col items-center gap-2 text-gray-500/85 dark:text-white/55">
                    <MessageCircle className="h-4 w-4 opacity-60" aria-hidden />
                    <p className="text-sm leading-relaxed">
                      What are you waiting for? Be the first to ID this track
                    </p>
                  </div>
                </div>
              );
            }

            return filteredComments.map((comment) => {
              const commentIsDeleted = isDeletedCommentBody(comment.body);
              const isOwnComment = !!contextUser?.id && comment.userId === contextUser.id;
              const isVerifiedComment = post.verifiedCommentId === comment.id; // artist-selected community comment
              const isArtistConfirmationComment = !!artistConfirmationCommentId && comment.id === artistConfirmationCommentId; // system/artist confirmation comment
              // Only treat tagged comments specially before artist verification; once verified, rely solely on the selected + confirmation comments
              const isTaggedSuggestion =
                !commentIsDeleted &&
                !isArtistVerifiedPost &&
                artistVerifiedBy &&
                ((comment as any).artistTag ?? (comment as any).artist_tag) === artistVerifiedBy;

              const highlightClass = commentIsDeleted
                ? ""
                : isArtistConfirmationComment
                ? "rounded-lg border-2 border-[#FFD700] bg-amber-50/70 p-2 dark:bg-amber-500/[0.14] dark:shadow-[inset_0_0_0_1px_rgba(250,204,21,0.2)]"
                : isVerifiedComment
                ? "rounded-lg border-2 border-green-500 bg-green-50/40 p-2 dark:border-green-500/75 dark:bg-green-500/[0.11]"
                : isTaggedSuggestion
                  ? "rounded-lg border border-amber-300 bg-amber-50/30 p-2 dark:border-amber-500/45 dark:bg-amber-500/[0.09]"
                  : "";
              return (
                <div
                  key={comment.id}
                  data-comment-id={comment.id}
                  className={`flex items-start space-x-2 ${highlightClass}`}
                >
                  <button
                    type="button"
                    className="relative flex-shrink-0 p-0"
                    aria-label={
                      comment.user.username
                        ? `View profile ${formatUsernameDisplay(comment.user.username)}`
                        : "View profile"
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openByUsername(comment.user.username, {
                        anchor: { x: e.clientX, y: e.clientY },
                      });
                    }}
                  >
                    <img
                      src={comment.user.avatar_url || undefined}
                      alt=""
                      className={`avatar-media h-6 w-6 rounded-full border-2 sm:h-7 sm:w-7 ${isDefaultAvatarUrl(comment.user.avatar_url) ? "avatar-default-media" : ""} ${
                        comment.user.account_type === "artist" && comment.user.verified_artist
                          ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                          : "border-transparent"
                      }`}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <div className="flex items-center space-x-1">
                    <span 
                      className={`text-xs font-medium cursor-pointer hover:underline sm:text-[13px] ${
                        comment.user.account_type === 'artist' && comment.user.verified_artist
                          ? "text-[#FFD700]"
                          : "text-gray-900 dark:text-white"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openByUsername(comment.user.username, {
                          anchor: { x: e.clientX, y: e.clientY },
                        });
                      }}
                    >
                      {formatUsernameDisplay(comment.user.username)}
                    </span>
                    <UserRoleInlineIcons
                      verifiedArtist={
                        comment.user.account_type === "artist" && comment.user.verified_artist === true
                      }
                      moderator={!!comment.user.moderator}
                      tickClassName="h-3 w-3 -mt-0.5"
                      shieldSizeClass="h-4 w-4"
                    />
                  </div>
                  {/* Artist identified badge: match post-level identified treatment */}
                  {!commentIsDeleted && isArtistConfirmationComment && isArtistVerifiedPost && !isVerifiedComment && (
                    <span
                      className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15"
                      style={getGenreGlowPillStyle(STATUS_GLOW_PILL_BG.identified, "text-white")}
                      data-testid={`badge-artist-verified-${comment.id}`}
                    >
                      <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" />
                      Identified
                    </span>
                  )}
                  {/* Tagged artist - user's comment that tagged the artist (secondary, no verified badge, only pre-artist verification) */}
                  {!commentIsDeleted && isTaggedSuggestion && !isVerifiedComment && !isArtistVerifiedPost && (
                    <div
                      className="flex items-center space-x-1 rounded-full bg-amber-100 px-1.5 py-0.5 dark:bg-amber-500/18 dark:ring-1 dark:ring-amber-400/25"
                      data-testid={`badge-tagged-artist-${comment.id}`}
                    >
                      <span className="text-xs text-amber-800 font-medium dark:text-amber-200">Tagged artist</span>
                    </div>
                  )}
                  {/* Community identified badge: keep community source icon, match post-level identified styling */}
                  {!commentIsDeleted &&
                    (post.verificationStatus === "community" || post.verificationStatus === "community_approved") &&
                    post.verifiedCommentId === comment.id &&
                    !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <span
                      className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15"
                      style={getGenreGlowPillStyle(STATUS_GLOW_PILL_BG.identified, "text-white")}
                      data-testid={`badge-community-identified-${comment.id}`}
                    >
                      <Users className="h-3 w-3 shrink-0" />
                      Identified
                    </span>
                  )}
                  {/* Moderator identified badge: match post-level identified treatment */}
                  {!commentIsDeleted && isVerifiedComment && post.verificationStatus === "identified" && !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <span
                      className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15"
                      style={getGenreGlowPillStyle(STATUS_GLOW_PILL_BG.identified, "text-white")}
                      data-testid={`badge-identified-${comment.id}`}
                    >
                      <Check className="h-3 w-3 shrink-0 text-white" />
                      Identified
                    </span>
                  )}
                  {/* Artist-selected verified comment: same identified treatment as post-level artist state */}
                  {!commentIsDeleted && isVerifiedComment && isArtistVerifiedPost && (
                    <span
                      className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15"
                      style={getGenreGlowPillStyle(STATUS_GLOW_PILL_BG.identified, "text-white")}
                    >
                      <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" />
                      Identified
                    </span>
                  )}
                  {/* Denied Tag Badge */}
                  {comment.tagStatus === "denied" && (
                    <div className="flex items-center space-x-1 rounded-full bg-red-50 px-1.5 py-0.5 dark:bg-red-950/55 dark:ring-1 dark:ring-red-500/25">
                      <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                      <span className="text-xs text-red-600 font-medium dark:text-red-400">Denied</span>
                    </div>
                  )}
                  <span className="whitespace-nowrap text-[11px] text-gray-500 sm:text-xs dark:text-white/60">
                    {formatTimeAgo(comment.createdAt)}
                  </span>
                </div>
                {commentIsDeleted ? (
                  <p className="mt-0.5 text-[13px] italic leading-snug text-gray-400 sm:text-sm dark:text-white/45">
                    {DELETED_COMMENT_DISPLAY}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[13px] leading-snug text-gray-700 sm:text-sm dark:text-white">
                    {highlightArtistMentions(comment.body, comment.tagStatus)}
                  </p>
                )}
                <div className="mt-0.5 flex items-center gap-2">
                  {!commentIsDeleted ? (
                    <>
                      {/* Comment likes (separate from post likes) */}
                      <button
                        className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full px-2 py-0.5 text-[11px] sm:text-xs dark:hover:bg-muted ${
                          comment.userVote === "upvote"
                            ? "text-pink-600 bg-pink-50 dark:bg-pink-950/50 dark:text-pink-400"
                            : "text-gray-500 dark:text-white/70"
                        }`}
                        onClick={() => handleToggleCommentLike(comment.id)}
                        data-testid={`button-like-${comment.id}`}
                      >
                        <Heart
                          className="w-3 h-3"
                          fill={comment.userVote === "upvote" ? "currentColor" : "none"}
                        />
                        <span>{comment.voteScore ?? 0}</span>
                      </button>
                      <button
                        className="text-[11px] text-gray-500 hover:text-gray-700 sm:text-xs dark:text-white/70 dark:hover:text-white"
                        onPointerDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => activateReplyTarget(comment.id, comment.user.username)}
                        data-testid={`reply-button-${comment.id}`}
                      >
                        Reply
                      </button>
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-ring dark:focus-visible:ring-offset-[color:var(--dark)] sm:h-8 sm:w-8"
                              aria-label="Comment actions"
                              data-testid={`comment-actions-trigger-${comment.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            sideOffset={6}
                            alignOffset={-4}
                            collisionPadding={16}
                            className={COMMENT_ACTIONS_DROPDOWN_CONTENT_CLASS}
                          >
                            {isOwnComment ? (
                              <DropdownMenuItem
                                className="cursor-pointer text-sm text-red-700 focus:bg-red-50 focus:text-red-800 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-800 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300 dark:data-[highlighted]:bg-red-950/40 dark:data-[highlighted]:text-red-300"
                                onSelect={() => requestDeleteComment(comment.id)}
                                data-testid={`delete-button-${comment.id}`}
                              >
                                <Trash2 className="h-4 w-4 shrink-0" />
                                Delete comment
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                                onSelect={() => {
                                  setReportingComment({ id: comment.id, userId: comment.userId });
                                  setShowReportModal(true);
                                }}
                                data-testid={`report-button-${comment.id}`}
                              >
                                <Flag className="h-4 w-4 shrink-0 text-red-600" />
                                Report comment
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                  ) : null}
                  {/* Toggle replies button */}
                  {comment.replies && comment.replies.length > 0 && (() => {
                    const totalReplies = comment.replies.length;
                    const visibleCount = visibleReplyCountByParent[comment.id] ?? 0;

                    if (visibleCount === 0) {
                      return (
                        <button
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          onClick={() =>
                            setVisibleReplyCountByParent((prev) => ({
                              ...prev,
                              [comment.id]: Math.min(REPLY_BATCH_SIZE, totalReplies),
                            }))
                          }
                          data-testid={`toggle-replies-${comment.id}`}
                        >
                          Show replies ({totalReplies})
                        </button>
                      );
                    }

                    return (
                      <button
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        onClick={() =>
                          setVisibleReplyCountByParent((prev) => ({
                            ...prev,
                            [comment.id]: 0,
                          }))
                        }
                        data-testid={`hide-replies-${comment.id}`}
                      >
                        Hide replies
                      </button>
                    );
                  })()}
                </div>
                
                {/* Show replies progressively */}
                {comment.replies &&
                  comment.replies.length > 0 &&
                  (visibleReplyCountByParent[comment.id] ?? 0) > 0 && (
                  <div className="ml-7 mt-2 space-y-2.5 border-l-2 border-gray-100 pl-2.5 dark:border-border">
                    {sortedRepliesChronological(comment.replies)
                      .slice(0, visibleReplyCountByParent[comment.id] ?? 0)
                      .map((reply) => {
                        const replyIsDeleted = isDeletedCommentBody(reply.body);
                        const isOwnReply = !!contextUser?.id && reply.userId === contextUser.id;
                        return (
                        <div key={reply.id} data-comment-id={reply.id} className="flex items-start space-x-2">
                          <button
                            type="button"
                            className="relative flex-shrink-0 p-0"
                            aria-label={
                              reply.user.username
                                ? `View profile ${formatUsernameDisplay(reply.user.username)}`
                                : "View profile"
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openByUsername(reply.user.username, {
                                anchor: { x: e.clientX, y: e.clientY },
                              });
                            }}
                          >
                            <img
                              src={reply.user.avatar_url || undefined}
                              alt=""
                              className={`avatar-media w-6 h-6 rounded-full border-2 ${isDefaultAvatarUrl(reply.user.avatar_url) ? "avatar-default-media" : ""} ${
                                reply.user.account_type === "artist" && reply.user.verified_artist
                                  ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                                  : "border-transparent"
                              }`}
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <div className="flex items-center space-x-1">
                              <span 
                                className={`text-xs font-medium cursor-pointer hover:underline ${
                                  reply.user.account_type === 'artist' && reply.user.verified_artist
                                    ? "text-[#FFD700]"
                                    : "text-gray-900 dark:text-white"
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openByUsername(reply.user.username, {
                                    anchor: { x: e.clientX, y: e.clientY },
                                  });
                                }}
                              >
                                {formatUsernameDisplay(reply.user.username)}
                              </span>
                              <UserRoleInlineIcons
                                verifiedArtist={
                                  reply.user.account_type === "artist" && reply.user.verified_artist === true
                                }
                                moderator={!!reply.user.moderator}
                                tickClassName="h-3 w-3 -mt-0.5"
                                shieldSizeClass="h-4 w-4"
                              />
                            </div>
                            {/* Verified by Artist Badge for Reply */}
                            {reply.isVerifiedByArtist && (
                              <div className="flex items-center space-x-1 rounded-full bg-green-50 px-1.5 py-0.5 dark:bg-green-500/16 dark:ring-1 dark:ring-green-400/25">
                                <CheckCircle className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                                <span className="text-xs font-medium text-green-600 dark:text-green-400">Verified</span>
                              </div>
                            )}
                            {/* Denied Tag Badge for Reply */}
                            {reply.tagStatus === "denied" && (
                              <div className="flex items-center space-x-1 rounded-full bg-red-50 px-1.5 py-0.5 dark:bg-red-950/55 dark:ring-1 dark:ring-red-500/25">
                                <XCircle className="w-2.5 h-2.5 text-red-600 dark:text-red-400" />
                                <span className="text-xs font-medium text-red-600 dark:text-red-400">Denied</span>
                              </div>
                            )}
                            <span className="text-xs text-gray-500 dark:text-white/60">
                              {formatTimeAgo(reply.createdAt)}
                            </span>
                          </div>
                          {replyIsDeleted ? (
                            <p className="mt-0.5 text-xs italic text-gray-400 dark:text-white/45">
                              {DELETED_COMMENT_DISPLAY}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-gray-700 dark:text-white">
                              {highlightArtistMentions(reply.body, reply.tagStatus)}
                            </p>
                          )}
                          <div className="mt-1 flex items-center space-x-2.5">
                            {!replyIsDeleted ? (
                              <>
                                <button
                                  className={`flex items-center space-x-1 rounded-full px-2 py-0.5 text-xs hover:bg-gray-100 dark:hover:bg-muted ${
                                    reply.userVote === "upvote"
                                      ? "bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400"
                                      : "text-gray-500 dark:text-white/70"
                                  }`}
                                  onClick={() => handleToggleCommentLike(reply.id)}
                                  data-testid={`button-like-${reply.id}`}
                                >
                                  <Heart
                                    className="w-3 h-3"
                                    fill={reply.userVote === "upvote" ? "currentColor" : "none"}
                                  />
                                  <span>{reply.voteScore ?? 0}</span>
                                </button>
                                {!commentIsDeleted ? (
                                  <button
                                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-white/70 dark:hover:text-white"
                                    onPointerDown={(e) => {
                                      e.preventDefault();
                                    }}
                                    onClick={() => activateReplyTarget(comment.id, reply.user.username)}
                                    data-testid={`reply-button-${reply.id}`}
                                  >
                                    Reply
                                  </button>
                                ) : null}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                                      aria-label="Reply actions"
                                      data-testid={`comment-actions-trigger-${reply.id}`}
                                    >
                                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    sideOffset={6}
                                    alignOffset={-4}
                                    collisionPadding={16}
                                    className={COMMENT_ACTIONS_DROPDOWN_CONTENT_CLASS}
                                  >
                                    {isOwnReply ? (
                                      <DropdownMenuItem
                                        className="cursor-pointer text-sm text-red-700 focus:bg-red-50 focus:text-red-800 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-800 dark:text-red-400 dark:focus:bg-red-950/40 dark:data-[highlighted]:bg-red-950/40"
                                        onSelect={() => requestDeleteComment(reply.id)}
                                        data-testid={`delete-button-${reply.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 shrink-0" />
                                        Delete comment
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:data-[highlighted]:bg-muted"
                                        onSelect={() => {
                                          setReportingComment({ id: reply.id, userId: reply.userId });
                                          setShowReportModal(true);
                                        }}
                                        data-testid={`report-button-${reply.id}`}
                                      >
                                        <Flag className="h-4 w-4 shrink-0 text-red-600" />
                                        Report comment
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                        );
                      })}
                    {(visibleReplyCountByParent[comment.id] ?? 0) <
                      comment.replies.length && (
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        onClick={() =>
                          setVisibleReplyCountByParent((prev) => ({
                            ...prev,
                            [comment.id]: Math.min(
                              comment.replies!.length,
                              (prev[comment.id] ?? 0) + REPLY_BATCH_SIZE,
                            ),
                          }))
                        }
                        data-testid={`show-more-replies-${comment.id}`}
                      >
                        Show more replies
                      </button>
                    )}
                  </div>
                )}
                </div>
              </div>
              );
            });
          })()}
        </div>

        {/* Comment Input */}
        <div className="border-t border-gray-200 px-3.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2 dark:border-border sm:px-4 sm:pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:pt-2.5">
          {/* Reply indicator */}
          {replyingTo && (
            <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-500/35 dark:bg-blue-950/45">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-blue-600 dark:text-blue-400">Replying to</span>
                  <span className="text-xs font-medium text-blue-800 dark:text-blue-200">{formatUsernameDisplay(replyingTo.username)}</span>
                </div>
                <button 
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  className="text-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                  data-testid="cancel-reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="relative">
            {/* Artist Auto-complete Dropdown */}
            {showArtistDropdown && mentionArtists.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-border dark:bg-popover dark:shadow-black/40">
                {mentionArtists.map((artist: any) => {
                  const isPinnedCurrentArtist =
                    !!pinnedArtist && artist.username?.toLowerCase() === normalizedContextUsername;
                  return (
                  <button
                    key={artist.id}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => handleArtistSelect(artist.username)}
                    className="flex w-full items-center space-x-3 border-b border-gray-100 p-2.5 text-left hover:bg-gray-50 last:border-b-0 dark:border-border dark:hover:bg-muted"
                    data-testid={`artist-option-${artist.id}`}
                  >
                    <img
                      src={artist.avatar_url || artist.profileImage || undefined}
                      alt={formatUsernameDisplay(artist.username) || artist.username || ""}
                      className={`avatar-media w-8 h-8 rounded-full ${isDefaultAvatarUrl(artist.avatar_url || artist.profileImage) ? "avatar-default-media" : ""}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-yellow-600">
                          {formatUsernameDisplay(artist.username)}
                        </span>
                        <CheckCircle className="w-3 h-3 text-yellow-400" />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-muted-foreground">
                        {isPinnedCurrentArtist
                          ? "Tag yourself if this is your ID"
                          : formatUsernameDisplay(artist.username)}
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="flex items-end space-x-2">
                <label
                  htmlFor={composerFieldId}
                  className="flex min-w-0 flex-1 cursor-text touch-manipulation items-end gap-2"
                  onPointerDown={(e) => {
                    const t = e.target as HTMLElement;
                    if (t.closest("textarea")) return;
                    if (addCommentMutation.isPending) return;
                    e.preventDefault();
                    commentInputRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <img
                    src={userProfileImage || undefined}
                    alt=""
                    className={`avatar-media pointer-events-none h-7 w-7 flex-shrink-0 rounded-full border-2 sm:h-8 sm:w-8 ${isDefaultAvatarUrl(userProfileImage) ? "avatar-default-media" : ""} ${
                      verifiedArtist
                        ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                        : "border-gray-200 dark:border-border"
                    }`}
                  />
                  <Textarea
                    id={composerFieldId}
                    ref={commentInputRef}
                    value={newComment}
                    onChange={handleCommentChange}
                    onKeyDown={handleComposerKeyDown}
                    onFocus={() => {
                      logKeyboardTiming("composer:focus");
                      if (!nativeKeyboardLayoutActive) {
                        logKeyboardTiming("composer:focus:before-sync");
                        viewportHostVvSyncRef.current?.();
                        logKeyboardTiming("composer:focus:after-sync");
                        logKeyboardTiming("composer:focus:raf-scheduled:1");
                        requestAnimationFrame(() => {
                          logKeyboardTiming("composer:focus:raf-fired:1-before-sync");
                          viewportHostVvSyncRef.current?.();
                          logKeyboardTiming("composer:focus:raf-fired:1-after-sync");
                          logKeyboardTiming("composer:focus:raf-scheduled:2");
                          requestAnimationFrame(() => {
                            logKeyboardTiming("composer:focus:raf-fired:2-before-sync");
                            viewportHostVvSyncRef.current?.();
                            logKeyboardTiming("composer:focus:raf-fired:2-after-sync");
                          });
                        });
                      } else {
                        logKeyboardTiming("composer:focus:vv-sync-skipped-native-ios");
                      }
                      if (commentsKeyboardDebugEnabled()) {
                        queueMicrotask(() =>
                          logCommentsKeyboardSnapshot("textarea-focus", { postId: post.id }),
                        );
                        if (!nativeKeyboardLayoutActive) {
                          logKeyboardTiming("composer:focus:timeout-scheduled", { delayMs: 350 });
                          window.setTimeout(() => {
                            logKeyboardTiming("composer:focus:timeout-fired", { delayMs: 350 });
                            logCommentsKeyboardSnapshot("textarea-focus+~350ms", { postId: post.id });
                          }, 350);
                        } else {
                          logKeyboardTiming("composer:focus:timeout-skipped-native-ios");
                        }
                      }
                    }}
                    onBlur={() => {
                      logKeyboardTiming("composer:blur");
                      if (!nativeKeyboardLayoutActive) {
                        logKeyboardTiming("composer:blur:before-sync");
                        viewportHostVvSyncRef.current?.();
                        logKeyboardTiming("composer:blur:after-sync");
                        logKeyboardTiming("composer:blur:raf-scheduled:1");
                        requestAnimationFrame(() => {
                          logKeyboardTiming("composer:blur:raf-fired:1-before-sync");
                          viewportHostVvSyncRef.current?.();
                          logKeyboardTiming("composer:blur:raf-fired:1-after-sync");
                          logKeyboardTiming("composer:blur:raf-scheduled:2");
                          requestAnimationFrame(() => {
                            logKeyboardTiming("composer:blur:raf-fired:2-before-sync");
                            viewportHostVvSyncRef.current?.();
                            logKeyboardTiming("composer:blur:raf-fired:2-after-sync");
                          });
                        });
                      } else {
                        logKeyboardTiming("composer:blur:vv-sync-skipped-native-ios");
                      }
                      if (commentsKeyboardDebugEnabled()) {
                        queueMicrotask(() =>
                          logCommentsKeyboardSnapshot("textarea-blur", { postId: post.id }),
                        );
                      }
                    }}
                    placeholder={
                      replyingTo
                        ? `Replying to ${formatUsernameDisplay(replyingTo.username)}...`
                        : shouldShowArtistSelfTagPlaceholder
                          ? "Tag yourself if this is your ID..."
                          : "What do you think?"
                    }
                    className="block max-h-28 min-h-[44px] flex-1 resize-none overflow-y-auto rounded-2xl border-gray-300 px-3 py-[11px] text-sm leading-5 dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/45 dark:ring-offset-[color:var(--dark)]"
                    disabled={addCommentMutation.isPending}
                    data-testid="comment-input"
                    maxLength={INPUT_LIMITS.commentBody}
                    rows={1}
                    enterKeyHint="send"
                    autoComplete="on"
                    autoCorrect="on"
                    spellCheck={true}
                  />
                </label>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !newComment.trim() ||
                    newComment.length > INPUT_LIMITS.commentBody ||
                    addCommentMutation.isPending
                  }
                  className="h-10 w-10 flex-shrink-0 rounded-full p-0"
                  data-testid="comment-submit"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {newComment.length > INPUT_LIMITS.commentBody && (
                <p className="mt-1 text-right text-[11px] text-red-500 dark:text-red-400">
                  Comment is too long. Keep it under {INPUT_LIMITS.commentBody} characters.
                </p>
              )}
            </form>
          </div>
        </div>

        {userProfilePopup}
      </DrawerContent>
    </Drawer>
    </>
  );
}
