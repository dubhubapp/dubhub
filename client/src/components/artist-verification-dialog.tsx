import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CommentWithUser } from "@shared/schema";

interface ArtistVerificationDialogProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ArtistVerificationDialog({ postId, isOpen, onClose }: ArtistVerificationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [collaborators, setCollaborators] = useState("");

  const { data: comments = [], isLoading } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", postId, "comments"],
    enabled: isOpen,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCommentId) {
        throw new Error("Please select a comment");
      }
      return apiRequest("POST", `/api/posts/${postId}/artist-confirm`, {
        commentId: selectedCommentId,
        ...(title.trim() && { title: title.trim() }),
        ...(collaborators.trim() && { collaborators: collaborators.trim() }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/eligible-for-release"] });
      toast({
        title: "Track Confirmed",
        description: "You have confirmed this track.",
      });
      onClose();
    },
    onError: (error: Error & { body?: { code?: string; message?: string } }) => {
      const body = (error as any)?.body;
      const code = body?.code;
      if (code === "VERIFIED_ARTIST_REQUIRED") {
        toast({
          title: "Verified Artist Required",
          description: "Verified artist profile required to confirm tracks.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Confirmation Failed",
          description: body?.message || error.message || "Failed to confirm",
          variant: "destructive",
        });
      }
    },
  });

  const denyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCommentId) {
        throw new Error("Please select a comment");
      }
      return apiRequest("POST", `/api/posts/${postId}/artist-deny`, {
        commentId: selectedCommentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/eligible-for-release"] });
      toast({
        title: "Track Denied",
        description: "You have denied this track.",
      });
      onClose();
    },
    onError: (error: Error & { body?: { code?: string; message?: string } }) => {
      const body = (error as any)?.body;
      const code = body?.code;
      if (code === "VERIFIED_ARTIST_REQUIRED") {
        toast({
          title: "Verified Artist Required",
          description: "Verified artist profile required to confirm tracks.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Denial Failed",
          description: body?.message || error.message || "Failed to deny",
          variant: "destructive",
        });
      }
    },
  });

  const handleConfirm = () => confirmMutation.mutate();
  const handleDeny = () => denyMutation.mutate();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-background/95 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle>Artist Verification</DialogTitle>
          <DialogDescription>
            You were tagged on this post. Select the comment that correctly identifies the track, then confirm or deny.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No comments yet. Select a comment to respond to.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <RadioGroup value={selectedCommentId} onValueChange={setSelectedCommentId}>
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={comment.id} id={comment.id} data-testid={`radio-artist-comment-${comment.id}`} />
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
                    {comment.taggedArtist && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Tagged artist: @{comment.taggedArtist.username}
                      </p>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="space-y-2">
              <Label htmlFor="artist-title">Title (optional)</Label>
              <Input
                id="artist-title"
                placeholder="Track title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="artist-collaborators">Collaborators (optional)</Label>
              <Input
                id="artist-collaborators"
                placeholder="e.g. Artist A, Artist B"
                value={collaborators}
                onChange={(e) => setCollaborators(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-artist-verification"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeny}
                disabled={!selectedCommentId || denyMutation.isPending}
                data-testid="button-artist-deny"
              >
                {denyMutation.isPending ? "Denying..." : "Deny"}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!selectedCommentId || confirmMutation.isPending}
                data-testid="button-artist-confirm"
              >
                {confirmMutation.isPending ? "Confirming..." : "Confirm"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
