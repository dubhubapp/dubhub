-- Verified artist profile Q&A answers (backend API writes only).

CREATE TABLE IF NOT EXISTS public.artist_profile_question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_slug text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_profile_question_answers_artist_slug_unique UNIQUE (artist_id, question_slug),
  CONSTRAINT artist_profile_question_answers_slug_max_length CHECK (char_length(question_slug) <= 64),
  CONSTRAINT artist_profile_question_answers_answer_not_empty CHECK (char_length(btrim(answer)) > 0),
  CONSTRAINT artist_profile_question_answers_answer_max_length CHECK (char_length(answer) <= 280)
);

CREATE INDEX IF NOT EXISTS idx_artist_profile_question_answers_artist_id_updated
  ON public.artist_profile_question_answers (artist_id, updated_at DESC);

COMMENT ON TABLE public.artist_profile_question_answers IS
  'Verified artist answers to official profile questions. Backend API read/write only.';
