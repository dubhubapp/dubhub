import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GENRE_ENTRIES, getGenreChipStyle } from "@/lib/genre-styles";
import {
  applyPostGenreChangeToQueryCaches,
  invalidateQueriesAfterPostGenreChange,
} from "@/lib/post-genre-cache-updates";
import { getCanonicalGenreLabel } from "@shared/report-genre";

interface CorrectGenreDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  postId: string;
  ownerUserId: string | undefined;
  currentGenre: string | null | undefined;
  suggestedGenreId: string | null;
  onSuccess?: () => void;
}

export function CorrectGenreDialog({
  isOpen,
  onClose,
  reportId,
  postId,
  ownerUserId,
  currentGenre,
  suggestedGenreId,
  onSuccess,
}: CorrectGenreDialogProps) {
  const [selectedGenreId, setSelectedGenreId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) return;
    setSelectedGenreId(suggestedGenreId ?? "");
  }, [isOpen, reportId, suggestedGenreId]);

  const currentChip = getGenreChipStyle(currentGenre);

  const correctMutation = useMutation({
    mutationFn: async (genreId: string) => {
      const res = await apiRequest("POST", `/api/moderator/reports/${reportId}/correct-genre`, {
        genre: genreId,
      });
      return res.json() as Promise<{ genre?: string; message?: string }>;
    },
    onSuccess: (data) => {
      const newGenre = typeof data?.genre === "string" ? data.genre : selectedGenreId;
      applyPostGenreChangeToQueryCaches(queryClient, postId, newGenre, ownerUserId);
      invalidateQueriesAfterPostGenreChange(queryClient, postId, ownerUserId);
      toast({
        title: "Genre updated",
        description: `Post genre set to ${getCanonicalGenreLabel(newGenre)}. Report resolved.`,
      });
      onSuccess?.();
      onClose();
    },
    onError: (error: unknown) => {
      const bodyMsg =
        error &&
        typeof error === "object" &&
        "body" in error &&
        error.body &&
        typeof error.body === "object" &&
        "message" in error.body
          ? String((error.body as { message?: string }).message ?? "")
          : "";
      toast({
        title: "Could not update genre",
        description: bodyMsg || (error instanceof Error ? error.message : "Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!selectedGenreId) {
      toast({
        title: "Select a genre",
        description: "Choose the final genre for this post.",
        variant: "destructive",
      });
      return;
    }
    correctMutation.mutate(selectedGenreId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Correct post genre</DialogTitle>
          <DialogDescription>
            Current genre: <span className="font-medium text-foreground">{currentChip.label}</span>.
            {suggestedGenreId ? (
              <>
                {" "}
                Reporter suggested:{" "}
                <span className="font-medium text-foreground">
                  {getCanonicalGenreLabel(suggestedGenreId)}
                </span>
                .
              </>
            ) : null}{" "}
            You choose the final genre — the post is not changed until you confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="correct-genre-select">Final genre</Label>
            <Select value={selectedGenreId} onValueChange={setSelectedGenreId}>
              <SelectTrigger id="correct-genre-select" data-testid="select-correct-genre">
                <SelectValue placeholder="Select genre…" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-[min(70vh,320px)]">
                {GENRE_ENTRIES.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={correctMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={correctMutation.isPending || !selectedGenreId}>
              {correctMutation.isPending ? "Saving…" : "Update genre"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
