import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { INPUT_LIMITS } from "@shared/input-limits";
import { cn } from "@/lib/utils";

export const ARTIST_PROFILE_QUESTIONS_QUERY_KEY = ["/api/artists/me/profile-questions"] as const;

type QuestionDef = {
  slug: string;
  question: string;
  helper?: string;
};

type AnswerRecord = {
  questionSlug: string;
  answer: string;
  createdAt: string;
  updatedAt: string;
};

type ProfileQuestionsState = {
  questions: QuestionDef[];
  answers: AnswerRecord[];
  unansweredSlugs: string[];
};

const CARD_CLASS =
  "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

export function ArtistProfileQuestionsManage({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [pickerSlug, setPickerSlug] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { data, isLoading, isError } = useQuery<ProfileQuestionsState>({
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
    const map = new Map<string, QuestionDef>();
    for (const q of data?.questions ?? []) {
      map.set(q.slug, q);
    }
    return map;
  }, [data?.questions]);

  const unansweredQuestions = useMemo(
    () => (data?.unansweredSlugs ?? []).map((slug) => questionBySlug.get(slug)).filter(Boolean) as QuestionDef[],
    [data?.unansweredSlugs, questionBySlug],
  );

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
      setPickerSlug("");
      setStatus({ type: "success", message: "Answer saved." });
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

  const startEdit = (slug: string, existingAnswer = "") => {
    setEditingSlug(slug);
    setDraftAnswer(existingAnswer);
    setPickerSlug("");
    setStatus(null);
  };

  const startNew = (slug: string) => {
    startEdit(slug, "");
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setDraftAnswer("");
    setPickerSlug("");
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
    setStatus(null);
    saveMutation.mutate({ slug: editingSlug, answer: trimmed });
  };

  const editingQuestion = editingSlug ? questionBySlug.get(editingSlug) : undefined;
  const isSaving = saveMutation.isPending || deleteMutation.isPending;
  const answered = data?.answers ?? [];

  return (
    <div className={cn(CARD_CLASS, className)} data-testid="artist-profile-questions-manage">
      <div className="mb-3 flex items-start gap-2.5">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-[#4ae9df]/80" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Artist Questions</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            Answer a few quick questions so listeners can get to know you beyond the music.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400" data-testid="artist-profile-questions-loading">
          Loading questions…
        </p>
      ) : isError ? (
        <p className="text-xs text-red-300" data-testid="artist-profile-questions-error">
          Could not load questions. Pull to refresh or try again later.
        </p>
      ) : (
        <div className="space-y-3">
          {answered.length > 0 ? (
            <ul className="space-y-2" data-testid="artist-profile-questions-answered-list">
              {answered.map((row) => {
                const def = questionBySlug.get(row.questionSlug);
                if (!def) return null;
                const isActive = editingSlug === row.questionSlug;
                return (
                  <li
                    key={row.questionSlug}
                    className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5"
                    data-testid={`artist-profile-question-answered-${row.questionSlug}`}
                  >
                    <p className="text-xs font-medium leading-snug text-white/90">{def.question}</p>
                    {!isActive ? (
                      <>
                        <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{row.answer}</p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => startEdit(row.questionSlug, row.answer)}
                            disabled={isSaving}
                            data-testid={`artist-profile-question-edit-${row.questionSlug}`}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">No answers yet — pick a question below to get started.</p>
          )}

          {editingQuestion ? (
            <div
              className="rounded-lg border border-[#4ae9df]/20 bg-[#4ae9df]/[0.05] p-3 space-y-2"
              data-testid="artist-profile-question-editor"
            >
              <p className="text-xs font-medium leading-snug text-white">{editingQuestion.question}</p>
              {editingQuestion.helper ? (
                <p className="text-[11px] leading-relaxed text-gray-400">{editingQuestion.helper}</p>
              ) : null}
              <Textarea
                value={draftAnswer}
                onChange={(e) => {
                  setDraftAnswer(e.target.value);
                  if (status) setStatus(null);
                }}
                maxLength={INPUT_LIMITS.artistProfileAnswer}
                placeholder="Your answer…"
                className="min-h-[72px] text-sm"
                data-testid="artist-profile-question-answer-input"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-gray-400">
                  {draftAnswer.trim().length}/{INPUT_LIMITS.artistProfileAnswer}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {answered.some((a) => a.questionSlug === editingSlug) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-red-300 hover:text-red-200"
                      onClick={() => editingSlug && deleteMutation.mutate(editingSlug)}
                      disabled={isSaving}
                      data-testid="artist-profile-question-remove"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Remove
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={cancelEdit} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={handleSave}
                    disabled={isSaving}
                    data-testid="artist-profile-question-save"
                  >
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          ) : unansweredQuestions.length > 0 ? (
            <div className="space-y-2" data-testid="artist-profile-questions-add">
              <Select
                value={pickerSlug}
                onValueChange={(value) => {
                  setPickerSlug(value);
                  startNew(value);
                }}
              >
                <SelectTrigger className="h-9 text-xs" data-testid="artist-profile-question-picker">
                  <SelectValue placeholder="Choose a question to answer" />
                </SelectTrigger>
                <SelectContent>
                  {unansweredQuestions.map((q) => (
                    <SelectItem key={q.slug} value={q.slug} className="text-xs">
                      {q.question}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full text-xs"
                onClick={() => {
                  const slug = pickerSlug || unansweredQuestions[0]?.slug;
                  if (slug) startNew(slug);
                }}
                disabled={unansweredQuestions.length === 0}
                data-testid="artist-profile-question-add-button"
              >
                <Plus className="mr-1 h-3 w-3" />
                Answer a question
              </Button>
            </div>
          ) : answered.length > 0 ? (
            <p className="text-xs text-gray-400">You&apos;ve answered every question — nice one.</p>
          ) : null}

          {status ? (
            <p
              className={cn("text-xs", status.type === "success" ? "text-emerald-300" : "text-red-300")}
              data-testid="artist-profile-questions-status"
            >
              {status.message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
