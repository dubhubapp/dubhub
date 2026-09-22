-- VAT-ANON-3.6: optional public track title on anonymous artist claims.
-- Additive only. No backfill.

ALTER TABLE public.artist_private_identifications
  ADD COLUMN IF NOT EXISTS track_title text NULL;

COMMENT ON COLUMN public.artist_private_identifications.track_title IS
  'Optional artist-supplied public track title for an anonymous identification. Safe to expose publicly while artist identity remains hidden. Not authoritative release metadata (release.title wins after attach).';
