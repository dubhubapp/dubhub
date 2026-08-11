-- Slice 1: additive release timing domain foundation.
-- Does NOT rewrite release_date values.
-- Does NOT backfill release_at from legacy 00:00Z serialization.
-- Existing dated rows remain calendar-date / Midnight semantics.

ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS release_timing_mode text NOT NULL DEFAULT 'midnight',
  ADD COLUMN IF NOT EXISTS release_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS release_timezone text NULL,
  ADD COLUMN IF NOT EXISTS release_announced_at timestamptz NULL;

-- Mode allow-list (exact reserved; API rejects exact writes until Slice 2).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'releases_release_timing_mode_check'
      AND conrelid = 'public.releases'::regclass
  ) THEN
    ALTER TABLE public.releases
      ADD CONSTRAINT releases_release_timing_mode_check
      CHECK (release_timing_mode IN ('midnight', 'exact'));
  END IF;
END $$;

-- Midnight (and Coming Soon defaulting to midnight) must not carry exact fields.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'releases_midnight_clears_exact_fields_check'
      AND conrelid = 'public.releases'::regclass
  ) THEN
    ALTER TABLE public.releases
      ADD CONSTRAINT releases_midnight_clears_exact_fields_check
      CHECK (
        release_timing_mode <> 'midnight'
        OR (release_at IS NULL AND release_timezone IS NULL)
      );
  END IF;
END $$;

-- Exact rows (none yet) must be complete and not Coming Soon.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'releases_exact_requires_complete_fields_check'
      AND conrelid = 'public.releases'::regclass
  ) THEN
    ALTER TABLE public.releases
      ADD CONSTRAINT releases_exact_requires_complete_fields_check
      CHECK (
        release_timing_mode <> 'exact'
        OR (
          is_coming_soon = false
          AND release_date IS NOT NULL
          AND release_at IS NOT NULL
          AND release_timezone IS NOT NULL
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.releases.release_timing_mode IS
  'midnight = calendar-date release (default); exact = absolute release_at instant. Legacy 00:00Z release_date values are NOT exact instants.';

COMMENT ON COLUMN public.releases.release_at IS
  'Absolute global release instant when release_timing_mode=exact. NULL for midnight / Coming Soon. Never backfill from release_date 00:00Z.';

COMMENT ON COLUMN public.releases.release_timezone IS
  'IANA timezone for exact wall-clock editing/reconstruction. NULL for midnight / Coming Soon.';

COMMENT ON COLUMN public.releases.release_announced_at IS
  'Absolute product timestamp for first dated announcement. Inert until announcement slice; do not backfill from notified_at.';

COMMENT ON COLUMN public.releases.release_date IS
  'Calendar-date carrier for Midnight mode. Historical/current values are typically stored at 00:00Z serialization and MUST NOT be treated as a global release instant.';
