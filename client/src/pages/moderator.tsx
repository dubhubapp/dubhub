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
import { Shield, AlertTriangle, Users, FileText, Settings, CheckCircle, XCircle, User, ExternalLink, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PostWithUser, CommentWithUser } from "@shared/schema";
import { VideoCard } from "@/components/video-card";

export default function ModeratorPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const { userType } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPost, setSelectedPost] = useState<PostWithUser | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");
  const [postForComments, setPostForComments] = useState<PostWithUser | null>(null);

  // Route protection - redirect non-moderators
  useEffect(() => {
    if (userType !== "moderator") {
      setLocation("/");
    }
  }, [userType, setLocation]);

  // Mark moderator notifications as read when page is opened
  useEffect(() => {
    const markModeratorNotificationsAsRead = async () => {
      try {
        // Get all notifications for the moderator
        const response = await fetch("/api/user/moderator1/notifications");
        const notifications = await response.json();
        
        // Mark all unread moderator-related notifications as read
        const moderatorNotifications = notifications.filter((n: any) => 
          n.type === "new_review_submission" && !n.isRead
        );
        
        for (const notification of moderatorNotifications) {
          await apiRequest("PATCH", `/api/notifications/${notification.id}/read`);
        }
        
        // Invalidate queries to update the badge count
        if (moderatorNotifications.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/moderator", "moderator1", "notifications", "unread-count"] });
        }
      } catch (error) {
        console.error("Failed to mark moderator notifications as read:", error);
      }
    };

    if (userType === "moderator") {
      markModeratorNotificationsAsRead();
    }
  }, [userType, queryClient]);

  // Query for pending community verifications
  const { data: pendingVerifications = [], isLoading: isPendingLoading } = useQuery<PostWithUser[]>({
    queryKey: ["/api/moderator/pending-verifications"],
  });

  // Query for reported tracks
  const { data: reportedContent = [], isLoading: isReportsLoading } = useQuery<any[]>({
    queryKey: ["/api/moderator/reports"],
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      toast({
        title: "Report Dismissed",
        description: "Report has been dismissed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to dismiss report",
        variant: "destructive",
      });
    },
  });

  const removePostMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/remove-post`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post Removed",
        description: "Reported post has been removed",
      });
    },
    onError: () => {
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
            <TabsTrigger value="pending" data-testid="tab-pending">Pending Verifications</TabsTrigger>
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
                                      <span className="text-xs font-medium">@{post.verifiedComment.user.username}</span>
                                    </div>
                                    <p className="text-sm">{post.verifiedComment.body || post.verifiedComment.content}</p>
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
                                    setSelectedCommentId(post.verifiedCommentId || "");
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
                              onClick={() => report.post && setPostForComments(report.post)}
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
                                <p 
                                  className="font-semibold cursor-pointer hover:text-primary transition-colors"
                                  onClick={() => report.post && setPostForComments(report.post)}
                                  data-testid={`description-${report.id}`}
                                >
                                  {report.post?.description || report.post_title || "Unknown post"}
                                </p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                  <User className="w-4 h-4" />
                                  <span>Reported by @{report.reportedBy?.username || "Unknown"}</span>
                                </div>
                              </div>

                              {/* Report reason */}
                              <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                                <p className="text-xs font-medium text-red-400 mb-1">Report Reason:</p>
                                <p className="text-sm">{report.reason}</p>
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-2 pt-2">
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
                          <p className="text-sm text-foreground">{comment.body || comment.content}</p>
                          {comment.id === selectedPost.verifiedCommentId && (
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
      <Dialog open={!!postForComments} onOpenChange={() => setPostForComments(null)}>
        <DialogContent className="max-w-md h-screen p-0 m-0 border-0 rounded-none bg-black">
          <DialogTitle className="sr-only">Post View</DialogTitle>
          {postForComments && (
            <div className="h-full w-full overflow-hidden">
              <VideoCard post={postForComments} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}