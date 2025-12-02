import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CommentWithUser } from "@shared/schema";

interface CommunityVerificationDialogProps {
  trackId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CommunityVerificationDialog({ trackId, isOpen, onClose }: CommunityVerificationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");

  const { data: comments = [], isLoading } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", trackId, "comments"],
    enabled: isOpen,
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCommentId) {
        throw new Error("Please select a comment");
      }
      return apiRequest("POST", `/api/tracks/${trackId}/community-verify`, {
        commentId: selectedCommentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
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
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={comment.id} id={comment.id} data-testid={`radio-comment-${comment.id}`} />
                  <Label htmlFor={comment.id} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">@{comment.user.username}</span>
                        {comment.user.isVerified && (
                          <CheckCircle className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground">{comment.content}</p>
                    {comment.taggedArtist && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Tagged artist: @{comment.taggedArtist.username}
                      </p>
                    )}
                  </Label>
                </div>
              ))}
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