-- Explicit per-user artist release alerts (not followers).
-- Backend API read/write only; no client direct table access.

CREATE TABLE IF NOT EXISTS public.artist_release_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_release_alerts_user_artist_unique UNIQUE (user_id, artist_id),
  CONSTRAINT artist_release_alerts_not_self CHECK (user_id <> artist_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_release_alerts_user_id
  ON public.artist_release_alerts (user_id);

CREATE INDEX IF NOT EXISTS idx_artist_release_alerts_artist_id
  ON public.artist_release_alerts (artist_id);

COMMENT ON TABLE public.artist_release_alerts IS
  'Per-user opt-in to receive future release updates from a verified artist. Not a follower graph.';
