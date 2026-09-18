-- VAT-ANON-1: private anonymous artist identification claims + public projection flag.
-- Additive only. No backfill. Service-role access only (RLS enabled, no public policies).

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_artist_verified_anonymous boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.posts.is_artist_verified_anonymous IS
  'True when a verified artist has privately claimed this post with identity hidden. Never store the claiming artist_id on posts while anonymous.';

CREATE TABLE IF NOT EXISTS public.artist_private_identifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_comment_id uuid NULL REFERENCES public.comments(id) ON DELETE SET NULL,
  state text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  revealed_at timestamptz NULL,
  entitled_at_claim boolean NOT NULL,
  created_via text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_private_identifications_state_check
    CHECK (state IN ('anonymous', 'revealed')),
  CONSTRAINT artist_private_identifications_revealed_at_check
    CHECK (
      (state = 'anonymous' AND revealed_at IS NULL)
      OR (state = 'revealed' AND revealed_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.artist_private_identifications IS
  'Private durable artist identity claims for anonymous identification (VAT). Not publicly readable.';

COMMENT ON COLUMN public.artist_private_identifications.artist_id IS
  'Real identifying artist. Must never be joined into public feed/post serializers while state = anonymous.';

COMMENT ON COLUMN public.artist_private_identifications.entitled_at_claim IS
  'Whether the artist had paid VAT access at claim time. Reveal-after-expiry policy deferred to VAT-ANON-4.';

-- One claim row per post for anonymous|revealed (same row transitions on reveal).
CREATE UNIQUE INDEX IF NOT EXISTS artist_private_identifications_one_claim_per_post_idx
  ON public.artist_private_identifications (post_id)
  WHERE state IN ('anonymous', 'revealed');

CREATE INDEX IF NOT EXISTS artist_private_identifications_artist_id_idx
  ON public.artist_private_identifications (artist_id);

CREATE INDEX IF NOT EXISTS artist_private_identifications_state_idx
  ON public.artist_private_identifications (state);

CREATE INDEX IF NOT EXISTS artist_private_identifications_post_state_idx
  ON public.artist_private_identifications (post_id, state);

CREATE INDEX IF NOT EXISTS idx_posts_is_artist_verified_anonymous
  ON public.posts (id)
  WHERE is_artist_verified_anonymous = true;

ALTER TABLE public.artist_private_identifications ENABLE ROW LEVEL SECURITY;

-- No policies: anon/authenticated clients cannot SELECT/INSERT/UPDATE/DELETE.
-- Backend uses service role / direct DB connection which bypasses RLS.
