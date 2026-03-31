import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Shield, AlertTriangle, FileText, CheckCircle, XCircle, User, MessageSquare, Clock3 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PostWithUser, CommentWithUser } from "@shared/schema";
import { VideoCard } from "@/components/video-card";
import { ModerationActionsDialog } from "@/components/moderation-actions-dialog";
import { ModeratorQueueCountBadge } from "@/components/moderator-queue-count-badge";
import { formatUsernameDisplay } from "@/lib/utils";
import { APP_PAGE_SCROLL_CLASS, APP_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/app-shell-layout";

function formatModeratorReportTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function ModeratorPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const { userType } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPost, setSelectedPost] = useState<PostWithUser | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");
  const [postForComments, setPostForComments] = useState<PostWithUser | null>(null);
  const [moderationDialogOpen, setModerationDialogOpen] = useState(false);
  const [selectedReportForModeration, setSelectedReportForModeration] = useState<{
    reportId: string;
    userId: string;
    username: string;
    contentTarget: "post" | "comment";
    defaultReportReason: string;
  } | null>(null);

  // Route protection - redirect non-moderators
  useEffect(() => {
    if (userType !== "moderator") {
      setLocation("/");
    }
  }, [userType, setLocation]);

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
          if (!n.message || n.read) return false;
          if (shouldMarkReportNotifications && n.message.includes("report")) return true;
          if (shouldMarkCommunityNotifications && n.message.includes("community verification")) return true;
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

  // Query for pending community verifications
  const { data: pendingVerifications = [], isLoading: isPendingLoading } = useQuery<PostWithUser[]>({
    queryKey: ["/api/moderator/pending-verifications"],
  });

  // Query for reported tracks
  const { data: reportedContent = [], isLoading: isReportsLoading } = useQuery<any[]>({
    queryKey: ["/api/moderator/reports"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/moderator/reports");
      return response.json();
    },
  });

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
  const toCommentTime = (value: unknown) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    const t = new Date(value as any).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const oldestPostCommentId =
    [...postComments].sort((a, b) => toCommentTime(a.createdAt) - toCommentTime(b.createdAt))[0]?.id ?? null;
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
    mutationFn: async ({ postId, commentId }: { postId: string; commentId?: string }) => {
      return apiRequest("POST", `/api/moderator/confirm-verification/${postId}`, {
        commentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/pending-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setSelectedPost(null);
      setSelectedCommentId("");
      toast({
        title: "Post Identified",
        description: "Post has been confirmed as identified",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to confirm verification",
        variant: "destructive",
      });
    },
  });

  const reopenVerificationMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("POST", `/api/moderator/reopen-verification/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/pending-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post Reopened",
        description: "Post has been reopened for review",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reopen post",
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
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
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
        description: "Failed to dismiss report",
        variant: "destructive",
      });
    },
  });

  // Additional security check - don't render if not moderator
  if (userType !== "moderator") {
    return null;
  }

  const pendingVerificationCount = pendingVerifications.length;
  const unresolvedReportsCount = reportedContent.filter(
    (r: { status?: string }) => r.status === "open" || r.status === "under_review"
  ).length;

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
            <Shield className="w-4 h-4 mr-2" />
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
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : pendingVerifications.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-12 text-center text-muted-foreground">
                    <Shield className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p className="text-sm font-medium text-foreground/90">No pending verifications</p>
                    <p className="mt-1 text-sm text-muted-foreground">All community verifications have been reviewed.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingVerifications.map((post: any) => (
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
                              onClick={() => setPostForComments(post)}
                              data-testid={`thumbnail-${post.id}`}
                            >
                              {post.videoUrl ? (
                                <>
                                  <video
                                    src={post.videoUrl}
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
                                <Badge variant="secondary" className="text-xs">
                                  {post.genre}
                                </Badge>
                              </div>
                            </div>

                            {/* Post info */}
                            <div className="flex-1 space-y-2">
                              <div>
                                <p 
                                  className="font-semibold cursor-pointer hover:text-primary transition-colors"
                                  onClick={() => setPostForComments(post)}
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

                              {/* Action buttons */}
                              <div className="flex flex-wrap gap-2 pt-2">
                                <Button
                                  size="sm"
                                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                                  onClick={() => {
                                    setSelectedPost(post);
                                    setSelectedCommentId(post.verifiedCommentId || post.verified_comment_id || "");
                                  }}
                                  data-testid={`button-review-confirm-${post.id}`}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Review & Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => reopenVerificationMutation.mutate(post.id)}
                                  disabled={reopenVerificationMutation.isPending}
                                  data-testid={`button-reopen-${post.id}`}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Reopen for Review
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
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
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p>Loading reports...</p>
                  </div>
                ) : reportedContent.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-12 text-center text-muted-foreground">
                    <AlertTriangle className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p className="text-sm font-medium text-foreground/90">No reported content at this time</p>
                    <p className="mt-1 text-sm text-muted-foreground">All clear for now.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reportedContent.map((report: any) => (
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
                                      setPostForComments(fullPost);
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
                                    if (report.post && report.post.videoUrl) {
                                      setPostForComments(report.post);
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
                                    {report.is_user_report ? "User Report" : "Post Report"}
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
                                        setPostForComments(fullPost);
                                        // Don't set selectedPost - that's only for verification dialog
                                      } catch (error) {
                                        console.error("Failed to fetch post:", error);
                                        // Fallback to report.post if fetch fails
                                        if (report.post) {
                                          setPostForComments(report.post);
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
                                    <p className="text-xs font-medium text-yellow-600 mb-1">⚠️ User Comment Report</p>
                                    <p className="text-sm text-muted-foreground">
                                      Reported user:{" "}
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
                                {report.description && (
                                  <div className="mt-2 pt-2 border-t border-red-500/20">
                                    <p className="text-xs font-medium text-red-400 mb-1">Additional Details:</p>
                                    <p className="text-sm text-muted-foreground">{report.description}</p>
                                  </div>
                                )}
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-2 pt-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => dismissReportMutation.mutate(report.id)}
                                  disabled={dismissReportMutation.isPending}
                                  data-testid={`button-dismiss-${report.id}`}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Dismiss Report
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    report.is_user_report
                                      ? !report.reported_user_id
                                      : !report.post?.user?.id
                                  }
                                  title={
                                    report.is_user_report && !report.reported_user_id
                                      ? "Missing reported user for this comment report"
                                      : !report.is_user_report && !report.post?.user?.id
                                        ? "Missing post author for this report"
                                        : undefined
                                  }
                                  onClick={() => {
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
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

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
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto bg-background/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>Review Comments & Select Identification</DialogTitle>
          </DialogHeader>

          {selectedPost && (
            <div className="space-y-4">
              {/* Post info summary */}
              <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                <p className="font-semibold text-sm mb-1">{selectedPost.description}</p>
                <p className="text-xs text-muted-foreground">
                  Uploaded by {formatUsernameDisplay(selectedPost.user.username)}
                </p>
              </div>

              {/* Comments list */}
              {postComments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No comments on this post yet</p>
                </div>
              ) : (
                <RadioGroup value={selectedCommentId} onValueChange={setSelectedCommentId}>
                  <div className="space-y-3">
                    {postComments.map((comment) => {
                      const isSelected = selectedCommentId === comment.id;
                      const isOldest = comment.id === oldestPostCommentId;
                      const highlightClass = isOldest
                        ? "border-[#3B82F6]/75 bg-[#3B82F6]/10 shadow-[0_0_22px_rgba(59,130,246,0.60)]"
                        : "border-border hover:bg-accent/50";
                      const selectionRingClass = isSelected
                        ? isOldest
                          ? "ring-2 ring-[#3B82F6]/95 shadow-[0_0_24px_rgba(59,130,246,0.65)]"
                          : "ring-2 ring-white shadow-[0_0_28px_rgba(255,255,255,0.45)]"
                        : "";
                      return (
                      <div
                        key={comment.id}
                        className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${highlightClass} ${
                          isSelected ? selectionRingClass : ""
                        } ${
                          isSelected && !isOldest
                            ? "border-white/95 bg-white/8 shadow-[0_0_0_4px_rgba(255,255,255,0.55),0_0_22px_rgba(255,255,255,0.22)]"
                            : ""
                        }`}
                      >
                        <RadioGroupItem 
                          value={comment.id} 
                          id={comment.id} 
                          data-testid={`radio-comment-${comment.id}`} 
                        />
                        <Label htmlFor={comment.id} className="flex-1 cursor-pointer">
                          <div className="mb-2 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{formatUsernameDisplay(comment.user.username)}</span>
                              {comment.user.verified_artist && (
                                <CheckCircle className="w-4 h-4 text-primary" />
                              )}
                            </div>
                            {isOldest && (
                              <span className="whitespace-nowrap rounded-full border border-[#3B82F6] bg-[#3B82F6] px-2 py-0.5 text-[11px] font-medium text-white">
                                Oldest Comment
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock3 className="h-3.5 w-3.5" />
                              <span>{formatCommentTimestamp(comment.createdAt as any)}</span>
                            </div>
                          </div>
                          <p className="text-sm text-foreground">{comment.body}</p>
                          {(comment.id === selectedPost.verifiedCommentId || comment.id === (selectedPost as any).verified_comment_id) && (
                            <Badge variant="secondary" className="mt-2 text-xs">
                              Uploader's Selection
                            </Badge>
                          )}
                        </Label>
                      </div>
                    )})}
                  </div>
                </RadioGroup>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedPost(null);
                    setSelectedCommentId("");
                  }}
                  data-testid="button-cancel-selection"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedCommentId && selectedPost) {
                      confirmVerificationMutation.mutate({
                        postId: selectedPost.id,
                        commentId: selectedCommentId,
                      });
                    }
                  }}
                  disabled={!selectedCommentId || confirmVerificationMutation.isPending}
                  data-testid="button-confirm-selection"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {confirmVerificationMutation.isPending ? "Confirming..." : "Confirm"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Post View Modal */}
      <Dialog open={!!postForComments} onOpenChange={(open) => {
        if (!open) {
          setPostForComments(null);
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] p-0 m-0 border-0 rounded-lg bg-black overflow-y-auto">
          <DialogTitle className="sr-only">Post View</DialogTitle>
          {postForComments && postForComments.videoUrl && postForComments.user ? (
            <div className="w-full relative">
              <VideoCard post={postForComments} />
            </div>
          ) : (
            <div className="p-4 text-white">
              <p>Loading post...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}