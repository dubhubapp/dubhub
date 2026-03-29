
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Heart, CheckCircle, Award, XCircle, Filter, Flag, MoreHorizontal } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_LIMITS } from "@shared/input-limits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface CommentsModalProps {
  post: PostWithUser;
  isOpen: boolean;
  onClose: () => void;
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
    const value = e.target.value.slice(0, INPUT_LIMITS.commentBody);
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
      >
      <DrawerContent
        overlayClassName="z-40 bg-transparent"
        className="z-40 mx-auto h-[34vh] max-h-[34vh] w-full max-w-xl gap-0 rounded-t-3xl border-0 bg-white/95 p-0 shadow-2xl backdrop-blur-sm"
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <DrawerTitle className="sr-only">Comments for track</DrawerTitle>
        <DrawerDescription className="sr-only">View and add comments for this track</DrawerDescription>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center space-x-3">
            <h3 className="text-base font-semibold text-gray-900">Comments ({comments.reduce((total, comment) => total + 1 + (comment.replies?.length || 0), 0)})</h3>
            <div className="flex items-center space-x-2">
              <Filter className="h-3.5 w-3.5 text-gray-500" />
              <Select value={commentFilter} onValueChange={(value: 'all' | 'newest' | 'top') => setCommentFilter(value)}>
                <SelectTrigger className="h-7 w-[96px] border-gray-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="top">Top Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 rounded-full p-0 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Comments List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 space-y-3">
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
                ? "p-3 rounded-lg border-2 border-[#FFD700] bg-amber-50/70"
                : isVerifiedComment
                ? "p-3 rounded-lg border-2 border-green-500 bg-green-50/40"
                : isTaggedSuggestion
                  ? "p-3 rounded-lg border border-amber-300 bg-amber-50/30"
                  : "";
              return (
                <div key={comment.id} className={`flex space-x-3 ${highlightClass}`}>
              <div className="relative flex-shrink-0">
                <img
                  src={comment.user.avatar_url || undefined}
                  alt={formatUsernameDisplay(comment.user.username) || comment.user.username || ""}
                  className={`avatar-media w-8 h-8 rounded-full border-2 ${isDefaultAvatarUrl(comment.user.avatar_url) ? "avatar-default-media" : ""} ${
                    comment.user.account_type === "artist" && comment.user.verified_artist
                      ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                      : "border-transparent"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <div className="flex items-center space-x-1">
                    <span 
                      className={`text-sm font-medium cursor-pointer hover:underline ${
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
                    <div className="flex items-center space-x-1 bg-amber-100 px-2 py-0.5 rounded-full" data-testid={`badge-tagged-artist-${comment.id}`}>
                      <span className="text-xs text-amber-800 font-medium">Tagged artist</span>
                    </div>
                  )}
                  {/* Community Identified Badge - Blue for pending moderator review (only when no artist verification) */}
                  {post.verificationStatus === "community" && post.verifiedCommentId === comment.id && !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <div className="flex items-center space-x-1 bg-blue-500 px-2 py-0.5 rounded-full" data-testid={`badge-community-identified-${comment.id}`}>
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-xs text-white font-bold">Community Identified</span>
                    </div>
                  )}
                  {/* Identified Track ID Badge - Green for moderator confirmed (fallback when no artist verification) */}
                  {isVerifiedComment && post.verificationStatus === "identified" && !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <div className="flex items-center space-x-1 bg-green-500 px-2 py-0.5 rounded-full" data-testid={`badge-identified-${comment.id}`}>
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-xs text-white font-bold">Identified Track ID</span>
                    </div>
                  )}
                  {/* Artist ID Badge - on the artist-selected community comment when artist verification is present */}
                  {isVerifiedComment && isArtistVerifiedPost && (
                    <div className="flex items-center space-x-1 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      <span className="text-xs text-green-600 font-medium">Artist ID</span>
                    </div>
                  )}
                  {/* Denied Tag Badge */}
                  {comment.tagStatus === "denied" && (
                    <div className="flex items-center space-x-1 bg-red-50 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3 h-3 text-red-600" />
                      <span className="text-xs text-red-600 font-medium">Denied</span>
                    </div>
                  )}
                  <span className="text-xs text-gray-500">
                    {formatTimeAgo(comment.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-700">
                  {highlightArtistMentions(comment.body, comment.tagStatus)}
                </p>
                <div className="mt-1.5 flex items-center gap-2 sm:gap-3">
                  {/* Comment likes (separate from post likes) */}
                  <button
                    className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full px-2 py-1 text-xs ${
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
                    className="text-xs text-gray-500 hover:text-gray-700"
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
                        className="inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1"
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
        <div className="border-t border-gray-200 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
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
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-1">
              <div className="flex items-center space-x-2">
                <img
                  src={userProfileImage || undefined}
                  alt="Your profile"
                  className={`avatar-media h-8 w-8 flex-shrink-0 rounded-full border-2 ${isDefaultAvatarUrl(userProfileImage) ? "avatar-default-media" : ""} ${
                    verifiedArtist
                      ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                      : "border-gray-200"
                  }`}
                />
                <Textarea
                  value={newComment}
                  onChange={handleCommentChange}
                  placeholder={
                    replyingTo
                      ? `Replying to ${formatUsernameDisplay(replyingTo.username)}...`
                      : "Add a comment... (Use @ to tag artists)"
                  }
                  className="min-h-[38px] max-h-28 flex-1 resize-y rounded-2xl border-gray-300"
                  disabled={addCommentMutation.isPending}
                  data-testid="comment-input"
                  maxLength={INPUT_LIMITS.commentBody}
                  rows={2}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !newComment.trim() ||
                    newComment.length > INPUT_LIMITS.commentBody ||
                    addCommentMutation.isPending
                  }
                  className="rounded-full px-4 flex-shrink-0"
                  data-testid="comment-submit"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[11px] text-gray-500 text-right">
                {newComment.length} / {INPUT_LIMITS.commentBody}
              </p>
            </form>
          </div>
        </div>

        {userProfilePopup}
      </DrawerContent>
    </Drawer>
    </>
  );
}
