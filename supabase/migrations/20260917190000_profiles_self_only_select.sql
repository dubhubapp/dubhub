-- Phase 2 (profiles security hardening): revoke public/anonymous SELECT on base
-- public.profiles while preserving allowlisted public.public_profiles.
--
-- Order (safe):
-- 1) Add authenticated self-only SELECT (while old public policies still exist)
-- 2) Drop both broad public SELECT-true policies if present
-- 3) Revoke table SELECT from anon (+ PUBLIC if present)
--
-- Does NOT:
-- - alter public.public_profiles columns
-- - revoke SELECT on public.public_profiles
-- - drop INSERT/UPDATE/DELETE policies
-- - drop profiles.email
-- - change country / demographics / subscription

-- ---------------------------------------------------------------------------
-- A. Authenticated self-only SELECT on base profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can select their own profile" ON public.profiles;

CREATE POLICY "Users can select their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

COMMENT ON POLICY "Users can select their own profile" ON public.profiles IS
  'Phase 2: authenticated users may SELECT only their own profiles row (auth.uid() = id). Public identity reads use public.public_profiles.';

-- ---------------------------------------------------------------------------
-- B. Drop broad public SELECT-true policies (defensive IF EXISTS)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- ---------------------------------------------------------------------------
-- C. Revoke base-table SELECT from anon / PUBLIC
--    authenticated keeps existing table SELECT grant; RLS enforces own-row only.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- D. Re-affirm public_profiles SELECT grants (unchanged allowlist; Phase 1 view)
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.public_profiles TO anon;
GRANT SELECT ON TABLE public.public_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
