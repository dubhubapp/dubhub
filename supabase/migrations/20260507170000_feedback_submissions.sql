CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  body text NOT NULL,
  app_version text NOT NULL DEFAULT 'unknown',
  platform text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_submissions_category_check CHECK (
    category IN (
      'UX / Design',
      'Bug / Issue',
      'Feature Request',
      'Performance',
      'Notifications',
      'Account / Verification',
      'Other'
    )
  ),
  CONSTRAINT feedback_submissions_body_not_empty CHECK (char_length(btrim(body)) > 0),
  CONSTRAINT feedback_submissions_body_max_length CHECK (char_length(body) <= 1000),
  CONSTRAINT feedback_submissions_app_version_max_length CHECK (char_length(app_version) <= 64),
  CONSTRAINT feedback_submissions_platform_check CHECK (platform IN ('ios', 'web', 'android'))
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
