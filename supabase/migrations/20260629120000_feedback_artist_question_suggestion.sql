-- Allow artist question suggestions via existing feedback_submissions flow.

ALTER TABLE public.feedback_submissions
  DROP CONSTRAINT IF EXISTS feedback_submissions_category_check;

ALTER TABLE public.feedback_submissions
  ADD CONSTRAINT feedback_submissions_category_check CHECK (
    category IN (
      'ux',
      'bug',
      'feature_request',
      'performance',
      'notifications',
      'account_verification',
      'artist_question_suggestion',
      'other'
    )
  );
