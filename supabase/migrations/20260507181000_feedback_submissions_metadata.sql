ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS app_version text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'web';

UPDATE public.feedback_submissions
SET
  category = CASE
    WHEN lower(btrim(category)) IN ('ux', 'ux / design') THEN 'ux'
    WHEN lower(btrim(category)) IN ('bug', 'bug / issue') THEN 'bug'
    WHEN lower(btrim(category)) IN ('feature_request', 'feature request') THEN 'feature_request'
    WHEN lower(btrim(category)) = 'performance' THEN 'performance'
    WHEN lower(btrim(category)) = 'notifications' THEN 'notifications'
    WHEN lower(btrim(category)) IN ('account_verification', 'account / verification') THEN 'account_verification'
    WHEN lower(btrim(category)) = 'other' THEN 'other'
    ELSE 'other'
  END,
  app_version = COALESCE(NULLIF(btrim(app_version), ''), 'unknown'),
  platform = CASE
    WHEN platform IN ('ios', 'web', 'android') THEN platform
    ELSE 'web'
  END;

ALTER TABLE public.feedback_submissions
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN app_version SET NOT NULL,
  ALTER COLUMN platform SET NOT NULL,
  ALTER COLUMN app_version SET DEFAULT 'unknown',
  ALTER COLUMN platform SET DEFAULT 'web';

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
      'other'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedback_submissions_app_version_max_length'
  ) THEN
    ALTER TABLE public.feedback_submissions
      ADD CONSTRAINT feedback_submissions_app_version_max_length CHECK (char_length(app_version) <= 64);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedback_submissions_platform_check'
  ) THEN
    ALTER TABLE public.feedback_submissions
      ADD CONSTRAINT feedback_submissions_platform_check CHECK (platform IN ('ios', 'web', 'android'));
  END IF;
END $$;
