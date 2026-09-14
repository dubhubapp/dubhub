-- PROFILE-REFINEMENT-C1: completed-month leaderboard finishes + freeze-run markers.
-- Backend-owned; no client direct table access. No historical backfill.

CREATE TABLE IF NOT EXISTS public.leaderboard_monthly_finishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  year_month date NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1),
  period_score integer NOT NULL CHECK (period_score > 0),
  period_correct_ids integer NOT NULL CHECK (period_correct_ids >= 0),
  frozen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leaderboard_monthly_finishes_scope_check
    CHECK (scope IN ('community', 'artist')),
  CONSTRAINT leaderboard_monthly_finishes_scope_month_user_unique
    UNIQUE (scope, year_month, user_id),
  CONSTRAINT leaderboard_monthly_finishes_month_start_check
    CHECK (year_month = (date_trunc('month', year_month::timestamp))::date)
);

CREATE INDEX IF NOT EXISTS leaderboard_monthly_finishes_user_scope_rank_idx
  ON public.leaderboard_monthly_finishes (user_id, scope, rank);

CREATE INDEX IF NOT EXISTS leaderboard_monthly_finishes_month_scope_rank_idx
  ON public.leaderboard_monthly_finishes (year_month, scope, rank);

COMMENT ON TABLE public.leaderboard_monthly_finishes IS
  'Frozen final ranks for completed UTC calendar months (period_score > 0 only). Source for Best Monthly Rank and Monthly Top 100.';

-- Distinguishes "froze with zero finishers" from "freeze never ran".
CREATE TABLE IF NOT EXISTS public.leaderboard_monthly_freeze_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  year_month date NOT NULL,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  finisher_count integer NOT NULL CHECK (finisher_count >= 0),
  CONSTRAINT leaderboard_monthly_freeze_runs_scope_check
    CHECK (scope IN ('community', 'artist')),
  CONSTRAINT leaderboard_monthly_freeze_runs_scope_month_unique
    UNIQUE (scope, year_month),
  CONSTRAINT leaderboard_monthly_freeze_runs_month_start_check
    CHECK (year_month = (date_trunc('month', year_month::timestamp))::date)
);

COMMENT ON TABLE public.leaderboard_monthly_freeze_runs IS
  'Idempotent marker that a completed UTC month was frozen for a scope (including zero-finisher months).';

ALTER TABLE public.leaderboard_monthly_finishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_monthly_freeze_runs ENABLE ROW LEVEL SECURITY;
