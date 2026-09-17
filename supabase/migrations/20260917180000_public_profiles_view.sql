-- Phase 1 (profiles security hardening): additive public identity projection.
--
-- Creates public.public_profiles with an allowlisted column set only.
-- Does NOT revoke SELECT on public.profiles.
-- Does NOT drop or alter existing public SELECT policies on public.profiles.
--
-- Security model (intentional for Phase 2 readiness):
-- - View uses security_invoker = false (Postgres default / security-definer semantics).
-- - Owner privileges read underlying public.profiles; callers only need SELECT on the VIEW.
-- - Column allowlist is the privacy boundary (email / moderation / prompt flags omitted).
-- - security_invoker = true would re-require broad base-table SELECT (or USING(true) RLS)
--   after Phase 2 revokes anon access to profiles — defeating the hardening goal.
-- - GRANT SELECT only on the view to anon + authenticated (no INSERT/UPDATE/DELETE).
--
-- Phase 2 (separate migration, after QA): revoke anon/public SELECT on base profiles
-- and drop duplicate public SELECT-true policies. This Phase 1 migration must remain
-- additive and reversible on its own.

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  p.banner_url,
  p.account_type,
  p.verified_artist,
  p.moderator,
  p.country_code,
  p.created_at
FROM public.profiles p;

COMMENT ON VIEW public.public_profiles IS
  'Allowlisted public identity projection of profiles (Phase 1). Omits email and private/moderation columns. security_invoker=false so SELECT on this view alone can serve anon after base-table public SELECT is revoked in Phase 2. Broad profiles SELECT policies remain active until Phase 2.';

-- Tighten grants: SELECT only for API client roles.
REVOKE ALL ON TABLE public.public_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.public_profiles FROM anon;
REVOKE ALL ON TABLE public.public_profiles FROM authenticated;
GRANT SELECT ON TABLE public.public_profiles TO anon;
GRANT SELECT ON TABLE public.public_profiles TO authenticated;

-- PostgREST schema cache (no-op if listener absent).
NOTIFY pgrst, 'reload schema';
