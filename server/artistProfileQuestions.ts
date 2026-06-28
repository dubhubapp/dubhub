import { ARTIST_PROFILE_QUESTION_SLUG_MAX_LENGTH, ARTIST_PROFILE_QUESTIONS, isValidArtistProfileQuestionSlug } from "@shared/artist-profile-questions";
import { INPUT_LIMITS } from "@shared/input-limits";

export function requireVerifiedArtistAccount(
  dbUser: { account_type?: string; verified_artist?: boolean } | null | undefined,
): { ok: true } | { ok: false; status: 401 | 403; message: string } {
  if (!dbUser) {
    return { ok: false, status: 401, message: "Not authenticated" };
  }
  if (dbUser.account_type !== "artist") {
    return { ok: false, status: 403, message: "Artists only" };
  }
  if (!dbUser.verified_artist) {
    return { ok: false, status: 403, message: "Verified artist access only" };
  }
  return { ok: true };
}

export function validateArtistProfileQuestionSlug(
  questionSlug: string,
): { ok: true; questionSlug: string } | { ok: false; status: 400; message: string } {
  const slug = typeof questionSlug === "string" ? questionSlug.trim() : "";
  if (!slug) {
    return { ok: false, status: 400, message: "questionSlug is required" };
  }
  if (slug.length > ARTIST_PROFILE_QUESTION_SLUG_MAX_LENGTH) {
    return { ok: false, status: 400, message: "Invalid question slug" };
  }
  if (!isValidArtistProfileQuestionSlug(slug)) {
    return { ok: false, status: 400, message: "Invalid question slug" };
  }
  return { ok: true, questionSlug: slug };
}

export function validateArtistProfileAnswerInput(
  questionSlug: string,
  rawAnswer: unknown,
): { ok: true; questionSlug: string; answer: string } | { ok: false; status: 400; message: string } {
  const slugResult = validateArtistProfileQuestionSlug(questionSlug);
  if (!slugResult.ok) return slugResult;

  const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";
  if (!answer) {
    return { ok: false, status: 400, message: "Answer cannot be empty" };
  }
  if (answer.length > INPUT_LIMITS.artistProfileAnswer) {
    return {
      ok: false,
      status: 400,
      message: `Answer must be at most ${INPUT_LIMITS.artistProfileAnswer} characters`,
    };
  }

  return { ok: true, questionSlug: slugResult.questionSlug, answer };
}

export function buildArtistProfileQuestionsState(
  answers: { questionSlug: string; answer: string; createdAt: string; updatedAt: string }[],
) {
  const answeredSlugs = new Set(answers.map((a) => a.questionSlug));
  const unansweredSlugs = ARTIST_PROFILE_QUESTIONS.filter((q) => !answeredSlugs.has(q.slug)).map((q) => q.slug);
  return {
    questions: ARTIST_PROFILE_QUESTIONS.map((q) => ({
      slug: q.slug,
      question: q.question,
      ...(q.helper ? { helper: q.helper } : {}),
    })),
    answers,
    unansweredSlugs,
  };
}
