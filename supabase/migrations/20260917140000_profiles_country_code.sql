-- Phase 1: optional user country (ISO 3166-1 alpha-2). No emoji storage.
-- Existing rows remain valid with NULL.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_country_code_iso2'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_country_code_iso2
      CHECK (
        country_code IS NULL
        OR country_code ~ '^[A-Z]{2}$'
      );
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.country_code IS
  'Optional ISO 3166-1 alpha-2 country code (uppercase). User-selected residence; not GPS/IP.';
