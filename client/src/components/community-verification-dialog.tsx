import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle, Clock3, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CommentWithUser } from "@shared/schema";
import { goldAvatarGlowShadowClass } from "./verified-artist";
import { formatUsernameDisplay } from "@/lib/utils";
import { playSuccessNotification } from "@/lib/haptic";

interface CommunityVerificationDialogProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CommunityVerificationDialog({ postId, isOpen, onClose }: CommunityVerificationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");

  const { data: comments = [], isLoading } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", postId, "comments"],
    enabled: isOpen,
  });

  const sortedComments = [...comments].sort((a, b) => {
    const toTime = (value: unknown) => {
      if (!value) return 0;
      if (value instanceof Date) return value.getTime();
      const t = new Date(value as any).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return toTime(a.createdAt) - toTime(b.createdAt);
  });

  const oldestCommentId = sortedComments[0]?.id ?? null;

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

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCommentId) {
        throw new Error("Please select a comment");
      }
      return apiRequest("POST", `/api/posts/${postId}/community-verify`, {
        commentId: selectedCommentId,
      });
    },
    onSuccess: () => {
      playSuccessNotification();
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/pending-verifications"] });
      toast({
        title: "Track ID Submitted",
        description: "Your track has been marked for moderator review",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "ID Track Failed",
        description: error.message || "Failed to ID track",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-background/95 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle>ID Track</DialogTitle>
          <DialogDescription>
            Select the comment that contains the correct track identification.
            A moderator will review your selection.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No comments yet. Users need to comment with track IDs first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <RadioGroup value={selectedCommentId} onValueChange={setSelectedCommentId}>
              {sortedComments.map((comment) => {
                const isSelected = selectedCommentId === comment.id;
                const isOldest = comment.id === oldestCommentId;

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
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${highlightClass} ${
                      isSelected ? selectionRingClass : ""
                    } ${
                      isSelected && !isOldest
                        ? "bg-white/8 border-white/95 shadow-[0_0_0_4px_rgba(255,255,255,0.55),0_0_22px_rgba(255,255,255,0.22)]"
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
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center border ${
                              comment.user.verified_artist
                                ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                                : "border-primary/20"
                            }`}
                          >
                            {comment.user.avatar_url ? (
                              <img
                                src={comment.user.avatar_url}
                                alt={formatUsernameDisplay(comment.user.username) || comment.user.username || ""}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{formatUsernameDisplay(comment.user.username)}</span>
                            {comment.user.verified_artist && (
                              <CheckCircle className="w-4 h-4 text-primary" />
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
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

                        <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span>{formatCommentTimestamp(comment.createdAt as any)}</span>
                        </div>
                      </div>

                      <p className="text-sm text-foreground">{comment.body}</p>
                      {comment.taggedArtist && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Tagged artist: {formatUsernameDisplay(comment.taggedArtist.username)}
                        </p>
                      )}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-verification"
              >
                Cancel
              </Button>
              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={!selectedCommentId || verifyMutation.isPending}
                data-testid="button-submit-verification"
              >
                {verifyMutation.isPending ? "Submitting..." : "Submit for Review"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}