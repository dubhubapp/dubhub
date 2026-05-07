CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_submissions_body_not_empty CHECK (char_length(btrim(body)) > 0),
  CONSTRAINT feedback_submissions_body_max_length CHECK (char_length(body) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_feedback_submissions_user_id_created_at
  ON public.feedback_submissions (user_id, created_at DESC);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert feedback" ON public.feedback_submissions;
CREATE POLICY "Authenticated users can insert feedback"
  ON public.feedback_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
