import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle, Clock3, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CommentWithUser } from "@shared/schema";
import { useUser } from "@/lib/user-context";
import { formatDate } from "@/pages/release-tracker";
import { goldAvatarGlowShadowClass } from "./verified-artist";

interface ArtistVerificationDialogProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ArtistVerificationDialog({ postId, isOpen, onClose }: ArtistVerificationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { verifiedArtist, currentUser } = useUser();
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
  const reviewingArtistId = currentUser?.id ?? null;
  const reviewingArtistUsername = currentUser?.username ?? null;
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const getTaggedArtistIdFromComment = (comment: CommentWithUser) => {
    const taggedArtistId = (comment as any)?.taggedArtist?.id as string | undefined;
    const artistTagId = (comment as any)?.artistTag as string | undefined;
    const artistTagAltId = (comment as any)?.artist_tag as string | undefined;
    return taggedArtistId ?? artistTagId ?? artistTagAltId ?? null;
  };

  const isCommentTaggedByReviewingArtist = (comment: CommentWithUser) => {
    const taggedArtistId = getTaggedArtistIdFromComment(comment);
    if (reviewingArtistId && taggedArtistId === reviewingArtistId) return true;

    // Fallback: detect @username in the comment body.
    // This keeps "First Tag" robust even if the backend doesn't populate tagged-artist objects.
    if (reviewingArtistUsername && typeof comment.body === "string") {
      const re = new RegExp(`@${escapeRegExp(reviewingArtistUsername)}\\b`, "i");
      return re.test(comment.body);
    }

    return false;
  };

  const firstTaggedCommentId =
    reviewingArtistId
      ? sortedComments.find((comment) => isCommentTaggedByReviewingArtist(comment))?.id ?? null
      : null;
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
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <p className="text-sm font-medium text-foreground">
                Confirm or deny the first or most relevant comment that tagged you.
              </p>
            </div>
            <RadioGroup value={selectedCommentId} onValueChange={setSelectedCommentId}>
              {sortedComments.map((comment, index) => {
                const isSelected = selectedCommentId === comment.id;
                const isOldest = comment.id === oldestCommentId;
                const isFirstTag = comment.id === firstTaggedCommentId;
                const selectionRingClass = isFirstTag
                  ? "ring-2 ring-[#FFD700]/90 shadow-[0_0_26px_rgba(255,215,0,0.55)]"
                  : isOldest
                    ? "ring-2 ring-[#3B82F6]/95 ring-offset-2 ring-offset-background shadow-[0_0_24px_rgba(59,130,246,0.65)]"
                    : "";
                const highlightClass = isFirstTag
                  ? "border-[#FFD700]/80 bg-amber-500/10 shadow-[0_0_22px_rgba(255,215,0,0.55)]"
                  : isOldest
                  ? "border-[#3B82F6]/75 bg-[#3B82F6]/10 shadow-[0_0_22px_rgba(59,130,246,0.60)]"
                  : "border-border hover:bg-accent/50";
                return (
                <div
                  key={comment.id}
                  className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${highlightClass} ${
                    isSelected
                        ? selectionRingClass
                        : ""
                  } ${
                    isSelected && !isOldest && !isFirstTag
                      ? "bg-white/8 border-white/95 shadow-[0_0_0_4px_rgba(255,255,255,0.55),0_0_22px_rgba(255,255,255,0.22)] ring-0"
                      : ""
                  }`}
                >
                  <RadioGroupItem value={comment.id} id={comment.id} data-testid={`radio-artist-comment-${comment.id}`} />
                  <Label htmlFor={comment.id} className="flex-1 cursor-pointer">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center border ${
                            comment.user.verified_artist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary/20"
                          }`}
                        >
                          {comment.user.avatar_url ? (
                            <img
                              src={comment.user.avatar_url}
                              alt={comment.user.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">@{comment.user.username}</span>
                          {comment.user.verified_artist && (
                            <CheckCircle className="w-4 h-4 text-primary" />
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {isOldest && (
                          <span
                            className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              isSelected && !isFirstTag
                                ? "border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-[0_0_14px_rgba(29,78,216,0.50)]"
                                : "border-[#3B82F6] bg-[#3B82F6] text-white"
                            }`}
                          >
                            Oldest Comment
                          </span>
                        )}
                        {isFirstTag && (
                          <span
                            className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              isSelected
                                ? "border-[#FFD700]/90 bg-[#FFD700]/35 text-white shadow-[0_0_16px_rgba(255,215,0,0.55)]"
                                : "border-[#FFD700]/80 bg-[#FFD700]/25 text-white shadow-[0_0_14px_rgba(255,215,0,0.35)]"
                            }`}
                          >
                            First Tag
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
                        Tagged artist: @{comment.taggedArtist.username}
                      </p>
                    )}
                  </Label>
                </div>
              )})}
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
