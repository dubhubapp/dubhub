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
import { useUser } from "@/lib/user-context";
import { formatDate } from "@/pages/release-tracker";

interface ArtistVerificationDialogProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ArtistVerificationDialog({ postId, isOpen, onClose }: ArtistVerificationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { verifiedArtist } = useUser();
  const [step, setStep] = useState<"verify" | "attach">("verify");
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [collaborators, setCollaborators] = useState("");
  const [attachOptions, setAttachOptions] = useState<
    { id: string; title: string; release_date: string; artwork_url: string | null }[]
  >([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>("");

  const { data: comments = [], isLoading } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", postId, "comments"],
    enabled: isOpen,
  });

  const resetState = () => {
    setStep("verify");
    setSelectedCommentId("");
    setTitle("");
    setCollaborators("");
    setAttachOptions([]);
    setSelectedReleaseId("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/eligible-for-release"] });
      toast({
        title: "Track Confirmed",
        description: "You have confirmed this track.",
      });
      // Only prompt verified artists for attach flow
      if (!verifiedArtist) {
        handleClose();
        return;
      }
      try {
        const res = await apiRequest(
          "GET",
          `/api/artists/me/upcoming-releases${postId ? `?post_id=${encodeURIComponent(postId)}` : ""}`
        );
        const releases = await res.json();
        if (Array.isArray(releases) && releases.length > 0) {
          setAttachOptions(releases);
          setStep("attach");
        } else {
          handleClose();
        }
      } catch (error) {
        console.error("[ArtistVerificationDialog] Failed to load upcoming releases", error);
        handleClose();
      }
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
      } else if (code === "ARTIST_ALREADY_VERIFIED") {
        toast({
          title: "Already verified",
          description: body?.message || "This post has already been verified by an artist.",
          variant: "destructive",
        });
        handleClose();
      } else {
        toast({
          title: "Confirmation Failed",
          description: body?.message || error.message || "Failed to confirm",
          variant: "destructive",
        });
      }
    },
  });

  const attachMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReleaseId) throw new Error("Please select a release");
      const res = await apiRequest("POST", `/api/releases/${selectedReleaseId}/attach-posts`, {
        post_ids: [postId],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/releases/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post attached",
        description: "This post has been attached to your release.",
      });
      handleClose();
    },
    onError: (error: Error & { body?: { code?: string; message?: string } }) => {
      const body = (error as any)?.body;
      const code = body?.code;
      let description = body?.message || error.message || "Failed to attach post to release.";
      if (code === "POST_ALREADY_ATTACHED") {
        description = "This post is already attached to another release.";
      } else if (code === "RELEASE_LOCKED") {
        description = "This release is locked and can no longer accept new posts.";
      }
      toast({
        title: "Attach failed",
        description,
        variant: "destructive",
      });
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
      } else if (code === "ARTIST_ALREADY_VERIFIED") {
        toast({
          title: "Already verified",
          description: body?.message || "This post has already been verified by an artist.",
          variant: "destructive",
        });
        handleClose();
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-background/95 backdrop-blur-md">
        {step === "verify" ? (
          <>
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
                onClick={handleClose}
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
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Attach this post to an existing release?</DialogTitle>
              <DialogDescription>
                You have upcoming releases. Attach this post so listeners see it on your Releases tab.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <RadioGroup value={selectedReleaseId} onValueChange={setSelectedReleaseId}>
                {attachOptions.map((rel) => (
                  <div
                    key={rel.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors"
                  >
                    <RadioGroupItem value={rel.id} id={rel.id} />
                    <Label htmlFor={rel.id} className="flex-1 cursor-pointer flex items-center gap-3">
                      <div className="w-12 h-12 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                        {rel.artwork_url ? (
                          <img src={rel.artwork_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">No artwork</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{rel.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(rel.release_date as any)}
                        </p>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  data-testid="button-attach-skip"
                >
                  Skip
                </Button>
                <Button
                  onClick={() => attachMutation.mutate()}
                  disabled={!selectedReleaseId || attachMutation.isPending}
                  data-testid="button-attach-confirm"
                >
                  {attachMutation.isPending ? "Attaching..." : "Attach to release"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
