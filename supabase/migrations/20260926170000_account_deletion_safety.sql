-- Account deletion Phase B1 — safety FKs + deletion job ledger.
-- Additive / constraint-only. No user data deleted or rewritten.
-- Pre-apply orphan audits (verified_by → profiles, verified_comment_id → comments) must be empty.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) reports.reported_user_id: CASCADE → SET NULL
--    Preserve moderation reports when a reported account is deleted.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reported_user_id_fkey;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_reported_user_id_fkey
  FOREIGN KEY (reported_user_id)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2) reports.reported_post_id: CASCADE → SET NULL
--    Preserve moderation reports when a reported post is deleted.
--    Column is nullable; existing reporter_id / assigned_moderator_id SET NULL unchanged.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reported_post_id_fkey;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_reported_post_id_fkey
  FOREIGN KEY (reported_post_id)
  REFERENCES public.posts (id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) posts.verified_by → profiles(id) ON DELETE SET NULL
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD CONSTRAINT posts_verified_by_fkey
  FOREIGN KEY (verified_by)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4) posts.verified_comment_id → comments(id) ON DELETE SET NULL
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD CONSTRAINT posts_verified_comment_id_fkey
  FOREIGN KEY (verified_comment_id)
  REFERENCES public.comments (id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5) account_deletion_jobs — survives Auth/profile deletion (no user FK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL,
  current_stage text,
  failure_code text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT account_deletion_jobs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- At most one in-flight deletion job per user.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_jobs_one_active_per_user_idx
  ON public.account_deletion_jobs (user_id)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS account_deletion_jobs_user_id_idx
  ON public.account_deletion_jobs (user_id);

CREATE INDEX IF NOT EXISTS account_deletion_jobs_status_idx
  ON public.account_deletion_jobs (status);

ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.account_deletion_jobs IS
  'Backend-owned account deletion stages. No FK to auth/profiles so the row survives Auth delete for idempotency and completion audit. Service-role / backend only.';

COMMENT ON COLUMN public.account_deletion_jobs.user_id IS
  'Supabase Auth / profiles UUID being deleted. Intentionally not a foreign key.';

COMMENT ON COLUMN public.account_deletion_jobs.failure_reason IS
  'Short non-PII failure summary. Do not store passwords, tokens, DOB, or email bodies.';

COMMENT ON CONSTRAINT reports_reported_user_id_fkey ON public.reports IS
  'SET NULL so account deletion does not destroy moderation/safety reports involving the reported user.';

COMMENT ON CONSTRAINT reports_reported_post_id_fkey ON public.reports IS
  'SET NULL so post deletion does not destroy moderation/safety reports on that post.';

COMMENT ON CONSTRAINT posts_verified_by_fkey ON public.posts IS
  'Attribution credit; SET NULL on profile delete. Does not revert identification outcome flags/title.';

COMMENT ON CONSTRAINT posts_verified_comment_id_fkey ON public.posts IS
  'Pinned identification comment; SET NULL when comment is deleted. Does not revert identification outcome flags/title.';

COMMIT;
