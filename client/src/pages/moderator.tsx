import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useUser } from "@/lib/user-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  FileText,
  Check,
  CheckCircle,
  XCircle,
  User,
  MessageSquare,
  Clock3,
  Handshake,
  Lock,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  getEffectiveNotificationType,
  isCommunityVerificationNotificationType,
  isReportNotificationType,
} from "@shared/notification-types";
import { ApiRequestError, serializeQueryError } from "@/lib/apiDiagnostics";
import { useToast } from "@/hooks/use-toast";
import type { PostWithUser, CommentWithUser } from "@shared/schema";
import { VideoCard } from "@/components/video-card";
import { ModerationActionsDialog } from "@/components/moderation-actions-dialog";
import { CorrectGenreDialog } from "@/components/correct-genre-dialog";
import { ModeratorQueueCountBadge } from "@/components/moderator-queue-count-badge";
import { ModeratorShieldIcon } from "@/components/moderator-shield";
import { formatUsernameDisplay } from "@/lib/utils";
import { flattenCommentsForIdSelection } from "@/lib/comment-selection";
import { ID_MARKING_DIALOG_CONTENT_CLASS, ID_MARKING_DIALOG_OVERLAY_CLASS } from "@/components/id-marking-dialog-styles";
import { goldAvatarGlowShadowClass } from "@/components/verified-artist";
import { APP_PAGE_SCROLL_CLASS, APP_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/app-shell-layout";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { getGenreChipStyle, getGenreGlowPillStyle } from "@/lib/genre-styles";
import {
  loadModeratorQueueFilterState,
  matchesModeratorGenresFilter,
  QUEUE_CLAIM_FILTER_OPTIONS,
  saveModeratorQueueFilterState,
  type ModeratorGenreId,
  type ModeratorQueueTab,
  type QueueClaimFilter,
} from "@/lib/moderator-queue-filters";
import { ModeratorGenreFilter } from "@/components/moderator-genre-filter";
import {
  INCORRECT_GENRE_REPORT_REASON,
  getCanonicalGenreLabel,
  parseSuggestedGenreFromReportDescription,
} from "@shared/report-genre";

function formatModeratorReportTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

type QueueClaimState = "unclaimed" | "mine" | "other";

function getQueueClaimState(
  item: { assigned_moderator_id?: string | null },
  currentUserId: string | undefined,
): QueueClaimState {
  const assignee = item.assigned_moderator_id ?? null;
  if (!assignee) return "unclaimed";
  if (currentUserId && assignee === currentUserId) return "mine";
  return "other";
}

function matchesQueueClaimFilter(
  item: { assigned_moderator_id?: string | null },
  filter: QueueClaimFilter,
  currentUserId: string | undefined,
): boolean {
  if (filter === "all") return true;
  const state = getQueueClaimState(item, currentUserId);
  if (filter === "unclaimed") return state === "unclaimed";
  if (filter === "mine") return state === "mine";
  return state === "other";
}

function moderationErrorDescription(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError && error.responseBody) {
    try {
      const body = JSON.parse(error.responseBody) as { message?: unknown };
      if (typeof body.message === "string" && body.message.trim()) {
        return body.message.trim();
      }
    } catch {
      // ignore non-JSON bodies
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function isIncorrectGenrePostReport(report: {
  is_user_report?: boolean;
  reason?: string | null;
}): boolean {
  return !report.is_user_report && report.reason === INCORRECT_GENRE_REPORT_REASON;
}

/** Works with parsed API fields or raw SUGGESTED_GENRE:… in description (pre-deploy). */
function resolveIncorrectGenreReportDisplay(report: {
  description?: string | null;
  suggested_genre_id?: string | null;
  suggested_genre_label?: string | null;
}): {
  suggestedGenreId: string | null;
  suggestedLabel: string | null;
  userNotes: string | null;
} {
  const parsed = parseSuggestedGenreFromReportDescription(report.description);
  const suggestedGenreId =
    (typeof report.suggested_genre_id === "string" ? report.suggested_genre_id : null) ??
    parsed.suggestedGenreId;
  const suggestedLabel =
    (typeof report.suggested_genre_label === "string" ? report.suggested_genre_label : null) ??
    (suggestedGenreId ? getCanonicalGenreLabel(suggestedGenreId) : null);
  const userNotes =
    parsed.suggestedGenreId != null
      ? parsed.userNotes
      : suggestedGenreId
        ? report.description?.trim() || null
        : null;
  return { suggestedGenreId, suggestedLabel, userNotes };
}

export default function ModeratorPage() {
  const [initialQueueFilters] = useState(() => loadModeratorQueueFilterState());
  const [activeTab, setActiveTab] = useState<ModeratorQueueTab>(initialQueueFilters.activeTab);
  const { userType } = useUser();
  const [, setLocation] = useLocation();
  const tabSearch = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPost, setSelectedPost] = useState<PostWithUser | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");
  const [postForComments, setPostForComments] = useState<PostWithUser | null>(null);
  const [isPreviewMuted, setIsPreviewMuted] = useState(true);
  const [isPostPreviewLoading, setIsPostPreviewLoading] = useState(false);
  const [moderationDialogOpen, setModerationDialogOpen] = useState(false);
  const [selectedReportForModeration, setSelectedReportForModeration] = useState<{
    reportId: string;
    userId: string;
    username: string;
    contentTarget: "post" | "comment";
    defaultReportReason: string;
  } | null>(null);
  const [queueClaimFilter, setQueueClaimFilter] = useState<QueueClaimFilter>(
    initialQueueFilters.claimFilter,
  );
  const [selectedGenres, setSelectedGenres] = useState<ModeratorGenreId[]>(
    initialQueueFilters.selectedGenres,
  );
  const [correctGenreDialog, setCorrectGenreDialog] = useState<{
    reportId: string;
    postId: string;
    ownerUserId: string | undefined;
    currentGenre: string | null | undefined;
    suggestedGenreId: string | null;
  } | null>(null);

  // Route protection - redirect non-moderators
  useEffect(() => {
    if (userType !== "moderator") {
      setLocation("/");
    }
  }, [userType, setLocation]);

  // Optional deep link / push tap: /moderator?tab=pending | reports
  useEffect(() => {
    const q = tabSearch.startsWith("?") ? tabSearch.slice(1) : tabSearch;
    const params = new URLSearchParams(q);
    const tab = params.get("tab");
    if (tab === "pending" || tab === "reports") {
      setActiveTab(tab);
    }
  }, [tabSearch]);

  useEffect(() => {
    saveModeratorQueueFilterState({
      activeTab,
      claimFilter: queueClaimFilter,
      selectedGenres,
    });
  }, [activeTab, queueClaimFilter, selectedGenres]);

  // Get current user for authenticated requests
  const { currentUser } = useUser();
  
  // Mark moderator notifications as read when relevant tab is opened
  useEffect(() => {
    const markReportNotificationsAsRead = async () => {
      if (!currentUser?.id) return;
      if (activeTab !== "reports" && activeTab !== "pending") return;
      
      try {
        // Get all notifications for the moderator using authenticated user's UUID
        const response = await apiRequest("GET", `/api/user/${currentUser.id}/notifications`);
        if (!response.ok) return;
        const raw = await response.json();
        const notifications = Array.isArray(raw) ? raw : (raw?.notifications ?? []);
        
        // Mark all unread report-related or community-verification notifications as read,
        // depending on which tab is currently active.
        const shouldMarkReportNotifications = activeTab === "reports";
        const shouldMarkCommunityNotifications = activeTab === "pending";

        const notificationsToMark = notifications.filter((n: any) => {
          if (n.read) return false;
          const type = getEffectiveNotificationType({
            message: n.message,
            notificationType: n.notificationType ?? n.notification_type,
            postId: n.postId ?? n.post_id,
            releaseId: n.releaseId ?? n.release_id,
          });
          if (shouldMarkReportNotifications) {
            if (isReportNotificationType(type)) return true;
            if (typeof n.message === "string" && n.message.includes("report")) return true;
          }
          if (shouldMarkCommunityNotifications) {
            if (isCommunityVerificationNotificationType(type)) return true;
            if (typeof n.message === "string" && n.message.includes("community verification")) return true;
          }
          return false;
        });
        
        for (const notification of notificationsToMark) {
          await apiRequest("PATCH", `/api/notifications/${notification.id}/read`);
        }
        
        // Invalidate queries to update the badge count instantly
        if (notificationsToMark.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        }
      } catch (error) {
        console.error("Failed to mark report notifications as read:", error);
      }
    };

    if (userType === "moderator" && currentUser?.id && (activeTab === "reports" || activeTab === "pending")) {
      markReportNotificationsAsRead();
    }
  }, [userType, currentUser, activeTab, queryClient]);

  const moderatorQueueStaleOptions = {
    staleTime: 0,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
  };

  // Query for pending community verifications
  const {
    data: pendingVerifications = [],
    isLoading: isPendingLoading,
  } = useQuery<PostWithUser[]>({
    queryKey: ["/api/moderator/pending-verifications"],
    ...moderatorQueueStaleOptions,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/moderator/pending-verifications");
      return res.json();
    },
  });

  // Query for reported tracks
  const {
    data: reportedContent = [],
    isLoading: isReportsLoading,
  } = useQuery<any[]>({
    queryKey: ["/api/moderator/reports"],
    ...moderatorQueueStaleOptions,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/moderator/reports");
      return response.json();
    },
  });

  useEffect(() => {
    if (activeTab === "pending") {
      void queryClient.refetchQueries({ queryKey: ["/api/moderator/pending-verifications"] });
    } else if (activeTab === "reports") {
      void queryClient.refetchQueries({ queryKey: ["/api/moderator/reports"] });
    }
  }, [activeTab, queryClient]);

  const { data: userStats } = useQuery({
    queryKey: ["/api/moderator/stats"],
    queryFn: async () => {
      // Placeholder stats
      return {
        totalUsers: 1247,
        newUsersToday: 23,
        reportedItems: 5,
        pendingReviews: 12
      };
    },
  });

  // Query for comments when a post is selected for review
  const { data: postComments = [] } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", selectedPost?.id, "comments"],
    enabled: !!selectedPost,
  });
  const flatPostComments = flattenCommentsForIdSelection(
    Array.isArray(postComments) ? postComments : [],
  );
  const toCommentTime = (value: unknown) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    const t = new Date(value as any).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const oldestPostCommentId =
    [...flatPostComments].sort((a, b) => toCommentTime(a.createdAt) - toCommentTime(b.createdAt))[0]?.id ?? null;
  const formatCommentTimestamp = (value: Date | string | null | undefined) => {
    if (!value) return "Unknown time";
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const confirmVerificationMutation = useMutation({
    mutationFn: async ({ postId, commentId }: { postId: string; commentId?: string; ownerUserId?: string }) => {
      return apiRequest("POST", `/api/moderator/confirm-verification/${postId}`, {
        commentId,
      });
    },
    onSuccess: (_data, variables) => {
      refetchModeratorPendingQueues();
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      if (variables.ownerUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", variables.ownerUserId, "posts"] });
      } else {
        queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === "/api/user" &&
            q.queryKey[2] === "posts",
        });
      }
      setSelectedPost(null);
      setSelectedCommentId("");
      toast({
        title: "ID confirmed",
        description: "This post is now marked as Identified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: moderationErrorDescription(error, "Failed to confirm verification"),
        variant: "destructive",
      });
    },
  });

  const reopenVerificationMutation = useMutation({
    mutationFn: async ({ postId }: { postId: string; ownerUserId?: string }) => {
      return apiRequest("POST", `/api/moderator/reopen-verification/${postId}`);
    },
    onSuccess: (_data, variables) => {
      refetchModeratorPendingQueues();
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      if (variables.ownerUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", variables.ownerUserId, "posts"] });
      } else {
        queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === "/api/user" &&
            q.queryKey[2] === "posts",
        });
      }
      toast({
        title: "ID rejected",
        description: "This post has been reopened as Unidentified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: moderationErrorDescription(error, "Failed to reopen post"),
        variant: "destructive",
      });
    },
  });

  const communityApproveMutation = useMutation({
    mutationFn: async ({ postId, commentId }: { postId: string; commentId?: string; ownerUserId?: string }) => {
      const body =
        typeof commentId === "string" && commentId.trim().length > 0 ? { commentId } : {};
      if (import.meta.env.DEV) {
        const path = `/api/moderator/community-approve/${postId}`;
        console.log("[moderator/community-approve] request", {
          endpoint: path,
          postId,
          bodyCommentId: "commentId" in body ? (body as { commentId: string }).commentId : "(server uses pinned verified_comment)",
        });
      }
      return apiRequest("POST", `/api/moderator/community-approve/${postId}`, body);
    },
    onSuccess: (_data, variables) => {
      refetchModeratorPendingQueues();
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      if (variables.ownerUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", variables.ownerUserId, "posts"] });
      } else {
        queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === "/api/user" &&
            q.queryKey[2] === "posts",
        });
      }
      setSelectedPost(null);
      setSelectedCommentId("");
      toast({
        title: "Kept as Community Identified",
        description: "This post has been reviewed and kept as Community Identified.",
      });
    },
    onError: (error) => {
      if (import.meta.env.DEV) {
        console.error(
          "[moderator/community-approve] failed — backend body / diagnostics:",
          serializeQueryError(error),
        );
      }
      toast({
        title: "Error",
        description: moderationErrorDescription(error, "Failed to keep post as Community Identified"),
        variant: "destructive",
      });
    },
  });

  const refetchModeratorReportQueues = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
    void queryClient.refetchQueries({ queryKey: ["/api/moderator/reports"] });
  };

  const refetchModeratorPendingQueues = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/moderator/pending-verifications"] });
    void queryClient.refetchQueries({ queryKey: ["/api/moderator/pending-verifications"] });
  };

  const claimPendingMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("POST", `/api/moderator/pending-verifications/${postId}/claim`);
    },
    onSuccess: () => {
      refetchModeratorPendingQueues();
      toast({
        title: "Verification claimed",
        description: "You can now review this community identification.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not claim verification",
        description: moderationErrorDescription(error, "Failed to claim verification"),
        variant: "destructive",
      });
    },
  });

  const releasePendingMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("POST", `/api/moderator/pending-verifications/${postId}/release`);
    },
    onSuccess: () => {
      refetchModeratorPendingQueues();
      toast({
        title: "Verification released",
        description: "Other moderators can claim this item again.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not release verification",
        description: moderationErrorDescription(error, "Failed to release verification"),
        variant: "destructive",
      });
    },
  });

  const claimReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/claim`);
    },
    onSuccess: () => {
      refetchModeratorReportQueues();
      toast({
        title: "Report claimed",
        description: "You can now take action on this report.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not claim report",
        description: moderationErrorDescription(error, "Failed to claim report"),
        variant: "destructive",
      });
    },
  });

  const releaseReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/release`);
    },
    onSuccess: () => {
      refetchModeratorReportQueues();
      toast({
        title: "Report released",
        description: "Other moderators can claim this report again.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not release report",
        description: moderationErrorDescription(error, "Failed to release report"),
        variant: "destructive",
      });
    },
  });

  const dismissReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/dismiss`);
    },
    onMutate: async (reportId: string) => {
      // Optimistically remove the report from the list
      await queryClient.cancelQueries({ queryKey: ["/api/moderator/reports"] });
      const previousReports = queryClient.getQueryData<any[]>(["/api/moderator/reports"]);
      queryClient.setQueryData<any[]>(["/api/moderator/reports"], (old = []) => 
        old.filter((r: any) => r.id !== reportId)
      );
      return { previousReports };
    },
    onSuccess: () => {
      refetchModeratorReportQueues();
      // Invalidate and refetch notification queries for instant updates
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
      toast({
        title: "Report Dismissed",
        description: "Report has been dismissed",
      });
    },
    onError: (error, reportId, context) => {
      // Rollback on error
      if (context?.previousReports) {
        queryClient.setQueryData(["/api/moderator/reports"], context.previousReports);
      }
      toast({
        title: "Error",
        description: moderationErrorDescription(error, "Failed to dismiss report"),
        variant: "destructive",
      });
    },
  });

  // Additional security check - don't render if not moderator
  if (userType !== "moderator") {
    return null;
  }

  const pendingVerificationCount = pendingVerifications.length;
  const filteredPendingVerifications = pendingVerifications.filter(
    (post: { assigned_moderator_id?: string | null; genre?: string | null }) =>
      matchesQueueClaimFilter(post, queueClaimFilter, currentUser?.id) &&
      matchesModeratorGenresFilter(post.genre, selectedGenres),
  );
  const filteredReports = reportedContent.filter(
    (report: { assigned_moderator_id?: string | null; post?: { genre?: string | null } | null }) =>
      matchesQueueClaimFilter(report, queueClaimFilter, currentUser?.id) &&
      matchesModeratorGenresFilter(report.post?.genre, selectedGenres),
  );
  const pendingClaimBusy =
    claimPendingMutation.isPending || releasePendingMutation.isPending;
  const unresolvedReportsCount = reportedContent.filter(
    (r: { status?: string }) => r.status === "open" || r.status === "under_review"
  ).length;
  const normalizePostForPreview = (post: any): PostWithUser | null => {
    if (!post || !post.id) return null;
    const normalizedVideoUrl = post.videoUrl || post.video_url || null;
    const normalizedUser =
      post.user ??
      (post.username
        ? {
            id: post.userId || post.user_id || "unknown",
            username: post.username,
            profileImageUrl: post.profileImageUrl || post.profile_image_url || null,
            verified_artist: Boolean(post.verified_artist),
          }
        : null);
    if (!normalizedUser) return null;
    return {
      ...post,
      videoUrl: normalizedVideoUrl,
      user: normalizedUser,
      likes: typeof post.likes === "number" ? post.likes : 0,
      hasLiked: Boolean(post.hasLiked),
      verificationStatus: post.verificationStatus || post.verification_status || "unidentified",
    } as PostWithUser;
  };
  const openPostPreviewModal = (rawPost: any) => {
    setIsPostPreviewLoading(true);
    setIsPreviewMuted(true);
    const normalizedPost = normalizePostForPreview(rawPost);
    if (process.env.NODE_ENV !== "production") {
      console.log("[Moderator] Open preview modal", {
        postId: rawPost?.id ?? null,
        hasVideoUrl: Boolean(rawPost?.videoUrl || rawPost?.video_url),
        modalOpened: Boolean(normalizedPost),
      });
    }
    setPostForComments(normalizedPost);
    setIsPostPreviewLoading(false);
  };
  useEffect(() => {
    if (!postForComments) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [postForComments]);

  return (
    <div className={`${APP_PAGE_SCROLL_CLASS} bg-background ${APP_SCROLL_BOTTOM_INSET_CLASS}`}>
      <div className="app-page-top-pad mx-auto w-full max-w-4xl space-y-5 px-4 pb-6">
        {/* Moderator Badge */}
        <div className="flex items-center justify-center">
          <Badge
            variant="outline"
            className="rounded-full border-red-500/40 bg-red-500/15 px-4 py-2 text-red-300 shadow-[0_0_20px_-10px_rgba(239,68,68,0.75)]"
            data-testid="moderator-badge"
          >
            <ModeratorShieldIcon sizeClass="h-4 w-4" className="mr-2 self-center" />
            Moderator Access
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border border-white/10 bg-black/35 p-1.5 backdrop-blur-md">
            <TabsTrigger
              value="pending"
              data-testid="tab-pending"
              className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-accent-foreground data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
            >
              <span>Pending Verifications</span>
              <ModeratorQueueCountBadge count={pendingVerificationCount} />
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              data-testid="tab-reports"
              className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-accent-foreground data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
            >
              <span>Reports</span>
              <ModeratorQueueCountBadge count={unresolvedReportsCount} />
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Genre
              </span>
              <ModeratorGenreFilter
                selectedGenres={selectedGenres}
                onGenresChange={setSelectedGenres}
              />
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filter by claim status"
            >
              <span className="w-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:w-auto sm:mr-1 sm:self-center">
                Claim
              </span>
              {QUEUE_CLAIM_FILTER_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={queueClaimFilter === opt.id ? "default" : "outline"}
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setQueueClaimFilter(opt.id)}
                  data-testid={`moderator-claim-filter-${opt.id}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <TabsContent value="pending" className="mt-5 space-y-4">
            <Card className="border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Pending Verifications
                  <ModeratorQueueCountBadge count={pendingVerificationCount} />
                </CardTitle>
                <CardDescription className="text-muted-foreground/90">
                  Community-verified posts awaiting moderator confirmation
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isPendingLoading ? (
                  <div className="flex justify-center py-8">
                    <VinylLoader />
                  </div>
                ) : pendingVerifications.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-12 text-center text-muted-foreground">
                    <ModeratorShieldIcon sizeClass="h-12 w-12" className="mx-auto mb-4 opacity-50" />
                    <p className="text-sm font-medium text-foreground/90">No pending verifications</p>
                    <p className="mt-1 text-sm text-muted-foreground">All community verifications have been reviewed.</p>
                  </div>
                ) : filteredPendingVerifications.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-12 text-center text-muted-foreground">
                    <p className="text-sm font-medium text-foreground/90">
                      No pending verifications match these filters.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try All Genres and All claims, or claim an item from the full queue.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredPendingVerifications.map((post: any) => (
                      (() => {
                        const genreChip = getGenreChipStyle(post.genre);
                        const claimState = getQueueClaimState(post, currentUser?.id);
                        const actionsLocked = claimState !== "mine";
                        return (
                      <Card
                        key={post.id}
                        className="border-white/10 bg-black/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
                        data-testid={`pending-verification-${post.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col gap-4 sm:flex-row">
                            {/* Video thumbnail - clickable */}
                            <div 
                              className="group relative h-32 w-full flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-muted sm:h-24 sm:w-24"
                              onClick={() => openPostPreviewModal(post)}
                              data-testid={`thumbnail-${post.id}`}
                            >
                              {post.videoUrl || post.video_url ? (
                                <>
                                  <video
                                    src={post.videoUrl || post.video_url}
                                    className="w-full h-full object-cover"
                                    muted
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <MessageSquare className="w-6 h-6 text-white" />
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <FileText className="w-8 h-8 text-muted-foreground" />
                                </div>
                              )}
                              <div className="absolute right-1 top-1">
                                <Badge
                                  className="text-xs"
                                  style={getGenreGlowPillStyle(genreChip.bgColor, genreChip.textClass)}
                                >
                                  {genreChip.label}
                                </Badge>
                              </div>
                            </div>

                            {/* Post info */}
                            <div className="flex-1 space-y-2">
                              <div>
                                <p 
                                  className="font-semibold cursor-pointer hover:text-primary transition-colors"
                                  onClick={() => openPostPreviewModal(post)}
                                  data-testid={`description-${post.id}`}
                                >
                                  {post.description}
                                </p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                  <User className="w-4 h-4" />
                                  <span>Uploaded by {formatUsernameDisplay(post.user.username)}</span>
                                </div>
                              </div>

                              {/* Verified comment display */}
                              {post.verifiedComment ? (
                                <div className="space-y-2 rounded-xl border border-blue-500/25 bg-blue-500/10 p-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-blue-300">Uploader's Selection:</p>
                                    <Badge variant="secondary" className="text-xs">
                                      <MessageSquare className="w-3 h-3 mr-1" />
                                      Selected Comment
                                    </Badge>
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-black/25 p-2">
                                    <div className="flex items-center gap-2 mb-1">
                                      <User className="w-3 h-3" />
                                      <span className="text-xs font-medium">
                                        {post.verifiedComment.user?.username
                                          ? formatUsernameDisplay(post.verifiedComment.user.username)
                                          : "Unknown"}
                                      </span>
                                    </div>
                                    <p className="text-sm">{post.verifiedComment.body || post.verifiedComment.content || 'No comment text'}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-2">
                                  <p className="mb-1 text-xs font-medium text-blue-300">Community Identified</p>
                                  <p className="text-sm">A user marked a comment as the correct track ID</p>
                                </div>
                              )}

                              {claimState === "other" ? (
                                <div
                                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
                                  data-testid={`pending-claimed-by-other-${post.id}`}
                                >
                                  <p className="flex items-center gap-1.5 font-medium text-amber-200">
                                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Claimed by{" "}
                                    {formatUsernameDisplay(
                                      post.assigned_moderator_username ?? "another moderator",
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Actions are locked while another moderator is handling this verification.
                                  </p>
                                </div>
                              ) : null}

                              {claimState === "unclaimed" ? (
                                <p className="text-xs text-muted-foreground">
                                  Claim this verification to unlock review actions.
                                </p>
                              ) : null}

                              <div className="space-y-2 pt-2">
                                <p className="text-[11px] leading-snug text-muted-foreground">
                                  Use Keep as Community Identified when the ID looks credible but can&apos;t be fully
                                  confirmed.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {claimState === "unclaimed" ? (
                                    <Button
                                      size="sm"
                                      onClick={() => claimPendingMutation.mutate(post.id)}
                                      disabled={pendingClaimBusy}
                                      data-testid={`button-claim-pending-${post.id}`}
                                    >
                                      Claim
                                    </Button>
                                  ) : null}
                                  {claimState === "mine" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => releasePendingMutation.mutate(post.id)}
                                      disabled={
                                        pendingClaimBusy ||
                                        confirmVerificationMutation.isPending ||
                                        communityApproveMutation.isPending ||
                                        reopenVerificationMutation.isPending
                                      }
                                      data-testid={`button-release-pending-${post.id}`}
                                    >
                                      Release
                                    </Button>
                                  ) : null}
                                  <Button
                                    size="sm"
                                    className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                                    onClick={() => {
                                      if (actionsLocked) return;
                                      setSelectedPost(post);
                                      setSelectedCommentId(post.verifiedCommentId || post.verified_comment_id || "");
                                    }}
                                    disabled={
                                      actionsLocked ||
                                      pendingClaimBusy ||
                                      confirmVerificationMutation.isPending
                                    }
                                    title={
                                      actionsLocked
                                        ? claimState === "other"
                                          ? "Claimed by another moderator"
                                          : "Claim this verification first"
                                        : undefined
                                    }
                                    data-testid={`button-review-confirm-${post.id}`}
                                  >
                                    <Check className="w-4 h-4 mr-1" />
                                    Confirm ID
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      if (actionsLocked) return;
                                      communityApproveMutation.mutate({
                                        postId: post.id,
                                        commentId: post.verifiedCommentId || post.verified_comment_id,
                                        ownerUserId: post.user?.id ?? post.user_id ?? post.userId,
                                      });
                                    }}
                                    disabled={
                                      actionsLocked ||
                                      pendingClaimBusy ||
                                      !(post.verifiedCommentId || post.verified_comment_id) ||
                                      communityApproveMutation.isPending
                                    }
                                    title={
                                      actionsLocked
                                        ? claimState === "other"
                                          ? "Claimed by another moderator"
                                          : "Claim this verification first"
                                        : undefined
                                    }
                                    data-testid={`button-keep-community-${post.id}`}
                                  >
                                    <Handshake className="w-4 h-4 mr-1" />
                                    Keep as Community Identified
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-600 dark:hover:bg-red-700"
                                    onClick={() => {
                                      if (actionsLocked) return;
                                      reopenVerificationMutation.mutate({
                                        postId: post.id,
                                        ownerUserId: post.user?.id ?? post.user_id ?? post.userId,
                                      });
                                    }}
                                    disabled={
                                      actionsLocked ||
                                      pendingClaimBusy ||
                                      reopenVerificationMutation.isPending
                                    }
                                    title={
                                      actionsLocked
                                        ? claimState === "other"
                                          ? "Claimed by another moderator"
                                          : "Claim this verification first"
                                        : undefined
                                    }
                                    data-testid={`button-reopen-${post.id}`}
                                  >
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Reopen for Review
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                        );
                      })()
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-5 space-y-4">
            <Card className="border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Reports
                  <ModeratorQueueCountBadge count={unresolvedReportsCount} />
                </CardTitle>
                <CardDescription className="text-muted-foreground/90">
                  Content flagged by users for review
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isReportsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <VinylLoader label="Loading reports..." />
                  </div>
                ) : reportedContent.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-12 text-center text-muted-foreground">
                    <AlertTriangle className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p className="text-sm font-medium text-foreground/90">No reported content at this time</p>
                    <p className="mt-1 text-sm text-muted-foreground">All clear for now.</p>
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-12 text-center text-muted-foreground">
                    <AlertTriangle className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p className="text-sm font-medium text-foreground/90">
                      No reports match these filters.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try All Genres and All claims, or claim a report from the full queue.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredReports.map((report: any) => {
                      const incorrectGenrePost = isIncorrectGenrePostReport(report);
                      const genreDisplay = incorrectGenrePost
                        ? resolveIncorrectGenreReportDisplay(report)
                        : null;
                      const additionalDetails = incorrectGenrePost
                        ? genreDisplay?.userNotes
                        : report.description?.trim() || null;
                      const claimState = getQueueClaimState(report, currentUser?.id);
                      const actionsLocked = claimState !== "mine";
                      const claimBusy =
                        claimReportMutation.isPending || releaseReportMutation.isPending;

                      return (
                      <Card
                        key={report.id}
                        className="border-white/10 bg-black/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
                        data-testid={`report-${report.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col gap-4 sm:flex-row">
                            {/* Video thumbnail - clickable */}
                            <div 
                              className="group relative h-32 w-full flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-muted sm:h-24 sm:w-24"
                              onClick={async () => {
                                if (report.post?.id) {
                                  // Fetch the full post data to ensure we have all fields
                                  try {
                                    const response = await apiRequest("GET", `/api/posts/${report.post.id}`);
                                    if (!response.ok) {
                                      throw new Error(`Failed to fetch post: ${response.status}`);
                                    }
                                    const fullPost = await response.json();
                                    console.log("[Moderator] Fetched post for thumbnail click:", fullPost);
                                    // Ensure all required fields are present
                                    if (fullPost && fullPost.id && fullPost.videoUrl && fullPost.user) {
                                      openPostPreviewModal(fullPost);
                                    } else {
                                      console.error("[Moderator] Post data incomplete:", fullPost);
                                      toast({
                                        title: "Error",
                                        description: "Failed to load post data",
                                        variant: "destructive",
                                      });
                                    }
                                    // Don't set selectedPost - that's only for verification dialog
                                  } catch (error) {
                                    console.error("[Moderator] Failed to fetch post:", error);
                                    toast({
                                      title: "Error",
                                      description: "Failed to load post",
                                      variant: "destructive",
                                    });
                                    // Fallback to report.post if fetch fails
                                    if (report.post && (report.post.videoUrl || report.post.video_url)) {
                                      openPostPreviewModal(report.post);
                                    }
                                  }
                                }
                              }}
                              data-testid={`thumbnail-${report.id}`}
                            >
                              {report.post?.videoUrl || report.post?.video_url ? (
                                <>
                                  <video
                                    src={report.post.videoUrl || report.post.video_url}
                                    className="w-full h-full object-cover"
                                    muted
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <MessageSquare className="w-6 h-6 text-white" />
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <FileText className="w-8 h-8 text-muted-foreground" />
                                </div>
                              )}
                            </div>

                            {/* Report info */}
                            <div className="flex-1 space-y-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant={report.is_user_report ? "secondary" : "destructive"}>
                                    {report.is_user_report ? "Community Report" : "Post Report"}
                                  </Badge>
                                </div>
                                <p 
                                  className="font-semibold cursor-pointer hover:text-primary transition-colors"
                                  onClick={async () => {
                                    if (report.post?.id) {
                                      // Fetch the full post data to ensure we have all fields
                                      try {
                                        const response = await apiRequest("GET", `/api/posts/${report.post.id}`);
                                        const fullPost = await response.json();
                                        openPostPreviewModal(fullPost);
                                        // Don't set selectedPost - that's only for verification dialog
                                      } catch (error) {
                                        console.error("Failed to fetch post:", error);
                                        // Fallback to report.post if fetch fails
                                        if (report.post) {
                                          openPostPreviewModal(report.post);
                                        }
                                      }
                                    }
                                  }}
                                  data-testid={`description-${report.id}`}
                                >
                                  {report.post?.title || report.post?.description || "Unknown post"}
                                </p>
                                {report.is_user_report && report.reportedUser && (
                                  <div className="mt-2 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-2">
                                    <p className="text-xs font-medium text-yellow-600 mb-1">⚠️ Community Comment Report</p>
                                    <p className="text-sm text-muted-foreground">
                                      Reported member:{" "}
                                      <span className="font-semibold">{formatUsernameDisplay(report.reportedUser.username)}</span>
                                    </p>
                                    {report.reported_comment_body && (
                                      <div className="mt-2 pt-2 border-t border-yellow-500/20">
                                        <p className="text-xs font-medium text-yellow-600 mb-1">Reported Comment:</p>
                                        <p className="text-sm italic">"{report.reported_comment_body}"</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {report.post?.user && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Post by: {formatUsernameDisplay(report.post.user.username)}
                                  </p>
                                )}
                                <div
                                  className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs"
                                  data-testid={`reporter-meta-${report.id}`}
                                >
                                  {report.reporter?.avatar_url ? (
                                    <img
                                      src={report.reporter.avatar_url}
                                      alt=""
                                      className="h-7 w-7 shrink-0 rounded-full border border-white/15 object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-muted">
                                      <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <p className="text-foreground">
                                      <span className="text-muted-foreground">Reported by </span>
                                      <span className="font-semibold">
                                        {report.reporter?.username ? formatUsernameDisplay(report.reporter.username) : "unknown"}
                                      </span>
                                    </p>
                                    <p className="flex items-center gap-1 text-muted-foreground">
                                      <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      <span>Reported on {formatModeratorReportTimestamp(report.created_at)}</span>
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Report reason */}
                              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3">
                                <p className="mb-1 text-xs font-medium text-red-300">Report Reason:</p>
                                <p className="text-sm">{report.reason}</p>
                                {incorrectGenrePost && report.post ? (
                                  <div className="mt-2 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                      <span className="text-xs text-muted-foreground">Current genre:</span>
                                      {(() => {
                                        const chip = getGenreChipStyle(report.post.genre);
                                        return (
                                          <Badge
                                            className="text-xs"
                                            style={getGenreGlowPillStyle(chip.bgColor, chip.textClass)}
                                          >
                                            {chip.label}
                                          </Badge>
                                        );
                                      })()}
                                    </div>
                                    {genreDisplay?.suggestedGenreId ? (
                                      <div className="flex flex-wrap items-center gap-2 text-sm">
                                        <span className="text-xs text-muted-foreground">Suggested genre:</span>
                                        {(() => {
                                          const chip = getGenreChipStyle(genreDisplay.suggestedGenreId);
                                          return (
                                            <Badge
                                              className="text-xs"
                                              style={getGenreGlowPillStyle(chip.bgColor, chip.textClass)}
                                            >
                                              {genreDisplay.suggestedLabel ?? chip.label}
                                            </Badge>
                                          );
                                        })()}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                                {additionalDetails ? (
                                  <div className="mt-2 pt-2 border-t border-red-500/20">
                                    <p className="text-xs font-medium text-red-400 mb-1">
                                      {incorrectGenrePost ? "Additional details:" : "Additional Details:"}
                                    </p>
                                    <p
                                      className={
                                        incorrectGenrePost
                                          ? "text-sm text-muted-foreground italic"
                                          : "text-sm text-muted-foreground"
                                      }
                                    >
                                      {incorrectGenrePost ? (
                                        <>
                                          &ldquo;{additionalDetails}&rdquo;
                                        </>
                                      ) : (
                                        additionalDetails
                                      )}
                                    </p>
                                  </div>
                                ) : null}
                              </div>

                              {claimState === "other" ? (
                                <div
                                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
                                  data-testid={`report-claimed-by-other-${report.id}`}
                                >
                                  <p className="flex items-center gap-1.5 font-medium text-amber-200">
                                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Claimed by{" "}
                                    {formatUsernameDisplay(
                                      report.assigned_moderator_username ?? "another moderator",
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Actions are locked while another moderator is handling this report.
                                  </p>
                                </div>
                              ) : null}

                              {claimState === "unclaimed" ? (
                                <p className="text-xs text-muted-foreground">
                                  Claim this report to unlock moderation actions.
                                </p>
                              ) : null}

                              {/* Claim / release + action buttons */}
                              <div className="flex gap-2 pt-2 flex-wrap">
                                {claimState === "unclaimed" ? (
                                  <Button
                                    size="sm"
                                    onClick={() => claimReportMutation.mutate(report.id)}
                                    disabled={claimBusy}
                                    data-testid={`button-claim-${report.id}`}
                                  >
                                    Claim
                                  </Button>
                                ) : null}
                                {claimState === "mine" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => releaseReportMutation.mutate(report.id)}
                                    disabled={claimBusy || dismissReportMutation.isPending}
                                    data-testid={`button-release-${report.id}`}
                                  >
                                    Release
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => dismissReportMutation.mutate(report.id)}
                                  disabled={
                                    actionsLocked ||
                                    dismissReportMutation.isPending ||
                                    claimBusy
                                  }
                                  title={
                                    actionsLocked
                                      ? claimState === "other"
                                        ? "Claimed by another moderator"
                                        : "Claim this report first"
                                      : undefined
                                  }
                                  data-testid={`button-dismiss-${report.id}`}
                                >
                                  {actionsLocked ? (
                                    <Lock className="w-4 h-4 mr-1" aria-hidden />
                                  ) : (
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                  )}
                                  Dismiss Report
                                </Button>
                                {incorrectGenrePost && report.post?.id ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={actionsLocked || claimBusy}
                                    title={
                                      actionsLocked
                                        ? claimState === "other"
                                          ? "Claimed by another moderator"
                                          : "Claim this report first"
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (actionsLocked) return;
                                      setCorrectGenreDialog({
                                        reportId: report.id,
                                        postId: report.post.id,
                                        ownerUserId: report.post.user?.id,
                                        currentGenre: report.post.genre,
                                        suggestedGenreId: genreDisplay?.suggestedGenreId ?? null,
                                      });
                                    }}
                                    data-testid={`button-correct-genre-${report.id}`}
                                  >
                                    Correct Genre
                                  </Button>
                                ) : null}
                                {!incorrectGenrePost ? (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    actionsLocked ||
                                    claimBusy ||
                                    (report.is_user_report
                                      ? !report.reported_user_id
                                      : !report.post?.user?.id)
                                  }
                                  title={
                                    actionsLocked
                                      ? claimState === "other"
                                        ? "Claimed by another moderator"
                                        : "Claim this report first"
                                      : report.is_user_report && !report.reported_user_id
                                      ? "Missing reported user for this comment report"
                                      : !report.is_user_report && !report.post?.user?.id
                                        ? "Missing post author for this report"
                                        : undefined
                                  }
                                  onClick={() => {
                                    if (actionsLocked) return;
                                    const userId = report.is_user_report
                                      ? report.reported_user_id
                                      : report.post?.user?.id;
                                    if (!userId) return;
                                    const username = report.is_user_report
                                      ? report.reportedUser?.username ?? "Unknown"
                                      : report.post?.user?.username ?? "Unknown";
                                    setSelectedReportForModeration({
                                      reportId: report.id,
                                      userId,
                                      username,
                                      contentTarget: report.is_user_report ? "comment" : "post",
                                      defaultReportReason:
                                        typeof report.reason === "string" ? report.reason : "",
                                    });
                                    setModerationDialogOpen(true);
                                  }}
                                  data-testid={`button-remove-moderate-${report.id}`}
                                >
                                  Remove &amp; Moderate
                                </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {correctGenreDialog ? (
        <CorrectGenreDialog
          isOpen={!!correctGenreDialog}
          onClose={() => setCorrectGenreDialog(null)}
          reportId={correctGenreDialog.reportId}
          postId={correctGenreDialog.postId}
          ownerUserId={correctGenreDialog.ownerUserId}
          currentGenre={correctGenreDialog.currentGenre}
          suggestedGenreId={correctGenreDialog.suggestedGenreId}
          onSuccess={() => {
            queryClient.setQueryData<any[]>(["/api/moderator/reports"], (old = []) =>
              old.filter((r: { id?: string }) => r.id !== correctGenreDialog.reportId),
            );
            refetchModeratorReportQueues();
          }}
        />
      ) : null}

      {/* Moderation Actions Dialog */}
      {selectedReportForModeration && (
        <ModerationActionsDialog
          isOpen={moderationDialogOpen}
          onClose={() => {
            setModerationDialogOpen(false);
            setSelectedReportForModeration(null);
          }}
          reportId={selectedReportForModeration.reportId}
          reportedUserId={selectedReportForModeration.userId}
          reportedUsername={selectedReportForModeration.username}
          contentTarget={selectedReportForModeration.contentTarget}
          defaultReportReason={selectedReportForModeration.defaultReportReason}
        />
      )}

      {/* Comment Selection Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={() => {
        setSelectedPost(null);
        setSelectedCommentId("");
      }}>
        <DialogContent
          overlayClassName={ID_MARKING_DIALOG_OVERLAY_CLASS}
          className={`${ID_MARKING_DIALOG_CONTENT_CLASS} overflow-x-hidden`}
        >
          <DialogHeader className="space-y-1.5 text-center">
            <DialogTitle className="text-lg font-semibold text-white">
              Review Comments & Select Identification
            </DialogTitle>
            <DialogDescription className="text-sm text-white/75">
              Select the comment with the correct track ID, then confirm or keep as community identified.
            </DialogDescription>
          </DialogHeader>

          {selectedPost && (
            <div className="mt-4 space-y-4 overflow-x-hidden">
              {/* Post info summary */}
              <div className="rounded-lg border border-white/15 bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-sm font-semibold text-white">{selectedPost.description}</p>
                <p className="text-xs text-white/65">
                  Uploaded by {formatUsernameDisplay(selectedPost.user.username)}
                </p>
              </div>

              {/* Comments list */}
              {flatPostComments.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/15 py-8 text-center text-white/70">
                  <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No comments on this post yet</p>
                </div>
              ) : (
                <RadioGroup
                  value={selectedCommentId}
                  onValueChange={setSelectedCommentId}
                  className="space-y-3 overflow-x-hidden px-1 py-1"
                >
                  {flatPostComments.map((comment) => {
                    const isSelected = selectedCommentId === comment.id;
                    const isOldest = comment.id === oldestPostCommentId;
                    const isReply = comment.selectionDepth > 0;
                    const highlightClass = isOldest
                      ? "border-[#3B82F6]/75 bg-[#3B82F6]/10 shadow-[0_0_22px_rgba(59,130,246,0.60)]"
                      : "border-white/20 hover:bg-white/10";
                    const selectionRingClass = isSelected
                      ? isOldest
                        ? "ring-2 ring-[#3B82F6]/95 shadow-[0_0_24px_rgba(59,130,246,0.65)]"
                        : "ring-2 ring-white shadow-[0_0_28px_rgba(255,255,255,0.45)]"
                      : "";
                    return (
                      <div
                        key={comment.id}
                        className={`flex min-w-0 items-start space-x-3 rounded-lg border p-3 transition-colors ${highlightClass} ${
                          isSelected ? selectionRingClass : ""
                        } ${
                          isSelected && !isOldest
                            ? "border-white/95 bg-white/8 shadow-[0_0_0_4px_rgba(255,255,255,0.55),0_0_22px_rgba(255,255,255,0.22)]"
                            : ""
                        } ${isReply ? "ml-3 border-l-2 border-l-white/25" : ""}`}
                      >
                        <RadioGroupItem
                          value={comment.id}
                          id={comment.id}
                          data-testid={`radio-comment-${comment.id}`}
                        />
                        <Label htmlFor={comment.id} className="min-w-0 flex-1 cursor-pointer">
                          <div className="mb-2 min-w-0">
                            <div className="flex min-w-0 items-start gap-2">
                              <div
                                className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
                                  comment.user.verified_artist
                                    ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                                    : "border-primary/20"
                                }`}
                              >
                                {comment.user.avatar_url ? (
                                  <img
                                    src={comment.user.avatar_url}
                                    alt={formatUsernameDisplay(comment.user.username) || comment.user.username || ""}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <User className="h-4 w-4 text-primary" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className={`truncate text-sm font-medium ${
                                      comment.user.verified_artist ? "text-[#FFD700]" : "text-white"
                                    }`}
                                  >
                                    {formatUsernameDisplay(comment.user.username)}
                                  </span>
                                  {comment.user.verified_artist && (
                                    <CheckCircle className="h-4 w-4 shrink-0 text-[#FFD700]" />
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {isReply && (
                                    <span className="whitespace-nowrap rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
                                      {comment.parentAuthorUsername
                                        ? `Reply to ${formatUsernameDisplay(comment.parentAuthorUsername)}`
                                        : "Reply"}
                                    </span>
                                  )}
                                  {isOldest && (
                                    <span
                                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                        isSelected
                                          ? "border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-[0_0_14px_rgba(29,78,216,0.50)]"
                                          : "border-[#3B82F6] bg-[#3B82F6] text-white"
                                      }`}
                                    >
                                      Oldest Comment
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-1 text-[11px] text-white/65">
                              <Clock3 className="h-3.5 w-3.5" />
                              <span>{formatCommentTimestamp(comment.createdAt as any)}</span>
                            </div>
                          </div>
                          <p className="break-words text-sm text-white/92">{comment.body}</p>
                          {(comment.id === selectedPost.verifiedCommentId || comment.id === (selectedPost as any).verified_comment_id) && (
                            <Badge
                              variant="secondary"
                              className="mt-2 border-white/25 bg-white/10 text-xs text-white/90"
                            >
                              Uploader's Selection
                            </Badge>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap justify-end gap-2 border-t border-white/15 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedPost(null);
                    setSelectedCommentId("");
                  }}
                  className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  data-testid="button-cancel-selection"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedCommentId && selectedPost) {
                      communityApproveMutation.mutate({
                        postId: selectedPost.id,
                        commentId: selectedCommentId,
                        ownerUserId: selectedPost.user?.id ?? (selectedPost as any).user_id ?? selectedPost.userId,
                      });
                    }
                  }}
                  disabled={
                    !selectedCommentId ||
                    communityApproveMutation.isPending ||
                    confirmVerificationMutation.isPending
                  }
                  className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                  data-testid="button-keep-community-selection"
                >
                  <Handshake className="mr-2 h-4 w-4" />
                  {communityApproveMutation.isPending
                    ? "Saving..."
                    : "Keep as Community Identified"}
                </Button>
                <Button
                  className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                  onClick={() => {
                    if (selectedCommentId && selectedPost) {
                      confirmVerificationMutation.mutate({
                        postId: selectedPost.id,
                        commentId: selectedCommentId,
                        ownerUserId: selectedPost.user?.id ?? (selectedPost as any).user_id ?? selectedPost.userId,
                      });
                    }
                  }}
                  disabled={!selectedCommentId || confirmVerificationMutation.isPending}
                  data-testid="button-confirm-selection"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {confirmVerificationMutation.isPending ? "Confirming..." : "Confirm ID"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full-screen pending post preview overlay */}
      {postForComments && (
        <div
          className="fixed inset-0 z-[100] h-[100dvh] w-screen bg-black"
          data-testid="moderator-fullscreen-preview"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setPostForComments(null);
              setIsPreviewMuted(true);
              setIsPostPreviewLoading(false);
            }}
            className="absolute right-3 top-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.5rem))] z-[110] border-white/20 bg-black/60 text-white hover:bg-black/80"
            data-testid="button-close-moderator-preview"
          >
            <XCircle className="mr-1 h-4 w-4" />
            Close
          </Button>
          <div className="relative h-full min-h-0 w-full">
            {isPostPreviewLoading ? (
              <div className="flex h-full w-full items-center justify-center bg-black/80">
                <VinylLoader label="Loading video..." />
              </div>
            ) : postForComments.videoUrl && postForComments.user ? (
              <div className="relative h-full min-h-0 w-full">
                <VideoCard
                  post={postForComments}
                  embeddedFeed
                  moderatorPreview
                  isActive
                  isMuted={isPreviewMuted}
                  onToggleMute={() => setIsPreviewMuted((prev) => !prev)}
                />
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-6 text-center text-white">
                <FileText className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">Video unavailable</p>
                <p className="text-xs text-muted-foreground">This post is missing a playable video source.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}