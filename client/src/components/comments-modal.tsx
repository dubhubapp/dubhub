
import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Heart, CheckCircle, Award, XCircle, Flag, MoreHorizontal } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_LIMITS } from "@shared/input-limits";
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
import { GoldVerifiedArtistPill, goldAvatarGlowShadowClass } from "./verified-artist";
import { UserRoleInlineIcons } from "./moderator-shield";
import { isDefaultAvatarUrl } from "@/lib/default-avatar";
import { useUserProfileLightPopup } from "@/components/user-profile-light-popup";
import { formatUsernameDisplay } from "@/lib/utils";
import { commentsKeyboardDebugEnabled, logCommentsKeyboardSnapshot } from "@/lib/comments-keyboard-debug";

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

export function CommentsModal({ post, isOpen, onClose }: CommentsModalProps) {
  const [newComment, setNewComment] = useState("");
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [artistSearchTerm, setArtistSearchTerm] = useState("");
  const [currentMentionStart, setCurrentMentionStart] = useState(-1);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingComment, setReportingComment] = useState<{id: string, userId: string} | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage: userProfileImage, username: contextUsername, currentUser: contextUser, verifiedArtist } = useUser();
  const debugComments =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "comments";
  const composerFieldId = useId();

  const { openByUsername, popup: userProfilePopup } = useUserProfileLightPopup({
    verifiedArtistsEnabled: isOpen,
  });

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
      dismissPullGuardTimer = window.setTimeout(() => {
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
      clearTimeout(t);
      t = setTimeout(() => logCommentsKeyboardSnapshot("visual-viewport-resize"), 80);
    };
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    let moT: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => {
      clearTimeout(moT);
      moT = setTimeout(() => logCommentsKeyboardSnapshot("html-body-style-mutation"), 80);
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
          className = "text-green-600 font-medium bg-green-50 px-1 rounded cursor-pointer hover:underline";
        } else if (tagStatus === "denied") {
          className = "text-gray-400 font-medium line-through";
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
  const [, bumpForVisualViewport] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const bump = () => bumpForVisualViewport();
    bump();
    vv?.addEventListener("resize", bump);
    vv?.addEventListener("scroll", bump);
    window.addEventListener("resize", bump);
    return () => {
      vv?.removeEventListener("resize", bump);
      vv?.removeEventListener("scroll", bump);
      window.removeEventListener("resize", bump);
    };
  }, [isOpen]);

  const commentsSheetMaxPx = isOpen ? computeCommentsSheetMaxPx() : null;

  const { data: comments = [] } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      if (debugComments) {
        console.log("[CommentsModal] fetching", { modalPostId: post.id, url: `/api/posts/${post.id}/comments` });
      }
      const response = await apiRequest("GET", `/api/posts/${post.id}/comments`);
      const data = await response.json();
      if (debugComments) {
        console.log("[CommentsModal] fetched", {
          modalPostId: post.id,
          payloadType: Array.isArray(data) ? "array" : typeof data,
          rootCount: Array.isArray(data) ? data.length : null,
        });
      }
      return data as CommentWithUser[];
    },
    enabled: isOpen,
  });

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
          avatarUrl: userProfileImage ?? null,
        } as any,
        replies: [],
      };
      // If this is a reply, attach to parent comment; otherwise append as top-level
      if (variables.parentId) {
        queryClient.setQueryData<CommentWithUser[]>(
          ["/api/posts", post.id, "comments"],
          (old) => {
            if (!old) return old;
            const attachReply = (items: CommentWithUser[]): CommentWithUser[] =>
              items.map((c) => {
                if (c.id === variables.parentId) {
                  const existingReplies = c.replies || [];
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
      } else {
        queryClient.setQueryData<CommentWithUser[]>(
          ["/api/posts", post.id, "comments"],
          (old) => (old ? [...old, newCommentWithUser] : [newCommentWithUser])
        );
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
    if (!replies || replies.length === 0) return [];
    return [...replies].sort((a, b) => {
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

  useLayoutEffect(() => {
    const el = commentInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(el.scrollHeight, 112);
    el.style.height = `${nextHeight}px`;
  }, [newComment, isOpen, replyingTo]);

  return (
    <>
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
      />
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        shouldScaleBackground={false}
        repositionInputs={false}
        noBodyStyles
      >
      <DrawerContent
        overlayClassName="z-40 bg-transparent"
        className="bottom-0 z-40 mx-auto mt-0 h-[min(66vh,33rem)] w-full max-w-xl gap-0 rounded-t-3xl border-0 bg-white/95 p-0 shadow-2xl backdrop-blur-sm"
        style={commentsSheetMaxPx != null ? { maxHeight: commentsSheetMaxPx } : undefined}
      >
        <DrawerTitle className="sr-only">Comments for track</DrawerTitle>
        <DrawerDescription className="sr-only">View and add comments for this track</DrawerDescription>
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="h-8 w-[4.5rem]" aria-hidden />
          <h3 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-base font-semibold text-gray-900">
            Comments
          </h3>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1"
                  aria-label="Comment filter options"
                  data-testid="comments-filter-menu-trigger"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-[10rem] rounded-lg border border-gray-200 bg-white p-1 text-gray-900 shadow-lg"
              >
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900"
                  onSelect={() => setCommentFilter("all")}
                  data-testid="comments-filter-all"
                >
                  {commentFilter === "all" ? "✓ " : ""}All
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900"
                  onSelect={() => setCommentFilter("newest")}
                  data-testid="comments-filter-newest"
                >
                  {commentFilter === "newest" ? "✓ " : ""}Newest
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900"
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
              onClick={onClose}
              className="h-7 w-7 rounded-full p-0 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Comments List */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3.5 pb-2.5 pt-2 sm:px-4 sm:pb-3 sm:pt-2.5">
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
            // - Body starts with the system confirmation prefix we use when creating the comment
            const artistConfirmationCommentId = isArtistVerifiedPost && artistVerifiedBy
              ? filteredComments.find((c) => {
                  const userId = (c as any).userId ?? (c as any).user?.id;
                  const body = (c as any).body ?? "";
                  return (
                    userId === artistVerifiedBy &&
                    typeof body === "string" &&
                    body.trim().startsWith("✅ @")
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

            return filteredComments.map((comment) => {
              const isVerifiedComment = post.verifiedCommentId === comment.id; // artist-selected community comment
              const isArtistConfirmationComment = !!artistConfirmationCommentId && comment.id === artistConfirmationCommentId; // system/artist confirmation comment
              // Only treat tagged comments specially before artist verification; once verified, rely solely on the selected + confirmation comments
              const isTaggedSuggestion =
                !isArtistVerifiedPost &&
                artistVerifiedBy &&
                ((comment as any).artistTag ?? (comment as any).artist_tag) === artistVerifiedBy;

              const highlightClass = isArtistConfirmationComment
                ? "rounded-lg border-2 border-[#FFD700] bg-amber-50/70 p-2"
                : isVerifiedComment
                ? "rounded-lg border-2 border-green-500 bg-green-50/40 p-2"
                : isTaggedSuggestion
                  ? "rounded-lg border border-amber-300 bg-amber-50/30 p-2"
                  : "";
              return (
                <div key={comment.id} className={`flex space-x-2 ${highlightClass}`}>
              <div className="relative flex-shrink-0">
                <img
                  src={comment.user.avatar_url || undefined}
                  alt={formatUsernameDisplay(comment.user.username) || comment.user.username || ""}
                  className={`avatar-media h-6 w-6 rounded-full border-2 sm:h-7 sm:w-7 ${isDefaultAvatarUrl(comment.user.avatar_url) ? "avatar-default-media" : ""} ${
                    comment.user.account_type === "artist" && comment.user.verified_artist
                      ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                      : "border-transparent"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <div className="flex items-center space-x-1">
                    <span 
                      className={`text-xs font-medium cursor-pointer hover:underline sm:text-[13px] ${
                        comment.user.account_type === 'artist' && comment.user.verified_artist ? "text-[#FFD700]" : "text-gray-900"
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
                  {/* Artist Verified Badge - on the artist/system confirmation comment, GOLD */}
                  {isArtistConfirmationComment && isArtistVerifiedPost && (
                    <GoldVerifiedArtistPill
                      data-testid={`badge-artist-verified-${comment.id}`}
                      size="xs"
                    />
                  )}
                  {/* Tagged artist - user's comment that tagged the artist (secondary, no verified badge, only pre-artist verification) */}
                  {isTaggedSuggestion && !isVerifiedComment && !isArtistVerifiedPost && (
                    <div className="flex items-center space-x-1 rounded-full bg-amber-100 px-1.5 py-0.5" data-testid={`badge-tagged-artist-${comment.id}`}>
                      <span className="text-xs text-amber-800 font-medium">Tagged artist</span>
                    </div>
                  )}
                  {/* Community Identified Badge - Blue for pending moderator review (only when no artist verification) */}
                  {post.verificationStatus === "community" && post.verifiedCommentId === comment.id && !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <div className="flex items-center space-x-1 rounded-full bg-blue-500 px-1.5 py-0.5" data-testid={`badge-community-identified-${comment.id}`}>
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-xs text-white font-bold">Community Identified</span>
                    </div>
                  )}
                  {/* Identified Track ID Badge - Green for moderator confirmed (fallback when no artist verification) */}
                  {isVerifiedComment && post.verificationStatus === "identified" && !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <div className="flex items-center space-x-1 rounded-full bg-green-500 px-1.5 py-0.5" data-testid={`badge-identified-${comment.id}`}>
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-xs text-white font-bold">Identified Track ID</span>
                    </div>
                  )}
                  {/* Artist ID Badge - on the artist-selected community comment when artist verification is present */}
                  {isVerifiedComment && isArtistVerifiedPost && (
                    <div className="flex items-center space-x-1 rounded-full bg-green-50 px-1.5 py-0.5">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      <span className="text-xs text-green-600 font-medium">Artist ID</span>
                    </div>
                  )}
                  {/* Denied Tag Badge */}
                  {comment.tagStatus === "denied" && (
                    <div className="flex items-center space-x-1 rounded-full bg-red-50 px-1.5 py-0.5">
                      <XCircle className="w-3 h-3 text-red-600" />
                      <span className="text-xs text-red-600 font-medium">Denied</span>
                    </div>
                  )}
                  <span className="whitespace-nowrap text-[11px] text-gray-500 sm:text-xs">
                    {formatTimeAgo(comment.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-gray-700 sm:text-sm">
                  {highlightArtistMentions(comment.body, comment.tagStatus)}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  {/* Comment likes (separate from post likes) */}
                  <button
                    className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full px-2 py-0.5 text-[11px] sm:text-xs ${
                      comment.userVote === "upvote" ? "text-pink-600 bg-pink-50" : "text-gray-500"
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
                    className="text-[11px] text-gray-500 hover:text-gray-700 sm:text-xs"
                    onClick={() => {
                      setReplyingTo({id: comment.id, username: comment.user.username});
                      setNewComment(`${formatUsernameDisplay(comment.user.username)} `);
                    }}
                    data-testid={`reply-button-${comment.id}`}
                  >
                    Reply
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 sm:h-8 sm:w-8"
                        aria-label="Comment actions"
                        data-testid={`comment-actions-trigger-${comment.id}`}
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={4}
                      className="min-w-[10rem] rounded-lg border border-gray-200 bg-white p-1 text-gray-900 shadow-lg"
                    >
                      <DropdownMenuItem
                        className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900"
                        onSelect={() => {
                          setReportingComment({ id: comment.id, userId: comment.userId });
                          setShowReportModal(true);
                        }}
                        data-testid={`report-button-${comment.id}`}
                      >
                        <Flag className="h-4 w-4 shrink-0 text-red-600" />
                        Report comment
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {/* Toggle replies button */}
                  {comment.replies && comment.replies.length > 0 && (() => {
                    const totalReplies = comment.replies.length;
                    const visibleCount = visibleReplyCountByParent[comment.id] ?? 0;

                    if (visibleCount === 0) {
                      return (
                        <button
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
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

                    if (visibleCount < totalReplies) {
                      return (
                        <button
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          onClick={() =>
                            setVisibleReplyCountByParent((prev) => ({
                              ...prev,
                              [comment.id]: Math.min(totalReplies, visibleCount + REPLY_BATCH_SIZE),
                            }))
                          }
                          data-testid={`show-more-replies-${comment.id}`}
                        >
                          Show more replies
                        </button>
                      );
                    }

                    return (
                      <button
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
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
                  <div className="ml-7 mt-2 space-y-2.5 border-l-2 border-gray-100 pl-2.5">
                    {sortedRepliesChronological(comment.replies)
                      .slice(0, visibleReplyCountByParent[comment.id] ?? 0)
                      .map((reply) => (
                        <div key={reply.id} className="flex space-x-2">
                        <div className="relative flex-shrink-0">
                          <img
                            src={reply.user.avatar_url || undefined}
                            alt={formatUsernameDisplay(reply.user.username) || reply.user.username || ""}
                            className={`avatar-media w-6 h-6 rounded-full border-2 ${isDefaultAvatarUrl(reply.user.avatar_url) ? "avatar-default-media" : ""} ${
                              reply.user.account_type === "artist" && reply.user.verified_artist
                                ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                                : "border-transparent"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <div className="flex items-center space-x-1">
                              <span 
                                className={`text-xs font-medium cursor-pointer hover:underline ${
                                  reply.user.account_type === 'artist' && reply.user.verified_artist ? "text-[#FFD700]" : "text-gray-900"
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
                              <div className="flex items-center space-x-1 bg-green-50 px-1.5 py-0.5 rounded-full">
                                <CheckCircle className="w-2.5 h-2.5 text-green-600" />
                                <span className="text-xs text-green-600 font-medium">Verified</span>
                              </div>
                            )}
                            {/* Denied Tag Badge for Reply */}
                            {reply.tagStatus === "denied" && (
                              <div className="flex items-center space-x-1 bg-red-50 px-1.5 py-0.5 rounded-full">
                                <XCircle className="w-2.5 h-2.5 text-red-600" />
                                <span className="text-xs text-red-600 font-medium">Denied</span>
                              </div>
                            )}
                            <span className="text-xs text-gray-500">
                              {formatTimeAgo(reply.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-700">
                            {highlightArtistMentions(reply.body, reply.tagStatus)}
                          </p>
                          <div className="mt-1 flex items-center space-x-2.5">
                            {/* Comment likes for replies */}
                            <button
                              className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full px-2 py-0.5 text-xs ${
                                reply.userVote === "upvote" ? "text-pink-600 bg-pink-50" : "text-gray-500"
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
                            <button 
                              className="text-xs text-gray-500 hover:text-gray-700"
                              onClick={() => {
                                setReplyingTo({id: comment.id, username: reply.user.username});
                                setNewComment(`${formatUsernameDisplay(reply.user.username)} `);
                              }}
                              data-testid={`reply-button-${reply.id}`}
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                      ))}
                  </div>
                )}
                </div>
              </div>
              );
            });
          })()}
        </div>

        {/* Comment Input */}
        <div className="border-t border-gray-200 px-3.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-4 sm:pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:pt-2.5">
          {/* Reply indicator */}
          {replyingTo && (
            <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-blue-600">Replying to</span>
                  <span className="text-xs font-medium text-blue-800">{formatUsernameDisplay(replyingTo.username)}</span>
                </div>
                <button 
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  className="text-blue-400 hover:text-blue-600"
                  data-testid="cancel-reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="relative">
            {/* Artist Auto-complete Dropdown */}
            {showArtistDropdown && filteredArtists.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {filteredArtists.map((artist: any) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => handleArtistSelect(artist.username)}
                    className="flex w-full items-center space-x-3 border-b border-gray-100 p-2.5 text-left hover:bg-gray-50 last:border-b-0"
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
                      <span className="text-xs text-gray-500">{formatUsernameDisplay(artist.username)}</span>
                    </div>
                  </button>
                ))}
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
                        : "border-gray-200"
                    }`}
                  />
                  <Textarea
                    id={composerFieldId}
                    ref={commentInputRef}
                    value={newComment}
                    onChange={handleCommentChange}
                    onKeyDown={handleComposerKeyDown}
                    onFocus={() => {
                      if (commentsKeyboardDebugEnabled()) {
                        queueMicrotask(() =>
                          logCommentsKeyboardSnapshot("textarea-focus", { postId: post.id }),
                        );
                        window.setTimeout(() => {
                          logCommentsKeyboardSnapshot("textarea-focus+~350ms", { postId: post.id });
                        }, 350);
                      }
                    }}
                    onBlur={() => {
                      if (commentsKeyboardDebugEnabled()) {
                        queueMicrotask(() =>
                          logCommentsKeyboardSnapshot("textarea-blur", { postId: post.id }),
                        );
                      }
                    }}
                    placeholder={
                      replyingTo
                        ? `Replying to ${formatUsernameDisplay(replyingTo.username)}...`
                        : "Who do you think this is?"
                    }
                    className="block max-h-28 min-h-[44px] flex-1 resize-none overflow-hidden rounded-2xl border-gray-300 px-3 py-[11px] text-sm leading-5"
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
                <p className="mt-1 text-right text-[11px] text-red-500">
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
