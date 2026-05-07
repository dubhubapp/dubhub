import { useRef, useState } from "react";
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
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { useUser } from "@/lib/user-context";
import { ID_MARKING_DIALOG_CONTENT_CLASS, ID_MARKING_DIALOG_OVERLAY_CLASS } from "./id-marking-dialog-styles";

interface CommunityVerificationDialogProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CommunityVerificationDialog({ postId, isOpen, onClose }: CommunityVerificationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser } = useUser();
  const [selectedCommentId, setSelectedCommentId] = useState<string>("");
  const initialFocusRef = useRef<HTMLDivElement | null>(null);

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
  const firstCommentId = sortedComments.find((comment) => !!comment.taggedArtist)?.id ?? null;
  const selectedIsOldest = selectedCommentId !== "" && selectedCommentId === oldestCommentId;
  const selectedIsFirstComment = selectedCommentId !== "" && selectedCommentId === firstCommentId;

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
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "liked-posts"] });
      }
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
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          initialFocusRef.current?.focus();
        }}
        overlayClassName={ID_MARKING_DIALOG_OVERLAY_CLASS}
        className={`${ID_MARKING_DIALOG_CONTENT_CLASS} overflow-x-hidden`}
      >
        <div ref={initialFocusRef} tabIndex={-1} />
        <DialogHeader className="space-y-1.5 text-center">
          <DialogTitle className="text-lg font-semibold text-white">ID Track</DialogTitle>
          <DialogDescription className="text-sm text-white/75">
            Select the comment that contains the correct track identification.
            A moderator will review your selection.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="mt-4 flex items-center justify-center rounded-lg border border-white/10 bg-black/15 py-8">
            <div className="flex flex-col items-center gap-2 text-white/75">
              <InlineSpinner className="border-primary" sizeClassName="h-8 w-8" />
              <p className="text-xs">Loading comments...</p>
            </div>
          </div>
        ) : comments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-black/15 py-8 text-center text-white/70">
            <p>No comments yet. Community members need to comment with track IDs first.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4 overflow-x-hidden">
            <RadioGroup value={selectedCommentId} onValueChange={setSelectedCommentId} className="overflow-x-hidden">
              {sortedComments.map((comment) => {
                const isSelected = selectedCommentId === comment.id;
                const isOldest = comment.id === oldestCommentId;
                const isFirstComment = comment.id === firstCommentId;

                const highlightClass = isFirstComment
                  ? "border-[#FFD700]/80 bg-[#FFD700]/10 shadow-[0_0_22px_rgba(255,215,0,0.55)]"
                  : isOldest
                    ? "border-[#3B82F6]/75 bg-[#3B82F6]/10 shadow-[0_0_22px_rgba(59,130,246,0.60)]"
                    : "border-white/20 hover:bg-white/10";

                const selectionRingClass = isSelected
                  ? isFirstComment
                    ? "ring-2 ring-[#FFD700]/90 shadow-[0_0_26px_rgba(255,215,0,0.55)]"
                    : isOldest
                      ? "ring-2 ring-[#3B82F6]/95 shadow-[0_0_24px_rgba(59,130,246,0.65)]"
                      : "ring-2 ring-white shadow-[0_0_28px_rgba(255,255,255,0.45)]"
                  : "";

                return (
                  <div
                    key={comment.id}
                    className={`flex min-w-0 items-start space-x-3 overflow-x-hidden rounded-lg border p-3 transition-colors ${highlightClass} ${
                      isSelected ? selectionRingClass : ""
                    } ${
                      isSelected && !isOldest && !isFirstComment
                        ? "bg-white/8 border-white/95 shadow-[0_0_0_4px_rgba(255,255,255,0.55),0_0_22px_rgba(255,255,255,0.22)]"
                        : ""
                    }`}
                  >
                    <RadioGroupItem
                      value={comment.id}
                      id={comment.id}
                      data-testid={`radio-comment-${comment.id}`}
                    />
                    <Label htmlFor={comment.id} className="min-w-0 flex-1 cursor-pointer overflow-x-hidden">
                      <div className="mb-2 min-w-0">
                        <div className="flex min-w-0 items-start gap-2">
                          <div
                            className={`h-8 w-8 shrink-0 rounded-full overflow-hidden flex items-center justify-center border ${
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
                              {isOldest && (
                                <span
                                  className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                    isSelected && !isFirstComment
                                      ? "border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-[0_0_14px_rgba(29,78,216,0.50)]"
                                      : "border-[#3B82F6] bg-[#3B82F6] text-white"
                                  }`}
                                >
                                  Oldest Comment
                                </span>
                              )}
                              {isFirstComment && (
                                <span
                                  className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                    isSelected
                                      ? "border-[#FFD700]/90 bg-[#FFD700]/35 text-white shadow-[0_0_16px_rgba(255,215,0,0.55)]"
                                      : "border-[#FFD700]/80 bg-[#FFD700]/25 text-white shadow-[0_0_14px_rgba(255,215,0,0.35)]"
                                  }`}
                                >
                                  First Comment
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
                      {comment.taggedArtist && (
                        <p className="mt-1 break-words text-xs text-white/65">
                          Tagged artist: {formatUsernameDisplay(comment.taggedArtist.username)}
                        </p>
                      )}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>

            <div className="flex justify-end gap-2 border-t border-white/15 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                data-testid="button-cancel-verification"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => verifyMutation.mutate()}
                disabled={!selectedCommentId || verifyMutation.isPending}
                className={
                  selectedIsFirstComment
                    ? "border-[#FFD700]/80 bg-[#FFD700]/25 text-white shadow-[0_0_14px_rgba(255,215,0,0.35)] hover:bg-[#FFD700]/35 hover:text-white"
                    : selectedIsOldest
                      ? "border-[#3B82F6] bg-[#1D4ED8] text-white shadow-[0_0_14px_rgba(29,78,216,0.40)] hover:bg-[#1D4ED8]/90 hover:text-white"
                      : "border-white/30 bg-white/12 text-white hover:bg-white/20 hover:text-white"
                }
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