ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS app_version text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'web';

UPDATE public.feedback_submissions
SET
  category = COALESCE(NULLIF(btrim(category), ''), 'Other'),
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedback_submissions_category_check'
  ) THEN
    ALTER TABLE public.feedback_submissions
      ADD CONSTRAINT feedback_submissions_category_check CHECK (
        category IN (
          'UX / Design',
          'Bug / Issue',
          'Feature Request',
          'Performance',
          'Notifications',
          'Account / Verification',
          'Other'
        )
      );
  END IF;
END $$;

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
