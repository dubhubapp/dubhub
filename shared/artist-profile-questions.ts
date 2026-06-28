/** Official artist profile question bank — stable slugs, editable display text. */
export type ArtistProfileQuestion = {
  slug: string;
  question: string;
  helper?: string;
};

export const ARTIST_PROFILE_QUESTION_SLUG_MAX_LENGTH = 64;

export const ARTIST_PROFILE_QUESTIONS: readonly ArtistProfileQuestion[] = [
  {
    slug: "rider_coolest_request",
    question: "What's the coolest thing you've ever asked for on a rider?",
    helper: "If you haven't had one yet, what would you ask for?",
  },
  {
    slug: "artist_name_origin",
    question: "How did you come up with your artist name?",
  },
  {
    slug: "arch_nemesis",
    question: "Who or what is your arch nemesis?",
  },
  {
    slug: "weirdest_rider_request",
    question: "What's the weirdest thing you've seen another artist ask for on their rider?",
  },
  {
    slug: "strangest_venue",
    question: "What's the strangest venue you've ever played?",
  },
  {
    slug: "stan_name",
    question: "If you had stans, what would they be called?",
    helper: "For example: Beliebers, the BeyHive, Swifties.",
  },
  {
    slug: "rename_dub_hub",
    question: "If you could rename dub hub, what would you change it to?",
  },
  {
    slug: "first_tune",
    question: "What was the first tune you ever made or released called?",
  },
  {
    slug: "genre_inspiration",
    question: "Which genre inspires you most?",
  },
  {
    slug: "underrated_producer",
    question: "Who's the most underrated producer right now?",
  },
  {
    slug: "production_tip",
    question: "What's one production tip you wish someone had told you earlier?",
  },
] as const;

const SLUG_SET = new Set(ARTIST_PROFILE_QUESTIONS.map((q) => q.slug));

export function isValidArtistProfileQuestionSlug(slug: string): boolean {
  return SLUG_SET.has(slug);
}

export function getArtistProfileQuestionBySlug(slug: string): ArtistProfileQuestion | undefined {
  return ARTIST_PROFILE_QUESTIONS.find((q) => q.slug === slug);
}

export type ArtistProfileQuestionAnswerRecord = {
  questionSlug: string;
  answer: string;
  createdAt: string;
  updatedAt: string;
};

export type ArtistProfileQuestionAnswerPublic = {
  questionSlug: string;
  question: string;
  answer: string;
  updatedAt: string;
};

export function toPublicArtistProfileQuestionAnswers(
  records: ArtistProfileQuestionAnswerRecord[],
): ArtistProfileQuestionAnswerPublic[] {
  return records
    .map((row) => {
      const def = getArtistProfileQuestionBySlug(row.questionSlug);
      if (!def) return null;
      return {
        questionSlug: row.questionSlug,
        question: def.question,
        answer: row.answer,
        updatedAt: row.updatedAt,
      };
    })
    .filter((row): row is ArtistProfileQuestionAnswerPublic => row !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
