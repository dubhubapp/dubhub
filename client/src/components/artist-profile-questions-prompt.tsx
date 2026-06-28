import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import {
  pickRandomUnansweredQuestionSlug,
  setArtistQuestionPromptDismissal,
  shouldShowArtistQuestionPrompt,
} from "@/lib/artist-profile-question-prompt";
import {
  ARTIST_PROFILE_QUESTIONS_QUERY_KEY,
  type ArtistProfileQuestionsState,
} from "@/lib/artist-profile-questions";
import { INPUT_LIMITS } from "@shared/input-limits";
import { cn } from "@/lib/utils";

const CARD_CLASS =
  "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

const PROMPT_ANIM_CLASS =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out";

const SUCCESS_MESSAGE = "Nice. We just learnt a little more about each other.";

export function ArtistProfileQuestionsPrompt({
  artistId,
  profileTabActive = true,
  className,
}: {
  artistId: string;
  profileTabActive?: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [draftAnswer, setDraftAnswer] = useState("");
  const [status, setStatus] = useState<{ type: "error"; message: string } | null>(null);
  const [hiddenThisVisit, setHiddenThisVisit] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [promptSlug, setPromptSlug] = useState<string | null>(null);

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

  const unansweredSlugs = data?.unansweredSlugs ?? [];
  const answeredCount = data?.answers?.length ?? 0;

  const eligibleToShow =
    profileTabActive &&
    !isLoading &&
    !isError &&
    !hiddenThisVisit &&
    !showSuccess &&
    shouldShowArtistQuestionPrompt({
      artistId,
      unansweredCount: unansweredSlugs.length,
      answeredCount,
    });

  useEffect(() => {
    if (!profileTabActive) {
      setShowSuccess(false);
    }
  }, [profileTabActive]);

  useEffect(() => {
    if (!eligibleToShow) return;
    if (promptSlug && unansweredSlugs.includes(promptSlug)) return;
    setPromptSlug(pickRandomUnansweredQuestionSlug(unansweredSlugs));
    setDraftAnswer("");
    setStatus(null);
  }, [eligibleToShow, unansweredSlugs, promptSlug]);

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
      setArtistQuestionPromptDismissal(artistId, "save");
      setHiddenThisVisit(true);
      setShowSuccess(true);
      setDraftAnswer("");
      setStatus(null);
      setPromptSlug(null);
      await invalidate();
    },
    onError: (error: Error) => {
      setStatus({ type: "error", message: error.message || "Failed to save answer." });
    },
  });

  const handleSkip = () => {
    setArtistQuestionPromptDismissal(artistId, "skip");
    setHiddenThisVisit(true);
    setDraftAnswer("");
    setStatus(null);
    setPromptSlug(null);
  };

  const handleSave = () => {
    if (!promptSlug) return;
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
    saveMutation.mutate({ slug: promptSlug, answer: trimmed });
  };

  const promptQuestion = promptSlug ? questionBySlug.get(promptSlug) : undefined;
  const isSaving = saveMutation.isPending;

  if (showSuccess && profileTabActive) {
    return (
      <div
        className={cn(CARD_CLASS, PROMPT_ANIM_CLASS, className)}
        data-testid="artist-profile-questions-success"
      >
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4ae9df]" aria-hidden />
          <p className="text-sm leading-relaxed text-white break-words">{SUCCESS_MESSAGE}</p>
        </div>
      </div>
    );
  }

  if (!eligibleToShow || !promptQuestion) {
    return null;
  }

  return (
    <div
      className={cn(CARD_CLASS, PROMPT_ANIM_CLASS, className)}
      data-testid="artist-profile-questions-prompt"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#4ae9df]/80" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Quick one…</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-400 break-words">
            Answer one question so listeners can get to know you beyond the music.
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t border-white/10 pt-3" data-testid="artist-profile-question-editor">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium leading-snug text-white break-words">{promptQuestion.question}</p>
          {promptQuestion.helper ? (
            <p className="text-xs leading-relaxed text-gray-400 break-words">{promptQuestion.helper}</p>
          ) : null}
        </div>
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
          <p className="text-[11px] text-gray-400 tabular-nums">
            {draftAnswer.trim().length} / {INPUT_LIMITS.artistProfileAnswer}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-gray-300"
              onClick={handleSkip}
              disabled={isSaving}
              data-testid="artist-profile-question-skip"
            >
              Skip
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
        {status ? (
          <p className="text-xs text-red-300" data-testid="artist-profile-questions-status">
            {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
