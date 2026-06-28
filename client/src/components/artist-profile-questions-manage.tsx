import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import {
  ARTIST_PROFILE_QUESTIONS_QUERY_KEY,
  type ArtistProfileQuestionsState,
} from "@/lib/artist-profile-questions";
import { INPUT_LIMITS } from "@shared/input-limits";
import { cn } from "@/lib/utils";

export function ArtistProfileQuestionsManage({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { data, isLoading, isError } = useQuery<ArtistProfileQuestionsState>({
    queryKey: [...ARTIST_PROFILE_QUESTIONS_QUERY_KEY],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/artists/me/profile-questions");
      if (!res.ok) throw new Error("Failed to load profile questions");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const questionBySlug = useMemo(() => {
    const map = new Map<string, { slug: string; question: string; helper?: string }>();
    for (const q of data?.questions ?? []) {
      map.set(q.slug, q);
    }
    return map;
  }, [data?.questions]);

  const answered = data?.answers ?? [];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: [...ARTIST_PROFILE_QUESTIONS_QUERY_KEY] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ slug, answer }: { slug: string; answer: string }) => {
      const res = await apiRequest("PUT", `/api/artists/me/profile-questions/${encodeURIComponent(slug)}`, {
        answer,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.message === "string" ? body.message : "Failed to save answer");
      }
      return res.json();
    },
    onSuccess: async () => {
      await invalidate();
      setEditingSlug(null);
      setDraftAnswer("");
      setStatus({ type: "success", message: "Answer updated." });
    },
    onError: (error: Error) => {
      setStatus({ type: "error", message: error.message || "Failed to save answer." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await apiRequest("DELETE", `/api/artists/me/profile-questions/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.message === "string" ? body.message : "Failed to remove answer");
      }
      return res.json();
    },
    onSuccess: async () => {
      await invalidate();
      setEditingSlug(null);
      setDraftAnswer("");
      setStatus({ type: "success", message: "Answer removed." });
    },
    onError: (error: Error) => {
      setStatus({ type: "error", message: error.message || "Failed to remove answer." });
    },
  });

  const startEdit = (slug: string, existingAnswer: string) => {
    setEditingSlug(slug);
    setDraftAnswer(existingAnswer);
    setStatus(null);
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setDraftAnswer("");
    setStatus(null);
  };

  const handleSave = () => {
    if (!editingSlug) return;
    const trimmed = draftAnswer.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Answer cannot be empty." });
      return;
    }
    if (trimmed.length > INPUT_LIMITS.artistProfileAnswer) {
      setStatus({
        type: "error",
        message: `Answer must be at most ${INPUT_LIMITS.artistProfileAnswer} characters.`,
      });
      return;
    }
    saveMutation.mutate({ slug: editingSlug, answer: trimmed });
  };

  const isSaving = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className={cn("space-y-4", className)} data-testid="artist-profile-questions-manage">
      {isLoading ? (
        <p className="text-xs text-muted-foreground" data-testid="artist-profile-questions-loading">
          Loading answers…
        </p>
      ) : isError ? (
        <p className="text-xs text-red-300" data-testid="artist-profile-questions-error">
          Could not load answers. Try again later.
        </p>
      ) : answered.length > 0 ? (
        <ul className="space-y-2" data-testid="artist-profile-questions-answered-list">
          {answered.map((row) => {
            const def = questionBySlug.get(row.questionSlug);
            if (!def) return null;
            const isEditing = editingSlug === row.questionSlug;
            return (
              <li
                key={row.questionSlug}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5"
                data-testid={`artist-profile-question-answered-${row.questionSlug}`}
              >
                <p className="text-xs font-medium leading-snug text-foreground break-words">{def.question}</p>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={draftAnswer}
                      onChange={(e) => {
                        setDraftAnswer(e.target.value);
                        if (status) setStatus(null);
                      }}
                      maxLength={INPUT_LIMITS.artistProfileAnswer}
                      className="min-h-[72px] text-sm"
                      data-testid={`artist-profile-question-edit-input-${row.questionSlug}`}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {draftAnswer.trim().length} / {INPUT_LIMITS.artistProfileAnswer}
                      </p>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-red-300 hover:text-red-200"
                          onClick={() => deleteMutation.mutate(row.questionSlug)}
                          disabled={isSaving}
                          data-testid="artist-profile-question-remove"
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Remove
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={cancelEdit}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={handleSave}
                          disabled={isSaving}
                          data-testid={`artist-profile-question-edit-save-${row.questionSlug}`}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground break-words">{row.answer}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-8 px-2.5 text-xs"
                      onClick={() => startEdit(row.questionSlug, row.answer)}
                      disabled={isSaving}
                      data-testid={`artist-profile-question-edit-${row.questionSlug}`}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div
          className="rounded-lg border border-white/10 bg-black/20 px-3 py-4 text-center"
          data-testid="artist-profile-questions-empty"
        >
          <p className="text-sm text-foreground">No artist answers yet.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            You&apos;ll get the occasional question on your Profile.
          </p>
        </div>
      )}

      {status ? (
        <p
          className={cn("text-xs", status.type === "success" ? "text-emerald-300" : "text-red-300")}
          data-testid="artist-profile-questions-status"
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
