-- Allow optional Verified Artist Tools cancellation feedback via the existing
-- feedback_submissions flow. Category check only. No new columns or tables.
-- Not applied by application code. Review and run separately.

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
      'other',
      'subscription_cancellation'
    )
  );
