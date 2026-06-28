export const ARTIST_PROFILE_QUESTIONS_QUERY_KEY = ["/api/artists/me/profile-questions"] as const;

export type ArtistProfileQuestionDef = {
  slug: string;
  question: string;
  helper?: string;
};

export type ArtistProfileAnswerRecord = {
  questionSlug: string;
  answer: string;
  createdAt: string;
  updatedAt: string;
};

export type ArtistProfileQuestionsState = {
  questions: ArtistProfileQuestionDef[];
  answers: ArtistProfileAnswerRecord[];
  unansweredSlugs: string[];
};
