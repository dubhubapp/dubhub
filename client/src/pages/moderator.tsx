import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { Header } from "@/components/brand/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Shield, AlertTriangle, Users, FileText, Settings, CheckCircle, XCircle, User, ExternalLink, MessageSquare, MoreVertical } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PostWithUser, CommentWithUser } from "@shared/schema";
import { VideoCard } from "@/components/video-card";
import { ModerationActionsDialog } from "@/components/moderation-actions-dialog";

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
  const [selectedReportForModeration, setSelectedReportForModeration] = useState<{ reportId: string; userId: string; username: string } | null>(null);

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
        const notifications = await response.json();
        
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
          queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
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
        queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
        queryClient.refetchQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
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

  const removeCommentMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/remove-comment`);
    },
    onMutate: async (reportId: string) => {
      // Optimistically remove the report from the list
      await queryClient.cancelQueries({ queryKey: ["/api/moderator/reports"] });
      const previousReports = queryClient.getQueryData<any[]>(["/api/moderator/reports"]);
      const report = previousReports?.find((r: any) => r.id === reportId);
      queryClient.setQueryData<any[]>(["/api/moderator/reports"], (old = []) => 
        old.filter((r: any) => r.id !== reportId)
      );
      return { previousReports, report };
    },
    onSuccess: (_, reportId: string, context) => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.refetchQueries({ queryKey: ["/api/posts"] });
      // Get the reported user ID from context (stored before removal)
      const report = context?.report;
      if (report?.reported_user_id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", report.reported_user_id, "notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", report.reported_user_id, "notifications", "unread-count"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", report.reported_user_id, "notifications"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", report.reported_user_id, "notifications", "unread-count"] });
      }
      // Invalidate and refetch notification queries for instant updates
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
        queryClient.refetchQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
      }
      toast({
        title: "Comment Removed",
        description: "Reported comment has been removed and user notified",
      });
    },
    onError: (error, reportId, context) => {
      // Rollback on error
      if (context?.previousReports) {
        queryClient.setQueryData(["/api/moderator/reports"], context.previousReports);
      }
      toast({
        title: "Error",
        description: "Failed to remove comment",
        variant: "destructive",
      });
    },
  });

  const removePostMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/remove-post`);
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
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      // Force refetch to ensure deleted post is removed from feed
      queryClient.refetchQueries({ queryKey: ["/api/posts"] });
      // Invalidate and refetch notification queries for instant updates
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
        queryClient.refetchQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
      }
      toast({
        title: "Post Removed",
        description: "Reported post has been removed",
      });
    },
    onError: (error, reportId, context) => {
      // Rollback on error
      if (context?.previousReports) {
        queryClient.setQueryData(["/api/moderator/reports"], context.previousReports);
      }
      toast({
        title: "Error",
        description: "Failed to remove post",
        variant: "destructive",
      });
    },
  });

  // Additional security check - don't render if not moderator
  if (userType !== "moderator") {
    return null;
  }

  return (
    <div className="flex-1 bg-background">
      <Header title="Moderator Dashboard" className="bg-red-500/10 border-b border-red-500/20" />
      
      <div className="p-4 space-y-6">
        {/* Moderator Badge */}
        <div className="flex items-center justify-center">
          <Badge variant="outline" className="bg-red-500/10 border-red-500 text-red-600 px-4 py-2" data-testid="moderator-badge">
            <Shield className="w-4 h-4 mr-2" />
            Moderator Access
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending Verifications
              {pendingVerifications.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-red-500 text-white">
                  {pendingVerifications.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Verifications</CardTitle>
                <CardDescription>Community-verified posts awaiting moderator confirmation</CardDescription>
              </CardHeader>
              <CardContent>
                {isPendingLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : pendingVerifications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No pending verifications</p>
                    <p className="text-sm">All community verifications have been reviewed</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingVerifications.map((post: any) => (
                      <Card key={post.id} className="border-blue-500/20" data-testid={`pending-verification-${post.id}`}>
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            {/* Video thumbnail - clickable */}
                            <div 
                              className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-muted cursor-pointer group"
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
                              <div className="absolute top-1 right-1">
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
                                  <span>Uploaded by @{post.user.username}</span>
                                </div>
                              </div>

                              {/* Verified comment display */}
                              {post.verifiedComment ? (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-blue-400">Uploader's Selection:</p>
                                    <Badge variant="secondary" className="text-xs">
                                      <MessageSquare className="w-3 h-3 mr-1" />
                                      Selected Comment
                                    </Badge>
                                  </div>
                                  <div className="bg-background/50 rounded p-2">
                                    <div className="flex items-center gap-2 mb-1">
                                      <User className="w-3 h-3" />
                                      <span className="text-xs font-medium">@{post.verifiedComment.user?.username || 'Unknown'}</span>
                                    </div>
                                    <p className="text-sm">{post.verifiedComment.body || post.verifiedComment.content || 'No comment text'}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2">
                                  <p className="text-xs font-medium text-blue-400 mb-1">Community Identified</p>
                                  <p className="text-sm">A user marked a comment as the correct track ID</p>
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
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

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Reported Content</CardTitle>
                <CardDescription>Content flagged by users for review</CardDescription>
              </CardHeader>
              <CardContent>
                {isReportsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p>Loading reports...</p>
                  </div>
                ) : reportedContent.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No reported content at this time</p>
                    <p className="text-sm">All clear! 🎉</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reportedContent.map((report: any) => (
                      <Card key={report.id} className="border-red-500/20" data-testid={`report-${report.id}`}>
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            {/* Video thumbnail - clickable */}
                            <div 
                              className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-muted cursor-pointer group"
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
                                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 mt-2">
                                    <p className="text-xs font-medium text-yellow-600 mb-1">⚠️ User Comment Report</p>
                                    <p className="text-sm text-muted-foreground">
                                      Reported user: <span className="font-semibold">@{report.reportedUser.username}</span>
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
                                    Post by: @{report.post.user.username}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                  <User className="w-4 h-4" />
                                  <span>Reported by @{report.reporter?.username || "Unknown"}</span>
                                </div>
                              </div>

                              {/* Report reason */}
                              <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                                <p className="text-xs font-medium text-red-400 mb-1">Report Reason:</p>
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
                                {report.is_user_report ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        if (confirm("Are you sure you want to remove this comment? The user will be notified. This action cannot be undone.")) {
                                          removeCommentMutation.mutate(report.id);
                                        }
                                      }}
                                      disabled={removeCommentMutation.isPending}
                                      data-testid={`button-remove-comment-${report.id}`}
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Remove Comment
                                    </Button>
                                    {report.reportedUser && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedReportForModeration({
                                            reportId: report.id,
                                            userId: report.reported_user_id,
                                            username: report.reportedUser.username,
                                          });
                                          setModerationDialogOpen(true);
                                        }}
                                        data-testid={`button-moderate-user-${report.id}`}
                                      >
                                        <Shield className="w-4 h-4 mr-1" />
                                        Moderate User
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        if (confirm("Are you sure you want to remove this post? This action cannot be undone.")) {
                                          removePostMutation.mutate(report.id);
                                        }
                                      }}
                                      disabled={removePostMutation.isPending}
                                      data-testid={`button-remove-${report.id}`}
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Remove Post
                                    </Button>
                                    {report.post?.user && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedReportForModeration({
                                            reportId: report.id,
                                            userId: report.post.user.id,
                                            username: report.post.user.username,
                                          });
                                          setModerationDialogOpen(true);
                                        }}
                                        data-testid={`button-moderate-user-${report.id}`}
                                      >
                                        <Shield className="w-4 h-4 mr-1" />
                                        Moderate User
                                      </Button>
                                    )}
                                  </>
                                )}
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
        />
      )}

      {/* Comment Selection Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={() => {
        setSelectedPost(null);
        setSelectedCommentId("");
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-background/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>Review Comments & Select Identification</DialogTitle>
          </DialogHeader>

          {selectedPost && (
            <div className="space-y-4">
              {/* Post info summary */}
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="font-semibold text-sm mb-1">{selectedPost.description}</p>
                <p className="text-xs text-muted-foreground">Uploaded by @{selectedPost.user.username}</p>
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
                    {postComments.map((comment) => (
                      <div 
                        key={comment.id} 
                        className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                          selectedCommentId === comment.id 
                            ? 'border-green-500 bg-green-50/30' 
                            : 'border-border hover:bg-accent/50'
                        }`}
                      >
                        <RadioGroupItem 
                          value={comment.id} 
                          id={comment.id} 
                          data-testid={`radio-comment-${comment.id}`} 
                        />
                        <Label htmlFor={comment.id} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">@{comment.user.username}</span>
                              {comment.user.verified_artist && (
                                <CheckCircle className="w-4 h-4 text-primary" />
                              )}
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
                    ))}
                  </div>
                </RadioGroup>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
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
                  className="bg-green-600 hover:bg-green-700"
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
                  {confirmVerificationMutation.isPending ? "Confirming..." : "Confirm as Identified"}
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